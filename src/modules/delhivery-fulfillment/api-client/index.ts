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

export class DelhiveryApiClient {
  private apiClient: AxiosInstance;
  private apiToken: string;

  constructor() {
    this.apiToken = process.env.DELHIVERY_API_TOKEN || "";

    if (!this.apiToken) {
      console.warn(
        "DELHIVERY_API_TOKEN environment variable is not set"
      );
    }

    const baseUrl = process.env.DELHIVERY_BASE_URL || 'https://track.delhivery.com/';
    this.apiClient = axios.create({
      baseURL: `${baseUrl}c`,
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
  async checkServiceability(
    pincode: string
  ): Promise<DelhiveryServiceabilityResponse> {
    try {
      const response = await this.apiClient.get("/api/pin-codes/json", {
        params: { filter_codes: pincode },
      });

      return response.data;
    } catch (error: any) {
      console.error("Error checking Delhivery serviceability:", error);
      throw new Error(
        `Failed to check Delhivery serviceability: ${error.message}`
      );
    }
  }

    /**
   * Calculate shipping cost
   */
  async calculateShipping(
    pincode: string,
    weight: number
  ): Promise<any> {
    try {
      const response = await this.apiClient.get("/api/kinko/v1/invoice/charges", {
        params: {
          filter_codes: pincode,
          weight: weight,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error("Error calculating Delhivery shipping:", error);
      throw new Error(
        `Failed to calculate Delhivery shipping: ${error.message}`
      );
    }
  }

  /**
   * Track shipment by waybill
   */
  async trackShipment(waybill: string): Promise<any> {
    try {
      const response = await this.apiClient.get("/api/packages/json", {
        params: { waybill: waybill },
      });

      return response.data;
    } catch (error: any) {
      console.error("Error tracking Delhivery shipment:", error);
      throw new Error(
        `Failed to track Delhivery shipment: ${error.message}`
      );
    }
  }
}

