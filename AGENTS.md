# AGENTS.md - Coding Agent Guidelines

Medusa.js v2 e-commerce backend for Jardin Botanica with custom modules for product bundles and Delhivery shipping fulfillment.

**Tech Stack:** TypeScript, Node.js 22.x, PostgreSQL, Medusa Framework v2, MikroORM, Jest

---

## Build/Lint/Test Commands

```bash
# Development
yarn dev                  # Start dev server with hot reload
yarn build                # Build for production (runs migrations first)
yarn start                # Start production server (runs migrations first)
yarn seed                 # Seed database

# Testing - Run all tests
yarn test:unit                              # Unit tests (*.unit.spec.ts)
yarn test:integration:http                  # HTTP integration tests
yarn test:integration:modules               # Module integration tests

# Testing - Run a single test file
TEST_TYPE=unit NODE_OPTIONS=--experimental-vm-modules npx jest path/to/test.unit.spec.ts --runInBand --forceExit
TEST_TYPE=integration:http NODE_OPTIONS=--experimental-vm-modules npx jest integration-tests/http/health.spec.ts --runInBand --forceExit
TEST_TYPE=integration:modules NODE_OPTIONS=--experimental-vm-modules npx jest src/modules/product-bundle/__tests__/service.spec.ts --runInBand --forceExit

# Database
npx medusa db:generate <module-name>        # Generate migrations
npx medusa db:migrate                       # Run migrations

# Typecheck
npx tsc --noEmit
```

---

## Project Structure

```
src/
├── api/                    # API routes (file-based: admin/, store/, hooks/)
├── modules/                # Custom Medusa modules (product-bundle, delhivery-fulfillment)
│   └── <module>/           # models/, migrations/, service.ts, index.ts
├── subscribers/            # Event subscribers
├── services/               # Shared services
├── links/                  # Module relationships
├── workflows/              # Custom workflows
├── loaders/                # Custom loaders
└── jobs/                   # Scheduled jobs
integration-tests/http/     # HTTP integration tests
```

---

## Code Style

### Imports
```typescript
// 1. External packages
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { Modules } from "@medusajs/framework/utils";
import { z } from "zod";

// 2. Internal modules
import { PRODUCT_BUNDLE_MODULE } from "../../../modules/product-bundle";
import ProductBundleService from "../../../modules/product-bundle/service";

// 3. Types
import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";
```

### Naming Conventions
- **Files:** kebab-case (`product-bundle.ts`)
- **Classes:** PascalCase (`ProductBundleService`)
- **Functions/Variables:** camelCase (`createBundle`)
- **Constants:** SCREAMING_SNAKE_CASE (`PRODUCT_BUNDLE_MODULE`)
- **API routes:** Next.js convention (`route.ts`, `[id]/route.ts`)

### TypeScript
- Explicit return types: `Promise<void>` for API routes
- Strict null checks enabled
- Use `import type` for type-only imports

### Services
```typescript
import { MedusaService } from "@medusajs/framework/utils";
import { Bundle } from "./models/Bundle";

class ProductBundleService extends MedusaService({ Bundle, BundleItem }) {
  async createBundle(data: CreateBundleInput) { /* ... */ }
}

export default ProductBundleService;
```

### Data Models
```typescript
import { model } from "@medusajs/framework/utils";

export const Bundle = model.define("bundle", {
  id: model.id().primaryKey(),
  title: model.text(),
  is_active: model.boolean().default(true),
  items: model.hasMany(() => BundleItem, { mappedBy: "bundle" }),
});
```

### API Routes
```typescript
import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { z } from "zod";

const schema = z.object({ title: z.string() });

export async function POST(req: MedusaRequest, res: MedusaResponse): Promise<void> {
  const validatedData = schema.parse(req.body);
  const service = req.scope.resolve(MODULE_NAME);
  res.json({ success: true });
}
```

### Error Handling
```typescript
try {
  const result = await service.createBundle(data);
  res.json({ bundle: result });
} catch (error: any) {
  console.error("Error creating bundle:", error.message);
  res.status(400).json({ message: error.message });
  return;
}
```

### Event Subscribers
```typescript
import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework";

export default async function handleOrderPlaced({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  // Handle event
}

export const config: SubscriberConfig = { event: "order.placed" };
```

### Module Definition
```typescript
import ProductBundleService from "./service";
import { Module } from "@medusajs/framework/utils";

export const PRODUCT_BUNDLE_MODULE = "productBundleModule";

export default Module(PRODUCT_BUNDLE_MODULE, { service: ProductBundleService });
```

### Testing
```typescript
import { medusaIntegrationTestRunner } from "@medusajs/test-utils";

jest.setTimeout(60 * 1000);

medusaIntegrationTestRunner({
  inApp: true,
  testSuite: ({ api }) => {
    describe("Feature", () => {
      it("should work", async () => {
        const response = await api.get("/health");
        expect(response.status).toEqual(200);
      });
    });
  },
});
```

---

## Key Files

| File | Purpose |
|------|---------|
| `medusa-config.ts` | Database, plugins, modules, CORS configuration |
| `tsconfig.json` | TypeScript config (decorators enabled) |
| `jest.config.js` | Test config with TEST_TYPE switching |

---

## Notes

- **No ESLint/Prettier:** Follow existing patterns
- **Node 22.x / Yarn 4.3.1 / PostgreSQL / MikroORM**
- **experimentalDecorators: true** in tsconfig
