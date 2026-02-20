package co.chaim.core.model;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;

import java.util.Arrays;
import java.util.List;
import java.util.ArrayList;

import static org.assertj.core.api.Assertions.*;

public class BprintSchemaTest {

  private BprintSchema schema;
  private BprintSchema.Identity identity;
  private BprintSchema.Field field;

  @BeforeEach
  void setUp() {
    schema = new BprintSchema();
    identity = new BprintSchema.Identity();
    field = new BprintSchema.Field();

    // Setup valid schema
    schema.schemaVersion = "1.1";
    schema.entityName = "Order";
    schema.description = "Basic order management system";

    identity.fields = Arrays.asList("orderId", "timestamp");

    field.name = "orderId";
    field.type = "string";
    field.required = true;
    field.description = "Unique order identifier";

    schema.identity = identity;
    schema.fields = List.of(field);
  }

  @Test
  void shouldCreateValidSchema() {
    assertThat(schema).isNotNull();
    assertThat(schema.schemaVersion).isEqualTo("1.1");
    assertThat(schema.entityName).isEqualTo("Order");
    assertThat(schema.description).isEqualTo("Basic order management system");
    assertThat(schema.identity).isNotNull();
    assertThat(schema.fields).isNotNull();
    assertThat(schema.fields).hasSize(1);
  }

  @Test
  void shouldCreateValidIdentity() {
    assertThat(identity).isNotNull();
    assertThat(identity.fields).containsExactly("orderId", "timestamp");
  }

  @Test
  void shouldCreateValidField() {
    assertThat(field).isNotNull();
    assertThat(field.name).isEqualTo("orderId");
    assertThat(field.type).isEqualTo("string");
    assertThat(field.required).isTrue();
    assertThat(field.description).isEqualTo("Unique order identifier");
  }

  @Test
  void shouldHandleNullValues() {
    schema.schemaVersion = null;
    schema.entityName = null;
    schema.description = null;
    schema.identity = null;
    schema.fields = null;

    assertThat(schema.schemaVersion).isNull();
    assertThat(schema.entityName).isNull();
    assertThat(schema.description).isNull();
    assertThat(schema.identity).isNull();
    assertThat(schema.fields).isNull();
  }

  @Test
  void shouldHandleEmptyStrings() {
    schema.entityName = "";
    schema.description = "";

    assertThat(schema.entityName).isEmpty();
    assertThat(schema.description).isEmpty();
  }

  @Test
  void shouldHandleWhitespaceStrings() {
    schema.entityName = "  Order  ";
    schema.description = "  Basic order management system  ";

    assertThat(schema.entityName).isEqualTo("  Order  ");
    assertThat(schema.description).isEqualTo("  Basic order management system  ");
  }

  @Test
  void shouldHandleSpecialCharacters() {
    schema.schemaVersion = "1.5";
    schema.entityName = "Order-v2";
    schema.description = "Order management system with special chars: @#$%^&*()";

    assertThat(schema.schemaVersion).isEqualTo("1.5");
    assertThat(schema.entityName).isEqualTo("Order-v2");
    assertThat(schema.description).isEqualTo("Order management system with special chars: @#$%^&*()");
  }

  @Test
  void shouldHandleSchemaVersionVariants() {
    // Test different numeric versions
    schema.schemaVersion = "2.0";
    assertThat(schema.schemaVersion).isEqualTo("2.0");

    schema.schemaVersion = "1.1";
    assertThat(schema.schemaVersion).isEqualTo("1.1");

    schema.schemaVersion = "0.5";
    assertThat(schema.schemaVersion).isEqualTo("0.5");
  }

  @Test
  void shouldHandleUnicodeCharacters() {
    schema.description = "Order management system with unicode: 🚀📦💳";

    assertThat(schema.description).isEqualTo("Order management system with unicode: 🚀📦💳");
  }

