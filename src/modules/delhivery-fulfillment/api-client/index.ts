import axios, { AxiosInstance } from "axios";

interface DelhiveryServiceabilityResponse {
  [key: string]: {
    pin: string;
    post_code: string;
    pre_paid: string;
    cash: string;
    pickups: string;
    cod: string;
    reverse: boolean;
    rd: boolean;
    rem: boolean;
    state_code: string;
    district: string;
    city: string;
    state: string;
  };
}

interface ShipmentDetails {
  name: string;
  order: string;
  phone: string | string[];
  add: string;
  pin: number;
  address_type?: string;
  ewbn?: string;
  hsn_code?: string;
  shipping_mode?: "Surface" | "Express";
  seller_inv?: string;
  city?: string;
  weight?: number;
  return_name?: string;
  return_add?: string;
  return_city?: string;
  return_phone?: string | string[];
  return_state?: string;
  return_country?: string;
  return_pin?: number;
  seller_name?: string;
  fragile_shipment?: boolean;
  shipment_height?: number;
  shipment_width?: number;
  shipment_length?: number;
  cod_amount?: number;
  products_desc?: string;
  state?: string;
  dangerous_good?: boolean;
  waybill?: string;
  total_amount?: number;
  seller_add?: string;
  country?: string;
  plastic_packaging?: boolean;
  quantity?: string;
  payment_mode?: "Prepaid" | "COD";
}

export class DelhiveryApiClient {
  private apiClient: AxiosInstance;
  private apiToken: string;

  constructor() {
    this.apiToken = process.env.DELHIVERY_API_TOKEN || "";

    if (!this.apiToken) {
      console.warn("DELHIVERY_API_TOKEN environment variable is not set");
    }

    const baseUrl = process.env.DELHIVERY_BASE_URL || "https://track.delhivery.com/";
    this.apiClient = axios.create({
      baseURL: `${baseUrl}`,
      headers: {
        Authorization: `Token ${this.apiToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  /**
   * Check serviceability for a pincode
   */
  async checkServiceability(pincode: string): Promise<DelhiveryServiceabilityResponse> {
    try {
      // IMPORTANT: Use /c/api/pin-codes/json (note the /c/ prefix)
      const response = await this.apiClient.get("/c/api/pin-codes/json/", {
        params: { filter_codes: pincode },
      });

      // If response is empty object, pincode is non-serviceable
      if (!response.data || Object.keys(response.data).length === 0) {
        throw new Error(`Pincode ${pincode} is non-serviceable`);
      }

      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to check Delhivery serviceability: ${error.message}`);
    }
  }

  /**
   * Calculate shipping cost
   */
  async calculateShippingCost({
    originPincode,
    destinationPincode,
    weightInGrams,
    mode = "S",
    status = "Delivered",
    paymentType = "Pre-paid",
  }: {
    originPincode: string;
    destinationPincode: string;
    weightInGrams: number;
    mode?: "E" | "S";
    status?: "Delivered" | "RTO" | "DTO";
    paymentType?: "Pre-paid" | "COD";
  }) {
    try {
      const response = await this.apiClient.get("/api/kinko/v1/invoice/charges/.json", {
        params: {
          md: mode,
          cgm: weightInGrams,
          o_pin: originPincode,
          d_pin: destinationPincode,
          ss: status,
          pt: paymentType,
        },
      });

      if (!response.data || response.data.length === 0) {
        throw new Error("No shipping cost data received");
      }

      return response.data;
    } catch (error: any) {
      console.error("Error calculating Delhivery shipping:", error);
      throw new Error(`Failed to calculate Delhivery shipping: ${error.message}`);
    }
  }

  /**
   * Track shipment by waybill
   */
  async trackShipment(waybill: string): Promise<any> {
    try {
      const response = await this.apiClient.get("/api/packages/json/", {
        params: { waybill: waybill },
      });

      return response.data;
    } catch (error: any) {
      console.error("Error tracking Delhivery shipment:", {
        waybill,
        error: error.message,
      });
      throw new Error(`Failed to track Delhivery shipment: ${error.message}`);
    }
  }

  /**
   * Create a new shipment
   */
  async createShipment(shipmentDetails: ShipmentDetails, pickupLocationName: { name: string }) {
    try {
      const payload = {
        shipments: [shipmentDetails],
        pickup_location: pickupLocationName,
      };

      console.log("Creating shipment:", {
        order: shipmentDetails.order,
        pin: shipmentDetails.pin,
        pickup: pickupLocationName.name,
      });

      const response = await this.apiClient.post(
        "/api/cmu/create.json",
        new URLSearchParams({
          format: "json",
          data: JSON.stringify(payload),
        }),
      );

      console.log("Shipment created:", JSON.stringify(response.data, null, 2));

      return response.data;
    } catch (error: any) {
      console.error("Create Shipping Error:", {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Create Shipping Error: ${error.message}`);
    }
  }

  /**
   * Cancel a shipment
   */
  async cancelShipment({
    waybill,
    cancellation = "true",
  }: {
    waybill: string;
    cancellation: string;
  }) {
    try {
      console.log("Cancelling shipment:", waybill);

      const response = await this.apiClient.post("/api/p/edit", {
        waybill,
        cancellation,
      });

      console.log("Shipment cancelled:", response.data);

      return response.data;
    } catch (error: any) {
      console.error("Cancel Shipping Error:", {
        waybill,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      throw new Error(`Cancel Shipping Error: ${error.message}`);
    }
  }
}
