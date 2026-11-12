export const metaFbpSchema = /^fb\.\d+\.\d{13}\.\d+$/;
export const metaFbcSchema = /^fb\.\d+\.\d{13}\.[a-zA-Z0-9_.-]+$/;

export function metaBrowserIdentifiers(fbp: unknown, fbc: unknown): { fbp?: string; fbc?: string } {
  return {
    ...(typeof fbp === "string" && fbp.length <= 256 && metaFbpSchema.test(fbp) ? { fbp } : {}),
    ...(typeof fbc === "string" && fbc.length <= 512 && metaFbcSchema.test(fbc) ? { fbc } : {}),
  };
}
