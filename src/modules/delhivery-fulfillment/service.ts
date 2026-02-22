import { AbstractFulfillmentProviderService } from "@medusajs/framework/utils";
import {
  Logger,
  FulfillmentOption,
  CalculatedShippingOptionPrice,
  CreateShippingOptionDTO,
  CalculateShippingOptionPriceDTO,
  FulfillmentItemDTO,
  FulfillmentOrderDTO,
  FulfillmentDTO,
  CreateFulfillmentResult,
  ValidateFulfillmentDataContext,
} from "@medusajs/framework/types";

import { DelhiveryApiClient } from "./api-client";

type InjectedDependencies = {
  logger: Logger;
};

type Options = {
  pickupLocationName?: string;
};

interface DelhiveryFulfillmentData {
  waybill?: string;
  shipment_id?: string;
  tracking_url?: string;
  external_id?: string;
}

class DelhiveryFulfillmentProviderService extends AbstractFulfillmentProviderService {
  static identifier = "delhivery";

  protected logger_: Logger;
  protected options_: Options;
  protected client_: DelhiveryApiClient;

  constructor({ logger }: InjectedDependencies, options: Options) {
    super();

    this.logger_ = logger;
    this.options_ = options;
    this.client_ = new DelhiveryApiClient();
  }

  async getFulfillmentOptions(): Promise<FulfillmentOption[]> {
    return [
      {
        id: "delhivery-surface",
        name: "Delhivery Surface Shipping",
        shipping_mode: "Surface",
      },
      {
        id: "delhivery-express",
        name: "Delhivery Express Shipping",
        shipping_mode: "Express",
      },
    ];
  }

  async validateOption(data: Record<string, unknown>): Promise<boolean> {
    return data.shipping_mode === "Surface" || data.shipping_mode === "Express";
  }

  async validateFulfillmentData(
    optionData: Record<string, unknown>,
    data: Record<string, unknown>,
    context: ValidateFulfillmentDataContext,
  ): Promise<Record<string, unknown>> {
    const { shipping_address } = context;

    if (!shipping_address?.postal_code) {
      throw new Error("Delivery pincode is required");
    }

    const result = await this.client_.checkServiceability(shipping_address.postal_code);

    // Handle new format with delivery_codes array
    if (result.delivery_codes && Array.isArray(result.delivery_codes)) {
      if (result.delivery_codes.length === 0) {
        throw new Error(`Pincode ${shipping_address.postal_code} is not serviceable by Delhivery`);
      }

      const postalData = result.delivery_codes[0]?.postal_code;
      if (!postalData) {
        throw new Error(`Pincode ${shipping_address.postal_code} is not serviceable by Delhivery`);
      }

      if (postalData.remarks === "Embargo") {
        throw new Error(
          `Pincode ${shipping_address.postal_code} is temporarily non-serviceable (Embargo)`,
        );
      }

      if (postalData.pre_paid !== "Y" && postalData.cod !== "Y") {
        throw new Error(
          `Pincode ${shipping_address.postal_code} has no available service (neither prepaid nor COD)`,
        );
      }

      return {
        ...data,
        shipping_mode: optionData.shipping_mode,
        pincode: shipping_address.postal_code,
        serviceable: true,
        city: postalData.city,
        state: postalData.state_code,
        district: postalData.district,
        prepaid_available: postalData.pre_paid === "Y",
        cod_available: postalData.cod === "Y",
      };
    }

    const pinData = result[shipping_address.postal_code];
    if (!pinData) {
      throw new Error(`Pincode ${shipping_address.postal_code} is not serviceable by Delhivery`);
    }

    return {
      ...data,
      shipping_mode: optionData.shipping_mode,
      pincode: shipping_address.postal_code,
      serviceable: true,
      city: pinData.city,
      state: pinData.state,
    };
  }

  async canCalculate(): Promise<boolean> {
    return true;
  }

