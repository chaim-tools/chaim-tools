# Chaim Agent Guide

**Purpose**: Top-level context for AI agents working across the Chaim toolchain. Read this file first, then read the `CHAIM_CONTEXT.md` in whichever package you are modifying.

---

## What Chaim Is

Chaim is a schema-driven code generation and data governance platform for DynamoDB. Developers author `.bprint` schema files describing their entity shapes, bind those schemas to DynamoDB tables via CDK constructs, and generate production-ready Java SDKs with a single CLI command.

The toolchain operates entirely at build/deploy time. There is zero runtime impact on customer applications — no sidecars, no instrumentation, no background processes.

---

## Package Map

| Package | npm Name | Purpose |
|---------|----------|---------|
| `chaim-bprint-spec` | `@chaim-tools/chaim-bprint-spec` | Schema format definition, JSON Schema, TypeScript types, validation logic |
| `chaim-cdk` | `@chaim-tools/cdk-lib` | AWS CDK constructs that bind `.bprint` schemas to DynamoDB tables and publish snapshots |
| `chaim-cli` | `@chaim-tools/chaim` | CLI tool that discovers snapshots and invokes the Java code generator |
| `chaim-client-java` | `@chaim-tools/client-java` | Java code generation engine (JavaPoet-based, invoked by CLI) |
| `chaim-examples-java` | (not published) | Reference implementation showing the complete workflow |

---

## End-to-End Data Flow

```
.bprint file → chaim-cdk (cdk synth) → LOCAL snapshot (OS cache) → chaim-cli → chaim-client-java → .java files
```

1. **Developer authors** a `.bprint` file defining entity name, primary key, fields, types, constraints
2. **CDK construct** (`ChaimDynamoDBBinder`) reads the `.bprint`, validates it, extracts DynamoDB table metadata (keys, GSIs, LSIs, TTL, streams, billing), writes a LOCAL snapshot to OS cache
3. **CLI** (`chaim generate`) discovers snapshots, groups entities by physical table, validates PK/SK consistency, passes schema JSON + table metadata to the Java generator
4. **Java generator** produces entity DTOs, key helpers, repositories, validators, client wrapper, and config class
5. **Developer uses** the generated Java SDK in their application

---

## Schema Format (.bprint)

### Schema Version

`schemaVersion` is a customer-controlled field in `"major.minor"` format (e.g., `"1.0"`, `"2.3"`). Customers increment it each time they change their `.bprint` file. All field types are available at any version.

Use `chaim bump <file>` (minor) or `chaim bump <file> --major` to increment automatically.

### Field Types

#### Scalar Types

| Type | Java Mapping | Description |
|------|-------------|-------------|
| `string` | `String` | Text values |
| `number` | `Double` | Numeric values |
| `boolean` | `Boolean` | True/false |
| `timestamp` | `Instant` | Date/time values (stored as epoch seconds in DynamoDB) |

#### Collection Types

| Type | Java Mapping | Description |
|------|-------------|-------------|
| `list` (scalar) | `List<String>`, `List<Double>`, etc. | Ordered list of scalar values |
| `list` (map) | `List<{FieldName}Item>` | Ordered list of objects (generates inner `@DynamoDbBean` class) |
| `map` | `{FieldName}` inner class | Nested object with named fields (generates inner `@DynamoDbBean` class) |
| `stringSet` | `Set<String>` | Unique set of strings |
| `numberSet` | `Set<Double>` | Unique set of numbers |

#### Collection Type Rules

- Available at any `schemaVersion`
- Cannot have `constraints`, `default`, or `enum` properties
- `list` fields require an `items` property defining the element type
- `map` fields require a `fields` array of nested field definitions
- Nested fields support scalar types only (`string`, `number`, `boolean`, `timestamp`)

### Field Properties

