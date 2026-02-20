# AI Agent Context: chaim-client-java

**Purpose**: Structured context for AI agents working in the chaim-client-java package.

**Package**: `@chaim-tools/client-java`
**Version**: 0.1.3
**License**: Apache-2.0

---

## What This Package Does

A hybrid Java/TypeScript package that generates production-ready Java source files from `.bprint` schemas and DynamoDB table metadata. It is an internal dependency of `chaim-cli` — end users invoke the CLI, which delegates to this generator.

The generator uses JavaPoet to emit:
- Entity DTOs with DynamoDB Enhanced Client annotations, Lombok, and recursively nested inner classes for map/list-of-map fields
- Key helpers with constants and factory methods
- Repositories with CRUD operations and GSI/LSI query methods (LSI queries use the table's partition key automatically)
- Validators with constraint enforcement
- A DI-friendly DynamoDB client wrapper
- A configuration class with table constants and repository factories

---

## Relationship to Other Packages

| Package | Relationship |
|---------|-------------|
| `@chaim-tools/chaim` (chaim-cli) | Consumer — invokes `JavaGenerator` via TypeScript wrapper |
| `@chaim-tools/chaim-bprint-spec` | Schema format — Java model (`BprintSchema.java`) mirrors TypeScript types including recursive `NestedField` support |
| `@chaim-tools/cdk-lib` (chaim-cdk) | Upstream — produces snapshots with schema + table metadata; `TableMetadata` records align with CDK's snapshot shape (GSI/LSI metadata) |

**Invocation path**: `chaim generate` → CLI discovers snapshots → CLI calls `JavaGenerator.generateForTable()` → TypeScript wrapper spawns Java process → Java generator writes `.java` files

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Code generation | JavaPoet 1.13.0 |
| Schema parsing | Jackson 2.15.2 |
| DynamoDB SDK | AWS SDK v2 Enhanced Client 2.21.29 |
| Annotations | Lombok 1.18.30 |
| Build | Gradle 9, Java 22 |
| TypeScript wrapper | Node.js 18+ |
| Testing | JUnit 5, AssertJ |

---

## Repository Structure

```
chaim-client-java/
├── schema-core/                          # Java schema model
│   └── src/main/java/co/chaim/core/model/
│       └── BprintSchema.java             # Java model with Jackson annotations
├── codegen-java/                         # Code generation engine
│   ├── src/main/java/co/chaim/generators/java/
│   │   ├── Main.java                     # CLI entry point
│   │   ├── JavaGenerator.java            # All code generation logic
│   │   └── TableMetadata.java            # Table + GSI/LSI metadata record
│   └── src/test/java/co/chaim/generators/java/
│       └── JavaGeneratorTest.java        # 57 tests
├── src/
│   └── index.ts                          # TypeScript wrapper
├── dist/
│   ├── index.js                          # Compiled wrapper
│   └── jars/
│       └── codegen-java-0.1.0.jar        # Bundled fat JAR
├── build.gradle.kts                      # Root Gradle config (Java 22)
└── package.json
```

---

## BprintSchema.java (Java Model)

Mirrors the TypeScript types from `chaim-bprint-spec`:

```java
public class BprintSchema {
    public String schemaVersion;
    public String entityName;
    public String description;
    public PrimaryKey primaryKey;
    public List<Field> fields;

    public static class PrimaryKey {
        public String partitionKey;
        public String sortKey;
    }

    public static class Field {
        public String name;
        public String nameOverride;
        public String type;           // string, number, boolean, timestamp, list, map, stringSet, numberSet
        public Boolean required;
        @JsonProperty("default") public Object defaultValue;
        @JsonProperty("enum") public List<String> enumValues;
        public String description;
        public Constraints constraints;
        public ListItems items;       // For list fields
        public List<NestedField> fields;  // For map fields
    }

    public static class Constraints {
        public Integer minLength, maxLength;
        public String pattern;
        public Double min, max;
    }

    public static class ListItems {
        public String type;
        public List<NestedField> fields;
    }

    // Supports recursive nesting: map within map, list within map
    public static class NestedField {
        public String name;
        public String type;           // string, number, boolean, timestamp, map, list
        public ListItems items;       // For nested list fields
        public List<NestedField> fields;  // For nested map fields (self-referencing)
    }
}
```

---

## TableMetadata.java

```java
public record TableMetadata(
    String tableName,
    String tableArn,
    String region,
    List<GSIMetadata> globalSecondaryIndexes,
    List<LSIMetadata> localSecondaryIndexes
) {
    public record GSIMetadata(String indexName, String partitionKey, String sortKey, String projectionType) {}
    public record LSIMetadata(String indexName, String sortKey, String projectionType) {}
}
```

---

## JavaGenerator.java — Method Reference

### Entry Point

| Method | Description |
|--------|-------------|
| `generateForTable(schemas, pkg, outDir, tableMetadata)` | Main API — generates all files for schemas sharing a table |

### Per-Entity Generation

| Method | Output File | Description |
|--------|-------------|-------------|
| `generateEntity()` | `{Entity}.java` | DTO with `@DynamoDbBean`, Lombok, inner classes for maps |
| `generateEntityKeys()` | `keys/{Entity}Keys.java` | Key constants, INDEX_ constants, key() factory |
| `generateRepository()` | `repository/{Entity}Repository.java` | CRUD + GSI/LSI query methods |
| `generateValidator()` | `validation/{Entity}Validator.java` | Required/constraint/enum checks |

### Shared Infrastructure (Once Per Table)

| Method | Output File | Description |
|--------|-------------|-------------|
| `generateChaimDynamoDbClient()` | `client/ChaimDynamoDbClient.java` | DI-friendly client wrapper |
| `generateChaimConfig()` | `config/ChaimConfig.java` | Constants + repository factories |
| `generateChaimValidationException()` | `validation/ChaimValidationException.java` | Structured error class |

### Type Mapping

| Method | Description |
|--------|-------------|
| `mapFieldType(field, entityClass, innerClasses)` | Maps bprint type to Java TypeName; generates inner classes for map types |
| `mapScalarType(type)` | Maps scalar type string to Java ClassName |
| `mapListType(field, entityClass, innerClasses)` | Handles list fields; generates inner class for list<map> |
| `mapMapType(field, entityClass, innerClasses)` | Handles standalone map fields; generates inner class |
| `buildNestedBeanClass(className, nestedFields)` | Recursively builds inner `@DynamoDbBean` classes; supports map-within-map and list-of-map-within-map with no depth limit |

### Name Resolution

| Method | Description |
|--------|-------------|
| `resolveCodeName(field)` | Uses `nameOverride` if set, otherwise auto-converts via `toJavaCamelCase()` |
| `resolveKeyCodeName(schema, keyFieldName)` | Resolves code name for a key field |
| `toJavaCamelCase(name)` | Converts hyphens/underscores to camelCase; prefixes leading digits with `_` |
| `needsAttributeAnnotation(field, codeName)` | True when code name differs from DynamoDB attribute name |
| `detectCollisions(fields)` | Throws if two fields resolve to the same Java identifier |

### Index Query Generation

| Method | Description |
|--------|-------------|
| `addIndexQueryMethods(tb, indexName, pk, sk, entityClass, listOfEntity)` | Adds `queryBy{IndexName}()` methods (PK-only and PK+SK overload) for a single GSI or LSI |

For GSIs, the generator passes the GSI's own `partitionKey` from `GSIMetadata`. For LSIs, it passes the table's partition key from the schema (`pkFieldName`) because LSIs always share the table's partition key. This matches the CDK snapshot shape where `LSIMetadata` has no `partitionKey` field.

### Utility

| Method | Description |
|--------|-------------|
| `deriveEntityName(schema)` | Uses `entityName` or defaults to `"Entity"` |
| `formatDefaultInitializer(fieldType, defaultValue)` | Formats default value as Java code |
| `isCollectionType(type)` | True for list, map, stringSet, numberSet |
| `toConstantCase(name)` | Converts to UPPER_SNAKE_CASE |
| `toCamelCase(name)` | Converts to camelCase |
| `cap(s)` / `uncap(s)` | Capitalize / uncapitalize first letter |

---

## Type Mappings

| bprint Type | Java Type | Notes |
|-------------|-----------|-------|
| `string` | `String` | |
| `number` | `Double` | |
| `boolean` | `Boolean` | |
| `timestamp` | `Instant` | `java.time.Instant` |
| `list` (scalar) | `List<String>`, `List<Double>`, etc. | Parameterized based on `items.type` |
| `list` (map) | `List<{FieldName}Item>` | Generates inner `@DynamoDbBean` static class |
| `map` | `{FieldName}` inner class | Generates inner `@DynamoDbBean` static class |
| `stringSet` | `Set<String>` | |
| `numberSet` | `Set<Double>` | |
| (unknown) | `Object` | Fallback |

---

## Annotation Placement

**Critical**: All DynamoDB mapping annotations (`@DynamoDbPartitionKey`, `@DynamoDbSortKey`, `@DynamoDbAttribute`) have `@Target(ElementType.METHOD)` in AWS SDK v2. They go on getter methods, never on field declarations.

The generator handles this by:
1. Declaring private fields (no DynamoDB annotations on fields)
2. Generating explicit getter methods for:
   - Partition key → annotated with `@DynamoDbPartitionKey` (+ `@DynamoDbAttribute` if name differs)
   - Sort key → annotated with `@DynamoDbSortKey` (+ `@DynamoDbAttribute` if name differs)
   - Non-key fields where code name differs from DynamoDB name → annotated with `@DynamoDbAttribute`
3. Lombok `@Data` generates getters for all remaining fields that do not have explicit getters

The `generateEntity()` method resolves all field code names and types in a single pass (using a local `ResolvedField` record), then generates fields first, followed by explicit getter methods.

---

## Generated Code Patterns

### Entity DTO

```java
@Data @Builder @NoArgsConstructor @AllArgsConstructor @DynamoDbBean
public class Order {
    private String orderId;
    private String customerId;
    private Double totalAmount;
    private List<LineItemsItem> lineItems;
    private ShippingAddress shippingAddress;
    private Set<String> tags;

    @DynamoDbPartitionKey
    public String getOrderId() { return orderId; }

    @DynamoDbSortKey
    public String getCustomerId() { return customerId; }

    // Inner class for list<map>
    @Data @NoArgsConstructor @AllArgsConstructor @DynamoDbBean
    public static class LineItemsItem { ... }

    // Inner class for standalone map (supports recursive nesting)
    @Data @NoArgsConstructor @AllArgsConstructor @DynamoDbBean
    public static class ShippingAddress {
        private String street;
        private String city;
        private Coordinates coordinates;  // Map within map

        @Data @NoArgsConstructor @AllArgsConstructor @DynamoDbBean
        public static class Coordinates {
            private Double lat;
            private Double lng;
        }
    }
}
```

### Repository

```java
public class OrderRepository {
    private final DynamoDbTable<Order> table;

    public OrderRepository(ChaimDynamoDbClient client) { ... }
    public OrderRepository(DynamoDbEnhancedClient client, String tableName) { ... }

    public void save(Order entity) {
        OrderValidator.validate(entity);
        table.putItem(entity);
    }

    public Optional<Order> findByKey(String orderId, String customerId) {
        Key key = OrderKeys.key(orderId, customerId);
        return Optional.ofNullable(table.getItem(key));
    }

    public void deleteByKey(String orderId, String customerId) {
        Key key = OrderKeys.key(orderId, customerId);
        table.deleteItem(key);
    }

    // Generated per GSI (uses GSI's own partition key)
    public List<Order> queryByCustomerIndex(String customerId) { ... }
    public List<Order> queryByCustomerDateIndex(String customerId, String orderDate) { ... }

    // Generated per LSI (uses table's partition key — LSIs always share it)
    public List<Order> queryByAmountIndex(String orderId) { ... }
    public List<Order> queryByAmountIndex(String orderId, String amount) { ... }
}
```

### Validator

```java
public final class OrderValidator {
    public static void validate(Order entity) {
        List<ChaimValidationException.FieldError> errors = new ArrayList<>();

        // Required field checks
        if (entity.getOrderId() == null) {
            errors.add(new ChaimValidationException.FieldError("orderId", "required", "is required but was null"));
        }

        // String constraint checks
        if (entity.getEmail() != null) {
            if (entity.getEmail().length() < 5) {
                errors.add(new ChaimValidationException.FieldError("email", "minLength", "must be at least 5 characters"));
            }
        }

        // Enum checks
        if (entity.getStatus() != null && !Set.of("pending", "confirmed", "shipped").contains(entity.getStatus())) {
            errors.add(new ChaimValidationException.FieldError("status", "enum", "must be one of [pending, confirmed, shipped]"));
        }

        if (!errors.isEmpty()) {
            throw new ChaimValidationException("Order", errors);
        }
    }
}
```

### Keys Helper

```java
public final class OrderKeys {
    public static final String PARTITION_KEY_FIELD = "orderId";
    public static final String SORT_KEY_FIELD = "customerId";
    public static final String INDEX_CUSTOMER_INDEX = "customer-index";

    public static Key key(String orderId, String customerId) {
        return Key.builder().partitionValue(orderId).sortValue(customerId).build();
    }
}
```

---

## Operations Status

### Available Operations

| Operation | Method | Description |
|-----------|--------|-------------|
| Create/Replace | `save(entity)` | Validates then `putItem` (full replacement) |
| Read | `findByKey(pk)` / `findByKey(pk, sk)` | Returns `Optional<Entity>` |
| Delete | `deleteByKey(pk)` / `deleteByKey(pk, sk)` | Removes item |
| GSI Query | `queryBy{IndexName}(pk)` | Query by GSI partition key |
| GSI Query (with SK) | `queryBy{IndexName}(pk, sk)` | Query by GSI PK + SK |
| LSI Query | `queryBy{IndexName}(pk)` | Query by table partition key (LSIs share it) |
| LSI Query (with SK) | `queryBy{IndexName}(pk, sk)` | Query by table PK + LSI sort key |

### Backlog Operations

| Operation | Status | Description |
|-----------|--------|-------------|
| Scan / findAll | Intentionally omitted | DynamoDB anti-pattern |
| Partial update | Backlog | Update specific attributes via UpdateItem |
| Batch write/get/delete | Backlog | Batch operations |
| Conditional put | Backlog | `saveIfNotExists` |
| Transactions | Backlog | ACID across items |
| Counter increment | Backlog | Atomic counters |

---

## TypeScript Wrapper (`src/index.ts`)

The `JavaGenerator` TypeScript class:
1. Locates the fat JAR (bundled `dist/jars/` or dev `codegen-java/build/libs/`)
2. Serializes schemas and table metadata to JSON
3. Spawns: `java -jar codegen-java.jar --schemas <json> --package <pkg> --output <dir> --table-metadata <json>`
4. For payloads >100KB, writes JSON to a temp file and passes `--schemas-file <path>`
5. Streams stdout/stderr, cleans up temp files

---

## Test Coverage (57 Tests)

| Category | Count | What It Covers |
|----------|-------|---------------|
| Entity generation | 11 | PK/SK annotations, Lombok, field types, Javadoc |
| Keys helper | 4 | Constants, key() methods, index constants |
| Repository | 5 | CRUD, validation integration |
| Shared infrastructure | 2 | Client wrapper, config class |
| Multi-entity | 2 | Single-table design |
| Name resolution | 10 | nameOverride, auto-conversion, collisions |
| Validation | 18 | Required, constraints, enums, error messages |
| Default values | 4 | String, boolean, number, mixed |
| Collection types | 8 | Lists, maps, sets, inner classes |
| GSI/LSI queries | 5 | Index query methods, constants |

Tests verify generated code as string content. They do not compile the generated Java files.

---

## Build and Packaging

```bash
npm run build           # Full: Gradle build + TypeScript compile + bundle JAR
./gradlew build         # Java modules only
./gradlew test          # Run 57 Java tests
npm run build:ts        # TypeScript wrapper only
npm run clean           # Clean all artifacts
```

### JAR Resolution Order

1. Bundled (npm install): `dist/jars/codegen-java-*.jar`
2. Development (local): `codegen-java/build/libs/codegen-java-*.jar`

### Published Artifacts

- `dist/index.js` — TypeScript wrapper
- `dist/jars/codegen-java-0.1.0.jar` — Fat JAR with all dependencies

---

## Key Files to Modify

| Task | File |
|------|------|
| Add/change generated entity fields | `JavaGenerator.java` → `generateEntity()` |
| Add/change repository operations | `JavaGenerator.java` → `generateRepository()` |
| Add/change validation logic | `JavaGenerator.java` → `generateValidator()` |
| Add new field type mapping | `JavaGenerator.java` → `mapFieldType()`, `mapScalarType()` |
| Change key helper | `JavaGenerator.java` → `generateEntityKeys()` |
| Change client wrapper | `JavaGenerator.java` → `generateChaimDynamoDbClient()` |
| Change config class | `JavaGenerator.java` → `generateChaimConfig()` |
| Change Java schema model | `schema-core/.../BprintSchema.java` |
| Change table metadata shape | `codegen-java/.../TableMetadata.java` |
| Change wrapper spawn logic | `src/index.ts` |
| Change CLI arg parsing | `codegen-java/.../Main.java` |

---

## Design Decisions

### Schema-Defined Keys Only

The generator uses exactly the PK/SK field names from the `.bprint` schema. It does not invent `pk`/`sk` fields. This means generated code works with existing DynamoDB tables and data.

### PutItem for save()

`save()` uses `PutItem` (full item replacement). Partial updates via `UpdateItem` are a backlog feature.

### No Scan

`scan()` / `findAll()` is intentionally omitted. Full table scans are a DynamoDB anti-pattern.

### Inner Classes for Nested Types

`list<map>` and standalone `map` fields generate inner static classes annotated with `@DynamoDbBean`. Inner class naming: `{FieldName}Item` for list-of-map, `{FieldName}` (capitalized) for standalone map. Each inner class gets `@Data`, `@NoArgsConstructor`, `@AllArgsConstructor` from Lombok.

Recursive nesting is fully supported. A nested `map` field generates a further inner class within the parent inner class, and a nested `list` of maps generates a further `{FieldName}Item` inner class. This mirrors the `.bprint` spec where `NestedField` is self-referencing. There is no hardcoded depth limit — the database itself is the guardrail.

### LSI Metadata Shape (CDK Alignment)

`TableMetadata.LSIMetadata` contains only `indexName`, `sortKey`, and `projectionType` — no `partitionKey`. This matches the CDK snapshot shape (`chaim-cdk`'s `LSIMetadata`), because LSIs always share the table's partition key. The generator uses the table's own partition key (from `schema.primaryKey.partitionKey`) when generating LSI query methods.

`TableMetadata.GSIMetadata` retains `partitionKey` because GSIs define their own independent key schema.

---

## Non-Goals

This package does NOT:
- Deploy AWS resources (that is chaim-cdk)
- Read `.bprint` files from disk — receives schema JSON from chaim-cli
- Validate cloud account permissions
- Generate scan() or findAll() methods
- Support languages other than Java (planned)
