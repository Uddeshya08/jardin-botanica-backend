import Migration, { 
  MigrationContext,
} from "contentful-migration"

export function productCollectionMigration(
  migration: Migration,
  context?: MigrationContext
) {
  const collection = migration
    .createContentType("collection")
    .name("Product Collection")
    .displayField("title")

    collection
      .createField("title")
      .name("Title")
      .type("Symbol")
      .required(true)
    collection
      .createField("medusaId")
      .name("Medusa ID")
      .type("Symbol")
}