export const COD_HANDLING_FEE = 100;

// Complimentary shipping is on by default. Set false to resume charging carrier rates.
export const isFreeShippingEnabled = (): boolean => process.env.FREE_SHIPPING_ENABLED !== "false";
