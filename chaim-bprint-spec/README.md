# chaim-bprint-spec

The Blueprint Specification (`.bprint`) defines the schema format that drives the entire Chaim toolchain. Every entity your application stores in DynamoDB starts as a `.bprint` file. This package provides the canonical JSON Schema, TypeScript types, and validation logic that all other Chaim packages depend on.

**npm**: [`@chaim-tools/chaim-bprint-spec`](https://www.npmjs.com/package/@chaim-tools/chaim-bprint-spec)

## Where This Fits

```
 .bprint file  ──>  chaim-cdk  ──>  chaim-cli  ──>  chaim-client-java
      ^                                                     │
      │                                                     v
  YOU WRITE THIS                                    Generated Java SDK
```

You author `.bprint` files. The CDK construct reads them at synth time. The CLI reads cached snapshots and invokes the Java code generator. Every step validates your schema against this spec.

## Installation

```bash
npm install @chaim-tools/chaim-bprint-spec
```

## Schema Format

A `.bprint` file is a JSON document describing a single entity: its name, identity (key fields), types, constraints, and metadata. The `entityName` must be PascalCase (e.g., `"User"`, `"OrderItem"`) — it becomes the class/type name in generated code.

### Minimal Example

```json
{
  "schemaVersion": "1.0",
  "entityName": "User",
  "description": "User account information",
  "identity": { "fields": ["userId"] },
  "fields": [
    { "name": "userId", "type": "string", "required": true },
    { "name": "email", "type": "string", "required": true },
    { "name": "isActive", "type": "boolean", "default": true }
  ]
}
```

### Full-Featured Example

This example demonstrates every field type, all field properties, constraints, collection types, recursive nesting, and `nameOverride`:

```json
{
  "schemaVersion": "1.0",
  "entityName": "Order",
  "description": "Customer orders with line items, shipping, and payment details",
  "identity": {
    "fields": ["orderId", "customerId"]
  },
  "fields": [
    { "name": "orderId", "type": "string", "required": true },
    { "name": "customerId", "type": "string", "required": true },
    {
      "name": "email",
      "type": "string",
      "required": true,
      "description": "Customer email for order notifications",
      "constraints": {
        "minLength": 5,
        "maxLength": 254,
        "pattern": "^[^@]+@[^@]+\\.[^@]+$"
      }
    },
    {
      "name": "status",
      "type": "string",
      "required": true,
      "enum": ["pending", "confirmed", "shipped", "delivered", "cancelled"]
    },
    {
      "name": "totalAmount",
      "type": "number.decimal",
      "required": true,
      "constraints": { "min": 0, "max": 999999.99 }
    },
    { "name": "isPrime", "type": "boolean", "default": false },
    {
      "name": "priorityLevel",
      "type": "number.int",
      "enum": [1, 2, 3, 4, 5],
      "description": "Shipping priority level"
    },
    { "name": "orderDate", "type": "timestamp.epoch", "required": true },
    {
      "name": "3pl-tracking-id",
      "type": "string",
      "nameOverride": "thirdPartyTrackingId",
      "description": "Tracking ID from third-party logistics provider"
    },
    {
      "name": "lineItems",
      "type": "list",
      "description": "Ordered products with pricing and discount details",
      "items": {
        "type": "map",
        "fields": [
          { "name": "productId", "type": "string" },
          { "name": "productName", "type": "string" },
          { "name": "quantity", "type": "number.int" },
          { "name": "unitPrice", "type": "number.decimal" },
          { "name": "discount", "type": "number.decimal" },
          {
            "name": "customization",
            "type": "map",
            "fields": [
              { "name": "color", "type": "string" },
              { "name": "size", "type": "string" },
              { "name": "giftWrap", "type": "boolean" },
              { "name": "engraving", "type": "string" }
            ]
          }
        ]
      }
    },
    {
      "name": "shippingAddress",
      "type": "map",
      "fields": [
        { "name": "recipientName", "type": "string" },
        { "name": "street", "type": "string" },
        { "name": "city", "type": "string" },
        { "name": "state", "type": "string" },
        { "name": "zip", "type": "string" },
        { "name": "country", "type": "string" },
        {
          "name": "coordinates",
          "type": "map",
          "fields": [
            { "name": "lat", "type": "number" },
            { "name": "lng", "type": "number" }
          ]
        },
        {
          "name": "deliveryInstructions",
          "type": "list",
          "items": { "type": "string" }
        }
      ]
    },
    {
      "name": "paymentHistory",
      "type": "list",
      "items": {
        "type": "map",
        "fields": [
          { "name": "transactionId", "type": "string" },
          { "name": "amount", "type": "number.decimal" },
          { "name": "method", "type": "string" },
          { "name": "processedAt", "type": "timestamp.epoch" }
        ]
      }
    },
    {
      "name": "priorityScores",
      "type": "list",
      "items": { "type": "number.decimal" }
    },
    { "name": "tags", "type": "stringSet" },
    { "name": "appliedCouponCodes", "type": "stringSet" },
    { "name": "loyaltyPointsUsed", "type": "numberSet.long" },
    { "name": "createdAt", "type": "timestamp.epoch", "required": true },
    { "name": "updatedAt", "type": "timestamp.epoch" }
  ]
}
```

**Features demonstrated above:**

| Feature                                                    | Where                                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Composite identity (2 fields)                              | `identity`                                                                    |
| All scalar types                                           | `email`, `totalAmount`, `isPrime`, `orderDate`                                |
| Dot-notation number types (`number.int`, `number.decimal`) | `quantity`, `unitPrice`, `totalAmount`                                        |
| Dot-notation timestamp types (`timestamp.epoch`)           | `orderDate`, `createdAt`, `processedAt`                                       |
| String constraints (`minLength`, `maxLength`, `pattern`)   | `email`                                                                       |
| Number constraints (`min`, `max`) on `number.decimal`      | `totalAmount`                                                                 |
| `enum` (allowed values)                                    | `status`                                                                      |
| `default` value                                            | `isPrime`                                                                     |
| `required` fields                                          | `orderId`, `customerId`, `email`, etc.                                        |
| `description` on fields                                    | `email`, `3pl-tracking-id`, `lineItems`                                       |
| `nameOverride` (invalid identifier)                        | `3pl-tracking-id` -> `thirdPartyTrackingId`                                   |
| `list` of scalars                                          | `priorityScores` (list of decimals), `deliveryInstructions` (list of strings) |
| `list` of maps (`list<map>`)                               | `lineItems`, `paymentHistory`                                                 |
| `map` (nested object)                                      | `shippingAddress`                                                             |
| Map within map (recursive nesting)                         | `shippingAddress.coordinates`                                                 |
| Map within list item (recursive nesting)                   | `lineItems[].customization`                                                   |
| List within map (recursive nesting)                        | `shippingAddress.deliveryInstructions`                                        |
| `stringSet`                                                | `tags`, `appliedCouponCodes`                                                  |
| `numberSet.long` (typed number set)                        | `loyaltyPointsUsed`                                                           |

## Supported Field Types

Field types follow the pattern `<base>` or `<base>.<subtype>`. The dot-notation suffix is a language-level precision hint — it does **not** change the DynamoDB attribute type, only the generated language type (e.g. `Long` vs `Integer` in Java).

### Scalar Types

| Type              | DynamoDB | Java Mapping | Description                                          |
| ----------------- | -------- | ------------ | ---------------------------------------------------- |
| `string`          | S        | `String`     | Text values                                          |
| `number`          | N        | `Integer`    | Numeric — defaults to Integer                        |
| `number.int`      | N        | `Integer`    | 32-bit integer                                       |
| `number.long`     | N        | `Long`       | 64-bit integer                                       |
| `number.float`    | N        | `Float`      | 32-bit float                                         |
| `number.double`   | N        | `Double`     | 64-bit float (explicit)                              |
| `number.decimal`  | N        | `BigDecimal` | Arbitrary-precision decimal                          |
| `boolean`         | BOOL     | `Boolean`    | True/false                                           |
| `binary`          | B        | `byte[]`     | Raw binary data (Buffer in Node.js, bytes in Python) |
| `timestamp`       | S        | `Instant`    | ISO-8601 full datetime                               |
| `timestamp.epoch` | N        | `Long`       | Unix epoch milliseconds                              |
| `timestamp.date`  | S        | `LocalDate`  | ISO-8601 date only (e.g. `"2024-01-15"`)             |

### Collection Types

| Type                | DynamoDB | Java Mapping                | Description                                                  |
| ------------------- | -------- | --------------------------- | ------------------------------------------------------------ |
| `list`              | L        | `List<T>`                   | Ordered collection                                           |
| `map`               | M        | Inner `@DynamoDbBean` class | Nested object with named fields                              |
| `stringSet`         | SS       | `Set<String>`               | Unordered collection of unique string values                 |
| `numberSet`         | NS       | `Set<Integer>`              | Unordered collection of unique numbers — defaults to Integer |
| `numberSet.int`     | NS       | `Set<Integer>`              | Number set of 32-bit integers                                |
| `numberSet.long`    | NS       | `Set<Long>`                 | Number set of 64-bit integers                                |
| `numberSet.float`   | NS       | `Set<Float>`                | Number set of 32-bit floats                                  |
| `numberSet.double`  | NS       | `Set<Double>`               | Number set of 64-bit floats (explicit)                       |
| `numberSet.decimal` | NS       | `Set<BigDecimal>`           | Number set of arbitrary-precision decimals                   |

### Dot-Notation Sub-Types

The dot-notation suffix selects the generated language type without changing DynamoDB storage:

```json
{ "name": "quantity",   "type": "number.int"      }   // Integer (same as bare number)
{ "name": "timestamp",  "type": "number.long"      }   // Long (64-bit)
{ "name": "price",      "type": "number.decimal"   }   // BigDecimal (arbitrary-precision)
{ "name": "eventTime",  "type": "timestamp.epoch"  }   // Long, stored as DynamoDB N
{ "name": "birthDate",  "type": "timestamp.date"   }   // LocalDate, stored as DynamoDB S
{ "name": "scores",     "type": "numberSet.int"    }   // Set<Integer>
{ "name": "payments",   "type": "numberSet.decimal"}   // Set<BigDecimal>
```

**`timestamp.date` note:** Java generators emit a `LocalDateConverter` class and annotate affected getters with `@DynamoDbConvertedBy(LocalDateConverter.class)` automatically. No manual converter setup is needed.

**Constraints with sub-types:** `min`/`max` constraints work on any `number.*` field including `number.decimal`. The validator uses `compareTo()` for decimal fields automatically.

### Cross-Language Type Mapping

The `.bprint` type system is designed for multi-language code generation. Below is the complete mapping for all planned target languages. The Java column reflects the current generator output; other columns show planned mappings.

**Scalars:**

| .bprint Type      | Java         | TypeScript              | Python     | Go             | C#               |
| ----------------- | ------------ | ----------------------- | ---------- | -------------- | ---------------- |
| `string`          | `String`     | `string`                | `str`      | `string`       | `string`         |
| `number`          | `Integer`    | `number`                | `int`      | `int32`        | `int`            |
| `number.int`      | `Integer`    | `number`                | `int`      | `int32`        | `int`            |
| `number.long`     | `Long`       | `bigint`                | `int`      | `int64`        | `long`           |
| `number.float`    | `Float`      | `number`                | `float`    | `float32`      | `float`          |
| `number.double`   | `Double`     | `number`                | `float`    | `float64`      | `double`         |
| `number.decimal`  | `BigDecimal` | `Decimal` ¹             | `Decimal`  | `*big.Float`   | `decimal`        |
| `boolean`         | `Boolean`    | `boolean`               | `bool`     | `bool`         | `bool`           |
| `binary`          | `byte[]`     | `Buffer` / `Uint8Array` | `bytes`    | `[]byte`       | `byte[]`         |
| `timestamp`       | `Instant`    | `string` ²              | `datetime` | `time.Time`    | `DateTimeOffset` |
| `timestamp.epoch` | `Long`       | `number`                | `int`      | `int64`        | `long`           |
| `timestamp.date`  | `LocalDate`  | `string` ²              | `date`     | `civil.Date` ³ | `DateOnly`       |

**Collections:**

| .bprint Type  | Java           | TypeScript                    | Python      | Go                    | C#                |
| ------------- | -------------- | ----------------------------- | ----------- | --------------------- | ----------------- |
| `list`        | `List<T>`      | `T[]`                         | `list[T]`   | `[]T`                 | `List<T>`         |
| `map`         | inner class    | interface / type              | `TypedDict` | struct                | class             |
| `stringSet`   | `Set<String>`  | `Set<string>`                 | `set[str]`  | `map[string]struct{}` | `HashSet<string>` |
| `numberSet`   | `Set<Integer>` | `Set<number>`                 | `set[int]`  | `map[int32]struct{}`  | `HashSet<int>`    |
| `numberSet.*` | `Set<{T}>`     | `Set<number>` / `Set<bigint>` | `set[{T}]`  | `map[{T}]struct{}`    | `HashSet<{T}>`    |

**Nullable modifier:** When `nullable: true`, generators emit nullable wrappers. Examples: `Integer` instead of `int` in Java, `Optional[int]` in Python, `*int32` in Go, `int?` in C#. TypeScript types are unaffected (all types are already nullable unless the field is `required`).

> ¹ TypeScript `Decimal`: use `decimal.js` or similar library.
> ² TypeScript timestamps: ISO-8601 strings. Consumers parse with `new Date()` or a library.
> ³ Go `civil.Date`: `cloud.google.com/go/civil` or equivalent. Alternatively `string` with ISO format.

### List Items

A `list` field requires an `items` property defining the element type:

```json
{ "name": "scores", "type": "list", "items": { "type": "number" } }
```

For a list of objects, use `items.type: "map"` with nested `fields`:

```json
{
  "name": "lineItems",
  "type": "list",
  "items": {
    "type": "map",
    "fields": [
      { "name": "sku", "type": "string" },
      { "name": "qty", "type": "number" }
    ]
  }
}
```

### Map Fields

A `map` field requires a `fields` array of nested field definitions:

```json
{
  "name": "address",
  "type": "map",
  "fields": [
    { "name": "street", "type": "string" },
    { "name": "city", "type": "string" },
    { "name": "zip", "type": "string" }
  ]
}
```

### Recursive Nesting (Maps within Maps)

Nested fields support both scalar types (`string`, `number`, `boolean`, `timestamp`) and collection types (`map`, `list`). This enables arbitrarily deep nesting for rich document structures:

```json
{
  "name": "shippingAddress",
  "type": "map",
  "fields": [
    { "name": "street", "type": "string" },
    { "name": "city", "type": "string" },
    {
      "name": "coordinates",
      "type": "map",
      "fields": [
        { "name": "lat", "type": "number" },
        { "name": "lng", "type": "number" }
      ]
    },
    {
      "name": "deliveryAttempts",
      "type": "list",
      "items": {
        "type": "map",
        "fields": [
          { "name": "attemptDate", "type": "timestamp" },
          { "name": "status", "type": "string" }
        ]
      }
    }
  ]
}
```

There is no hardcoded depth limit for nesting. The database itself is the guardrail for how deeply structures can be nested.

## Field Properties

| Property       | Type                 | Description                                                                                                                                                                                 |
| -------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`         | string               | Attribute/column name in the data store (required). If it collides with a reserved keyword in any target language, a `nameOverride` is required.                                            |
| `type`         | FieldType            | Data type (required)                                                                                                                                                                        |
| `nameOverride` | string               | Alternative code identifier when `name` is not valid or collides with a reserved word                                                                                                       |
| `required`     | boolean              | Generates null-check validation (default: false)                                                                                                                                            |
| `nullable`     | boolean              | When true, generators emit nullable/wrapper types instead of primitives (e.g., `Integer` vs `int` in Java, `Optional[int]` in Python). Identity fields cannot be nullable. (default: false) |
| `default`      | any                  | Default value; generates `@Builder.Default` in Java                                                                                                                                         |
| `enum`         | (string \| number)[] | Allowed values (strings or numbers); type-matched against the field type. Applies to nested fields too.                                                                                     |
| `description`  | string               | Generates Javadoc on the field                                                                                                                                                              |
| `constraints`  | object               | Validation constraints (see below)                                                                                                                                                          |
| `annotations`  | object               | Extensible metadata for governance and tooling                                                                                                                                              |
| `items`        | object               | Element type for `list` fields                                                                                                                                                              |
| `fields`       | array                | Nested field definitions for `map` fields                                                                                                                                                   |

### Constraints

String fields support:

| Constraint  | Type    | Description                  |
| ----------- | ------- | ---------------------------- |
| `minLength` | integer | Minimum string length        |
| `maxLength` | integer | Maximum string length        |
| `pattern`   | string  | Regex pattern for validation |

Number fields support:

| Constraint | Type   | Description               |
| ---------- | ------ | ------------------------- |
| `min`      | number | Minimum value (inclusive) |
| `max`      | number | Maximum value (inclusive) |

Constraints cannot be applied to collection types.

### Name Override

When an attribute name contains hyphens, starts with a digit, or is otherwise invalid as an identifier, use `nameOverride`:

```json
{
  "name": "2fa-verified",
  "type": "boolean",
  "nameOverride": "twoFactorVerified"
}
```

The generator uses `twoFactorVerified` as the Java field name and emits a `@DynamoDbAttribute("2fa-verified")` annotation on the getter to map back to the DynamoDB attribute.

## Schema vs Infrastructure Boundary

The `.bprint` schema defines **what data looks like** — field names, types, constraints, and metadata. Infrastructure concerns — **how and where data is stored** — belong in the CDK constructs (or future Terraform/CloudFormation binders).

| Concern                         | Where it lives                                       | Why                                           |
| ------------------------------- | ---------------------------------------------------- | --------------------------------------------- |
| Field names, types, constraints | `.bprint` schema                                     | Portable across databases and languages       |
| TTL attribute                   | CDK `timeToLiveAttribute`                            | DynamoDB-specific infrastructure config       |
| GSIs / LSIs (secondary indexes) | CDK `addGlobalSecondaryIndex()`                      | Database-specific access pattern optimization |
| Billing mode, capacity          | CDK table properties                                 | Operational/cost concern                      |
| Streams, encryption, backups    | CDK table properties                                 | Infrastructure/compliance concern             |
| Uniqueness enforcement          | CDK via GSI design (DynamoDB) or DB constraint (SQL) | Implementation varies by data store           |

This boundary is intentional: the same `.bprint` schema should be usable with DynamoDB today and PostgreSQL tomorrow without modification. Infrastructure-specific knobs stay in the infrastructure layer.

### DynamoDB TTL

DynamoDB TTL is configured on the CDK table construct — **not** in the `.bprint` schema. Simply declare the TTL field in your schema as a normal `timestamp.epoch` field, then configure the TTL attribute name on the table in CDK:

```json
{ "name": "expiresAt", "type": "timestamp.epoch", "required": true }
```

```typescript
// CDK — the one place TTL is declared
const table = new dynamodb.Table(this, 'Sessions', {
  partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
  timeToLiveAttribute: 'expiresAt',
});
```

The `ChaimDynamoDBBinder` reads `timeToLiveAttribute` from the CDK L1 construct, validates the attribute name exists as a field in the `.bprint` schema, and captures it in the snapshot. The Java generator uses the snapshot's `ttlAttribute` to annotate the field appropriately.

**Unit note:** DynamoDB TTL reads the stored value as Unix epoch **seconds**. When populating a TTL field in Java, use `Instant.getEpochSecond()` — not `toEpochMilli()`. Milliseconds will make items expire ~1000 years in the future.

```java
item.setExpiresAt(Instant.now().plusSeconds(86400).getEpochSecond()); // 24h TTL
```

## TypeScript API

### Types

```typescript
import {
  SchemaData,
  Identity,
  Field,
  FieldType,
  NumberSubType,
  TimestampSubType,
  ListItems,
  NestedField,
  NestedListItems,
  FieldConstraints,
  FieldAnnotations,
} from '@chaim-tools/chaim-bprint-spec';
```

### Validation

```typescript
import { validateSchema } from '@chaim-tools/chaim-bprint-spec';

const rawSchema = JSON.parse(fs.readFileSync('user.bprint', 'utf-8'));
const validated: SchemaData = validateSchema(rawSchema);
```

`validateSchema` performs:

- Schema version format validation and support checking
- Required top-level fields (`entityName`, `description`, `identity`, `fields`)
- `entityName` PascalCase format validation and reserved-word collision check
- Field type validation (including `binary` type)
- Field `name` reserved-word check (requires `nameOverride` if the name collides with a keyword in Java, Python, Go, or TypeScript)
- Duplicate field name detection
- `nameOverride` identifier validity and reserved keyword checks
- `nullable` property validation (boolean type, identity fields cannot be nullable)
- Constraint type/range validation (string constraints on string fields, number constraints on number fields, min <= max)
- Enum type-matching validation on both top-level and nested fields (string enums for string fields, numeric enums for number fields)
- `binary` type restrictions (no defaults, no enums)
- Regex pattern compilation check
- Collection type rules (cannot have constraints/defaults/enums)
- List `items` and map `fields` structure validation
- Recursive validation of nested `map` and `list` types within map fields (no depth limit)

### JSON Schema

Access the raw JSON Schema for use with any validator (e.g., Ajv):

```typescript
import bprintSchema from '@chaim-tools/chaim-bprint-spec/schema';
```

### Schema Version

There are two independent version concepts — do not confuse them:

| Concept                                      | Where                                | Who controls                                                          | Example                                                   |
| -------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------- |
| **`schemaVersion`** (in your `.bprint` file) | `"schemaVersion": "1.0"`             | **You** — bump it each time you change your entity schema             | `"1.0"` → `"1.1"` after adding a field                    |
| **Spec version** (this package's release)    | `spec-versions.json`, `package.json` | **Chaim maintainers** — tracks changes to the `.bprint` format itself | `1.3` = added `nullable`, `binary`, entityName validation |

`schemaVersion` is your entity's version. It is **not** tied to the spec version. You start at `"1.0"` and increment whenever the schema content changes. The Chaim server enforces this: if content changes but the version doesn't, `cdk deploy` fails (HTTP 409).

The `SPEC_VERSION_PATTERN` regex is exported for format validation:

```typescript
import { SPEC_VERSION_PATTERN } from '@chaim-tools/chaim-bprint-spec';
// SPEC_VERSION_PATTERN = /^\d+\.\d+$/
```

Use the CLI to bump the version automatically:

```bash
chaim bump ./schemas/user.bprint            # minor: 1.5 -> 1.6
chaim bump ./schemas/user.bprint --major    # major: 1.5 -> 2.0
```

## Using in Your Application

Place `.bprint` files alongside your CDK infrastructure code. A typical project structure:

```
my-cdk-project/
├── schemas/
│   ├── user.bprint
│   ├── order.bprint
│   └── product.bprint
├── lib/
│   └── my-stack.ts       # References schemas via ChaimDynamoDBBinder
├── cdk.json
└── package.json          # depends on @chaim-tools/cdk-lib
```

Each `.bprint` file describes one entity type. Multiple entities can share the same DynamoDB table (single-table design) by using the same partition/sort key field names.

## CDK Synth-Time Validation

When using `chaim-cdk`, the `ChaimDynamoDBBinder` construct performs additional validation at CDK synth time beyond what the `.bprint` spec validates on its own:

- **Field reference validation** -- All DynamoDB key attribute names (table partition key, sort key, GSI partition/sort keys, LSI sort keys, and TTL attribute) must exist as fields in the `.bprint` schema. If any attribute references a field that doesn't exist in the schema, the CDK synth fails immediately with a descriptive error listing all mismatches.

This prevents silent drift between your `.bprint` schema and DynamoDB table definition.

## Development

```bash
npm run build          # Compile TypeScript
npm run test           # Run test suite (150+ tests)
npm run check          # Full validation: format, lint, spec check, examples, tests
npm run validate:examples  # Validate all example fixtures
```

### Test Fixtures

`tests/fixtures/valid/` contains working `.bprint` examples covering basic schemas, composite keys, constraints, name overrides, collection types, recursive nested maps, and deeply nested structures. `tests/fixtures/invalid/` contains schemas that should fail validation.

## License

Apache-2.0
