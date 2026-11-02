// Meta matching values must be normalized before SHA-256 hashing. Unknown or
// absent demographic values must be omitted, never inferred from a name/email.
const INDIA_STATES: Record<string, string> = {
  andhrapradesh: "ap", arunachalpradesh: "ar", assam: "as", bihar: "br",
  chhattisgarh: "ct", goa: "ga", gujarat: "gj", haryana: "hr", himachalpradesh: "hp",
  jharkhand: "jh", karnataka: "ka", kerala: "kl", madhyapradesh: "mp",
  maharashtra: "mh", manipur: "mn", meghalaya: "ml", mizoram: "mz", nagaland: "nl",
  odisha: "or", orissa: "or", punjab: "pb", rajasthan: "rj", sikkim: "sk",
  tamilnadu: "tn", telangana: "tg", tripura: "tr", uttarpradesh: "up",
  uttarakhand: "ut", westbengal: "wb", andamanandnicobarislands: "an",
  chandigarh: "ch", dadraandnagarhavelianddamananddiu: "dh", delhi: "dl",
  jammuandkashmir: "jk", ladakh: "la", lakshadweep: "ld", puducherry: "py",
};

export function normalizeMetaMatchValue(field: string, input: unknown, country?: string): string | undefined {
  if (typeof input !== "string") return undefined;
  const value = input.trim().toLowerCase();
  if (!value) return undefined;
  if (field === "country") return /^[a-z]{2}$/.test(value) ? value : undefined;
  if (field === "ge") {
    if (value === "m" || value === "male") return "m";
    if (value === "f" || value === "female") return "f";
    return undefined;
  }
  if (field === "db") {
    if (!/^(?:\d{4}-\d{2}-\d{2}|\d{8})$/.test(value)) return undefined;
    const digits = value.replace(/-/g, "");
    const date = new Date(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.getTime() > Date.now() ||
      date.toISOString().slice(0, 10).replace(/-/g, "") !== digits) return undefined;
    return digits;
  }
  if (field === "zp") {
    const postal = value.replace(/\s/g, "").split("-")[0];
    return /^[a-z0-9]+$/.test(postal) ? postal : undefined;
  }
  if (field === "st") {
    const state = value.replace(/^[a-z]{2}-/, "").replace(/[^a-z]/g, "");
    if (country === "in") return INDIA_STATES[state] || (Object.values(INDIA_STATES).includes(state) ? state : undefined);
    return /^[a-z]{2}$/.test(state) ? state : undefined;
  }
  const text = value.replace(/[\p{N}\p{P}\p{S}\s]/gu, "");
  return text || undefined;
}
