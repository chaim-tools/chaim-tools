package co.chaim.core;

import co.chaim.core.model.BprintSchema;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

import java.util.List;
import java.util.ArrayList;

public class BprintValidatorTest {

  @Test
  void validatesHappyPath() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatCode(() -> BprintValidator.validate(s)).doesNotThrowAnyException();
  }

  @Test
  void rejectsMissingSchemaVersion() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = null;
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("schemaVersion required");
  }

  @Test
  void acceptsValidSchemaVersion() {
    // schemaVersion is now a String, so test that various valid versions are accepted
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    // Should not throw - validates successfully
    BprintValidator.validate(s);

    // Also test version 2.0
    s.schemaVersion = "2.0";
    BprintValidator.validate(s);
  }

  @Test
  void rejectsMissingEntityName() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = null;
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("entityName required");
  }

  @Test
  void rejectsEmptyEntityName() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("entityName required");
  }

  @Test
  void rejectsMissingDescription() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = null;

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("description required");
  }

  @Test
  void rejectsEmptyDescription() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("description required");
  }

  @Test
  void rejectsMissingIdentity() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    s.identity = null;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("identity is required");
  }

  @Test
  void rejectsMissingIdentityFields() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity id = new BprintSchema.Identity();
    id.fields = null;
    s.identity = id;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("identity.fields is required");
  }

  @Test
  void rejectsEmptyIdentityFields() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity id = new BprintSchema.Identity();
    id.fields = new ArrayList<>();
    s.identity = id;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("identity.fields is required");
  }

  @Test
  void rejectsMissingFields() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    s.fields = null;

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("fields must have at least one field");
  }

  @Test
  void rejectsEmptyFields() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    s.fields = new ArrayList<>();

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("fields must have at least one field");
  }

  @Test
  void rejectsFieldWithMissingName() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = null;
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("Order: field.name required");
  }

  @Test
  void rejectsFieldWithEmptyName() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("Order: field.name required");
  }

  @Test
  void rejectsFieldWithMissingType() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = null;
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("Order.orderId: type required");
  }

  @Test
  void rejectsFieldWithEmptyType() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("Order.orderId: type required");
  }

  @Test
  void rejectsBadType() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "money";
    f.required = true;
    s.fields = List.of(f);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("unsupported type");
  }

  @Test
  void rejectsDuplicateFieldNames() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;

    BprintSchema.Field f1 = new BprintSchema.Field();
    f1.name = "orderId";
    f1.type = "string";
    f1.required = true;

    BprintSchema.Field f2 = new BprintSchema.Field();
    f2.name = "orderId"; // Same name as first field
    f2.type = "string";
    f2.required = false;

    s.fields = List.of(f1, f2);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("duplicate field");
  }

  @Test
  void validatesAllSupportedFieldTypes() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;

    BprintSchema.Field stringField = new BprintSchema.Field();
    stringField.name = "name";
    stringField.type = "string";
    stringField.required = false;

    BprintSchema.Field numberField = new BprintSchema.Field();
    numberField.name = "amount";
    numberField.type = "number";
    numberField.required = false;

    BprintSchema.Field boolField = new BprintSchema.Field();
    boolField.name = "isActive";
    boolField.type = "bool";
    boolField.required = false;

    BprintSchema.Field timestampField = new BprintSchema.Field();
    timestampField.name = "createdAt";
    timestampField.type = "timestamp";
    timestampField.required = false;

    s.fields = List.of(stringField, numberField, boolField, timestampField);

    assertThatCode(() -> BprintValidator.validate(s)).doesNotThrowAnyException();
  }

  @Test
  void validatesEnumValues() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;

    BprintSchema.Field f1 = new BprintSchema.Field();
    f1.name = "orderId";
    f1.type = "string";
    f1.required = true;

    BprintSchema.Field enumField = new BprintSchema.Field();
    enumField.name = "status";
    enumField.type = "string";
    enumField.required = false;
    enumField.enumValues = List.of("pending", "processing", "completed", "cancelled");

    s.fields = List.of(f1, enumField);

    assertThatCode(() -> BprintValidator.validate(s)).doesNotThrowAnyException();
  }

  @Test
  void rejectsEmptyEnumValues() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;

    BprintSchema.Field f1 = new BprintSchema.Field();
    f1.name = "orderId";
    f1.type = "string";
    f1.required = true;

    BprintSchema.Field enumField = new BprintSchema.Field();
    enumField.name = "status";
    enumField.type = "string";
    enumField.required = false;
    enumField.enumValues = new ArrayList<>();

    s.fields = List.of(f1, enumField);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("enum values cannot be empty");
  }

  @Test
  void rejectsEnumWithEmptyString() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;

    BprintSchema.Field f1 = new BprintSchema.Field();
    f1.name = "orderId";
    f1.type = "string";
    f1.required = true;

    BprintSchema.Field enumField = new BprintSchema.Field();
    enumField.name = "status";
    enumField.type = "string";
    enumField.required = false;
    enumField.enumValues = List.of("pending", "", "completed");

    s.fields = List.of(f1, enumField);

    assertThatThrownBy(() -> BprintValidator.validate(s))
      .isInstanceOf(IllegalArgumentException.class)
      .hasMessageContaining("enum values cannot be empty");
  }

  @Test
  void validatesCompositeIdentity() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId", "timestamp");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    assertThatCode(() -> BprintValidator.validate(s)).doesNotThrowAnyException();
  }

  @Test
  void validatesMultipleFields() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;

    BprintSchema.Field f1 = new BprintSchema.Field();
    f1.name = "orderId";
    f1.type = "string";
    f1.required = true;

    BprintSchema.Field f2 = new BprintSchema.Field();
    f2.name = "customerId";
    f2.type = "string";
    f2.required = true;

    BprintSchema.Field f3 = new BprintSchema.Field();
    f3.name = "amount";
    f3.type = "number";
    f3.required = true;

    s.fields = List.of(f1, f2, f3);

    assertThatCode(() -> BprintValidator.validate(s)).doesNotThrowAnyException();
  }

  @Test
  void validatesAnnotations() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);

    BprintSchema.Annotations annotations = new BprintSchema.Annotations();
    annotations.pii = true;
    annotations.retention = "7years";
    annotations.encryption = "required";
    s.annotations = annotations;

    assertThatCode(() -> BprintValidator.validate(s)).doesNotThrowAnyException();
  }

  @Test
  void validatesNullAnnotations() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;
    BprintSchema.Field f = new BprintSchema.Field();
    f.name = "orderId";
    f.type = "string";
    f.required = true;
    s.fields = List.of(f);
    s.annotations = null;

    assertThatCode(() -> BprintValidator.validate(s)).doesNotThrowAnyException();
  }

  @Test
  void validatesFieldWithDefaultValue() {
    BprintSchema s = new BprintSchema();
    s.schemaVersion = "1.1";
    s.entityName = "Order";
    s.description = "Basic order management system";

    BprintSchema.Identity pk = new BprintSchema.Identity();
    pk.fields = java.util.Arrays.asList("orderId");
    s.identity = pk;

    BprintSchema.Field f1 = new BprintSchema.Field();
    f1.name = "orderId";
    f1.type = "string";
    f1.required = true;

    BprintSchema.Field fieldWithDefault = new BprintSchema.Field();
    fieldWithDefault.name = "isActive";
    fieldWithDefault.type = "bool";
    fieldWithDefault.required = false;
    fieldWithDefault.defaultValue = true;

    s.fields = List.of(f1, fieldWithDefault);

    assertThatCode(() -> BprintValidator.validate(s)).doesNotThrowAnyException();
  }
}