| Property | Applies To | Description |
|----------|-----------|-------------|
| `name` | All | DynamoDB attribute name |
| `type` | All | Field type (see above) |
| `nameOverride` | All | Alternative Java identifier when `name` is invalid for code |
| `required` | All | Generates null-check validation |
| `default` | Scalars only | Generates `@Builder.Default` initializer |
| `enum` | Scalars only | Generates enum membership validation |
| `description` | All | Generates Javadoc on the field |
| `constraints` | Scalars only | String: `minLength`, `maxLength`, `pattern`. Number: `min`, `max` |
| `annotations` | All | Extensible metadata (reserved for future use) |
| `items` | `list` only | Element type definition |
| `fields` | `map` only | Nested field definitions |

### Name Override

When a DynamoDB attribute name contains hyphens, starts with a digit, or is a reserved keyword, `nameOverride` provides a valid Java identifier. Without `nameOverride`, the generator auto-converts names to camelCase (hyphens/underscores removed, segments capitalized). If two fields resolve to the same identifier, generation fails with a collision error.

---

## Generated Java Code Structure

For each entity, the generator produces:

```
{package}/
├── {Entity}.java                      # Entity DTO (@DynamoDbBean + Lombok)
├── keys/{Entity}Keys.java             # Key constants, INDEX_ constants, key() helper
├── repository/{Entity}Repository.java # save(), findByKey(), deleteByKey(), queryBy{Index}()
├── validation/{Entity}Validator.java  # Required/constraint/enum validation
├── validation/ChaimValidationException.java  # Shared structured error class
├── client/ChaimDynamoDbClient.java    # DI-friendly client wrapper (shared per table)
└── config/ChaimConfig.java            # Table constants, lazy client, repo factories (shared per table)
```

### Entity DTO

- `@DynamoDbBean` on the class
- `@Data`, `@Builder`, `@NoArgsConstructor`, `@AllArgsConstructor` (Lombok)
- Private fields for each schema field
- Explicit getter with `@DynamoDbPartitionKey` for partition key
- Explicit getter with `@DynamoDbSortKey` for sort key (if defined)
- Explicit getters with `@DynamoDbAttribute("original-name")` for non-key fields where the code name differs from the DynamoDB attribute name
- `@Builder.Default` with initializer for fields with `default` values
- Javadoc from `description` property
- Inner `@DynamoDbBean` static classes for `list<map>` and standalone `map` fields

**Critical**: `@DynamoDbAttribute` has `@Target(ElementType.METHOD)` in AWS SDK v2 — it goes on getter methods, never on fields. Lombok `@Data` skips generating a getter when an explicit one already exists.

### Repository

- `save(entity)` — calls validator, then `table.putItem(entity)`
- `findByKey(pk)` / `findByKey(pk, sk)` — returns `Optional<Entity>`
- `deleteByKey(pk)` / `deleteByKey(pk, sk)`
- `queryBy{IndexName}(pk)` — one per GSI/LSI, uses `DynamoDbIndex` and `QueryConditional`
- `queryBy{IndexName}(pk, sk)` — overload when the index has a sort key
- No `scan()` or `findAll()` — intentionally omitted (DynamoDB anti-pattern)

### Validator

- Null checks for `required` fields
- `minLength`, `maxLength`, `pattern` for string fields with constraints
- `min`, `max` for number fields with constraints
- Membership check for `enum` fields
- Collection types: only required check (constraints/enum skipped)
- Throws `ChaimValidationException` with a list of `FieldError` objects

### Keys Helper

- `PARTITION_KEY_FIELD` / `SORT_KEY_FIELD` constants (original DynamoDB attribute names)
- `INDEX_{INDEX_NAME}` constants for each GSI and LSI
- `key(pk)` / `key(pk, sk)` static factory for `Key` objects

---

## DynamoDB Metadata Captured by CDK

The `ChaimDynamoDBBinder` extracts the following from the CDK table construct:

