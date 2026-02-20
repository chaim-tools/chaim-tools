package co.chaim.generators.java;

import co.chaim.core.model.BprintSchema;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.*;

public class JavaGeneratorTest {

  @TempDir
  Path tempDir;

  private BprintSchema userSchema;
  private BprintSchema orderSchema;
  private BprintSchema userWithSortKeySchema;
  private TableMetadata tableMetadata;
  private JavaGenerator generator;

  @BeforeEach
  void setUp() {
    generator = new JavaGenerator();

    // Create User schema (partition key only)
    userSchema = new BprintSchema();
    userSchema.schemaVersion = "1.1";
    userSchema.entityName = "User";
    userSchema.description = "User entity";

    BprintSchema.Identity userId = new BprintSchema.Identity();
    userId.fields = java.util.Arrays.asList("userId");
    userSchema.identity = userId;
    
    BprintSchema.Field userIdField = new BprintSchema.Field();
    userIdField.name = "userId";
    userIdField.type = "string";
    userIdField.required = true;
    
    BprintSchema.Field emailField = new BprintSchema.Field();
    emailField.name = "email";
    emailField.type = "string";
    emailField.required = true;
    
    userSchema.fields = List.of(userIdField, emailField);

    // Create User schema with sort key (for composite key tests)
    userWithSortKeySchema = new BprintSchema();
    userWithSortKeySchema.schemaVersion = "1.1";
    userWithSortKeySchema.entityName = "User";
    userWithSortKeySchema.description = "User entity with sort key";

    BprintSchema.Identity userWithSkId = new BprintSchema.Identity();
    userWithSkId.fields = java.util.Arrays.asList("userId", "entityType");
    userWithSortKeySchema.identity = userWithSkId;
    
    BprintSchema.Field userIdField2 = new BprintSchema.Field();
    userIdField2.name = "userId";
    userIdField2.type = "string";
    userIdField2.required = true;
    
    BprintSchema.Field entityTypeField = new BprintSchema.Field();
    entityTypeField.name = "entityType";
    entityTypeField.type = "string";
    entityTypeField.required = true;
    
    BprintSchema.Field emailField2 = new BprintSchema.Field();
    emailField2.name = "email";
    emailField2.type = "string";
    emailField2.required = true;
    
    userWithSortKeySchema.fields = List.of(userIdField2, entityTypeField, emailField2);

    // Create Order schema (same keys as userWithSortKeySchema for multi-entity tests)
    orderSchema = new BprintSchema();
    orderSchema.schemaVersion = "1.1";
    orderSchema.entityName = "Order";
    orderSchema.description = "Order entity";

    BprintSchema.Identity orderId = new BprintSchema.Identity();
    orderId.fields = java.util.Arrays.asList("userId", "entityType");
    orderSchema.identity = orderId;
    
    BprintSchema.Field orderUserIdField = new BprintSchema.Field();
    orderUserIdField.name = "userId";
    orderUserIdField.type = "string";
    orderUserIdField.required = true;
    
    BprintSchema.Field orderEntityTypeField = new BprintSchema.Field();
    orderEntityTypeField.name = "entityType";
    orderEntityTypeField.type = "string";
    orderEntityTypeField.required = true;
    
    BprintSchema.Field amountField = new BprintSchema.Field();
    amountField.name = "amount";
    amountField.type = "number";
    amountField.required = true;
    
    orderSchema.fields = List.of(orderUserIdField, orderEntityTypeField, amountField);

    // Create table metadata (no GSI/LSI for basic tests)
    tableMetadata = new TableMetadata(
        "DataTable",
        "arn:aws:dynamodb:us-east-1:123456789012:table/DataTable",
        "us-east-1",
        null,
        null
    );
  }

