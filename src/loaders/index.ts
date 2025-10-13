import { 
  ConfigModule, 
  StoreService, 
  MedusaContainer,
} from "@medusajs/medusa"
import { runMigration } from "contentful-migration"
import { 
  productMigration,
} from "./contentful-migrations/product"
import { 
  productVariantMigration,
} from "./contentful-migrations/product-variant"
import { 
  productCollectionMigration,
} from "./contentful-migrations/product-collection"
import { 
  productTypeMigration,
} from "./contentful-migrations/product-type"
import { 
  regionMigration,
} from "./contentful-migrations/region"

type ContentfulPluginType = {
  resolve: string
  options: {
    space_id: string
    access_token: string
    environment: string
  }
}

export default async (
  container: MedusaContainer,
  config: ConfigModule
): Promise<void> => {
  // ensure that migration only runs once
  const storeService = container.resolve<StoreService>(
    "storeService"
  )
  const store = await storeService.retrieve()

  if (store.metadata?.ran_contentful_migrations) {
    return
  }

  console.info("Running contentful migrations...")
  
  // load Contentful options
  const contentfulPlugin = config.plugins
    .find((plugin) => 
      typeof plugin === "object" && 
      plugin.resolve === "medusa-plugin-contentful"
    ) as ContentfulPluginType

  if (!contentfulPlugin) {
    console.log(
      "Didn't find Contentful plugin. Aborting migration..."
    )
    return
  }

  const options = {
    spaceId: contentfulPlugin.options.space_id,
    accessToken: contentfulPlugin.options.access_token,
    environment: contentfulPlugin.options.environment,
    yes: true,
  }

  const migrationFunctions = [
    {
      name: "Product",
      function: productMigration,
    },
    {
      name: "Product Variant",
      function: productVariantMigration,
    },
    {
      name: "Product Collection",
      function: productCollectionMigration,
    },
    {
      name: "Product Type",
      function: productTypeMigration,
    },
    {
      name: "Region",
      function: regionMigration,
    },
  ]

  await Promise.all(
    migrationFunctions.map(async (migrationFunction) => {
      console.info(`Migrating ${
        migrationFunction.name
      } component...`)
      try {
        await runMigration({
          ...options,
          migrationFunction: migrationFunction.function,
        })
        console.info(`Finished migrating ${
          migrationFunction.name
        } component`)
      } catch (e) {
        if (
          typeof e === "object" && "errors" in e &&
          Array.isArray(e.errors) && 
          e.errors.length > 0 && 
          e.errors[0].type === "Invalid Action" && 
          e.errors[0].message.includes("already exists")
        ) {
          console.info(`${
            migrationFunction.name
          } already exists. Skipping its migration.`)
        } else {
          throw new Error(e)
        }
      }
    })
  )

  await storeService.update({
    metadata: {
      ran_contentful_migrations: true,
    },
  })

  console.info("Finished contentful migrations")
}