  @Test
  void shouldHandleLongStrings() {
    String longDescription = "A".repeat(1000);
    schema.description = longDescription;

    assertThat(schema.description).isEqualTo(longDescription);
    assertThat(schema.description).hasSize(1000);
  }


  @Test
  void shouldHandleIdentityWithNullValues() {
    identity.fields = null;

    assertThat(identity.fields).isNull();
  }

  @Test
  void shouldHandleFieldWithNullValues() {
    field.name = null;
    field.type = null;
    field.description = null;
    field.defaultValue = null;
    field.enumValues = null;

    assertThat(field.name).isNull();
    assertThat(field.type).isNull();
    assertThat(field.description).isNull();
    assertThat(field.defaultValue).isNull();
    assertThat(field.enumValues).isNull();
  }

  @Test
  void shouldHandleFieldWithDefaultValues() {
    field.defaultValue = "default";
    field.enumValues = List.of("option1", "option2", "option3");

    assertThat(field.defaultValue).isEqualTo("default");
    assertThat(field.enumValues).containsExactly("option1", "option2", "option3");
  }

  @Test
  void shouldHandleFieldWithBooleanDefaultValue() {
    field.type = "bool";
    field.defaultValue = true;

    assertThat(field.type).isEqualTo("bool");
    assertThat(field.defaultValue).isEqualTo(true);
  }

  @Test
  void shouldHandleFieldWithNumberDefaultValue() {
    field.type = "number";
    field.defaultValue = 42.5;

    assertThat(field.type).isEqualTo("number");
    assertThat(field.defaultValue).isEqualTo(42.5);
  }

  @Test
  void shouldHandleFieldWithIntegerDefaultValue() {
    field.type = "number";
    field.defaultValue = 100;

    assertThat(field.type).isEqualTo("number");
    assertThat(field.defaultValue).isEqualTo(100);
  }

  @Test
  void shouldHandleFieldWithEmptyEnumValues() {
    field.enumValues = new ArrayList<>();

    assertThat(field.enumValues).isEmpty();
  }

  @Test
  void shouldHandleFieldWithSingleEnumValue() {
    field.enumValues = List.of("single");

    assertThat(field.enumValues).containsExactly("single");
    assertThat(field.enumValues).hasSize(1);
  }

  @Test
  void shouldHandleFieldWithMultipleEnumValues() {
    field.enumValues = List.of("option1", "option2", "option3", "option4", "option5");

    assertThat(field.enumValues).containsExactly("option1", "option2", "option3", "option4", "option5");
    assertThat(field.enumValues).hasSize(5);
  }

  @Test
  void shouldHandleFieldWithDuplicateEnumValues() {
    field.enumValues = List.of("option1", "option2", "option1", "option3");

    assertThat(field.enumValues).containsExactly("option1", "option2", "option1", "option3");
    assertThat(field.enumValues).hasSize(4);
  }

  @Test
  void shouldHandleFieldWithSpecialCharactersInEnum() {
    field.enumValues = List.of("option-1", "option_2", "option.3", "option@4");

    assertThat(field.enumValues).containsExactly("option-1", "option_2", "option.3", "option@4");
  }

  @Test
  void shouldHandleFieldWithUnicodeInEnum() {
    field.enumValues = List.of("option🚀", "option📦", "option💳");

    assertThat(field.enumValues).containsExactly("option🚀", "option📦", "option💳");
  }

  @Test
  void shouldHandleAnnotations() {
    BprintSchema.Annotations annotations = new BprintSchema.Annotations();
    annotations.pii = true;
    annotations.retention = "7years";
    annotations.encryption = "required";

    schema.annotations = annotations;

    assertThat(schema.annotations).isNotNull();
    assertThat(schema.annotations.pii).isTrue();
    assertThat(schema.annotations.retention).isEqualTo("7years");
    assertThat(schema.annotations.encryption).isEqualTo("required");
  }

  @Test
  void shouldHandleNullAnnotations() {
    schema.annotations = null;

    assertThat(schema.annotations).isNull();
  }

