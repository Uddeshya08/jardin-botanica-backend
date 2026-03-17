import { defineWidgetConfig } from "@medusajs/admin-sdk";
import type { AdminOrder, DetailWidgetProps } from "@medusajs/framework/types";
import { Badge, Container, Heading, Text } from "@medusajs/ui";
import { useEffect, useState } from "react";

type BundleItemMetadata = {
  variant_id: string;
  quantity: number;
  product_title?: string;
  variant_title?: string;
  variant_display_title?: string;
};

type BundleChoiceItemMetadata = BundleItemMetadata & {
  slot_id?: string;
  slot_name?: string;
  slot_description?: string;
  option_id?: string;
};

interface BundleMetadata {
  _bundle_id: string;
  _bundle_title: string;
  _bundle_price: number;
  _bundle_personalized_note?: string;
  _bundle_selections?: Record<string, string[]>;
  _bundle_items?: BundleItemMetadata[];
  _bundle_choice_items?: BundleChoiceItemMetadata[];
}

type VariantLookupEntry = {
  product_title?: string;
  variant_title?: string;
  variant_display_title?: string;
};

const formatCurrency = (amount?: number) => {
  if (typeof amount !== "number") {
    return null;
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
};

const getBundleQuantity = (quantity: unknown) => {
  const parsedQuantity = Number(quantity);

  if (!Number.isFinite(parsedQuantity) || parsedQuantity < 1) {
    return 1;
  }

  return parsedQuantity;
};

const getItemPrimaryTitle = (
  item: BundleItemMetadata | BundleChoiceItemMetadata,
  fallbackLookup?: VariantLookupEntry
) => {
  return (
    item.product_title ||
    fallbackLookup?.product_title ||
    item.variant_title ||
    fallbackLookup?.variant_title ||
    "Unknown item"
  );
};

const getItemSecondaryTitle = (
  item: BundleItemMetadata | BundleChoiceItemMetadata,
  fallbackLookup?: VariantLookupEntry
) => {
  return (
    item.variant_display_title ||
    fallbackLookup?.variant_display_title ||
    item.variant_title ||
    fallbackLookup?.variant_title ||
    item.variant_id
  );
};

const BundleItemList = ({
  title,
  items,
  bundleQuantity,
  variantLookup,
}: {
  title: string;
  items: Array<BundleItemMetadata | BundleChoiceItemMetadata>;
  bundleQuantity: number;
  variantLookup: Record<string, VariantLookupEntry>;
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-y-3">
      <Text size="small" weight="plus" className="text-ui-fg-base">
        {title}
      </Text>
      <div className="overflow-hidden rounded-lg border border-ui-border-base">
        <div className="divide-y divide-ui-border-base">
          {items.map((bundleItem, index) => {
            const fallbackLookup = variantLookup[bundleItem.variant_id];
            const totalQuantity = getBundleQuantity(bundleItem.quantity) * bundleQuantity;

            return (
              <div
                key={`${bundleItem.variant_id}-${index}`}
                className="flex items-start justify-between gap-x-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <Text size="small" weight="plus" className="text-ui-fg-base">
                    {getItemPrimaryTitle(bundleItem, fallbackLookup)}
                  </Text>
                  <Text size="small" className="text-ui-fg-subtle">
                    {getItemSecondaryTitle(bundleItem, fallbackLookup)}
                  </Text>
                </div>
                <Badge size="2xsmall" color="grey">
                  Qty {totalQuantity}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const BundleChoiceGroups = ({
  items,
  bundleQuantity,
  variantLookup,
}: {
  items: BundleChoiceItemMetadata[];
  bundleQuantity: number;
  variantLookup: Record<string, VariantLookupEntry>;
}) => {
  if (items.length === 0) {
    return null;
  }

  const groupedItems = items.reduce<Record<string, BundleChoiceItemMetadata[]>>((acc, item) => {
    const groupKey = item.slot_id || item.slot_name || "selection";
    acc[groupKey] = acc[groupKey] || [];
    acc[groupKey].push(item);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-y-4">
      <Text size="small" weight="plus" className="text-ui-fg-base">
        Customer selections
      </Text>
      {Object.entries(groupedItems).map(([groupKey, groupItems]) => {
        const slotTitle = groupItems[0]?.slot_name || "Selection";
        const slotDescription = groupItems[0]?.slot_description;

        return (
          <div key={groupKey} className="rounded-lg border border-ui-border-base">
            <div className="border-b border-ui-border-base px-4 py-3">
              <Text size="small" weight="plus" className="text-ui-fg-base">
                {slotTitle}
              </Text>
              {slotDescription ? (
                <Text size="small" className="text-ui-fg-subtle">
                  {slotDescription}
                </Text>
              ) : null}
            </div>
            <div className="divide-y divide-ui-border-base">
              {groupItems.map((choiceItem, index) => {
                const fallbackLookup = variantLookup[choiceItem.variant_id];
                const totalQuantity = getBundleQuantity(choiceItem.quantity) * bundleQuantity;

                return (
                  <div
                    key={`${choiceItem.option_id || choiceItem.variant_id}-${index}`}
                    className="flex items-start justify-between gap-x-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <Text size="small" weight="plus" className="text-ui-fg-base">
                        {getItemPrimaryTitle(choiceItem, fallbackLookup)}
                      </Text>
                      <Text size="small" className="text-ui-fg-subtle">
                        {getItemSecondaryTitle(choiceItem, fallbackLookup)}
                      </Text>
                    </div>
                    <Badge size="2xsmall" color="grey">
                      Qty {totalQuantity}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const OrderBundleDetailsWidget = ({ data: order }: DetailWidgetProps<AdminOrder>) => {
  const bundleItems = order.items?.filter((item) => item.metadata?._bundle_id) || [];
  const [variantLookup, setVariantLookup] = useState<Record<string, VariantLookupEntry>>({});
  const missingVariantIds = Array.from(
    new Set(
      bundleItems.flatMap((item) => {
        const bundleMeta = item.metadata as unknown as BundleMetadata;
        const metadataItems = [...(bundleMeta._bundle_items || []), ...(bundleMeta._bundle_choice_items || [])];

        return metadataItems
          .filter((entry) => !entry.product_title && !entry.variant_title && !entry.variant_display_title)
          .map((entry) => entry.variant_id)
          .filter(Boolean);
      })
    )
  );
  const variantLookupRequestKey = missingVariantIds.slice().sort().join("|");

  useEffect(() => {
    if (missingVariantIds.length === 0) {
      setVariantLookup({});
      return;
    }

    let isCancelled = false;

    const fetchVariantDetails = async () => {
      try {
        const query = new URLSearchParams({
          limit: String(missingVariantIds.length),
          fields: "id,title,product.title,options.value,options.option.title",
        });

        missingVariantIds.forEach((variantId) => {
          query.append("id[]", variantId);
        });

        const response = await fetch(`/admin/product-variants?${query.toString()}`, {
          credentials: "include",
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch variants (${response.status})`);
        }

        const data = await response.json();
        const nextLookup = (data?.variants || []).reduce(
          (acc: Record<string, VariantLookupEntry>, variant: any) => {
            const optionText = (variant?.options || [])
              .map((optionValue: any) => {
                const optionTitle = optionValue?.option?.title?.trim();
                const value = optionValue?.value?.trim();

                if (optionTitle && value) {
                  return `${optionTitle}: ${value}`;
                }

                return value || optionTitle || null;
              })
              .filter(Boolean)
              .join(", ");

            acc[variant.id] = {
              product_title: variant?.product?.title || undefined,
              variant_title: variant?.title || undefined,
              variant_display_title: optionText || undefined,
            };

            return acc;
          },
          {}
        );

        if (!isCancelled) {
          setVariantLookup(nextLookup);
        }
      } catch (error) {
        console.error("Error fetching bundle variant details:", error);
        if (!isCancelled) {
          setVariantLookup({});
        }
      }
    };

    fetchVariantDetails();

    return () => {
      isCancelled = true;
    };
  }, [variantLookupRequestKey]);

  if (bundleItems.length === 0) {
    return null;
  }

  return (
    <Container>
      <div className="flex flex-col gap-y-4">
        <div>
          <Heading level="h2">Gift Sets</Heading>
          <Text size="small" className="text-ui-fg-subtle">
            Bundle contents, customer selections, and note details.
          </Text>
        </div>

        <div className="flex flex-col gap-y-4">
          {bundleItems.map((item, index) => {
            const bundleMeta = item.metadata as unknown as BundleMetadata;
            const bundleQuantity = getBundleQuantity(item.quantity);
            const unitPrice = typeof bundleMeta._bundle_price === "number" ? bundleMeta._bundle_price : Number(item.unit_price || 0);
            const lineTotal = unitPrice * bundleQuantity;
            const fixedItems = bundleMeta._bundle_items || [];
            const choiceItems = bundleMeta._bundle_choice_items || [];

            return (
              <div
                key={item.id || `${bundleMeta._bundle_id}-${index}`}
                className="rounded-lg border border-ui-border-base"
              >
                <div className="flex items-start justify-between gap-4 border-b border-ui-border-base px-4 py-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Text weight="plus" className="text-ui-fg-base">
                        {bundleMeta._bundle_title || item.title || "Gift Set"}
                      </Text>
                      <Badge size="2xsmall" color="blue">
                        Gift set
                      </Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                      <Text size="small" className="text-ui-fg-subtle">
                        Quantity: {bundleQuantity}
                      </Text>
                      {formatCurrency(unitPrice) ? (
                        <Text size="small" className="text-ui-fg-subtle">
                          Unit price: {formatCurrency(unitPrice)}
                        </Text>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <Text size="small" className="text-ui-fg-subtle">
                      Line total
                    </Text>
                    <Text weight="plus" className="text-ui-fg-base">
                      {formatCurrency(lineTotal) || "N/A"}
                    </Text>
                  </div>
                </div>

                <div className="flex flex-col gap-y-5 px-4 py-4">
                  <BundleItemList
                    title="Included items"
                    items={fixedItems}
                    bundleQuantity={bundleQuantity}
                    variantLookup={variantLookup}
                  />

                  <BundleChoiceGroups
                    items={choiceItems}
                    bundleQuantity={bundleQuantity}
                    variantLookup={variantLookup}
                  />

                  {bundleMeta._bundle_personalized_note ? (
                    <div className="flex flex-col gap-y-2 rounded-lg border border-ui-border-base px-4 py-3">
                      <Text size="small" weight="plus" className="text-ui-fg-base">
                        Personalized note
                      </Text>
                      <Text size="small" className="whitespace-pre-wrap text-ui-fg-subtle">
                        {bundleMeta._bundle_personalized_note}
                      </Text>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Container>
  );
};

export const config = defineWidgetConfig({
  zone: "order.details.after",
});

export default OrderBundleDetailsWidget;
