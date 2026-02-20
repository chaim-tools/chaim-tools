# chaim-client-java

The Java code generation engine for the Chaim toolchain. It accepts parsed `.bprint` schemas and DynamoDB table metadata as JSON, and produces production-ready Java source files: entity DTOs with DynamoDB Enhanced Client annotations, repositories with CRUD and index query operations, validators with constraint enforcement, and DI-friendly client infrastructure.

**npm**: [`@chaim-tools/client-java`](https://www.npmjs.com/package/@chaim-tools/client-java)

## Where This Fits

```
 .bprint file  ──>  chaim-cdk  ──>  chaim-cli  ──>  chaim-client-java
                                                          ^
                                                          │
                                                   INTERNAL ENGINE
```

This package is an internal dependency of `chaim-cli`. End users interact with the CLI; it invokes this generator behind the scenes. Direct usage is only necessary for local development and testing of the generator itself.

**Invocation path**: End user runs `chaim generate` -> CLI discovers snapshots and resolves metadata -> CLI passes schema JSON + table metadata to this package -> Java source files are written to disk.

## What It Generates

For each entity defined in a `.bprint` schema, the generator produces:

### Entity DTO

A `@DynamoDbBean`-annotated class with Lombok `@Data`, `@Builder`, `@NoArgsConstructor`, `@AllArgsConstructor`:

```java
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@DynamoDbBean
public class Order {
    private String orderId;
    private String customerId;
    private Double totalAmount;
    private List<LineItemsItem> lineItems;
    private ShippingAddress shippingAddress;
    private Set<String> tags;
    private Instant createdAt;

    @DynamoDbPartitionKey
    public String getOrderId() { return orderId; }

    @DynamoDbSortKey
    public String getCustomerId() { return customerId; }

    // Inner class for list-of-map field
    @Data @NoArgsConstructor @AllArgsConstructor @DynamoDbBean
    public static class LineItemsItem {
        private String productId;
        private Double quantity;
        private Double price;
    }

    // Inner class for standalone map field (supports recursive nesting)
    @Data @NoArgsConstructor @AllArgsConstructor @DynamoDbBean
    public static class ShippingAddress {
        private String street;
        private String city;
        private Coordinates coordinates;  // Map within map

        // Nested inner class for map-within-map
        @Data @NoArgsConstructor @AllArgsConstructor @DynamoDbBean
        public static class Coordinates {
            private Double lat;
            private Double lng;
        }
    }
}
```

Key behaviors:
- Schema-defined primary keys are annotated with `@DynamoDbPartitionKey` / `@DynamoDbSortKey` on explicit getter methods
- Fields with `nameOverride` or auto-converted names get explicit getters with `@DynamoDbAttribute` mapping back to the original DynamoDB attribute name
- Fields with `default` values get `@Builder.Default` with an initializer
- Fields with `description` get Javadoc
- `list<map>` and standalone `map` fields generate inner `@DynamoDbBean` static classes
- Recursive nesting is fully supported — maps within maps, lists of maps within maps, and lists within maps generate nested inner classes with no depth limit
- `stringSet` maps to `Set<String>`, `numberSet` maps to `Set<Double>`

### Keys Helper

Constants and factory for building `Key` objects:

```java
public final class OrderKeys {
    public static final String PARTITION_KEY_FIELD = "orderId";
    public static final String SORT_KEY_FIELD = "customerId";
    public static final String INDEX_CUSTOMER_INDEX = "customer-index";

    public static Key key(String orderId, String customerId) {
        return Key.builder()
            .partitionValue(orderId)
            .sortValue(customerId)
            .build();
    }
}
```

Generates `INDEX_` constants for each GSI and LSI defined on the table.

### Repository

CRUD operations with automatic validation, plus typed query methods for each GSI and LSI:

```java
public class OrderRepository {
    public OrderRepository(ChaimDynamoDbClient client) { ... }
    public OrderRepository(DynamoDbEnhancedClient client, String tableName) { ... }

    public void save(Order entity) { ... }                           // Validates then putItem
    public Optional<Order> findByKey(String orderId, String customerId) { ... }
    public void deleteByKey(String orderId, String customerId) { ... }

    // Generated per GSI
    public List<Order> queryByCustomerIndex(String customerId) { ... }
    public List<Order> queryByCustomerIndex(String customerId, String orderDate) { ... }

    // Generated per LSI (uses the table's partition key automatically)
    public List<Order> queryByAmountIndex(String orderId) { ... }
    public List<Order> queryByAmountIndex(String orderId, String amount) { ... }
}
```

- `save()` calls the validator before persisting
- `findByKey()` returns `Optional.empty()` when the item does not exist
- GSI queries use the GSI's own partition key; LSI queries use the table's partition key (LSIs always share it)
- Each index generates a PK-only method and a PK+SK overloaded method (when the index has a sort key)
- No `scan()` or `findAll()` — promotes DynamoDB best practices

### Validator

Per-entity validation with structured error reporting:

```java
public final class OrderValidator {
    public static void validate(Order entity) { ... }
}
```

Checks:
- `required` fields: null check
- String constraints: `minLength`, `maxLength`, `pattern`
- Number constraints: `min`, `max`
- Enum values: membership check against allowed values
- Collection types: required null check (constraints/enums are skipped)

Throws `ChaimValidationException` with a list of `FieldError` objects for all violations.

### Shared Infrastructure

- **ChaimDynamoDbClient**: DI-friendly wrapper around `DynamoDbEnhancedClient` with builder pattern, environment variable resolution (`CHAIM_TABLE_NAME`, `AWS_REGION`, `DYNAMODB_ENDPOINT`), endpoint override for local testing, and a `wrap()` method for dependency injection
- **ChaimConfig**: Table constants (`TABLE_NAME`, `TABLE_ARN`, `REGION`), lazy singleton client, `clientBuilder()` factory, and per-entity repository factory methods

## Type Mappings

| .bprint Type | Java Type | Notes |
|--------------|-----------|-------|
| `string` | `String` | |
| `number` | `Double` | |
| `boolean` | `Boolean` | |
| `timestamp` | `Instant` | `java.time.Instant` |
| `list` (scalar) | `List<String>`, `List<Double>`, etc. | Parameterized by `items.type` |
| `list` (map) | `List<{FieldName}Item>` | Inner `@DynamoDbBean` class |
| `map` | `{FieldName}` (inner class) | Inner `@DynamoDbBean` class; supports recursive nesting |
| `stringSet` | `Set<String>` | |
| `numberSet` | `Set<Double>` | |

Recursive nesting is fully supported. A `map` field can contain nested `map` or `list` fields, which generate further inner static classes. There is no hardcoded depth limit — the database itself is the guardrail.

## Name Resolution

The generator handles DynamoDB attribute names that are not valid Java identifiers:

1. **`nameOverride`**: If the `.bprint` field specifies `nameOverride`, the generator uses that value as the Java field name
2. **Auto-conversion**: Otherwise, hyphens and underscores are converted to camelCase, leading digits are prefixed with `_`, all-caps names are lowercased
3. **Collision detection**: If two fields resolve to the same Java identifier, generation fails with a clear error message

When the resolved code name differs from the DynamoDB attribute name, the generator emits an explicit getter with `@DynamoDbAttribute("original-name")` so the DynamoDB Enhanced Client maps the field correctly.

## Repository Structure

```
chaim-client-java/
├── schema-core/                    # Core schema handling
│   └── src/main/java/co/chaim/core/model/
│       └── BprintSchema.java       # Java model with Jackson annotations
├── codegen-java/                   # Code generation engine
│   └── src/main/java/co/chaim/generators/java/
│       ├── JavaGenerator.java      # JavaPoet-based generator
│       ├── TableMetadata.java      # Table + GSI/LSI metadata (matches CDK snapshot shape)
│       └── Main.java               # CLI entry point
├── src/
│   └── index.ts                    # TypeScript wrapper (spawns Java process)
├── dist/
│   ├── index.js                    # Compiled TypeScript wrapper
│   └── jars/
│       └── codegen-java-0.1.0.jar  # Bundled fat JAR
└── package.json
```

The TypeScript wrapper (`src/index.ts`) locates the bundled JAR and spawns a Java process with the schema and metadata as JSON arguments. For payloads over 100KB, it uses file-based passing to avoid command-line length limits.

## Building from Source

```bash
# Full build: Java + TypeScript + bundle JAR
npm run build

# Java only
./gradlew build

# TypeScript only
npm run build:ts

# Run tests
./gradlew test          # 57 tests covering all generation paths

# Clean
npm run clean
```

**Build requirements**: Java 22, Node.js 18+, Gradle 8+

## Development

### Running Tests

```bash
./gradlew :codegen-java:test
```

The test suite covers entity generation (scalar and collection types, inner classes, nameOverride, auto-conversion, collision detection), repository operations, GSI/LSI query methods, key constants, validator generation, default values, shared infrastructure, and multi-entity support.

### Adding a New Feature

1. Update `BprintSchema.java` in `schema-core` if the `.bprint` schema model changes
2. Update `JavaGenerator.java` in `codegen-java` to handle the new schema element
3. Add test cases in `JavaGeneratorTest.java`
4. Update `TableMetadata.java` if new infrastructure metadata is needed
5. Run `./gradlew test` to verify

## Multi-Entity Table Support

When multiple entities share a DynamoDB table (single-table design), the generator:
- Produces one entity class, keys helper, repository, and validator per entity
- Generates a single shared `ChaimDynamoDbClient` and `ChaimConfig` per table
- `ChaimConfig` includes repository factory methods for every entity on the table

The CLI validates that all entities bound to the same table have matching partition/sort key field names before invoking the generator.

## CDK Snapshot Alignment

The `TableMetadata` record in this package mirrors the CDK snapshot shape produced by `chaim-cdk`. Key design decisions:

- **GSI metadata** includes `indexName`, `partitionKey`, `sortKey`, and `projectionType` — GSIs define their own key schema
- **LSI metadata** includes `indexName`, `sortKey`, and `projectionType` only — LSIs always share the table's partition key, so no `partitionKey` field is needed. The generator uses the table's partition key (from the `.bprint` schema) when generating LSI query methods
- **`@JsonIgnoreProperties(ignoreUnknown = true)`** on all metadata records ensures forward compatibility when the CDK snapshot adds new fields

This alignment means the CLI can pass the snapshot's `resource` section directly to the Java generator without transformation.

## License

Apache-2.0