  @Test
  void shouldHandleAnnotationsWithNullValues() {
    BprintSchema.Annotations annotations = new BprintSchema.Annotations();
    annotations.pii = null;
    annotations.retention = null;
    annotations.encryption = null;

    schema.annotations = annotations;

    assertThat(schema.annotations.pii).isNull();
    assertThat(schema.annotations.retention).isNull();
    assertThat(schema.annotations.encryption).isNull();
  }

  @Test
  void shouldHandleAnnotationsWithBooleanValues() {
    BprintSchema.Annotations annotations = new BprintSchema.Annotations();
    annotations.pii = false;

    schema.annotations = annotations;

    assertThat(schema.annotations.pii).isFalse();
  }

  @Test
  void shouldHandleAnnotationsWithSpecialCharacters() {
    BprintSchema.Annotations annotations = new BprintSchema.Annotations();
    annotations.retention = "7-years_with.special@chars";
    annotations.encryption = "required: AES-256";

    schema.annotations = annotations;

    assertThat(schema.annotations.retention).isEqualTo("7-years_with.special@chars");
    assertThat(schema.annotations.encryption).isEqualTo("required: AES-256");
  }

  @Test
  void shouldHandleMultipleFields() {
    BprintSchema.Field field2 = new BprintSchema.Field();
    field2.name = "customerId";
    field2.type = "string";
    field2.required = true;

    BprintSchema.Field field3 = new BprintSchema.Field();
    field3.name = "amount";
    field3.type = "number";
    field3.required = false;

    schema.fields = List.of(field, field2, field3);

    assertThat(schema.fields).hasSize(3);
    assertThat(schema.fields.get(0).name).isEqualTo("orderId");
    assertThat(schema.fields.get(1).name).isEqualTo("customerId");
    assertThat(schema.fields.get(2).name).isEqualTo("amount");
  }

  @Test
  void shouldHandleEmptyFieldsList() {
    schema.fields = new ArrayList<>();

    assertThat(schema.fields).isEmpty();
  }

  @Test
  void shouldHandleNullFieldsList() {
    schema.fields = null;

    assertThat(schema.fields).isNull();
  }

  @Test
  void shouldHandleFieldWithAllTypes() {
    List<BprintSchema.Field> allTypeFields = new ArrayList<>();

    BprintSchema.Field stringField = new BprintSchema.Field();
    stringField.name = "stringField";
    stringField.type = "string";
    allTypeFields.add(stringField);

    BprintSchema.Field numberField = new BprintSchema.Field();
    numberField.name = "numberField";
    numberField.type = "number";
    allTypeFields.add(numberField);

    BprintSchema.Field boolField = new BprintSchema.Field();
    boolField.name = "boolField";
    boolField.type = "bool";
    allTypeFields.add(boolField);

    BprintSchema.Field timestampField = new BprintSchema.Field();
    timestampField.name = "timestampField";
    timestampField.type = "timestamp";
    allTypeFields.add(timestampField);

    schema.fields = allTypeFields;

    assertThat(schema.fields).hasSize(4);
    assertThat(schema.fields.get(0).type).isEqualTo("string");
    assertThat(schema.fields.get(1).type).isEqualTo("number");
    assertThat(schema.fields.get(2).type).isEqualTo("bool");
    assertThat(schema.fields.get(3).type).isEqualTo("timestamp");
  }

  @Test
  void shouldHandleFieldWithMixedRequiredValues() {
    field.required = true;

    BprintSchema.Field optionalField = new BprintSchema.Field();
    optionalField.name = "optionalField";
    optionalField.type = "string";
    optionalField.required = false;

    schema.fields = List.of(field, optionalField);

    assertThat(schema.fields.get(0).required).isTrue();
    assertThat(schema.fields.get(1).required).isFalse();
  }

  @Test
  void shouldHandleFieldWithLongNames() {
    field.name = "veryLongFieldNameThatExceedsNormalLength";

    assertThat(field.name).isEqualTo("veryLongFieldNameThatExceedsNormalLength");
  }