  async calculatePrice(
    optionData: CalculateShippingOptionPriceDTO["optionData"],
    data: CalculateShippingOptionPriceDTO["data"],
    context: CalculateShippingOptionPriceDTO["context"],
  ): Promise<CalculatedShippingOptionPrice> {
    const { shipping_address, items, from_location } = context;

    const paymentMethod = data.paymentMethod;

    if (!paymentMethod) {
      return {
        calculated_amount: 0,
        is_calculated_price_tax_inclusive: false,
      };
    }

    console.log("Shipping Address", JSON.stringify(shipping_address, null, 2));

    if (!shipping_address?.postal_code) {
      throw new Error("Delivery pincode missing");
    }

    if (!from_location?.address?.postal_code) {
      throw new Error("Origin warehouse pincode missing");
    }

    const destination = shipping_address.postal_code;
    const origin = from_location.address.postal_code;

    // Calculate weight in grams from items
    if (!items?.length) {
      throw new Error("Items are required to calculate weight");
    }

    const totalWeightGrams = items.reduce((sum, item) => {
      const w = (item as any).variant?.weight || 0;
      return sum + w * Number(item.quantity);
    }, 0);

    if (totalWeightGrams <= 0) {
      throw new Error(
        "Total weight must be greater than 0. Please ensure all product variants have weight configured.",
      );
    }

    // Convert Medusa shipping mode → Delhivery API format
    const delhiveryMode = optionData?.shipping_mode === "Surface" ? "S" : "E";

    const pricingResponse = await this.client_.calculateShippingCost({
      originPincode: origin,
      destinationPincode: destination,
      weightInGrams: totalWeightGrams,
      mode: delhiveryMode,
      status: "Delivered",
      paymentType: paymentMethod === "PREPAID" ? "Pre-paid" : "COD",
    });

    // Extract pricing details from Delhivery response
    let pricingData;

    if (Array.isArray(pricingResponse) && pricingResponse.length > 0) {
      pricingData = pricingResponse[0];
    } else if (pricingResponse?.total_amount) {
      pricingData = pricingResponse;
    }

    if (!pricingData || !pricingData.total_amount) {
      throw new Error("Failed to calculate shipping cost");
    }

    // Extract tax information
    const netAmount = pricingData.total_amount;

    return {
      calculated_amount: netAmount,
      is_calculated_price_tax_inclusive: false,
    };
  }