  @Test
  void generatesEntityWithSchemaDefinedPartitionKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/User.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);
    
    // Check plain-Java boilerplate (no Lombok)
    assertThat(content).contains("public User()");
    assertThat(content).contains("public static class Builder");
    assertThat(content).contains("public static Builder builder()");
    assertThat(content).contains("public User build()");
    
    // Check DynamoDB annotation
    assertThat(content).contains("@DynamoDbBean");
    
    // Check domain fields (NO invented pk/sk fields!)
    assertThat(content).contains("private String userId");
    assertThat(content).contains("private String email");
    
    // Should NOT have invented pk/sk fields
    assertThat(content).doesNotContain("private String pk;");
    assertThat(content).doesNotContain("private String sk;");
    
    // Check @DynamoDbPartitionKey on schema-defined key getter
    assertThat(content).contains("@DynamoDbPartitionKey");
    assertThat(content).contains("public String getUserId()");
    
    // No sort key for this schema
    assertThat(content).doesNotContain("@DynamoDbSortKey");
  }

  @Test
  void generatesEntityWithSchemaDefinedCompositeKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userWithSortKeySchema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/User.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);
    
    // Check DynamoDB annotations on schema-defined key getters
    assertThat(content).contains("@DynamoDbPartitionKey");
    assertThat(content).contains("public String getUserId()");
    
    assertThat(content).contains("@DynamoDbSortKey");
    assertThat(content).contains("public String getEntityType()");
    
    // Check domain fields
    assertThat(content).contains("private String userId");
    assertThat(content).contains("private String entityType");
    assertThat(content).contains("private String email");
  }

  @Test
  void generatesKeysHelperWithFieldConstants() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/keys/UserKeys.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);
    
    // Check class structure
    assertThat(content).contains("public final class UserKeys");
    
    // Check field name constant (no prefixes!)
    assertThat(content).contains("public static final String PARTITION_KEY_FIELD = \"userId\"");
    
    // Should NOT have entity prefix (old behavior)
    assertThat(content).doesNotContain("ENTITY_PREFIX");
    assertThat(content).doesNotContain("USER#");
    
    // Check key() method
    assertThat(content).contains("public static Key key(String userId)");
    assertThat(content).contains("partitionValue(userId)");
  }

  @Test
  void generatesKeysHelperWithSortKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userWithSortKeySchema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/keys/UserKeys.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);
    
    // Check both field constants
    assertThat(content).contains("PARTITION_KEY_FIELD = \"userId\"");
    assertThat(content).contains("SORT_KEY_FIELD = \"entityType\"");
    
    // Check key() method takes both parameters
    assertThat(content).contains("public static Key key(String userId, String entityType)");
    assertThat(content).contains("partitionValue(userId)");
    assertThat(content).contains("sortValue(entityType)");
  }

  @Test
  void generatesRepositoryWithFindByKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/repository/UserRepository.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);
    
    // Check class structure
    assertThat(content).contains("public class UserRepository");
    
    // Check constructors
    assertThat(content).contains("public UserRepository(ChaimDynamoDbClient client)");
    assertThat(content).contains("public UserRepository(DynamoDbEnhancedClient enhancedClient, String tableName)");
    
    // Check key-based methods (no pk/sk arguments!)
    assertThat(content).contains("public void save(User entity)");
    assertThat(content).contains("public Optional<User> findByKey(String userId)");
    assertThat(content).contains("public void deleteByKey(String userId)");
    
    // Should NOT have old pk/sk methods
    assertThat(content).doesNotContain("findByPkSk");
    assertThat(content).doesNotContain("deleteByPkSk");
    
    // Should NOT contain old findAll
    assertThat(content).doesNotContain("findAll");

    // Should now have scan, batch, transaction, and conditional write methods
    assertThat(content).contains("public List<User> scan()");
    assertThat(content).contains("public void batchSave(List<User> entities)");
    assertThat(content).contains("public void transactSave(List<User> entities)");
    assertThat(content).contains("public User update(User entity)");
    assertThat(content).contains("public boolean existsByKey(String userId)");
  }

  @Test
  void generatesRepositoryWithCompositeKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userWithSortKeySchema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/repository/UserRepository.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);
    
    // Check findByKey takes both PK and SK
    assertThat(content).contains("public Optional<User> findByKey(String userId, String entityType)");
    assertThat(content).contains("public void deleteByKey(String userId, String entityType)");
  }

  @Test
  void generatesChaimDynamoDbClient() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/client/ChaimDynamoDbClient.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);
    
    // Check class structure
    assertThat(content).contains("public class ChaimDynamoDbClient");
    
    // Check getters
    assertThat(content).contains("public DynamoDbEnhancedClient getEnhancedClient()");
    assertThat(content).contains("public String getTableName()");
    
    // Check builder pattern
    assertThat(content).contains("public static Builder builder()");
    assertThat(content).contains("public static class Builder");
    
    // Check wrap() for DI
    assertThat(content).contains("public static ChaimDynamoDbClient wrap(DynamoDbEnhancedClient client, String tableName)");
    
    // Check builder methods
    assertThat(content).contains("public Builder tableName(String tableName)");
    assertThat(content).contains("public Builder region(String region)");
    assertThat(content).contains("public Builder endpoint(String endpoint)");
    assertThat(content).contains("public Builder existingClient(DynamoDbEnhancedClient client)");
    
    // Check environment variable resolution
    assertThat(content).contains("CHAIM_TABLE_NAME");
    assertThat(content).contains("AWS_REGION");
    assertThat(content).contains("DYNAMODB_ENDPOINT");
  }

  @Test
  void generatesChaimConfigWithFactoryMethods() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/config/ChaimConfig.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);
    
    // Check class structure
    assertThat(content).contains("public class ChaimConfig");
    
    // Check constants
    assertThat(content).contains("public static final String TABLE_NAME = \"DataTable\"");
    assertThat(content).contains("public static final String TABLE_ARN");
    assertThat(content).contains("public static final String REGION = \"us-east-1\"");
    
    // Check getClient()
    assertThat(content).contains("public static ChaimDynamoDbClient getClient()");
    
    // Check clientBuilder()
    assertThat(content).contains("public static ChaimDynamoDbClient.Builder clientBuilder()");
    
    // Check repository factory methods
    assertThat(content).contains("public static UserRepository userRepository()");
    assertThat(content).contains("public static UserRepository userRepository(ChaimDynamoDbClient client)");
  }

  @Test
  void generatesMultipleEntitiesForSingleTable() throws Exception {
    Path out = tempDir.resolve("generated");
    
    // Generate both User and Order for the same table (both have same PK/SK)
    generator.generateForTable(List.of(userWithSortKeySchema, orderSchema), "com.example.model", out, tableMetadata);

    // Check both entity files exist
    assertThat(Files.exists(out.resolve("com/example/model/User.java"))).isTrue();
    assertThat(Files.exists(out.resolve("com/example/model/Order.java"))).isTrue();
    
    // Check both keys helpers exist
    assertThat(Files.exists(out.resolve("com/example/model/keys/UserKeys.java"))).isTrue();
    assertThat(Files.exists(out.resolve("com/example/model/keys/OrderKeys.java"))).isTrue();
    
    // Check both repositories exist
    assertThat(Files.exists(out.resolve("com/example/model/repository/UserRepository.java"))).isTrue();
    assertThat(Files.exists(out.resolve("com/example/model/repository/OrderRepository.java"))).isTrue();
    
    // Shared infrastructure should exist only once
    assertThat(Files.exists(out.resolve("com/example/model/client/ChaimDynamoDbClient.java"))).isTrue();
    assertThat(Files.exists(out.resolve("com/example/model/config/ChaimConfig.java"))).isTrue();
    
    // Check ChaimConfig has factory methods for BOTH entities
    String configContent = Files.readString(out.resolve("com/example/model/config/ChaimConfig.java"));
    assertThat(configContent).contains("public static UserRepository userRepository()");
    assertThat(configContent).contains("public static OrderRepository orderRepository()");
  }

  @Test
  void multiEntitySchemasSameKeyFields() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userWithSortKeySchema, orderSchema), "com.example.model", out, tableMetadata);

    // Both entities should use same key field names
    String userKeysContent = Files.readString(out.resolve("com/example/model/keys/UserKeys.java"));
    assertThat(userKeysContent).contains("PARTITION_KEY_FIELD = \"userId\"");
    assertThat(userKeysContent).contains("SORT_KEY_FIELD = \"entityType\"");
    
    String orderKeysContent = Files.readString(out.resolve("com/example/model/keys/OrderKeys.java"));
    assertThat(orderKeysContent).contains("PARTITION_KEY_FIELD = \"userId\"");
    assertThat(orderKeysContent).contains("SORT_KEY_FIELD = \"entityType\"");
  }

  @Test
  void derivesEntityNameFromNamespace() throws Exception {
    // Create schema without explicit entityName - should default to "Entity"
    BprintSchema schemaWithoutName = new BprintSchema();
    schemaWithoutName.schemaVersion = "1.1";
    schemaWithoutName.entityName = null;  // Not set
    schemaWithoutName.description = "Products";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("productId");
    schemaWithoutName.identity = pk;
    
    BprintSchema.Field field = new BprintSchema.Field();
    field.name = "productId";
    field.type = "string";
    field.required = true;
    schemaWithoutName.fields = List.of(field);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schemaWithoutName), "com.example.model", out, tableMetadata);

    // Should default to "Entity" when entityName is not set
    assertThat(Files.exists(out.resolve("com/example/model/Entity.java"))).isTrue();
    assertThat(Files.exists(out.resolve("com/example/model/keys/EntityKeys.java"))).isTrue();
    
    String keysContent = Files.readString(out.resolve("com/example/model/keys/EntityKeys.java"));
    assertThat(keysContent).contains("PARTITION_KEY_FIELD = \"productId\"");
  }

  // =========================================================================
  // nameOverride and auto-conversion tests
  // =========================================================================

  @Test
  void generatesEntityWithHyphenatedFieldNames() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order entity with hyphenated fields";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("order-id");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "order-id";
    orderId.type = "string";
    orderId.required = true;

    BprintSchema.Field orderDate = new BprintSchema.Field();
    orderDate.name = "order-date";
    orderDate.type = "timestamp";
    orderDate.required = true;

    BprintSchema.Field customerId = new BprintSchema.Field();
    customerId.name = "customerId";
    customerId.type = "string";
    customerId.required = true;

    schema.fields = List.of(orderId, orderDate, customerId);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/Order.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);

    // Hyphenated fields should be auto-converted to camelCase
    assertThat(content).contains("private String orderId");
    assertThat(content).contains("private Instant orderDate");
    assertThat(content).contains("private String customerId");

    // Should NOT contain the raw hyphenated names as Java fields
    assertThat(content).doesNotContain("private String order-id");
    assertThat(content).doesNotContain("private Instant order-date");

    // @DynamoDbAttribute must be on getter methods, NOT on field declarations.
    // (The annotation has @Target(ElementType.METHOD) in AWS SDK v2.)
    assertThat(content).contains("@DynamoDbAttribute(\"order-id\")");
    assertThat(content).contains("@DynamoDbAttribute(\"order-date\")");

    // Non-key auto-converted field should have an explicit getter with @DynamoDbAttribute
    assertThat(content).contains("@DynamoDbAttribute(\"order-date\")\n  public Instant getOrderDate()");

    // Field declaration should NOT have @DynamoDbAttribute
    assertThat(content).doesNotContain("@DynamoDbAttribute(\"order-date\")\n  private");

    // Clean field should NOT have @DynamoDbAttribute
    // customerId maps to customerId - no annotation needed
    assertThat(content).doesNotContain("@DynamoDbAttribute(\"customerId\")");

    // PK getter should have both @DynamoDbPartitionKey and @DynamoDbAttribute
    assertThat(content).contains("@DynamoDbPartitionKey");
    assertThat(content).contains("public String getOrderId()");
  }

  @Test
  void generatesEntityWithNameOverride() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order with nameOverride";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "orderId";
    orderId.type = "string";
    orderId.required = true;

    BprintSchema.Field tfa = new BprintSchema.Field();
    tfa.name = "2fa-verified";
    tfa.nameOverride = "twoFactorVerified";
    tfa.type = "boolean";
    tfa.required = false;

    schema.fields = List.of(orderId, tfa);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Order.java"));

    // nameOverride should be used as the Java field name
    assertThat(content).contains("private Boolean twoFactorVerified");

    // @DynamoDbAttribute should be on the getter method, not the field
    assertThat(content).contains("@DynamoDbAttribute(\"2fa-verified\")\n  public Boolean getTwoFactorVerified()");

    // Field declaration must NOT have @DynamoDbAttribute
    assertThat(content).doesNotContain("@DynamoDbAttribute(\"2fa-verified\")\n  private");

    // Clean field should NOT have @DynamoDbAttribute
    assertThat(content).doesNotContain("@DynamoDbAttribute(\"orderId\")");
    assertThat(content).contains("private String orderId");
  }

  @Test
  void generatesEntityWithCleanName_noAnnotation() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Customer";
    schema.description = "Clean field names";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("customerId");
    schema.identity = pk;

    BprintSchema.Field custId = new BprintSchema.Field();
    custId.name = "customerId";
    custId.type = "string";
    custId.required = true;

    BprintSchema.Field email = new BprintSchema.Field();
    email.name = "email";
    email.type = "string";
    email.required = true;

    schema.fields = List.of(custId, email);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Customer.java"));

    // Clean names should NOT have @DynamoDbAttribute at all
    assertThat(content).doesNotContain("@DynamoDbAttribute");
    assertThat(content).contains("private String customerId");
    assertThat(content).contains("private String email");
  }

  @Test
  void detectsCollisionBetweenAutoConvertedNames() {
    // Two fields that resolve to the same Java identifier should throw
    BprintSchema.Field field1 = new BprintSchema.Field();
    field1.name = "order-date";
    field1.type = "string";

    BprintSchema.Field field2 = new BprintSchema.Field();
    field2.name = "orderDate";
    field2.type = "string";

    List<BprintSchema.Field> fields = new ArrayList<>();
    fields.add(field1);
    fields.add(field2);

    assertThatThrownBy(() -> JavaGenerator.detectCollisions(fields))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("Name collision")
        .hasMessageContaining("order-date")
        .hasMessageContaining("orderDate");
  }

  @Test
  void generatesEntityWithMixedFieldNames() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Mixed field names";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("order-id");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "order-id";
    orderId.type = "string";
    orderId.required = true;

    BprintSchema.Field orderDate = new BprintSchema.Field();
    orderDate.name = "order-date";
    orderDate.type = "timestamp";
    orderDate.required = true;

    BprintSchema.Field tfa = new BprintSchema.Field();
    tfa.name = "2fa-verified";
    tfa.nameOverride = "twoFactorVerified";
    tfa.type = "boolean";
    tfa.required = false;

    BprintSchema.Field customerId = new BprintSchema.Field();
    customerId.name = "customerId";
    customerId.type = "string";
    customerId.required = true;

    schema.fields = List.of(orderId, orderDate, tfa, customerId);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Order.java"));

    // Auto-converted: order-id -> orderId with annotation
    assertThat(content).contains("private String orderId");
    assertThat(content).contains("@DynamoDbAttribute(\"order-id\")");

    // Auto-converted: order-date -> orderDate with annotation
    assertThat(content).contains("private Instant orderDate");
    assertThat(content).contains("@DynamoDbAttribute(\"order-date\")");

    // nameOverride: 2fa-verified -> twoFactorVerified with annotation
    assertThat(content).contains("private Boolean twoFactorVerified");
    assertThat(content).contains("@DynamoDbAttribute(\"2fa-verified\")");

    // Clean: customerId -> customerId, no annotation
    assertThat(content).contains("private String customerId");
    assertThat(content).doesNotContain("@DynamoDbAttribute(\"customerId\")");
  }

  @Test
  void toJavaCamelCaseConvertsCorrectly() {
    // Hyphens trigger camelCase
    assertThat(JavaGenerator.toJavaCamelCase("order-date")).isEqualTo("orderDate");
    assertThat(JavaGenerator.toJavaCamelCase("user-id")).isEqualTo("userId");

    // Underscores trigger camelCase
    assertThat(JavaGenerator.toJavaCamelCase("order_date")).isEqualTo("orderDate");

    // Leading digits get underscore prefix
    assertThat(JavaGenerator.toJavaCamelCase("2fa-enabled")).isEqualTo("_2faEnabled");

    // All-caps lowered
    assertThat(JavaGenerator.toJavaCamelCase("TTL")).isEqualTo("ttl");

    // Already valid identifier stays as-is via resolveCodeName
    BprintSchema.Field cleanField = new BprintSchema.Field();
    cleanField.name = "customerId";
    cleanField.type = "string";
    assertThat(JavaGenerator.resolveCodeName(cleanField)).isEqualTo("customerId");
  }

  @Test
  void resolveCodeNameUsesNameOverrideWhenSet() {
    BprintSchema.Field field = new BprintSchema.Field();
    field.name = "2fa-verified";
    field.nameOverride = "twoFactorVerified";
    field.type = "boolean";

    assertThat(JavaGenerator.resolveCodeName(field)).isEqualTo("twoFactorVerified");
  }

  @Test
  void resolveCodeNameAutoConvertsWhenNoOverride() {
    BprintSchema.Field field = new BprintSchema.Field();
    field.name = "order-date";
    field.type = "string";

    assertThat(JavaGenerator.resolveCodeName(field)).isEqualTo("orderDate");
  }

  @Test
  void keysHelperPreservesOriginalDynamoDbAttributeNames() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order with hyphenated PK";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("order-id");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "order-id";
    orderId.type = "string";
    orderId.required = true;

    schema.fields = List.of(orderId);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String keysContent = Files.readString(out.resolve("com/example/model/keys/OrderKeys.java"));

    // Constants should use original DynamoDB attribute name
    assertThat(keysContent).contains("PARTITION_KEY_FIELD = \"order-id\"");

    // Method parameter should use resolved code name
    assertThat(keysContent).contains("public static Key key(String orderId)");
  }

  @Test
  void repositoryUsesResolvedCodeNamesForParameters() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order with hyphenated PK";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("order-id");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "order-id";
    orderId.type = "string";
    orderId.required = true;

    schema.fields = List.of(orderId);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String repoContent = Files.readString(out.resolve("com/example/model/repository/OrderRepository.java"));

    // Parameters should use resolved code name, not raw hyphenated name
    assertThat(repoContent).contains("findByKey(String orderId)");
    assertThat(repoContent).contains("deleteByKey(String orderId)");

    // Method signatures should not use hyphenated names as parameter names
    assertThat(repoContent).doesNotContain("findByKey(String order-id)");
    assertThat(repoContent).doesNotContain("deleteByKey(String order-id)");
  }

  // =========================================================================
  // Constraint validation generation tests
  // =========================================================================

  @Test
  void generatesChaimValidationException() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/validation/ChaimValidationException.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);

    // Check class structure
    assertThat(content).contains("public class ChaimValidationException extends RuntimeException");

    // Check FieldError inner class
    assertThat(content).contains("public static class FieldError");
    assertThat(content).contains("public String getFieldName()");
    assertThat(content).contains("public String getConstraint()");
    assertThat(content).contains("public String getMessage()");
    assertThat(content).contains("public String toString()");

    // Check constructor and getErrors
    assertThat(content).contains("public ChaimValidationException(String entityName");
    assertThat(content).contains("public List<FieldError> getErrors()");
    assertThat(content).contains("Collections.unmodifiableList(errors)");
  }

  @Test
  void generatesValidatorWithStringConstraints() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Customer";
    schema.description = "Customer with string constraints";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("customerId");
    schema.identity = pk;

    BprintSchema.Field custId = new BprintSchema.Field();
    custId.name = "customerId";
    custId.type = "string";
    custId.required = true;
    BprintSchema.Constraints custIdConstraints = new BprintSchema.Constraints();
    custIdConstraints.minLength = 1;
    custIdConstraints.maxLength = 64;
    custId.constraints = custIdConstraints;

    BprintSchema.Field email = new BprintSchema.Field();
    email.name = "email";
    email.type = "string";
    email.required = true;
    BprintSchema.Constraints emailConstraints = new BprintSchema.Constraints();
    emailConstraints.minLength = 5;
    emailConstraints.maxLength = 254;
    emailConstraints.pattern = "^[^@]+@[^@]+\\.[^@]+$";
    email.constraints = emailConstraints;

    schema.fields = List.of(custId, email);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/validation/CustomerValidator.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);

    // Check class structure
    assertThat(content).contains("public final class CustomerValidator");
    assertThat(content).contains("public static void validate(Customer entity)");

    // Check string minLength constraint
    assertThat(content).contains("entity.getCustomerId().length() < 1");
    assertThat(content).contains("\"customerId\"");
    assertThat(content).contains("\"minLength\"");

    // Check string maxLength constraint
    assertThat(content).contains("entity.getCustomerId().length() > 64");
    assertThat(content).contains("\"maxLength\"");

    // Check email pattern constraint
    assertThat(content).contains("entity.getEmail().matches(");
    assertThat(content).contains("\"pattern\"");

    // Check null-safety
    assertThat(content).contains("entity.getCustomerId() != null");
    assertThat(content).contains("entity.getEmail() != null");

    // Check error collection and throw
    assertThat(content).contains("new ArrayList<>()");
    assertThat(content).contains("if (!errors.isEmpty())");
    assertThat(content).contains("throw new ChaimValidationException(\"Customer\", errors)");
  }

  @Test
  void generatesValidatorWithNumberConstraints() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Product";
    schema.description = "Product with number constraints";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("productId");
    schema.identity = pk;

    BprintSchema.Field prodId = new BprintSchema.Field();
    prodId.name = "productId";
    prodId.type = "string";
    prodId.required = true;

    BprintSchema.Field price = new BprintSchema.Field();
    price.name = "price";
    price.type = "number";
    price.required = true;
    BprintSchema.Constraints priceConstraints = new BprintSchema.Constraints();
    priceConstraints.min = 0.0;
    priceConstraints.max = 999999.99;
    price.constraints = priceConstraints;

    BprintSchema.Field quantity = new BprintSchema.Field();
    quantity.name = "quantity";
    quantity.type = "number";
    quantity.required = false;
    BprintSchema.Constraints qtyConstraints = new BprintSchema.Constraints();
    qtyConstraints.min = 0.0;
    qtyConstraints.max = 10000.0;
    quantity.constraints = qtyConstraints;

    schema.fields = List.of(prodId, price, quantity);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/validation/ProductValidator.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);

    // Check number min/max for price (bare 'number' → Integer, so integer literals)
    assertThat(content).contains("entity.getPrice() != null");
    assertThat(content).contains("entity.getPrice() < 0");
    assertThat(content).contains("entity.getPrice() > 999999");
    assertThat(content).contains("\"price\"");
    assertThat(content).contains("\"min\"");
    assertThat(content).contains("\"max\"");

    // Check number min/max for quantity (bare 'number' → Integer, so integer literals)
    assertThat(content).contains("entity.getQuantity() != null");
    assertThat(content).contains("entity.getQuantity() < 0");
    assertThat(content).contains("entity.getQuantity() > 10000");
  }

  @Test
  void generatesValidatorWithMixedConstraints() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "User";
    schema.description = "User with mixed constraints";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("userId");
    schema.identity = pk;

    BprintSchema.Field userId = new BprintSchema.Field();
    userId.name = "userId";
    userId.type = "string";
    userId.required = true;
    BprintSchema.Constraints userIdConstraints = new BprintSchema.Constraints();
    userIdConstraints.minLength = 1;
    userIdConstraints.maxLength = 64;
    userId.constraints = userIdConstraints;

    BprintSchema.Field email = new BprintSchema.Field();
    email.name = "email";
    email.type = "string";
    email.required = true;
    BprintSchema.Constraints emailConstraints = new BprintSchema.Constraints();
    emailConstraints.minLength = 5;
    emailConstraints.maxLength = 254;
    emailConstraints.pattern = "^[^@]+@[^@]+\\.[^@]+$";
    email.constraints = emailConstraints;

    BprintSchema.Field age = new BprintSchema.Field();
    age.name = "age";
    age.type = "number";
    age.required = false;
    BprintSchema.Constraints ageConstraints = new BprintSchema.Constraints();
    ageConstraints.min = 0.0;
    ageConstraints.max = 150.0;
    age.constraints = ageConstraints;

    schema.fields = List.of(userId, email, age);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/validation/UserValidator.java"));

    // String constraints present
    assertThat(content).contains("entity.getUserId().length() < 1");
    assertThat(content).contains("entity.getEmail().matches(");

    // Number constraints present (bare 'number' → Integer literals)
    assertThat(content).contains("entity.getAge() < 0");
    assertThat(content).contains("entity.getAge() > 150");

    // All use original field names in error messages
    assertThat(content).contains("\"userId\"");
    assertThat(content).contains("\"email\"");
    assertThat(content).contains("\"age\"");
  }

  @Test
  void generatesValidatorWithNoValidation() throws Exception {
    // Schema where fields are NOT required, have no constraints, and no enum
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Simple";
    schema.description = "Simple entity with no validation rules";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("id");
    schema.identity = pk;

    BprintSchema.Field idField = new BprintSchema.Field();
    idField.name = "id";
    idField.type = "string";

    BprintSchema.Field nameField = new BprintSchema.Field();
    nameField.name = "name";
    nameField.type = "string";

    schema.fields = List.of(idField, nameField);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    Path file = out.resolve("com/example/model/validation/SimpleValidator.java");
    assertThat(Files.exists(file)).isTrue();

    String content = Files.readString(file);

    // Validator class exists
    assertThat(content).contains("public final class SimpleValidator");
    assertThat(content).contains("public static void validate(Simple entity)");

    // No validation logic should be present
    assertThat(content).doesNotContain("new ArrayList<>()");
    assertThat(content).doesNotContain("errors.add");
    assertThat(content).doesNotContain("throw new ChaimValidationException");
  }

  @Test
  void generatesValidatorWithPartialConstraints() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Account";
    schema.description = "Account with partial constraints";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("accountId");
    schema.identity = pk;

    // accountId: not required, no constraints -> no validation
    BprintSchema.Field accountId = new BprintSchema.Field();
    accountId.name = "accountId";
    accountId.type = "string";

    // name: not required but has constraints -> constraint checks only
    BprintSchema.Field name = new BprintSchema.Field();
    name.name = "name";
    name.type = "string";
    BprintSchema.Constraints nameConstraints = new BprintSchema.Constraints();
    nameConstraints.minLength = 1;
    nameConstraints.maxLength = 100;
    name.constraints = nameConstraints;

    // isActive: not required, no constraints -> no validation
    BprintSchema.Field isActive = new BprintSchema.Field();
    isActive.name = "isActive";
    isActive.type = "boolean";

    schema.fields = List.of(accountId, name, isActive);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/validation/AccountValidator.java"));

    // Only 'name' field should have constraint checks
    assertThat(content).contains("entity.getName().length() < 1");
    assertThat(content).contains("entity.getName().length() > 100");

    // Non-constrained, non-required fields should not appear in validation
    assertThat(content).doesNotContain("getAccountId()");
    assertThat(content).doesNotContain("getIsActive()");
  }

  @Test
  void repositorySaveCallsValidator() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);

    String repoContent = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    // save() should call validator before putItem
    assertThat(repoContent).contains("UserValidator.validate(entity)");
    assertThat(repoContent).contains("table.putItem(entity)");

    // Validator call should come before putItem (check ordering)
    int validateIndex = repoContent.indexOf("UserValidator.validate(entity)");
    int putItemIndex = repoContent.indexOf("table.putItem(entity)");
    assertThat(validateIndex).isLessThan(putItemIndex);

    // Repository should import the validator
    assertThat(repoContent).contains("import com.example.model.validation.UserValidator");
  }

  @Test
  void validatorUsesOriginalFieldNameInErrors() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order with nameOverride and constraints";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "orderId";
    orderId.type = "string";
    orderId.required = true;

    BprintSchema.Field orderTotal = new BprintSchema.Field();
    orderTotal.name = "order-total";
    orderTotal.nameOverride = "orderTotal";
    orderTotal.type = "number";
    orderTotal.required = true;
    BprintSchema.Constraints totalConstraints = new BprintSchema.Constraints();
    totalConstraints.min = 0.0;
    totalConstraints.max = 1000000.0;
    orderTotal.constraints = totalConstraints;

    schema.fields = List.of(orderId, orderTotal);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/validation/OrderValidator.java"));

    // Getter uses resolved code name (from nameOverride)
    assertThat(content).contains("entity.getOrderTotal()");

    // Error message uses original DynamoDB attribute name
    assertThat(content).contains("\"order-total\"");

    // Should NOT use the resolved name in the error field name
    // (the first argument to FieldError is the original DynamoDB name)
  }

  @Test
  void validatorHandlesPatternWithSpecialChars() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Contact";
    schema.description = "Contact with complex pattern";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("contactId");
    schema.identity = pk;

    BprintSchema.Field contactId = new BprintSchema.Field();
    contactId.name = "contactId";
    contactId.type = "string";
    contactId.required = true;

    BprintSchema.Field ssn = new BprintSchema.Field();
    ssn.name = "ssn";
    ssn.type = "string";
    ssn.required = false;
    BprintSchema.Constraints ssnConstraints = new BprintSchema.Constraints();
    ssnConstraints.minLength = 9;
    ssnConstraints.maxLength = 11;
    ssnConstraints.pattern = "^[0-9]{3}-?[0-9]{2}-?[0-9]{4}$";
    ssn.constraints = ssnConstraints;

    schema.fields = List.of(contactId, ssn);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/validation/ContactValidator.java"));

    // Pattern with special regex chars should be properly escaped as a Java string literal
    assertThat(content).contains("entity.getSsn().matches(");
    // Javapoet $S handles the escaping - check the pattern content is present
    assertThat(content).contains("[0-9]{3}");
    assertThat(content).contains("[0-9]{2}");
    assertThat(content).contains("[0-9]{4}");

    // minLength and maxLength also present
    assertThat(content).contains("entity.getSsn().length() < 9");
    assertThat(content).contains("entity.getSsn().length() > 11");
  }

  // =========================================================================
  // Required field validation tests
  // =========================================================================

  @Test
  void generatesValidatorWithRequiredFields() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Customer";
    schema.description = "Customer with required fields";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("customerId");
    schema.identity = pk;

    BprintSchema.Field custId = new BprintSchema.Field();
    custId.name = "customerId";
    custId.type = "string";
    custId.required = true;

    BprintSchema.Field email = new BprintSchema.Field();
    email.name = "email";
    email.type = "string";
    email.required = true;

    BprintSchema.Field nickname = new BprintSchema.Field();
    nickname.name = "nickname";
    nickname.type = "string";
    // not required (default false)

    schema.fields = List.of(custId, email, nickname);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/validation/CustomerValidator.java"));

    // Required fields should have null checks
    assertThat(content).contains("entity.getCustomerId() == null");
    assertThat(content).contains("\"customerId\", \"required\", \"is required but was null\"");
    assertThat(content).contains("entity.getEmail() == null");
    assertThat(content).contains("\"email\", \"required\", \"is required but was null\"");

    // Non-required field without constraints should NOT appear in validation
    assertThat(content).doesNotContain("getNickname()");

    // Error collection and throw
    assertThat(content).contains("new ArrayList<>()");
    assertThat(content).contains("throw new ChaimValidationException(\"Customer\", errors)");
  }

  @Test
  void validatorAllowsNullOptionalField() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Profile";
    schema.description = "Profile with optional fields";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("profileId");
    schema.identity = pk;

    BprintSchema.Field profileId = new BprintSchema.Field();
    profileId.name = "profileId";
    profileId.type = "string";
    profileId.required = true;

    BprintSchema.Field bio = new BprintSchema.Field();
    bio.name = "bio";
    bio.type = "string";
    // not required, no constraints

    BprintSchema.Field website = new BprintSchema.Field();
    website.name = "website";
    website.type = "string";
    // not required, no constraints

    schema.fields = List.of(profileId, bio, website);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/validation/ProfileValidator.java"));

    // Only profileId should have required check
    assertThat(content).contains("entity.getProfileId() == null");
    assertThat(content).contains("\"profileId\", \"required\"");

    // Optional fields should NOT appear in validation
    assertThat(content).doesNotContain("getBio()");
    assertThat(content).doesNotContain("getWebsite()");
  }

  @Test
  void validatorRequiredCheckComesBeforeConstraintChecks() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Account";
    schema.description = "Account with required + constraints";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("accountId");
    schema.identity = pk;

    BprintSchema.Field accountId = new BprintSchema.Field();
    accountId.name = "accountId";
    accountId.type = "string";
    accountId.required = true;
    BprintSchema.Constraints idConstraints = new BprintSchema.Constraints();
    idConstraints.minLength = 5;
    idConstraints.maxLength = 50;
    accountId.constraints = idConstraints;

    schema.fields = List.of(accountId);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/validation/AccountValidator.java"));

    // Both required and constraint checks should be present
    assertThat(content).contains("entity.getAccountId() == null");
    assertThat(content).contains("\"required\"");
    assertThat(content).contains("entity.getAccountId().length() < 5");
    assertThat(content).contains("entity.getAccountId().length() > 50");

    // Required check should come BEFORE constraint checks
    int requiredIndex = content.indexOf("entity.getAccountId() == null");
    int constraintIndex = content.indexOf("entity.getAccountId().length()");
    assertThat(requiredIndex).isLessThan(constraintIndex);
  }

  // =========================================================================
  // Default value tests
  // =========================================================================

  @Test
  void generatesEntityWithStringDefault() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Settings";
    schema.description = "Settings with string default";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("settingsId");
    schema.identity = pk;

    BprintSchema.Field settingsId = new BprintSchema.Field();
    settingsId.name = "settingsId";
    settingsId.type = "string";

    BprintSchema.Field currency = new BprintSchema.Field();
    currency.name = "currency";
    currency.type = "string";
    currency.defaultValue = "USD";

    BprintSchema.Field locale = new BprintSchema.Field();
    locale.name = "locale";
    locale.type = "string";
    // no default

    schema.fields = List.of(settingsId, currency, locale);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Settings.java"));

    // Field with default has an inline initializer (no @Builder.Default)
    assertThat(content).contains("private String currency = \"USD\"");
    assertThat(content).doesNotContain("@Builder.Default");

    // Field without default has no initializer
    assertThat(content).contains("private String locale;");
    assertThat(content).contains("private String settingsId;");
  }

  @Test
  void generatesEntityWithBooleanDefault() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Feature";
    schema.description = "Feature with boolean default";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("featureId");
    schema.identity = pk;

    BprintSchema.Field featureId = new BprintSchema.Field();
    featureId.name = "featureId";
    featureId.type = "string";

    BprintSchema.Field active = new BprintSchema.Field();
    active.name = "active";
    active.type = "boolean";
    active.defaultValue = true;

    BprintSchema.Field deprecated = new BprintSchema.Field();
    deprecated.name = "deprecated";
    deprecated.type = "boolean";
    deprecated.defaultValue = false;

    schema.fields = List.of(featureId, active, deprecated);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Feature.java"));

    assertThat(content).contains("private Boolean active = true");
    assertThat(content).contains("private Boolean deprecated = false");
    assertThat(content).doesNotContain("@Builder.Default");
  }

  @Test
  void generatesEntityWithNumberDefault() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Pricing";
    schema.description = "Pricing with number default";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("pricingId");
    schema.identity = pk;

    BprintSchema.Field pricingId = new BprintSchema.Field();
    pricingId.name = "pricingId";
    pricingId.type = "string";

    BprintSchema.Field taxRate = new BprintSchema.Field();
    taxRate.name = "taxRate";
    taxRate.type = "number";
    taxRate.defaultValue = 0.0;

    BprintSchema.Field discount = new BprintSchema.Field();
    discount.name = "discount";
    discount.type = "number";
    discount.defaultValue = 10.5;

    schema.fields = List.of(pricingId, taxRate, discount);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Pricing.java"));

    assertThat(content).contains("private Integer taxRate = 0");
    assertThat(content).contains("private Integer discount = 10");
    assertThat(content).doesNotContain("@Builder.Default");
  }

  @Test
  void generatesEntityWithMixedDefaults() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Config";
    schema.description = "Config with mixed defaults";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("configId");
    schema.identity = pk;

    BprintSchema.Field configId = new BprintSchema.Field();
    configId.name = "configId";
    configId.type = "string";

    BprintSchema.Field env = new BprintSchema.Field();
    env.name = "env";
    env.type = "string";
    env.defaultValue = "production";

    BprintSchema.Field retries = new BprintSchema.Field();
    retries.name = "retries";
    retries.type = "number";
    retries.defaultValue = 3;

    BprintSchema.Field enabled = new BprintSchema.Field();
    enabled.name = "enabled";
    enabled.type = "boolean";
    enabled.defaultValue = true;

    BprintSchema.Field label = new BprintSchema.Field();
    label.name = "label";
    label.type = "string";
    // no default

    schema.fields = List.of(configId, env, retries, enabled, label);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Config.java"));

    // Fields with defaults
    assertThat(content).contains("private String env = \"production\"");
    assertThat(content).contains("private Boolean enabled = true");

    // Fields without defaults - no @Builder.Default, no initializer
    assertThat(content).contains("private String configId;");
    assertThat(content).contains("private String label;");
  }

  // =========================================================================
  // Enum validation tests
  // =========================================================================

  @Test
  void generatesValidatorWithEnumValues() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Product";
    schema.description = "Product with enum values";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("productId");
    schema.identity = pk;

    BprintSchema.Field productId = new BprintSchema.Field();
    productId.name = "productId";
    productId.type = "string";

    BprintSchema.Field category = new BprintSchema.Field();
    category.name = "category";
    category.type = "string";
    category.enumValues = List.of("electronics", "clothing", "books");

    schema.fields = List.of(productId, category);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    // A standalone enum file should be generated for the category field
    String enumContent = Files.readString(out.resolve("com/example/model/ProductCategory.java"));
    assertThat(enumContent).contains("public enum ProductCategory");
    assertThat(enumContent).contains("electronics");
    assertThat(enumContent).contains("clothing");
    assertThat(enumContent).contains("books");

    // The entity field should use the enum type, not String
    String entityContent = Files.readString(out.resolve("com/example/model/Product.java"));
    assertThat(entityContent).contains("ProductCategory category");

    // The validator should NOT contain a string-based Set.of enum check — the enum
    // type enforces valid values at compile/serialization time
    String validatorContent = Files.readString(out.resolve("com/example/model/validation/ProductValidator.java"));
    assertThat(validatorContent).doesNotContain("Set.of(");
    assertThat(validatorContent).doesNotContain("must be one of");
  }

  @Test
  void generatesValidatorWithEnumAndConstraints() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Item";
    schema.description = "Item with both enum and constraints";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("itemId");
    schema.identity = pk;

    BprintSchema.Field itemId = new BprintSchema.Field();
    itemId.name = "itemId";
    itemId.type = "string";

    BprintSchema.Field status = new BprintSchema.Field();
    status.name = "status";
    status.type = "string";
    status.required = true;
    status.enumValues = List.of("active", "inactive", "archived");
    BprintSchema.Constraints statusConstraints = new BprintSchema.Constraints();
    statusConstraints.minLength = 1;
    statusConstraints.maxLength = 20;
    status.constraints = statusConstraints;

    schema.fields = List.of(itemId, status);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    // A standalone enum file should be generated
    String enumContent = Files.readString(out.resolve("com/example/model/ItemStatus.java"));
    assertThat(enumContent).contains("public enum ItemStatus");
    assertThat(enumContent).contains("active");
    assertThat(enumContent).contains("inactive");
    assertThat(enumContent).contains("archived");

    // The entity should use the enum type
    String entityContent = Files.readString(out.resolve("com/example/model/Item.java"));
    assertThat(entityContent).contains("ItemStatus status");

    String validatorContent = Files.readString(out.resolve("com/example/model/validation/ItemValidator.java"));

    // Required null-check is still emitted (null is always invalid for required fields)
    assertThat(validatorContent).contains("entity.getStatus() == null");
    assertThat(validatorContent).contains("\"required\"");

    // String constraints and Set-based enum checks are NOT emitted — the enum type
    // makes them redundant (type system + DynamoDB Enhanced Client enforce valid values)
    assertThat(validatorContent).doesNotContain("entity.getStatus().length()");
    assertThat(validatorContent).doesNotContain("Set.of(");
  }

  // =========================================================================
  // Description / Javadoc tests
  // =========================================================================

  @Test
  void generatesEntityWithDescription() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Customer";
    schema.description = "Customer entity";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("customerId");
    schema.identity = pk;

    BprintSchema.Field custId = new BprintSchema.Field();
    custId.name = "customerId";
    custId.type = "string";
    custId.description = "Unique customer identifier";

    BprintSchema.Field email = new BprintSchema.Field();
    email.name = "email";
    email.type = "string";
    email.description = "Customer email address";

    BprintSchema.Field age = new BprintSchema.Field();
    age.name = "age";
    age.type = "number";
    // no description

    schema.fields = List.of(custId, email, age);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Customer.java"));

    // Fields with description should have Javadoc
    assertThat(content).contains("Unique customer identifier");
    assertThat(content).contains("Customer email address");

    // Field without description should NOT have Javadoc for it
    // (age has no description, so its Javadoc should not appear)
    assertThat(content).doesNotContain("age\n");
  }

  @Test
  void generatesEntityWithoutDescription() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Minimal";
    schema.description = "Minimal entity";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("id");
    schema.identity = pk;

    BprintSchema.Field id = new BprintSchema.Field();
    id.name = "id";
    id.type = "string";
    // no description

    BprintSchema.Field value = new BprintSchema.Field();
    value.name = "value";
    value.type = "string";
    // no description

    schema.fields = List.of(id, value);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Minimal.java"));

    // No field-level Javadoc should be present (only class-level content from javapoet)
    // Fields should be declared directly without preceding Javadoc comments
    assertThat(content).contains("private String id;");
    assertThat(content).contains("private String value;");
  }

  // =========================================================================
  // Collection type tests
  // =========================================================================

  @Test
  void generatesEntityWithListOfStrings() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order with tags";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "orderId";
    orderId.type = "string";
    orderId.required = true;

    BprintSchema.Field tags = new BprintSchema.Field();
    tags.name = "tags";
    tags.type = "list";
    BprintSchema.ListItems tagsItems = new BprintSchema.ListItems();
    tagsItems.type = "string";
    tags.items = tagsItems;

    schema.fields = List.of(orderId, tags);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Order.java"));

    assertThat(content).contains("private List<String> tags");
    assertThat(content).contains("import java.util.List");
  }

  @Test
  void generatesEntityWithListOfNumbers() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Score";
    schema.description = "Score with values";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("scoreId");
    schema.identity = pk;

    BprintSchema.Field scoreId = new BprintSchema.Field();
    scoreId.name = "scoreId";
    scoreId.type = "string";

    BprintSchema.Field values = new BprintSchema.Field();
    values.name = "values";
    values.type = "list";
    BprintSchema.ListItems valuesItems = new BprintSchema.ListItems();
    valuesItems.type = "number";
    values.items = valuesItems;

    schema.fields = List.of(scoreId, values);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Score.java"));

    assertThat(content).contains("private List<Integer> values");
  }

  @Test
  void generatesEntityWithListOfMaps() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order with line items";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "orderId";
    orderId.type = "string";
    orderId.required = true;

    BprintSchema.Field lineItems = new BprintSchema.Field();
    lineItems.name = "lineItems";
    lineItems.type = "list";
    BprintSchema.ListItems lineItemsItems = new BprintSchema.ListItems();
    lineItemsItems.type = "map";
    BprintSchema.NestedField productIdNested = new BprintSchema.NestedField();
    productIdNested.name = "productId";
    productIdNested.type = "string";
    BprintSchema.NestedField quantityNested = new BprintSchema.NestedField();
    quantityNested.name = "quantity";
    quantityNested.type = "number";
    BprintSchema.NestedField priceNested = new BprintSchema.NestedField();
    priceNested.name = "price";
    priceNested.type = "number";
    lineItemsItems.fields = List.of(productIdNested, quantityNested, priceNested);
    lineItems.items = lineItemsItems;

    schema.fields = List.of(orderId, lineItems);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String entityContent = Files.readString(out.resolve("com/example/model/Order.java"));

    // Entity references the model class type (import added by JavaPoet)
    assertThat(entityContent).contains("private List<LineItemsItem> lineItems");

    // LineItemsItem is now a standalone class in the model sub-package
    String modelContent = Files.readString(out.resolve("com/example/model/model/LineItemsItem.java"));
    assertThat(modelContent).contains("public class LineItemsItem");
    assertThat(modelContent).contains("private String productId");
    assertThat(modelContent).contains("private Integer quantity");
    assertThat(modelContent).contains("private Integer price");

    // Model class should have DynamoDB annotation and plain-Java boilerplate
    assertThat(modelContent).contains("@DynamoDbBean");
    assertThat(modelContent).contains("public LineItemsItem()");
    assertThat(modelContent).contains("public static class Builder");
  }

  @Test
  void generatesEntityWithStandaloneMap() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Config";
    schema.description = "Config with metadata map";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("configId");
    schema.identity = pk;

    BprintSchema.Field configId = new BprintSchema.Field();
    configId.name = "configId";
    configId.type = "string";

    BprintSchema.Field metadata = new BprintSchema.Field();
    metadata.name = "metadata";
    metadata.type = "map";
    BprintSchema.NestedField sourceField = new BprintSchema.NestedField();
    sourceField.name = "source";
    sourceField.type = "string";
    BprintSchema.NestedField versionField = new BprintSchema.NestedField();
    versionField.name = "version";
    versionField.type = "number";
    metadata.fields = List.of(sourceField, versionField);

    schema.fields = List.of(configId, metadata);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String entityContent = Files.readString(out.resolve("com/example/model/Config.java"));

    // Entity references the Metadata model class
    assertThat(entityContent).contains("private Metadata metadata");

    // Metadata is now a standalone class in the model sub-package
    String modelContent = Files.readString(out.resolve("com/example/model/model/Metadata.java"));
    assertThat(modelContent).contains("public class Metadata");
    assertThat(modelContent).contains("private String source");
    assertThat(modelContent).contains("private Integer version");
  }

  @Test
  void generatesEntityWithStringSet() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "User";
    schema.description = "User with roles";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("userId");
    schema.identity = pk;

    BprintSchema.Field userId = new BprintSchema.Field();
    userId.name = "userId";
    userId.type = "string";

    BprintSchema.Field roles = new BprintSchema.Field();
    roles.name = "roles";
    roles.type = "stringSet";

    schema.fields = List.of(userId, roles);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/User.java"));

    assertThat(content).contains("private Set<String> roles");
    assertThat(content).contains("import java.util.Set");
  }

  @Test
  void generatesEntityWithNumberSet() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Score";
    schema.description = "Score with tiers";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("scoreId");
    schema.identity = pk;

    BprintSchema.Field scoreId = new BprintSchema.Field();
    scoreId.name = "scoreId";
    scoreId.type = "string";

    BprintSchema.Field tiers = new BprintSchema.Field();
    tiers.name = "tiers";
    tiers.type = "numberSet";

    schema.fields = List.of(scoreId, tiers);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Score.java"));

    assertThat(content).contains("private Set<Integer> tiers");
  }

  @Test
  void validatorSkipsConstraintsOnCollectionTypes() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order with required collection";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "orderId";
    orderId.type = "string";
    orderId.required = true;

    BprintSchema.Field tags = new BprintSchema.Field();
    tags.name = "tags";
    tags.type = "list";
    tags.required = true;
    BprintSchema.ListItems tagsItems = new BprintSchema.ListItems();
    tagsItems.type = "string";
    tags.items = tagsItems;

    BprintSchema.Field roles = new BprintSchema.Field();
    roles.name = "roles";
    roles.type = "stringSet";
    roles.required = true;

    schema.fields = List.of(orderId, tags, roles);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/validation/OrderValidator.java"));

    // Required checks should be present for all required fields (including collections)
    assertThat(content).contains("entity.getOrderId() == null");
    assertThat(content).contains("entity.getTags() == null");
    assertThat(content).contains("entity.getRoles() == null");

    // No constraint/enum checks for collection types
    assertThat(content).doesNotContain("length()");
    assertThat(content).doesNotContain("matches(");
    assertThat(content).doesNotContain("Set.of(");
  }

  @Test
  void generatesEntityWithAllCollectionTypes() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order with all collection types";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "orderId";
    orderId.type = "string";
    orderId.required = true;

    BprintSchema.Field tags = new BprintSchema.Field();
    tags.name = "tags";
    tags.type = "list";
    BprintSchema.ListItems tagsItems = new BprintSchema.ListItems();
    tagsItems.type = "string";
    tags.items = tagsItems;

    BprintSchema.Field lineItems = new BprintSchema.Field();
    lineItems.name = "lineItems";
    lineItems.type = "list";
    BprintSchema.ListItems liItems = new BprintSchema.ListItems();
    liItems.type = "map";
    BprintSchema.NestedField pidNf = new BprintSchema.NestedField();
    pidNf.name = "productId";
    pidNf.type = "string";
    BprintSchema.NestedField qtyNf = new BprintSchema.NestedField();
    qtyNf.name = "quantity";
    qtyNf.type = "number";
    liItems.fields = List.of(pidNf, qtyNf);
    lineItems.items = liItems;

    BprintSchema.Field shippingAddr = new BprintSchema.Field();
    shippingAddr.name = "shippingAddress";
    shippingAddr.type = "map";
    BprintSchema.NestedField streetNf = new BprintSchema.NestedField();
    streetNf.name = "street";
    streetNf.type = "string";
    BprintSchema.NestedField cityNf = new BprintSchema.NestedField();
    cityNf.name = "city";
    cityNf.type = "string";
    shippingAddr.fields = List.of(streetNf, cityNf);

    BprintSchema.Field promoCodes = new BprintSchema.Field();
    promoCodes.name = "promotionCodes";
    promoCodes.type = "stringSet";

    BprintSchema.Field discountTiers = new BprintSchema.Field();
    discountTiers.name = "discountTiers";
    discountTiers.type = "numberSet";

    schema.fields = List.of(orderId, tags, lineItems, shippingAddr, promoCodes, discountTiers);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Order.java"));

    // All collection types mapped correctly in the entity
    assertThat(content).contains("private List<String> tags");
    assertThat(content).contains("private List<LineItemsItem> lineItems");
    assertThat(content).contains("private ShippingAddress shippingAddress");
    assertThat(content).contains("private Set<String> promotionCodes");
    assertThat(content).contains("private Set<Integer> discountTiers");

    // Map/list-of-map types are now standalone model files, not inner classes
    assertThat(Files.exists(out.resolve("com/example/model/model/LineItemsItem.java"))).isTrue();
    assertThat(Files.exists(out.resolve("com/example/model/model/ShippingAddress.java"))).isTrue();
  }

  // =========================================================================
  // Binary type tests
  // =========================================================================

  @Test
  void generatesEntityWithBinaryField() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.0";
    schema.entityName = "Document";
    schema.description = "Document with binary content";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("docId");
    schema.identity = pk;

    BprintSchema.Field docId = new BprintSchema.Field();
    docId.name = "docId";
    docId.type = "string";

    BprintSchema.Field content = new BprintSchema.Field();
    content.name = "content";
    content.type = "binary";

    schema.fields = List.of(docId, content);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String entityContent = Files.readString(out.resolve("com/example/model/Document.java"));

    assertThat(entityContent).contains("private byte[] content");
    assertThat(entityContent).contains("public byte[] getContent()");
    assertThat(entityContent).contains("public void setContent(byte[] content)");
  }

  @Test
  void generatesEntityWithNullableBinaryField() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.0";
    schema.entityName = "Attachment";
    schema.description = "Attachment with nullable binary";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("attachmentId");
    schema.identity = pk;

    BprintSchema.Field attachmentId = new BprintSchema.Field();
    attachmentId.name = "attachmentId";
    attachmentId.type = "string";

    BprintSchema.Field thumbnail = new BprintSchema.Field();
    thumbnail.name = "thumbnail";
    thumbnail.type = "binary";
    thumbnail.nullable = true;
    thumbnail.description = "Optional thumbnail image";

    schema.fields = List.of(attachmentId, thumbnail);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String entityContent = Files.readString(out.resolve("com/example/model/Attachment.java"));

    assertThat(entityContent).contains("private byte[] thumbnail");
    assertThat(entityContent).contains("Nullable");
  }

  @Test
  void generatesNestedModelWithBinaryField() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.0";
    schema.entityName = "Record";
    schema.description = "Record with nested binary";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("recordId");
    schema.identity = pk;

    BprintSchema.Field recordId = new BprintSchema.Field();
    recordId.name = "recordId";
    recordId.type = "string";

    BprintSchema.Field attachment = new BprintSchema.Field();
    attachment.name = "attachment";
    attachment.type = "map";
    BprintSchema.NestedField fileName = new BprintSchema.NestedField();
    fileName.name = "fileName";
    fileName.type = "string";
    BprintSchema.NestedField fileData = new BprintSchema.NestedField();
    fileData.name = "fileData";
    fileData.type = "binary";
    attachment.fields = List.of(fileName, fileData);

    schema.fields = List.of(recordId, attachment);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String modelContent = Files.readString(out.resolve("com/example/model/model/Attachment.java"));

    assertThat(modelContent).contains("private String fileName");
    assertThat(modelContent).contains("private byte[] fileData");
  }

  // =========================================================================
  // Nullable property tests
  // =========================================================================

  @Test
  void generatesEntityWithNullableJavadoc() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.0";
    schema.entityName = "Product";
    schema.description = "Product with nullable fields";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("productId");
    schema.identity = pk;

    BprintSchema.Field productId = new BprintSchema.Field();
    productId.name = "productId";
    productId.type = "string";

    BprintSchema.Field weight = new BprintSchema.Field();
    weight.name = "weight";
    weight.type = "number.float";
    weight.nullable = true;
    weight.description = "Product weight in kg";

    BprintSchema.Field stockCount = new BprintSchema.Field();
    stockCount.name = "stockCount";
    stockCount.type = "number.int";

    schema.fields = List.of(productId, weight, stockCount);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Product.java"));

    assertThat(content).contains("private Float weight");
    assertThat(content).contains("private Integer stockCount");
    assertThat(content).contains("Nullable");
  }

  @Test
  void nullablePropertyDeserializesFromSchema() {
    BprintSchema.Field field = new BprintSchema.Field();
    field.name = "temperature";
    field.type = "number.float";
    field.nullable = true;

    assertThat(field.nullable).isTrue();

    BprintSchema.Field nonNullField = new BprintSchema.Field();
    nonNullField.name = "count";
    nonNullField.type = "number.int";

    assertThat(nonNullField.nullable).isNull();
  }

  // =========================================================================
  // Timestamp subtype tests
  // =========================================================================

  @Test
  void generatesEntityWithTimestampEpoch() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.0";
    schema.entityName = "Event";
    schema.description = "Event with epoch timestamp";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("eventId");
    schema.identity = pk;

    BprintSchema.Field eventId = new BprintSchema.Field();
    eventId.name = "eventId";
    eventId.type = "string";

    BprintSchema.Field eventTime = new BprintSchema.Field();
    eventTime.name = "eventTime";
    eventTime.type = "timestamp.epoch";

    schema.fields = List.of(eventId, eventTime);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Event.java"));

    assertThat(content).contains("private Long eventTime");
  }

  @Test
  void generatesEntityWithTimestampDate() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.0";
    schema.entityName = "Person";
    schema.description = "Person with date of birth";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("personId");
    schema.identity = pk;

    BprintSchema.Field personId = new BprintSchema.Field();
    personId.name = "personId";
    personId.type = "string";

    BprintSchema.Field dateOfBirth = new BprintSchema.Field();
    dateOfBirth.name = "dateOfBirth";
    dateOfBirth.type = "timestamp.date";

    schema.fields = List.of(personId, dateOfBirth);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/Person.java"));

    assertThat(content).contains("private LocalDate dateOfBirth");
    assertThat(content).contains("DynamoDbConvertedBy");
    assertThat(content).contains("LocalDateConverter");
  }

  @Test
  void generatesEntityWithBareTimestamp() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.0";
    schema.entityName = "AuditLog";
    schema.description = "Audit log with bare timestamp";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("logId");
    schema.identity = pk;

    BprintSchema.Field logId = new BprintSchema.Field();
    logId.name = "logId";
    logId.type = "string";

    BprintSchema.Field createdAt = new BprintSchema.Field();
    createdAt.name = "createdAt";
    createdAt.type = "timestamp";

    schema.fields = List.of(logId, createdAt);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String content = Files.readString(out.resolve("com/example/model/AuditLog.java"));

    assertThat(content).contains("private Instant createdAt");
    assertThat(content).doesNotContain("DynamoDbConvertedBy");
  }

  // =========================================================================
  // GSI/LSI query generation tests
  // =========================================================================

  @Test
  void generatesRepositoryWithGSIQueryMethod() throws Exception {
    TableMetadata metaWithGsi = new TableMetadata(
        "OrdersTable",
        "arn:aws:dynamodb:us-east-1:123:table/OrdersTable",
        "us-east-1",
        List.of(new TableMetadata.GSIMetadata("customer-index", "customerId", null, "ALL")),
        null
    );

    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order entity";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "orderId";
    orderId.type = "string";
    orderId.required = true;

    BprintSchema.Field customerId = new BprintSchema.Field();
    customerId.name = "customerId";
    customerId.type = "string";

    schema.fields = List.of(orderId, customerId);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, metaWithGsi);

    String repoContent = Files.readString(out.resolve("com/example/model/repository/OrderRepository.java"));

    // Query method generated for the GSI
    assertThat(repoContent).contains("public List<Order> queryByCustomerIndex(String customerId)");
    assertThat(repoContent).contains("table.index(\"customer-index\")");
    assertThat(repoContent).contains("QueryConditional");
    assertThat(repoContent).contains("partitionValue(customerId)");
    assertThat(repoContent).contains("results.addAll(page.items())");
  }

  @Test
  void generatesRepositoryWithGSIAndSortKey() throws Exception {
    TableMetadata metaWithGsi = new TableMetadata(
        "OrdersTable",
        "arn:aws:dynamodb:us-east-1:123:table/OrdersTable",
        "us-east-1",
        List.of(new TableMetadata.GSIMetadata("customer-date-index", "customerId", "orderDate", "ALL")),
        null
    );

    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order entity";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "orderId";
    orderId.type = "string";

    schema.fields = List.of(orderId);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, metaWithGsi);

    String repoContent = Files.readString(out.resolve("com/example/model/repository/OrderRepository.java"));

    // PK-only method
    assertThat(repoContent).contains("public List<Order> queryByCustomerDateIndex(String customerId)");

    // PK+SK overloaded method
    assertThat(repoContent).contains("public List<Order> queryByCustomerDateIndex(String customerId, String orderDate)");
    assertThat(repoContent).contains("sortValue(orderDate)");
  }

  @Test
  void generatesRepositoryWithMultipleGSIs() throws Exception {
    TableMetadata metaWithGsis = new TableMetadata(
        "OrdersTable",
        "arn:aws:dynamodb:us-east-1:123:table/OrdersTable",
        "us-east-1",
        List.of(
            new TableMetadata.GSIMetadata("customer-index", "customerId", null, "ALL"),
            new TableMetadata.GSIMetadata("status-index", "status", "createdAt", "ALL")
        ),
        null
    );

    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order entity";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "orderId";
    orderId.type = "string";

    schema.fields = List.of(orderId);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, metaWithGsis);

    String repoContent = Files.readString(out.resolve("com/example/model/repository/OrderRepository.java"));

    // Both GSI query methods present
    assertThat(repoContent).contains("queryByCustomerIndex(String customerId)");
    assertThat(repoContent).contains("queryByStatusIndex(String status)");
    assertThat(repoContent).contains("queryByStatusIndex(String status, String createdAt)");
  }

  @Test
  void generatesRepositoryWithLSI() throws Exception {
    TableMetadata metaWithLsi = new TableMetadata(
        "OrdersTable",
        "arn:aws:dynamodb:us-east-1:123:table/OrdersTable",
        "us-east-1",
        null,
        List.of(new TableMetadata.LSIMetadata("amount-index", "amount", "ALL"))
    );

    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order entity";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "orderId";
    orderId.type = "string";

    schema.fields = List.of(orderId);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, metaWithLsi);

    String repoContent = Files.readString(out.resolve("com/example/model/repository/OrderRepository.java"));

    // LSI query method (LSI shares the table's partition key "orderId")
    assertThat(repoContent).contains("queryByAmountIndex(String orderId)");
    assertThat(repoContent).contains("queryByAmountIndex(String orderId, String amount)");
    assertThat(repoContent).contains("table.index(\"amount-index\")");
  }

  @Test
  void generatesKeysHelperWithIndexConstants() throws Exception {
    TableMetadata metaWithIndexes = new TableMetadata(
        "OrdersTable",
        "arn:aws:dynamodb:us-east-1:123:table/OrdersTable",
        "us-east-1",
        List.of(
            new TableMetadata.GSIMetadata("customer-index", "customerId", null, "ALL"),
            new TableMetadata.GSIMetadata("status-date-index", "status", "createdAt", "ALL")
        ),
        List.of(new TableMetadata.LSIMetadata("amount-index", "amount", "ALL"))
    );

    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Order entity";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderId = new BprintSchema.Field();
    orderId.name = "orderId";
    orderId.type = "string";

    schema.fields = List.of(orderId);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, metaWithIndexes);

    String keysContent = Files.readString(out.resolve("com/example/model/keys/OrderKeys.java"));

    // GSI index constants
    assertThat(keysContent).contains("INDEX_CUSTOMER_INDEX = \"customer-index\"");
    assertThat(keysContent).contains("INDEX_STATUS_DATE_INDEX = \"status-date-index\"");

    // LSI index constant
    assertThat(keysContent).contains("INDEX_AMOUNT_INDEX = \"amount-index\"");
  }

  @Test
  void repositoryWithNoIndexesHasNoQueryMethods() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);

    String repoContent = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    // No queryBy methods should be present
    assertThat(repoContent).doesNotContain("queryBy");
    assertThat(repoContent).doesNotContain("DynamoDbIndex");
    assertThat(repoContent).doesNotContain("QueryConditional");
  }

  @Test
  void toConstantCaseConvertsCorrectly() {
    assertThat(JavaGenerator.toConstantCase("customer-index")).isEqualTo("CUSTOMER_INDEX");
    assertThat(JavaGenerator.toConstantCase("status-date-index")).isEqualTo("STATUS_DATE_INDEX");
    assertThat(JavaGenerator.toConstantCase("customerIndex")).isEqualTo("CUSTOMER_INDEX");
    assertThat(JavaGenerator.toConstantCase("amount_index")).isEqualTo("AMOUNT_INDEX");
  }

  @Test
  void toCamelCaseConvertsCorrectly() {
    assertThat(JavaGenerator.toCamelCase("customer-index")).isEqualTo("customerIndex");
    assertThat(JavaGenerator.toCamelCase("status-date-index")).isEqualTo("statusDateIndex");
    assertThat(JavaGenerator.toCamelCase("customerId")).isEqualTo("customerId");
    assertThat(JavaGenerator.toCamelCase("amount_index")).isEqualTo("amountIndex");
  }

  @Test
  void generatesNestedInnerClassesForMapsWithinMaps() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.0";
    schema.entityName = "Order";
    schema.description = "Order with nested maps";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    schema.identity = pk;

    BprintSchema.Field orderIdField = new BprintSchema.Field();
    orderIdField.name = "orderId";
    orderIdField.type = "string";
    orderIdField.required = true;

    // Build nested map: shippingAddress > coordinates (map within map)
    BprintSchema.NestedField streetField = new BprintSchema.NestedField();
    streetField.name = "street";
    streetField.type = "string";

    BprintSchema.NestedField cityField = new BprintSchema.NestedField();
    cityField.name = "city";
    cityField.type = "string";

    BprintSchema.NestedField latField = new BprintSchema.NestedField();
    latField.name = "lat";
    latField.type = "number";

    BprintSchema.NestedField lngField = new BprintSchema.NestedField();
    lngField.name = "lng";
    lngField.type = "number";

    BprintSchema.NestedField coordsField = new BprintSchema.NestedField();
    coordsField.name = "coordinates";
    coordsField.type = "map";
    coordsField.fields = List.of(latField, lngField);

    BprintSchema.Field shippingField = new BprintSchema.Field();
    shippingField.name = "shippingAddress";
    shippingField.type = "map";
    shippingField.fields = List.of(streetField, cityField, coordsField);

    schema.fields = List.of(orderIdField, shippingField);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);

    String entityContent = Files.readString(out.resolve("com/example/model/Order.java"));

    // Entity references the model class type
    assertThat(entityContent).contains("private ShippingAddress shippingAddress");

    // ShippingAddress is now a standalone model class
    String shippingContent = Files.readString(out.resolve("com/example/model/model/ShippingAddress.java"));
    assertThat(shippingContent).contains("public class ShippingAddress");
    assertThat(shippingContent).contains("private String street");
    assertThat(shippingContent).contains("private String city");

    // Deeply-nested coordinates map gets its own file with a qualified name to avoid collisions
    String coordsContent = Files.readString(out.resolve("com/example/model/model/ShippingAddressCoordinates.java"));
    assertThat(coordsContent).contains("public class ShippingAddressCoordinates");
    assertThat(coordsContent).contains("private Integer lat");
    assertThat(coordsContent).contains("private Integer lng");

    // ShippingAddress references the qualified coordinates type
    assertThat(shippingContent).contains("private ShippingAddressCoordinates coordinates");
  }

  // =========================================================================
  // DDB Enhanced Client Parity Tests
  // =========================================================================

  @Test
  void generatesConditionalSaveAndUpdate() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public void save(User entity, Expression conditionExpression)");
    assertThat(content).contains("public User update(User entity)");
    assertThat(content).contains("public User update(User entity, Expression conditionExpression)");
    assertThat(content).contains("PutItemEnhancedRequest");
    assertThat(content).contains("UpdateItemEnhancedRequest");
  }

  @Test
  void generatesConsistentReadOverload() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public Optional<User> findByKey(String userId, boolean consistentRead)");
    assertThat(content).contains("GetItemEnhancedRequest");
    assertThat(content).contains("consistentRead(consistentRead)");
  }

  @Test
  void generatesConsistentReadOverloadWithCompositeKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userWithSortKeySchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public Optional<User> findByKey(String userId, String entityType, boolean consistentRead)");
  }

  @Test
  void generatesProjectionReadOverload() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public Optional<User> findByKey(String userId, List<String> attributesToProject)");
    assertThat(content).contains("attributesToProject(attributesToProject)");
  }

  @Test
  void generatesConditionalDeleteOverload() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public void deleteByKey(String userId, Expression conditionExpression)");
    assertThat(content).contains("DeleteItemEnhancedRequest");
  }

  @Test
  void generatesConditionalDeleteWithCompositeKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userWithSortKeySchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public void deleteByKey(String userId, String entityType, Expression conditionExpression)");
  }

  @Test
  void generatesExistsByKeyMethod() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public boolean existsByKey(String userId)");
    assertThat(content).contains("attributesToProject(\"userId\")");
  }

  @Test
  void generatesExistsByKeyWithCompositeKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userWithSortKeySchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public boolean existsByKey(String userId, String entityType)");
  }

  @Test
  void generatesScanMethods() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public List<User> scan()");
    assertThat(content).contains("public List<User> scan(Expression filterExpression)");
    assertThat(content).contains("public PageIterable<User> scan(ScanEnhancedRequest request)");
    assertThat(content).contains("public PageIterable<User> scanPages()");
  }

  @Test
  void generatesMainTableQueryMethodsWhenSortKeyExists() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userWithSortKeySchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public List<User> query(String userId)");
    assertThat(content).contains("public PageIterable<User> query(QueryEnhancedRequest request)");
    assertThat(content).contains("public PageIterable<User> queryPages(String userId)");
    assertThat(content).contains("public List<User> queryBetween(String userId, String sortFrom, String sortTo)");
    assertThat(content).contains("public List<User> queryBeginsWith(String userId, String sortPrefix)");
    assertThat(content).contains("public List<User> queryGreaterThan(String userId, String sortValue)");
    assertThat(content).contains("public List<User> queryGreaterThanOrEqualTo(String userId, String sortValue)");
    assertThat(content).contains("public List<User> queryLessThan(String userId, String sortValue)");
    assertThat(content).contains("public List<User> queryLessThanOrEqualTo(String userId, String sortValue)");
  }

  @Test
  void doesNotGenerateMainTableQueryMethodsWithoutSortKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).doesNotContain("queryBetween");
    assertThat(content).doesNotContain("queryBeginsWith");
    assertThat(content).doesNotContain("queryGreaterThan");
    assertThat(content).doesNotContain("queryLessThan");
  }

  @Test
  void generatesBatchOperations() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public List<User> batchGet(List<Key> keys)");
    assertThat(content).contains("public void batchSave(List<User> entities)");
    assertThat(content).contains("public void batchDelete(List<Key> keys)");
    assertThat(content).contains("ReadBatch");
    assertThat(content).contains("WriteBatch");
    assertThat(content).contains("BatchGetItemEnhancedRequest");
    assertThat(content).contains("BatchWriteItemEnhancedRequest");
  }

  @Test
  void generatesTransactionOperations() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public List<User> transactGet(List<Key> keys)");
    assertThat(content).contains("public void transactSave(List<User> entities)");
    assertThat(content).contains("public void transactDelete(List<Key> keys)");
    assertThat(content).contains("TransactGetItemsEnhancedRequest");
    assertThat(content).contains("TransactWriteItemsEnhancedRequest");
  }

  @Test
  void generatesIndexQueryRangeMethods() throws Exception {
    TableMetadata metaWithGsi = new TableMetadata(
        "DataTable",
        "arn:aws:dynamodb:us-east-1:123456789012:table/DataTable",
        "us-east-1",
        List.of(new TableMetadata.GSIMetadata("email-index", "email", "userId", "ALL")),
        null
    );

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, metaWithGsi);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public List<User> queryByEmailIndex(String email)");
    assertThat(content).contains("public List<User> queryByEmailIndex(String email, String userId)");
    assertThat(content).contains("public List<User> queryByEmailIndexBetween(String email, String sortFrom, String sortTo)");
    assertThat(content).contains("public List<User> queryByEmailIndexBeginsWith(String email, String sortPrefix)");
    assertThat(content).contains("public List<User> queryByEmailIndexGreaterThan(String email, String sortValue)");
    assertThat(content).contains("public List<User> queryByEmailIndexGreaterThanOrEqualTo(String email, String sortValue)");
    assertThat(content).contains("public List<User> queryByEmailIndexLessThan(String email, String sortValue)");
    assertThat(content).contains("public List<User> queryByEmailIndexLessThanOrEqualTo(String email, String sortValue)");
  }

  @Test
  void generatesRepositoryWithEnhancedClientFields() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("private final DynamoDbEnhancedClient enhancedClient");
    assertThat(content).contains("private final TableSchema<User> tableSchema");
    assertThat(content).contains("TableSchema.fromBean(User.class)");
  }

  @Test
  void batchSaveValidatesEntities() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("entities.forEach(UserValidator::validate)");
  }

  @Test
  void transactSaveValidatesEntities() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    int transactSaveIdx = content.indexOf("public void transactSave");
    assertThat(transactSaveIdx).isGreaterThan(0);
    String afterTransact = content.substring(transactSaveIdx, content.indexOf("}", transactSaveIdx + 1) + 1);
    assertThat(afterTransact).contains("UserValidator::validate");
  }

  @Test
  void generatesQueryWithLimitOnMainTable() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userWithSortKeySchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public List<User> query(String userId, int maxResults)");
    assertThat(content).contains(".limit(maxResults)");
    assertThat(content).contains("QueryEnhancedRequest.builder()");
  }

  @Test
  void generatesQueryWithLimitOnIndex() throws Exception {
    TableMetadata metaWithGsi = new TableMetadata(
        "DataTable",
        "arn:aws:dynamodb:us-east-1:123456789012:table/DataTable",
        "us-east-1",
        List.of(new TableMetadata.GSIMetadata("email-index", "email", "userId", "ALL")),
        null
    );

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, metaWithGsi);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public List<User> queryByEmailIndex(String email, int maxResults)");
  }

  @Test
  void validatorUsesIntegerLiteralForIntFields() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Product";
    schema.description = "Product with number.int field";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("productId");
    schema.identity = pk;

    BprintSchema.Field prodId = new BprintSchema.Field();
    prodId.name = "productId";
    prodId.type = "string";
    prodId.required = true;

    BprintSchema.Field stock = new BprintSchema.Field();
    stock.name = "stockQuantity";
    stock.type = "number.int";
    stock.required = false;
    BprintSchema.Constraints stockC = new BprintSchema.Constraints();
    stockC.min = 0.0;
    stockC.max = 10000.0;
    stock.constraints = stockC;

    schema.fields = List.of(prodId, stock);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/validation/ProductValidator.java"));

    // Integer fields should use integer literals, not double
    assertThat(content).contains("entity.getStockQuantity() < 0");
    assertThat(content).doesNotContain("entity.getStockQuantity() < 0.0");
    assertThat(content).contains("entity.getStockQuantity() > 10000");
    assertThat(content).doesNotContain("entity.getStockQuantity() > 10000.0");
    assertThat(content).contains("must be >= 0");
    assertThat(content).contains("must be <= 10000");
  }

  @Test
  void validatorUsesDoubleLiteralForDoubleFields() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Product";
    schema.description = "Product with number.double field";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("productId");
    schema.identity = pk;

    BprintSchema.Field prodId = new BprintSchema.Field();
    prodId.name = "productId";
    prodId.type = "string";
    prodId.required = true;

    BprintSchema.Field price = new BprintSchema.Field();
    price.name = "price";
    price.type = "number.double";
    price.required = false;
    BprintSchema.Constraints priceC = new BprintSchema.Constraints();
    priceC.min = 0.0;
    priceC.max = 999.99;
    price.constraints = priceC;

    schema.fields = List.of(prodId, price);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/validation/ProductValidator.java"));

    // Double fields should keep double literals
    assertThat(content).contains("entity.getPrice() < 0.0");
    assertThat(content).contains("entity.getPrice() > 999.99");
  }

  @Test
  void validatorUsesLongLiteralForLongFields() throws Exception {
    BprintSchema schema = new BprintSchema();
    schema.schemaVersion = "1.1";
    schema.entityName = "Event";
    schema.description = "Event with number.long field";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("eventId");
    schema.identity = pk;

    BprintSchema.Field eventId = new BprintSchema.Field();
    eventId.name = "eventId";
    eventId.type = "string";
    eventId.required = true;

    BprintSchema.Field count = new BprintSchema.Field();
    count.name = "viewCount";
    count.type = "number.long";
    count.required = false;
    BprintSchema.Constraints countC = new BprintSchema.Constraints();
    countC.min = 0.0;
    countC.max = 1000000.0;
    count.constraints = countC;

    schema.fields = List.of(eventId, count);

    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(schema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/validation/EventValidator.java"));

    // Long fields should use long literals (no decimal point)
    assertThat(content).contains("entity.getViewCount() < 0");
    assertThat(content).doesNotContain("entity.getViewCount() < 0.0");
    assertThat(content).contains("entity.getViewCount() > 1000000");
    assertThat(content).doesNotContain("entity.getViewCount() > 1000000.0");
  }

  // =========================================================================
  // 100% Enhanced Client Parity Tests
  // =========================================================================

  @Test
  void generatesRepositoryAccessors() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public DynamoDbTable<User> getTable()");
    assertThat(content).contains("public DynamoDbEnhancedClient getEnhancedClient()");
    assertThat(content).contains("public TableSchema<User> getTableSchema()");
    assertThat(content).contains("return table");
    assertThat(content).contains("return enhancedClient");
    assertThat(content).contains("return tableSchema");
  }

  @Test
  void generatesUpdateWithIgnoreNulls() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public User update(User entity, boolean ignoreNulls)");
    assertThat(content).contains(".ignoreNulls(ignoreNulls)");
    assertThat(content).contains("public User update(User entity, Expression conditionExpression, boolean ignoreNulls)");
  }

  @Test
  void generatesFullPassThroughOverloads() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public void save(PutItemEnhancedRequest<User> request)");
    assertThat(content).contains("public User update(UpdateItemEnhancedRequest<User> request)");
    assertThat(content).contains("public Optional<User> delete(DeleteItemEnhancedRequest request)");
    assertThat(content).contains("public Optional<User> findByKey(GetItemEnhancedRequest request)");
  }

  @Test
  void generatesDeleteAndReturnForSingleKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public Optional<User> deleteAndReturn(String userId)");
    assertThat(content).contains("public Optional<User> deleteAndReturn(String userId, Expression conditionExpression)");
  }

  @Test
  void generatesDeleteAndReturnForCompositeKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userWithSortKeySchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public Optional<User> deleteAndReturn(String userId, String entityType)");
    assertThat(content).contains("public Optional<User> deleteAndReturn(String userId, String entityType,");
    assertThat(content).contains("Expression conditionExpression)");
  }

  @Test
  void generatesBatchSaveWithRetryLogic() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("for (int attempt = 0; attempt <= 3 && !remaining.isEmpty(); attempt++)");
    assertThat(content).contains("result.unprocessedPutItemsForTable(table)");
    assertThat(content).contains("Batch save failed:");
    assertThat(content).contains("BatchWriteResult");
  }

  @Test
  void generatesBatchDeleteWithRetryLogic() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("result.unprocessedDeleteItemsForTable(table)");
    assertThat(content).contains("Batch delete failed:");
  }

  @Test
  void generatesTransactWritePassThrough() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public void transactWrite(TransactWriteItemsEnhancedRequest request)");
    assertThat(content).contains("public List<User> transactRead(TransactGetItemsEnhancedRequest request)");
  }

  @Test
  void generatesQueryWithFilterExpression() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userWithSortKeySchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    assertThat(content).contains("public List<User> query(String userId, Expression filterExpression)");
    assertThat(content).contains(".filterExpression(filterExpression)");
  }

  @Test
  void doesNotGenerateQueryWithFilterWhenNoSortKey() throws Exception {
    Path out = tempDir.resolve("generated");
    generator.generateForTable(List.of(userSchema), "com.example.model", out, tableMetadata);
    String content = Files.readString(out.resolve("com/example/model/repository/UserRepository.java"));

    // query(pk, Expression filterExpression) should NOT exist for PK-only tables (no sort key = no query)
    assertThat(content).doesNotContain("query(String userId, Expression filterExpression)");
  }
}
