# AI Agent Context: chaim-examples-java

**Purpose**: Structured context for AI agents working in the chaim-examples-java reference implementation.

**Package**: `@chaim-tools/examples-java` (not published — reference implementation only)
**Version**: 0.1.0
**License**: Apache-2.0

---

## What This Repository Is

A complete, working reference implementation demonstrating the entire Chaim workflow end-to-end: from authoring a `.bprint` schema, binding it to a DynamoDB table via CDK, synthesizing a snapshot, generating a Java SDK, and using the SDK in a Java application.

This is the "hello world" of Chaim — it shows every step a customer follows to go from schema to running code.

---

## Relationship to Other Packages

| Package | Role in This Example |
|---------|---------------------|
| `@chaim-tools/chaim-bprint-spec` | Defines the `.bprint` file format used in `schemas/` |
| `@chaim-tools/cdk-lib` | CDK construct (`ChaimDynamoDBBinder`) used in `cdk-stacks/` |
| `@chaim-tools/chaim` (CLI) | Generates Java SDK from snapshots |
| `@chaim-tools/client-java` | Internal engine invoked by CLI |

---

## The Complete Workflow

```
Step 1: Author .bprint      → schemas/product-catalog.bprint
Step 2: Create CDK stack     → cdk-stacks/product-catalog-stack.ts
Step 3: cdk synth            → LOCAL snapshot in ~/.chaim/cache/snapshots/
Step 4: chaim generate       → Java SDK in generated-sdks/
Step 5: mvn package          → Compiled JAR
Step 6: Run Java app         → java-applications/product-demo/
```

### Key Insight: No Deploy Required for Code Generation

LOCAL snapshots are written during `cdk synth`, not just `cdk deploy`. This means:
- Generate Java code without AWS credentials
- Generate code before the table exists in AWS
- CI/CD can generate code in a build step, deploy in a separate step

---

## Repository Structure

```
chaim-examples-java/
├── schemas/                          # Step 1: .bprint schema definitions
│   ├── product-catalog.bprint       # Product entity (primary example)
│   ├── customer.bprint              # Customer entity (single-table example)
│   ├── orders.bprint                # Orders entity (single-table example)
│   └── order-item.bprint            # OrderItem entity (single-table example)
│
├── cdk-stacks/                       # Step 2: CDK infrastructure
│   ├── app.ts                        # CDK app entry point
│   ├── product-catalog-stack.ts     # Primary: single entity, single table
│   └── single-table-example.ts      # Advanced: multiple entities, one table
│
├── generated-sdks/                   # Step 4: Generated Java code (gitignored)
│   └── productcatalogstack-sdk/
│       └── com/acme/products/
│           ├── Product.java
│           ├── keys/ProductKeys.java
│           ├── repository/ProductRepository.java
│           ├── validation/ProductValidator.java
│           ├── validation/ChaimValidationException.java
│           ├── client/ChaimDynamoDbClient.java
│           └── config/ChaimConfig.java
│
├── java-applications/                # Step 6: Demo applications
│   └── product-demo/
│       ├── src/main/java/com/acme/demo/
│       │   └── ProductCatalogDemo.java
│       └── pom.xml
│
├── scripts/
│   └── synth-and-generate.sh        # Automates steps 3-4
│
├── templates/
│   └── sdk-pom.xml.template         # Maven POM template for generated SDKs
│
├── cdk.json
├── tsconfig.json
└── package.json
```

---

## Step-by-Step Detail

### Step 1: Schema Definition

```json
{
  "schemaVersion": "1.0",
  "entityName": "Product",
  "description": "Product catalog for ACME E-Commerce platform",
  "primaryKey": {
    "partitionKey": "productId",
    "sortKey": "category"
  },
  "fields": [
    { "name": "productId", "type": "string", "required": true },
    { "name": "category", "type": "string", "required": true },
    {
      "name": "name",
      "type": "string",
      "required": true,
      "constraints": { "minLength": 1, "maxLength": 256 }
    },
    {
      "name": "price",
      "type": "number",
      "required": true,
      "constraints": { "min": 0 }
    },
    { "name": "stockQuantity", "type": "number", "required": true },
    { "name": "isActive", "type": "boolean", "default": true },
    { "name": "tags", "type": "stringSet" },
    { "name": "createdAt", "type": "timestamp", "required": true }
  ]
}
```