| Property | Passed to Java Generator |
|----------|------------------------|
| Table name | Yes (in `ChaimConfig` constants) |
| Table ARN | Yes (in `ChaimConfig` constants) |
| Region | Yes (in `ChaimConfig` constants) |
| Partition key | Yes (entity annotation) |
| Sort key | Yes (entity annotation) |
| GSIs (name, keys, projection) | Yes (query methods + index constants) |
| LSIs (name, sort key, projection) | Yes (query methods + index constants) |
| TTL attribute | Captured but not used in generated code |
| Stream config | Captured but not used in generated code |
| Billing mode | Captured but not used in generated code |
| Encryption key ARN | Captured but not used in generated code |

---

## Key Technical Decisions

### Schema-Defined Keys Only

The generator uses exactly the partition key and sort key field names from the `.bprint` schema. It does not invent `pk`/`sk` fields. This means generated code works with existing DynamoDB tables and data.

### Annotation Placement

`@DynamoDbPartitionKey`, `@DynamoDbSortKey`, and `@DynamoDbAttribute` all have `@Target(ElementType.METHOD)` in AWS SDK v2. They go on getter methods, not field declarations. The generator creates explicit getter methods for:
- The partition key field (always)
- The sort key field (if defined)
- Any non-key field where the resolved code name differs from the DynamoDB attribute name

Lombok `@Data` generates getters for all remaining fields that do not have explicit getters.

### PutItem vs UpdateItem

`save()` uses `PutItem`, which replaces the entire item. Partial updates via `UpdateItem` are a backlog feature.

### No Scan

`scan()` / `findAll()` is intentionally omitted. Full table scans are a DynamoDB anti-pattern. For access by non-key attributes, use a GSI.

---

## Build Commands by Package

| Package | Build | Test | Clean |
|---------|-------|------|-------|
| `chaim-bprint-spec` | `npm run build` | `npm test` | `npm run clean` |
| `chaim-cdk` | `npm run build` | `npm test` | `npm run clean` |
| `chaim-cli` | `npm run build` | `npm test` | `npm run clean` |
| `chaim-client-java` | `npm run build` (Java + TS + JAR bundle) | `./gradlew test` | `npm run clean` |
| Root (all) | Build each package individually | — | — |

The workspace uses pnpm with workspace protocol. All packages are in `pnpm-workspace.yaml`.

---

## Common Agent Tasks

### Adding a New Field Property to .bprint

1. Update JSON Schema in `chaim-bprint-spec/schema/bprint.schema.json`
2. Update TypeScript types in `chaim-bprint-spec/src/types/index.ts`
3. Update validation in `chaim-bprint-spec/src/validation/index.ts`
4. Add test fixtures and test cases in `chaim-bprint-spec/tests/`
5. Update `chaim-cli/src/types/snapshot-payload.ts` (SchemaField interface)
6. Update `chaim-client-java/schema-core/.../BprintSchema.java` (Java model)
7. Update `chaim-client-java/codegen-java/.../JavaGenerator.java` (code generation)
8. Add Java generator tests in `chaim-client-java/codegen-java/src/test/`

### Adding a New Generated File

1. Add a new `generate{FileName}()` method in `JavaGenerator.java`
2. Call it from `generateForTable()`
3. Add test cases

### Changing Repository Operations

1. Edit `generateRepository()` in `JavaGenerator.java`
2. Update tests in `JavaGeneratorTest.java`

### Adding a New CDK Metadata Field

1. Update extraction in `chaim-cdk/src/binders/chaim-dynamodb-binder.ts`
2. Update snapshot payload types in `chaim-cdk/src/types/snapshot-payload.ts`
3. Update CLI types in `chaim-cli/src/types/snapshot-payload.ts`
4. Update `TableMetadata.java` in `chaim-client-java`
5. Use the new field in `JavaGenerator.java`

---

## Non-Goals

The Chaim toolchain does NOT:
- Deploy AWS resources (that is standard CDK)
- Access or scan customer data at runtime
- Intercept DynamoDB requests
- Generate `scan()` operations
- Invent primary key fields — it uses schema-defined keys only
- Support languages other than Java (Python and Node.js are planned)
