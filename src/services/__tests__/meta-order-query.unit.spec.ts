import { Query } from "@medusajs/modules-sdk";
import { META_ORDER_FIELDS } from "../meta-order-query";

describe("Meta order query relation syntax", () => {
  it("parses calculation inputs as relations through the real graph query parser", async () => {
    const remoteQuery = {
      getEntitiesMap: () => ({}),
      query: jest.fn().mockResolvedValue([]),
    };
    const query = new Query({ remoteQuery, indexModule: undefined } as any);
    await query.graph({ entity: "order", fields: META_ORDER_FIELDS });
    const normalized = remoteQuery.query.mock.calls[0][0].order;
    expect(normalized.__fields).toContain("total");
    expect(normalized.__fields.some((field: string) => field.startsWith("*"))).toBe(false);
    expect(Object.keys(normalized).some((key) => key.startsWith("*"))).toBe(false);
    expect(normalized.items).toMatchObject({
      __fields: ["*"], detail: { __fields: ["*"] },
      tax_lines: { __fields: ["*"] }, adjustments: { __fields: ["*"] },
    });
    expect(normalized.shipping_methods).toMatchObject({
      __fields: ["*"], tax_lines: { __fields: ["*"] }, adjustments: { __fields: ["*"] },
    });
    expect(normalized.credit_lines.__fields).toEqual(["*"]);
  });
});