Key points:
- `schemaVersion` is customer-controlled; increment it with each schema change
- `primaryKey` fields reference field names in the `fields` array
- `required: true` generates null-check validation in the SDK
- `constraints` generates range/pattern validation
- `default: true` generates `@Builder.Default` in the entity

### Step 2: CDK Stack

```typescript
import { ChaimDynamoDBBinder, TableBindingConfig, ChaimCredentials, FailureMode } from '@chaim-tools/cdk-lib';

const productTable = new dynamodb.Table(this, 'ProductTable', {
  tableName: 'acme-product-catalog',
  partitionKey: { name: 'productId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'category', type: dynamodb.AttributeType.STRING },
});

const config = new TableBindingConfig(
  'chaim-examples-java',
  ChaimCredentials.fromApiKeys(
    process.env.CHAIM_API_KEY || 'demo-api-key',
    process.env.CHAIM_API_SECRET || 'demo-api-secret'
  ),
  FailureMode.BEST_EFFORT
);

new ChaimDynamoDBBinder(this, 'ProductSchema', {
  schemaPath: path.join(__dirname, '../schemas/product-catalog.bprint'),
  table: productTable,
  config,
});
```

Table key names must match the schema's `primaryKey` field names.

### Step 3: Synthesize

```bash
npx cdk synth ProductCatalogStack
```

Writes LOCAL snapshot to `~/.chaim/cache/snapshots/aws/{accountId}/{region}/ProductCatalogStack/dynamodb/{resourceId}.json`.

### Step 4: Generate

```bash
chaim generate \
  --stack ProductCatalogStack \
  --package com.acme.products \
  --output ./generated-sdks/productcatalogstack-sdk
```

### Step 5: Build

```bash
cd generated-sdks/productcatalogstack-sdk
mvn package
```

### Step 6: Use

```java
import com.acme.products.Product;
import com.acme.products.config.ChaimConfig;
import com.acme.products.repository.ProductRepository;

ProductRepository repository = ChaimConfig.productRepository();

Product product = Product.builder()
    .productId("PROD-001")
    .category("Electronics")
    .name("Smart Speaker")
    .price(149.99)
    .stockQuantity(100.0)
    .isActive(true)
    .tags(Set.of("audio", "smart-home"))
    .createdAt(Instant.now())
    .build();

// save() validates constraints automatically
repository.save(product);

Optional<Product> found = repository.findByKey("PROD-001", "Electronics");
repository.deleteByKey("PROD-001", "Electronics");
```

---

## Generated Code Overview

### Entity DTO

- `@DynamoDbBean`, `@Data`, `@Builder`, `@NoArgsConstructor`, `@AllArgsConstructor`
- Schema-defined partition/sort keys with annotations on getter methods
- `@Builder.Default` for fields with default values
- `@DynamoDbAttribute` on getters for fields with resolved names that differ from DynamoDB attribute names
- Inner `@DynamoDbBean` classes for `list<map>` and standalone `map` fields
- `Set<String>` for `stringSet`, `Set<Double>` for `numberSet`

### Repository

- `save(entity)` — validates then persists via `putItem`
- `findByKey(pk, sk)` — returns `Optional<Entity>`
- `deleteByKey(pk, sk)` — removes item
- `queryBy{IndexName}(pk)` — generated per GSI/LSI

### Validator

- Null checks for `required` fields
- `minLength`, `maxLength`, `pattern` for string constraints
- `min`, `max` for number constraints
- Enum membership check
- Throws `ChaimValidationException` with field-level error details

### Keys Helper

- `PARTITION_KEY_FIELD`, `SORT_KEY_FIELD` constants
- `INDEX_` constants for GSIs/LSIs
- `key()` factory method

