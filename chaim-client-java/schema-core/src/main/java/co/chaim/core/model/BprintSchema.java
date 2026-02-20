package co.chaim.core.model;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import java.util.List;
import java.util.Objects;

@JsonIgnoreProperties(ignoreUnknown = true)
public class BprintSchema {
  public String schemaVersion;
  public String entityName;
  public String description;
  public Identity identity;
  public List<Field> fields;
  public Annotations annotations;

  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class Identity {
    public List<String> fields;
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class Field {
    public String name;
    public String nameOverride;
    /**
     * Full field type, including optional dot-notation sub-type qualifier.
     *
     * <p>Examples:
     * <ul>
     *   <li>{@code "string"}          – plain string (DynamoDB S)</li>
     *   <li>{@code "number"}          – number, defaults to Integer (DynamoDB N)</li>
     *   <li>{@code "number.int"}      – integer (DynamoDB N)</li>
     *   <li>{@code "number.long"}     – long integer (DynamoDB N)</li>
     *   <li>{@code "number.float"}    – float (DynamoDB N)</li>
     *   <li>{@code "number.double"}   – double, explicit (DynamoDB N)</li>
     *   <li>{@code "number.decimal"}  – arbitrary-precision decimal (DynamoDB N)</li>
     *   <li>{@code "boolean"}         – boolean (DynamoDB BOOL)</li>
     *   <li>{@code "binary"}          – raw bytes, byte[] (DynamoDB B)</li>
     *   <li>{@code "timestamp"}       – ISO-8601 instant string (DynamoDB S)</li>
     *   <li>{@code "timestamp.epoch"} – epoch milliseconds, Long (DynamoDB N)</li>
     *   <li>{@code "timestamp.date"}  – ISO-8601 date string, LocalDate (DynamoDB S)</li>
     *   <li>{@code "list"}            – list, requires items definition (DynamoDB L)</li>
     *   <li>{@code "map"}             – map, requires fields definition (DynamoDB M)</li>
     *   <li>{@code "stringSet"}       – set of strings (DynamoDB SS)</li>
     *   <li>{@code "numberSet"}       – number set, defaults to Integer (DynamoDB NS)</li>
     *   <li>{@code "numberSet.int"}   – set of integers (DynamoDB NS)</li>
     *   <li>{@code "numberSet.long"}  – set of longs (DynamoDB NS)</li>
     *   <li>{@code "numberSet.decimal"} – set of BigDecimal (DynamoDB NS)</li>
     * </ul>
     */
    public String type;
    public boolean required;
    /** When true, field explicitly allows null values. Generators emit nullable wrapper types. */
    public Boolean nullable;
    public String description;
    @JsonAlias({"default", "defaultValue"})
    public Object defaultValue;
    @JsonAlias({"enum", "enumValues"})
    public List<String> enumValues;
    public Constraints constraints;
    public FieldAnnotations annotations;
    /** Element type definition for list fields. */
    public ListItems items;
    /** Nested field definitions for map type fields. */
    public List<NestedField> fields;
  }

  /**
   * Field-level constraints for validation.
   * String constraints: minLength, maxLength, pattern
   * Number constraints: min, max
   */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class Constraints {
    // String constraints
    public Integer minLength;
    public Integer maxLength;
    public String pattern;
    
    // Number constraints
    public Double min;
    public Double max;
  }

  /**
   * Element type definition for list fields.
   * When type is 'map', fields defines the map structure.
   * Supports the same dot-notation sub-types as Field.type (e.g. "number.int", "timestamp.epoch").
   */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class ListItems {
    public String type;
    public List<NestedField> fields;
  }

  /**
   * Field definition for nested map structures.
   * Supports recursive nesting: nested fields can themselves be maps or lists.
   * Carries the same optional metadata as Field so that inner-class generation
   * can emit Javadoc, @Builder.Default, and correct Java identifiers.
   * Supports the same dot-notation sub-types as Field.type.
   */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class NestedField {
    public String name;
    public String nameOverride;
    /** Full type string, same dot-notation format as Field.type. */
    public String type;
    public boolean required;
    /** When true, field explicitly allows null values. */
    public Boolean nullable;
    public String description;
    @JsonAlias({"default", "defaultValue"})
    public Object defaultValue;
    @JsonAlias({"enum", "enumValues"})
    public List<String> enumValues;
    public Constraints constraints;
    public FieldAnnotations annotations;
    /** Element type definition (when type is 'list') */
    public ListItems items;
    /** Nested field definitions (when type is 'map') */
    public List<NestedField> fields;
  }

  /**
   * Field-level annotations for custom metadata.
   */
  @JsonIgnoreProperties(ignoreUnknown = true)
  public static class FieldAnnotations {
    // Extensible - add specific annotation fields as needed
  }

  public static class Annotations {
    public Boolean pii;
    public String retention;
    public String encryption;
  }

  public void require() {
    Objects.requireNonNull(schemaVersion, "schemaVersion is required");
    Objects.requireNonNull(entityName, "entityName is required");
    Objects.requireNonNull(description, "description is required");
    Objects.requireNonNull(identity, "identity is required");
    Objects.requireNonNull(fields, "fields is required");
  }
}