  @Test
  void shouldHandleFieldWithSpecialCharactersInName() {
    field.name = "field-with_special.chars@123";

    assertThat(field.name).isEqualTo("field-with_special.chars@123");
  }

  @Test
  void shouldHandleFieldWithUnicodeInName() {
    field.name = "field🚀📦💳";

    assertThat(field.name).isEqualTo("field🚀📦💳");
  }

  @Test
  void shouldHandleFieldWithLongDescription() {
    String longDesc = "A".repeat(500);
    field.description = longDesc;

    assertThat(field.description).isEqualTo(longDesc);
    assertThat(field.description).hasSize(500);
  }

  @Test
  void shouldHandleFieldWithSpecialCharactersInDescription() {
    field.description = "Field description with special chars: @#$%^&*()_+-=[]{}|;':\",./<>?";

    assertThat(field.description).isEqualTo("Field description with special chars: @#$%^&*()_+-=[]{}|;':\",./<>?");
  }

  @Test
  void shouldHandleFieldWithUnicodeInDescription() {
    field.description = "Field description with unicode: 🚀📦💳";

    assertThat(field.description).isEqualTo("Field description with unicode: 🚀📦💳");
  }

  @Test
  void shouldHandleComplexNestedStructure() {
    // Create a complex schema structure
    BprintSchema complexSchema = new BprintSchema();
    complexSchema.schemaVersion = "1.1";
    complexSchema.entityName = "ComplexEntity";
    complexSchema.description = "A complex entity with many fields";

    BprintSchema.Identity nestedId = new BprintSchema.Identity();
    nestedId.fields = Arrays.asList("id", "timestamp");

    List<BprintSchema.Field> nestedFields = new ArrayList<>();

    for (int i = 0; i < 10; i++) {
      BprintSchema.Field f = new BprintSchema.Field();
      f.name = "field" + i;
      f.type = i % 4 == 0 ? "string" : i % 4 == 1 ? "number" : i % 4 == 2 ? "bool" : "timestamp";
      f.required = i % 2 == 0;
      f.description = "Field " + i + " description";

      if (f.type.equals("string") && i % 3 == 0) {
        f.enumValues = List.of("option" + i + "a", "option" + i + "b", "option" + i + "c");
      }

      if (f.type.equals("bool") && i % 2 == 0) {
        f.defaultValue = i % 4 == 0;
      }

      if (f.type.equals("number") && i % 2 == 0) {
        f.defaultValue = (double) i;
      }

      nestedFields.add(f);
    }

    complexSchema.identity = nestedId;
    complexSchema.fields = nestedFields;

    BprintSchema.Annotations nestedAnnotations = new BprintSchema.Annotations();
    nestedAnnotations.pii = true;
    nestedAnnotations.retention = "10years";
    nestedAnnotations.encryption = "AES-256";

    complexSchema.annotations = nestedAnnotations;

    // Verify the complex structure
    assertThat(complexSchema.entityName).isEqualTo("ComplexEntity");
    assertThat(complexSchema.description).isEqualTo("A complex entity with many fields");
    assertThat(complexSchema.identity.fields).containsExactly("id", "timestamp");
    assertThat(complexSchema.fields).hasSize(10);
    assertThat(complexSchema.annotations.pii).isTrue();
    assertThat(complexSchema.annotations.retention).isEqualTo("10years");
    assertThat(complexSchema.annotations.encryption).isEqualTo("AES-256");

    // Verify field types
    assertThat(complexSchema.fields.get(0).type).isEqualTo("string");
    assertThat(complexSchema.fields.get(1).type).isEqualTo("number");
    assertThat(complexSchema.fields.get(2).type).isEqualTo("bool");
    assertThat(complexSchema.fields.get(3).type).isEqualTo("timestamp");
    assertThat(complexSchema.fields.get(4).type).isEqualTo("string");
  }
}
