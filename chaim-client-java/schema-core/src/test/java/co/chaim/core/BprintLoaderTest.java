package co.chaim.core;

import co.chaim.core.model.BprintSchema;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.*;

public class BprintLoaderTest {

  @TempDir
  Path tempDir;

  private String validJsonSchema;

  @BeforeEach
  void setUp() {
    validJsonSchema = """
      {
        "schemaVersion": "1.1",
        "entityName": "Order",
        "description": "Basic order management system",
        "identity": { "fields": ["orderId"] },
        "fields": [
          { "name": "orderId", "type": "string", "required": true }
        ]
      }
      """;
  }

  @Test
  void shouldLoadValidJsonSchema() throws IOException {
    Path jsonFile = tempDir.resolve("schema.json");
    Files.writeString(jsonFile, validJsonSchema);

    BprintSchema schema = BprintLoader.load(jsonFile);

    assertThat(schema).isNotNull();
    assertThat(schema.schemaVersion).isEqualTo("1.1");
    assertThat(schema.entityName).isEqualTo("Order");
    assertThat(schema.description).isEqualTo("Basic order management system");
    assertThat(schema.identity).isNotNull();
    assertThat(schema.identity.fields.get(0)).isEqualTo("orderId");
    assertThat(schema.fields).hasSize(1);
    assertThat(schema.fields.get(0).name).isEqualTo("orderId");
    assertThat(schema.fields.get(0).type).isEqualTo("string");
    assertThat(schema.fields.get(0).required).isTrue();
  }

  @Test
  void shouldLoadBprintExtensionAsJson() throws IOException {
    Path bprintFile = tempDir.resolve("schema.bprint");
    Files.writeString(bprintFile, validJsonSchema);

    BprintSchema schema = BprintLoader.load(bprintFile);

    assertThat(schema).isNotNull();
    assertThat(schema.schemaVersion).isEqualTo("1.1");
  }

  @Test
  void shouldLoadJsonExtension() throws IOException {
    Path jsonFile = tempDir.resolve("schema.json");
    Files.writeString(jsonFile, validJsonSchema);

    BprintSchema schema = BprintLoader.load(jsonFile);

    assertThat(schema).isNotNull();
    assertThat(schema.schemaVersion).isEqualTo("1.1");
  }

  @Test
  void shouldRejectInvalidJson() throws IOException {
    String invalidJson = """
      {
        "schemaVersion": "1.1",
        "entityName": "Order",
        "description": "Basic order management system",
        "identity": { "fields": ["orderId"] },
        "fields": [
          { "name": "orderId", "type": "string", "required": true }
        ]
      """; // Missing closing brace

    Path jsonFile = tempDir.resolve("invalid.json");
    Files.writeString(jsonFile, invalidJson);

    assertThatThrownBy(() -> BprintLoader.load(jsonFile))
      .isInstanceOf(IOException.class);
  }

  @Test
  void shouldRejectSchemaWithMissingRequiredFields() throws IOException {
    String incompleteJson = """
      {
        "schemaVersion": "1.1",
        "entityName": "Order"
      }
      """;

    Path jsonFile = tempDir.resolve("incomplete.json");
    Files.writeString(jsonFile, incompleteJson);

    assertThatThrownBy(() -> BprintLoader.load(jsonFile))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("description required");
  }

  @Test
  void shouldRejectSchemaWithInvalidEntity() throws IOException {
    String invalidEntityJson = """
      {
        "schemaVersion": "1.1",
        "entityName": "Order",
        "description": "Basic order management system",
        "fields": [
          { "name": "orderId", "type": "string", "required": true }
        ]
      }
      """;

    Path jsonFile = tempDir.resolve("invalid-entity.json");
    Files.writeString(jsonFile, invalidEntityJson);

    assertThatThrownBy(() -> BprintLoader.load(jsonFile))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("identity is required");
  }

  @Test
  void shouldHandleComplexSchemaWithAllFeatures() throws IOException {
    String complexJson = """
      {
        "schemaVersion": "1.1",
        "entityName": "Customer",
        "description": "Customer account information and profile data",
        "identity": {
          "fields": ["customerId", "email"]
        },
        "fields": [
          { "name": "customerId", "type": "string", "required": true },
          { "name": "email", "type": "string", "required": true },
          { "name": "firstName", "type": "string", "required": true },
          { "name": "lastName", "type": "string", "required": true },
          { "name": "membershipTier", "type": "string", "required": false, "enumValues": ["bronze", "silver", "gold", "platinum"] },
          { "name": "isActive", "type": "bool", "required": false, "defaultValue": true },
          { "name": "createdAt", "type": "timestamp", "required": true },
          { "name": "lastLoginAt", "type": "timestamp", "required": false },
          { "name": "totalOrders", "type": "number", "required": false, "defaultValue": 0 },
          { "name": "totalSpent", "type": "number", "required": false, "defaultValue": 0.0 }
        ],
        "annotations": {
          "pii": true,
          "retention": "7years",
          "encryption": "required"
        }
      }
      """;

    Path jsonFile = tempDir.resolve("complex.json");
    Files.writeString(jsonFile, complexJson);

    BprintSchema schema = BprintLoader.load(jsonFile);

    assertThat(schema).isNotNull();
    assertThat(schema.schemaVersion).isEqualTo("1.1");
    assertThat(schema.entityName).isEqualTo("Customer");
    assertThat(schema.description).isEqualTo("Customer account information and profile data");
    assertThat(schema.identity).isNotNull();
    assertThat(schema.identity.fields.get(0)).isEqualTo("customerId");
    assertThat(schema.identity.fields.get(1)).isEqualTo("email");
    assertThat(schema.fields).hasSize(10);
    assertThat(schema.annotations).isNotNull();
    assertThat(schema.annotations.pii).isTrue();
    assertThat(schema.annotations.retention).isEqualTo("7years");
    assertThat(schema.annotations.encryption).isEqualTo("required");
  }

  @Test
  void shouldHandleEmptyFile() throws IOException {
    Path emptyFile = tempDir.resolve("empty.json");
    Files.writeString(emptyFile, "");

    assertThatThrownBy(() -> BprintLoader.load(emptyFile))
      .isInstanceOf(IOException.class);
  }

  @Test
  void shouldHandleFileWithOnlyWhitespace() throws IOException {
    Path whitespaceFile = tempDir.resolve("whitespace.json");
    Files.writeString(whitespaceFile, "   \n\t  ");

    assertThatThrownBy(() -> BprintLoader.load(whitespaceFile))
      .isInstanceOf(IOException.class);
  }

  @Test
  void shouldHandleMalformedJsonWithExtraCommas() throws IOException {
    String malformedJson = """
      {
        "schemaVersion": "1.1",
        "entityName": "Order",
        "description": "Basic order management system",
        "identity": { "fields": ["orderId"] },
        "fields": [
          { "name": "orderId", "type": "string", "required": true },
        ]
      }
      """;

    Path jsonFile = tempDir.resolve("malformed.json");
    Files.writeString(jsonFile, malformedJson);

    assertThatThrownBy(() -> BprintLoader.load(jsonFile))
      .isInstanceOf(IOException.class);
  }
}
