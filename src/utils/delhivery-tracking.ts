export const DELHIVERY_PROVIDER_ID = "delhivery_delhivery";

const stages = {
  manifested: "Ready to ship",
  pending: "Pending",
  "ready for pickup": "Ready for pickup",
  "picked up": "Picked up",
  "in transit": "In transit",
  dispatched: "Out for delivery",
  "out for delivery": "Out for delivery",
  delivered: "Delivered",
} as const;

export type DelhiveryTracking = {
  status: string;
  stage: string;
  scannedAt: string;
  shipped: boolean;
  delivered: boolean;
  terminal: boolean;
};

export function getDelhiveryTracking(
  response: { ShipmentData?: { Shipment?: {
    AWB?: unknown;
    Status?: { Status?: unknown; StatusType?: unknown; StatusDateTime?: unknown };
  } }[] } | null,
  waybill: string,
): DelhiveryTracking | null {
  if (!Array.isArray(response?.ShipmentData)) return null;
  const shipment = response.ShipmentData.find((entry) => String(entry?.Shipment?.AWB) === waybill)?.Shipment;
  const scan = shipment?.Status;
  if (typeof scan?.Status !== "string" || typeof scan.StatusDateTime !== "string") return null;

  // Delhivery's offset-free scan times are India local time.
  const rawDate = scan.StatusDateTime.trim().replace(" ", "T");
  const date = new Date(/(?:Z|[+-]\d\d:?\d\d)$/i.test(rawDate) ? rawDate : `${rawDate}+05:30`);
  if (!Number.isFinite(date.getTime())) return null;

  const status = scan.Status.trim().slice(0, 100);
  if (!status) return null;
  const key = status.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  const type = typeof scan.StatusType === "string" ? scan.StatusType.trim().toUpperCase() : "";
  const forward = type === "UD" || type === "DL";
  const delivered = key === "delivered" && type === "DL";
  const shipped = delivered || (forward && ["picked up", "in transit", "dispatched", "out for delivery"].includes(key));
  const returning = type === "RT" || type === "RTO" || type === "DTO" || /\b(rto|returned|return to origin)\b/i.test(status);
  const canceled = /^(cancelled|canceled)$/.test(key);
  const terminal = delivered || canceled || (returning && key === "delivered") ||
    ["rto returned", "returned rto", "returned"].includes(key);
  const label = Object.prototype.hasOwnProperty.call(stages, key) ? stages[key as keyof typeof stages] : status;
  const stage = returning ? `Return · ${status}` : label;
  return { status, stage, scannedAt: date.toISOString(), shipped: !returning && shipped, delivered, terminal };
}