  async createFulfillment(
    data: Record<string, unknown>,
    items: Partial<Omit<FulfillmentItemDTO, "fulfillment">>[],
    order: Partial<FulfillmentOrderDTO> | undefined,
    fulfillment: Partial<Omit<FulfillmentDTO, "provider_id" | "data" | "items">>,
  ): Promise<CreateFulfillmentResult> {
    console.log("createFulfillment called", JSON.stringify(data, null, 2));
    console.log("items", JSON.stringify(items, null, 2));
    console.log("fulfillment", JSON.stringify(fulfillment, null, 2));
    console.log("order", JSON.stringify(order, null, 2));

    const paymentMethod = data.paymentMethod;

    if (paymentMethod !== "COD" && paymentMethod !== "PREPAID") {
      throw new Error("Payment method is required");
    }

    if (paymentMethod === "PREPAID" && data.cod_available != true) {
      throw new Error("COD payment method is not supported");
    }

    if (paymentMethod === "PREPAID" && data.prepaid_available != true) {
      throw new Error("COD payment method is not supported");
    }

    const delivery = (fulfillment as any).delivery_address;

    if (!delivery) {
      throw new Error("Delivery address missing");
    }

    if (!order?.items?.length) {
      throw new Error("Items are required for fulfillment");
    }

    // Calculate weight in grams from items
    const totalWeightGrams = order.items.reduce((sum, i) => {
      const w = (i as any).variant?.weight || 0;
      return sum + w * (i.quantity || 1);
    }, 0);

    const products_desc = order.items
      .map((item) => {
        const title = item.title || "";
        const subtitle = item.subtitle || "";
        const qty = item.quantity || 1;
        return `${title}-${subtitle}-${qty}`;
      })
      .join(", ");

    const totalAmount = data.totalAmount;

    if (!totalAmount) {
      throw new Error("Total amount is required");
    }

    if (totalWeightGrams <= 0) {
      throw new Error(
        "Total weight must be greater than 0. Please ensure all product variants have weight configured.",
      );
    }

    const shippingMode = (data.shipping_mode as string) || "Surface";
    const validShippingMode: "Surface" | "Express" =
      shippingMode === "Express" ? "Express" : "Surface";

    const shipment = {
      name: `${delivery.first_name} ${delivery.last_name}`.trim(),
      order: (order?.display_id || order?.id || "").toString(),
      phone: delivery.phone,
      add: `${delivery.address_1} ${delivery.address_2 || ""}`.trim(),
      pin: parseInt(delivery.postal_code),
      city: delivery.city,
      state: delivery.province,
      country: delivery.country_code,
      weight: totalWeightGrams,
      payment_mode: paymentMethod === "PREPAID" ? "Prepaid" as const : "COD" as const,
      cod_amount: paymentMethod === "COD" ? Number(totalAmount) : undefined,
      shipping_mode: validShippingMode,
      products_desc: products_desc,
      total_amount: Number(totalAmount),
      quantity: items.reduce((sum, i) => sum + (i.quantity || 1), 0).toString(),
    };

    console.log("shipment", shipment);

    const response = await this.client_.createShipment(shipment, {
      name: this.options_.pickupLocationName || "Jardin Botanica",
    });

    const waybill = response?.packages?.[0]?.waybill || response?.waybill || response?.rmk;

    if (!waybill) {
      throw new Error("Failed to create shipment: No waybill returned");
    }

    return {
      data: {
        waybill,
        shipment_id: response?.shipment_id,
        tracking_url: `https://www.delhivery.com/api/packages/json/?waybill=${waybill}`,
        external_id: response?.external_id,
      },
      labels: [
        {
          tracking_number: waybill,
          tracking_url: `https://www.delhivery.com/api/packages/json/?waybill=${waybill}`,
          label_url: `https://www.delhivery.com/api/packages/json/?waybill=${waybill}`,
        },
      ],
    };
  }

  async cancelFulfillment(data: Record<string, unknown>): Promise<void> {
    const { waybill } = data as DelhiveryFulfillmentData;

    if (!waybill) {
      throw new Error("Waybill required for cancellation");
    }

    await this.client_.cancelShipment({ waybill, cancellation: "true" });
  }

  // async createReturnFulfillment(
  //   fulfillment: Record<string, unknown>,
  // ): Promise<CreateFulfillmentResult> {
  //   return {
  //     data: {
  //       ...fulfillment,
  //       is_return: true,
  //     },
  //   };
  // }

  // async getFulfillmentDocuments(data: Record<string, unknown>): Promise<any[]> {
  //   const f = data as DelhiveryFulfillmentData;

  //   if (!f.waybill) return [];

  //   return [
  //     {
  //       type: "tracking",
  //       waybill: f.waybill,
  //       url: f.tracking_url,
  //     },
  //   ];
  // }

  // async getShipmentDocuments(data: Record<string, unknown>): Promise<any[]> {
  //   return this.getFulfillmentDocuments(data);
  // }

  // async getReturnDocuments(data: Record<string, unknown>): Promise<any[]> {
  //   return this.getFulfillmentDocuments(data);
  // }

  async retrieveDocuments(data: Record<string, unknown>, type: string): Promise<any> {
    const f = data as DelhiveryFulfillmentData;

    if (type === "tracking" && f.waybill) {
      return await this.client_.trackShipment(f.waybill);
    }

    return null;
  }
}

export default DelhiveryFulfillmentProviderService;
