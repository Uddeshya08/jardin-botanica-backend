import Migration, { 
  MigrationContext,
} from "contentful-migration"

export function regionMigration(
  migration: Migration,
  context?: MigrationContext
) {
  const region = migration
    .createContentType("region")
    .name("Region")
    .displayField("name")

  region
    .createField("name")
    .name("Name")
    .type("Symbol")
    .required(true)
  region
    .createField("currency_code")
    .name("Currency Code")
    .type("Symbol")
  region
    .createField("tax_rate")
    .name("Tax Rate")
    .type("Number")
  region
    .createField("countries")
    .name("Countries")
    .type("Object")
  region
    .createField("medusaId")
    .name("Medusa ID")
    .type("Symbol")
}

