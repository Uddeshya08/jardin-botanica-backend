import { MedusaService } from "@medusajs/framework/utils";
import { Bundle } from "./models/Bundle";
import { BundleItem } from "./models/BundleItem";
import { ChoiceSlot } from "./models/ChoiceSlot";
import { ChoiceOption } from "./models/ChoiceOption";

class ProductBundleService extends MedusaService({
  Bundle,
  BundleItem,
  ChoiceSlot,
  ChoiceOption,
}) {
  async createBundle(data: {
    title: string;
    description?: string;
    medusa_product_id?: string;
    medusa_variant_id?: string;
    bundle_price: number;
    bundle_image?: string;
    is_active?: boolean;
    metadata?: Record<string, unknown>;
    items?: Array<{
      medusa_variant_id: string;
      quantity: number;
      sort_order?: number;
    }>;
    choice_slots?: Array<{
      slot_name: string;
      slot_description?: string;
      required?: boolean;
      min_selections?: number;
      max_selections?: number;
      sort_order?: number;
      options: Array<{
        medusa_variant_id: string;
        quantity?: number;
        sort_order?: number;
      }>;
    }>;
  }) {
    const { items, choice_slots, ...bundleData } = data;

    const bundle = await this.createBundles(bundleData);

    if (items && items.length > 0) {
      const bundleItems = items.map((item, index) => ({
        bundle_id: bundle.id,
        medusa_variant_id: item.medusa_variant_id,
        quantity: item.quantity,
        sort_order: item.sort_order ?? index,
      }));
      await this.createBundleItems(bundleItems);
    }

    if (choice_slots && choice_slots.length > 0) {
      for (const slot of choice_slots) {
        const choiceSlot = await this.createChoiceSlots({
          bundle_id: bundle.id,
          slot_name: slot.slot_name,
          slot_description: slot.slot_description,
          required: slot.required ?? true,
          min_selections: slot.min_selections ?? 1,
          max_selections: slot.max_selections ?? 1,
          sort_order: slot.sort_order ?? 0,
        });

        if (slot.options && slot.options.length > 0) {
          const options = slot.options.map((option, index) => ({
            choice_slot_id: choiceSlot.id,
            medusa_variant_id: option.medusa_variant_id,
            quantity: option.quantity ?? 1,
            sort_order: option.sort_order ?? index,
          }));
          await this.createChoiceOptions(options);
        }
      }
    }

    return this.retrieveBundle(bundle.id, {
      relations: ["items", "choice_slots", "choice_slots.options"],
    });
  }

  async updateBundle(
    id: string,
    data: {
      title?: string;
      description?: string;
      medusa_product_id?: string;
      medusa_variant_id?: string;
      bundle_price?: number;
      bundle_image?: string;
      is_active?: boolean;
      metadata?: Record<string, unknown>;
      items?: Array<{
        medusa_variant_id: string;
        quantity: number;
        sort_order?: number;
      }>;
      choice_slots?: Array<{
        slot_name: string;
        slot_description?: string;
        required?: boolean;
        min_selections?: number;
        max_selections?: number;
        sort_order?: number;
        options?: Array<{
          medusa_variant_id: string;
          quantity?: number;
          sort_order?: number;
        }>;
      }>;
    }
  ) {
    const { items, choice_slots, ...bundleData } = data;
    
    await this.updateBundles({ id, ...bundleData });
    
    if (items !== undefined) {
      const existingItems = await this.listBundleItems({ bundle_id: id });
      for (const item of existingItems) {
        await this.deleteBundleItems(item.id);
      }
      
      if (items.length > 0) {
        const bundleItems = items.map((item, index) => ({
          bundle_id: id,
          medusa_variant_id: item.medusa_variant_id,
          quantity: item.quantity,
          sort_order: item.sort_order ?? index,
        }));
        await this.createBundleItems(bundleItems);
      }
    }
    
    if (choice_slots !== undefined) {
      const existingSlots = await this.listChoiceSlots({ bundle_id: id });
      for (const slot of existingSlots) {
        const existingOptions = await this.listChoiceOptions({ choice_slot_id: slot.id });
        for (const opt of existingOptions) {
          await this.deleteChoiceOptions(opt.id);
        }
        await this.deleteChoiceSlots(slot.id);
      }
      
      if (choice_slots.length > 0) {
        for (const slot of choice_slots) {
          const choiceSlot = await this.createChoiceSlots({
            bundle_id: id,
            slot_name: slot.slot_name,
            slot_description: slot.slot_description,
            required: slot.required ?? true,
            min_selections: slot.min_selections ?? 1,
            max_selections: slot.max_selections ?? 1,
            sort_order: slot.sort_order ?? 0,
          });

          if (slot.options && slot.options.length > 0) {
            const options = slot.options.map((option, index) => ({
              choice_slot_id: choiceSlot.id,
              medusa_variant_id: option.medusa_variant_id,
              quantity: option.quantity ?? 1,
              sort_order: option.sort_order ?? index,
            }));
            await this.createChoiceOptions(options);
          }
        }
      }
    }
    
    const bundle = await this.retrieveBundle(id);
    if (!bundle) return null;

    const updatedItems = await this.listBundleItems({ bundle_id: id });
    const choiceSlots = await this.listChoiceSlots({ bundle_id: id });

    const choiceSlotsWithOptions = await Promise.all(
      choiceSlots.map(async (slot) => {
        const options = await this.listChoiceOptions({ choice_slot_id: slot.id });
        return { ...slot, options };
      })
    );

    return { ...bundle, items: updatedItems || [], choice_slots: choiceSlotsWithOptions || [] };
  }

  async addBundleItem(data: {
    bundle_id: string;
    medusa_variant_id: string;
    quantity: number;
    sort_order?: number;
  }) {
    return this.createBundleItems(data);
  }

  async removeBundleItem(id: string) {
    await this.deleteBundleItems(id);
  }

  async addChoiceSlot(data: {
    bundle_id: string;
    slot_name: string;
    slot_description?: string;
    required?: boolean;
    min_selections?: number;
    max_selections?: number;
    sort_order?: number;
    options: Array<{
      medusa_variant_id: string;
      quantity?: number;
      sort_order?: number;
    }>;
  }) {
    const { options, ...slotData } = data;
    const slot = await this.createChoiceSlots({
      ...slotData,
      bundle_id: data.bundle_id,
    });

    if (options && options.length > 0) {
      const choiceOptions = options.map((option, index) => ({
        choice_slot_id: slot.id,
        medusa_variant_id: option.medusa_variant_id,
        quantity: option.quantity ?? 1,
        sort_order: option.sort_order ?? index,
      }));
      await this.createChoiceOptions(choiceOptions);
    }

    return this.retrieveChoiceSlot(slot.id, {
      relations: ["options"],
    });
  }

  async addChoiceOption(data: {
    choice_slot_id: string;
    medusa_variant_id: string;
    quantity?: number;
    sort_order?: number;
  }) {
    return this.createChoiceOptions(data);
  }

  async removeChoiceSlot(id: string) {
    await this.deleteChoiceSlots(id);
  }

  async getBundleWithDetails(id: string) {
    const bundle = await this.retrieveBundle(id);
    if (!bundle) return null;

    const items = await this.listBundleItems({ bundle_id: id });
    const choiceSlots = await this.listChoiceSlots({ bundle_id: id });

    const choiceSlotsWithOptions = await Promise.all(
      choiceSlots.map(async (slot) => {
        const options = await this.listChoiceOptions({ choice_slot_id: slot.id });
        return { ...slot, options };
      })
    );

    return { ...bundle, items: items || [], choice_slots: choiceSlotsWithOptions || [] };
  }

  async listBundlesWithDetails() {
    const bundles = await this.listBundles({ is_active: true });

    const bundlesWithDetails = await Promise.all(
      bundles.map(async (bundle) => {
        const items = await this.listBundleItems({ bundle_id: bundle.id });
        const choiceSlots = await this.listChoiceSlots({ bundle_id: bundle.id });

        const choiceSlotsWithOptions = await Promise.all(
          choiceSlots.map(async (slot) => {
            const options = await this.listChoiceOptions({ choice_slot_id: slot.id });
            return { ...slot, options };
          })
        );

        return { ...bundle, items: items || [], choice_slots: choiceSlotsWithOptions || [] };
      })
    );

    return bundlesWithDetails;
  }

  async validateBundleSelections(
    bundleId: string,
    selections: Record<string, string[]>
  ) {
    const bundle = await this.retrieveBundle(bundleId);
    if (!bundle) {
      return { valid: false, errors: ["Bundle not found"] };
    }

    const choiceSlots = await this.listChoiceSlots({ bundle_id: bundleId });

    const choiceSlotsWithOptions = await Promise.all(
      choiceSlots.map(async (slot) => {
        const options = await this.listChoiceOptions({ choice_slot_id: slot.id });
        return { ...slot, options };
      })
    );

    const errors: string[] = [];

    for (const slot of choiceSlotsWithOptions) {
      // Try to find selections by slot ID first, then by slot name
      let selectedOptions = selections[slot.id] || selections[slot.slot_name] || [];
      
      // If selections are empty and there's only one slot, try to use any available selection
      if (selectedOptions.length === 0 && Object.keys(selections).length > 0) {
        const allValues = Object.values(selections).flat();
        if (allValues.length > 0) {
          selectedOptions = allValues;
        }
      }
      
      if (slot.required && selectedOptions.length === 0) {
        errors.push(`Slot "${slot.slot_name}" requires a selection`);
        continue;
      }

      if (selectedOptions.length < slot.min_selections) {
        errors.push(
          `Slot "${slot.slot_name}" requires at least ${slot.min_selections} selection(s)`
        );
      }

      if (selectedOptions.length > slot.max_selections) {
        errors.push(
          `Slot "${slot.slot_name}" allows at most ${slot.max_selections} selection(s)`
        );
      }

      // Accept both option IDs and option display names
      const validOptionIds = slot.options?.map((o) => o.id) || [];
      const validOptionNames = slot.options?.map((o) => o.medusa_variant_id) || [];
      
      for (const optionValue of selectedOptions) {
        const isValidId = validOptionIds.includes(optionValue);
        const isValidName = validOptionNames.some((name: string) => 
          name?.toLowerCase().includes(optionValue.toLowerCase()) ||
          optionValue.toLowerCase().includes(name?.toLowerCase() || '')
        );
        
        if (!isValidId && !isValidName) {
          errors.push(`Invalid option "${optionValue}" for slot "${slot.slot_name}"`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async getBundleVariantIds(bundleId: string, selections: Record<string, string[]>): Promise<{
    variantIds: string[];
    quantities: Record<string, number>;
  }> {
    const bundle = await this.getBundleWithDetails(bundleId);
    if (!bundle) {
      throw new Error("Bundle not found");
    }

    const variantIds: string[] = [];
    const quantities: Record<string, number> = {};

    for (const item of bundle.items || []) {
      variantIds.push(item.medusa_variant_id);
      quantities[item.medusa_variant_id] = (quantities[item.medusa_variant_id] || 0) + item.quantity;
    }

    for (const slot of bundle.choice_slots || []) {
      // Try to find selections by slot ID first, then by slot name
      let selectedOptions = selections[slot.id] || selections[slot.slot_name] || [];
      
      // If selections are empty and there's only one slot, try to use any available selection
      if (selectedOptions.length === 0 && Object.keys(selections).length > 0) {
        const allValues = Object.values(selections).flat();
        if (allValues.length > 0) {
          selectedOptions = allValues;
        }
      }
      
      for (const option of slot.options || []) {
        const isSelectedById = selectedOptions.includes(option.id);
        const isSelectedByName = selectedOptions.some((value: string) => 
          value?.toLowerCase() === option.medusa_variant_id?.toLowerCase() ||
          value?.toLowerCase().includes(option.medusa_variant_id?.toLowerCase() || '') ||
          (option.medusa_variant_id?.toLowerCase() || '').includes(value?.toLowerCase())
        );
        
        if (isSelectedById || isSelectedByName) {
          variantIds.push(option.medusa_variant_id);
          quantities[option.medusa_variant_id] = (quantities[option.medusa_variant_id] || 0) + option.quantity;
        }
      }
    }

    return { variantIds, quantities };
  }
}

export default ProductBundleService;
