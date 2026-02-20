package co.chaim.core;

import co.chaim.core.model.BprintSchema;

import java.util.HashSet;
import java.util.Set;

public final class BprintValidator {

  public static void validate(BprintSchema s) {
    if (s.schemaVersion == null) fail("schemaVersion required");
    if (isBlank(s.entityName)) fail("entityName required");
    if (isBlank(s.description)) fail("description required");
    if (s.identity == null) fail("identity is required");

    if (s.identity.fields == null || s.identity.fields.isEmpty())
      fail("identity.fields is required for " + s.entityName);
    if (s.fields == null || s.fields.isEmpty()) fail("fields must have at least one field for " + s.entityName);

    Set<String> fieldNames = new HashSet<>();
    for (BprintSchema.Field f : s.fields) {
      if (isBlank(f.name)) fail(s.entityName + ": field.name required");
      if (!fieldNames.add(f.name)) fail(s.entityName + ": duplicate field " + f.name);
      if (isBlank(f.type)) fail(s.entityName + "." + f.name + ": type required");
      if (!FieldType.isValid(f.type)) fail(s.entityName + "." + f.name + ": unsupported type " + f.type);

      // Validate enum values if present
      if (f.enumValues != null) {
        if (f.enumValues.isEmpty()) {
          fail(s.entityName + "." + f.name + ": enum values cannot be empty");
        }
        for (String enumValue : f.enumValues) {
          if (isBlank(enumValue)) fail(s.entityName + "." + f.name + ": enum values cannot be empty");
        }
      }
    }
  }

  private static boolean isBlank(String s) { return s == null || s.isEmpty(); }
  private static void fail(String msg) { throw new IllegalArgumentException(msg); }
}
