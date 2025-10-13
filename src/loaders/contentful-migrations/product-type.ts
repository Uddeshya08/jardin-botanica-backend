import Migration, { 
  MigrationContext,
} from "contentful-migration"

export function productTypeMigration(
  migration: Migration,
  context?: MigrationContext
) {
  const productType = migration
    .createContentType("productType")
    .name("Product Type")
    .displayField("value")

  productType
    .createField("value")
    .name("Value")
    .type("Symbol")
    .required(true)
  productType
    .createField("medusaId")
    .name("Medusa ID")
    .type("Symbol")
}