### Config

- `TABLE_NAME`, `TABLE_ARN`, `REGION` constants
- `getClient()` — lazy singleton
- `clientBuilder()` — custom builder factory
- `productRepository()` — repository factory method

---

## Single-Table Design Example

The `single-table-example.ts` stack demonstrates multiple entities on one table:

```typescript
const singleTable = new dynamodb.Table(this, 'DataTable', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
});

const config = new TableBindingConfig('my-app', ChaimCredentials.fromApiKeys(...));

new ChaimDynamoDBBinder(this, 'CustomerBinding', {
  schemaPath: './schemas/customer.bprint', table: singleTable, config,
});
new ChaimDynamoDBBinder(this, 'OrderBinding', {
  schemaPath: './schemas/orders.bprint', table: singleTable, config,
});
new ChaimDynamoDBBinder(this, 'OrderItemBinding', {
  schemaPath: './schemas/order-item.bprint', table: singleTable, config,
});
```

All entities must have matching PK/SK field names. The CLI validates this before generation. One shared `ChaimDynamoDbClient` and `ChaimConfig` is generated per table, with separate entity classes and repositories.

---

## Common Tasks

### Add a New Field

1. Edit the `.bprint` file
2. Re-synth: `npx cdk synth ProductCatalogStack`
3. Re-generate: `chaim generate --stack ProductCatalogStack --package com.acme.products --output ./generated-sdks/productcatalogstack-sdk`
4. Re-build: `cd java-applications/product-demo && mvn compile`

### Add a New Entity (Same Table)

1. Create new `.bprint` file with matching PK/SK field names
2. Add another `ChaimDynamoDBBinder` in the CDK stack
3. Re-synth and re-generate

### Add a New Entity (New Table)

1. Create new `.bprint` file
2. Add a new table + `ChaimDynamoDBBinder` to a CDK stack
3. Re-synth and re-generate

### Test Without AWS Deployment

```bash
npx cdk synth ProductCatalogStack
chaim generate --stack ProductCatalogStack --package com.acme.products --output ./generated-sdks
cd java-applications/product-demo && mvn compile
```

The entire generation workflow works without deploying to AWS. DynamoDB calls in the demo will fail without a deployed table, but the code compiles and validates.

---

## Key Files to Modify

| Task | File |
|------|------|
| Change entity schema | `schemas/*.bprint` |
| Change table/stack config | `cdk-stacks/product-catalog-stack.ts` |
| Add new CDK stack | `cdk-stacks/app.ts` |
| Change demo application | `java-applications/product-demo/.../ProductCatalogDemo.java` |
| Change workflow automation | `scripts/synth-and-generate.sh` |
| Change SDK build template | `templates/sdk-pom.xml.template` |

---

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install Node.js dependencies |
| `npx cdk synth <Stack>` | Synthesize CDK (creates LOCAL snapshot) |
| `npx cdk deploy <Stack>` | Deploy to AWS |
| `chaim generate --stack <Stack> --package <pkg> --output <dir>` | Generate Java SDK |
| `mvn compile` | Compile Java code |
| `mvn exec:java -Dexec.mainClass=<class>` | Run Java application |

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| "No snapshot found" | LOCAL snapshot does not exist | Run `npx cdk synth` first |
| "Table must be a concrete DynamoDB Table construct" | Using imported table | Use `new dynamodb.Table(...)` |
| Java "package does not exist" | Generated sources not in Maven path | Check `build-helper-maven-plugin` in `pom.xml` |
| DynamoDB operations fail at runtime | Table not deployed | Run `npx cdk deploy` |

---

## Best Practices Demonstrated

1. Schema-first design — define `.bprint` before infrastructure
2. Infrastructure as code — all resources in CDK TypeScript
3. Separation of concerns — schema, infra, generated code, and app code in separate directories
4. Gitignore generated code — `generated-sdks/` is gitignored; regenerate during build
5. DI-friendly architecture — `ChaimDynamoDbClient` accepts existing clients for testing
6. No scan by default — promotes DynamoDB best practices
