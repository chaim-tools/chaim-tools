/**
 * TypeScript types for Chaim Blueprint (.bprint) schema format
 * Based on the official JSON schema specification
 */
export interface SchemaData {
  schemaVersion: string;
  entityName: string;
  description: string;
  identity: Identity;
  fields: Field[];
}

/**
 * Defines which fields uniquely identify an entity instance.
 *
 * For DynamoDB: fields[0] is the partition key, fields[1] (if present) is the sort key.
 * For SQL:     maps to `PRIMARY KEY (field1, field2, ...)`.
 */
export interface Identity {
  fields: string[];
}

/**
 * Numeric sub-type qualifier for 'number' and 'numberSet' fields.
 * Encoded in the field type as a dot-suffix: "number.int", "numberSet.long", etc.
 *
 * | Suffix    | Java         | TypeScript | Python  | Go        |
 * |-----------|--------------|------------|---------|-----------|
 * | .int      | Integer      | number     | int     | int32     |
 * | .long     | Long         | bigint     | int     | int64     |
 * | .float    | Float        | number     | float   | float32   |
 * | .double   | Double       | number     | float   | float64   |
 * | .decimal  | BigDecimal   | Decimal    | Decimal | *big.Float|
 *
 * When the suffix is omitted (bare "number" or "numberSet"), generators fall
 * back to their own default (Java uses Integer).
 */
export type NumberSubType = 'int' | 'long' | 'float' | 'double' | 'decimal';

/**
 * Temporal sub-type qualifier for 'timestamp' fields.
 * Encoded in the field type as a dot-suffix: "timestamp.epoch", "timestamp.date".
 *
 * | Suffix | DynamoDB storage | Java        | TypeScript   | Description              |
 * |--------|-----------------|-------------|--------------|--------------------------|
 * | .epoch | N (number)      | Long        | number       | Unix epoch milliseconds  |
 * | .date  | S (string)      | LocalDate   | string       | ISO-8601 date (no time)  |
 * | (bare) | S (string)      | Instant     | string       | ISO-8601 full timestamp  |
 *
 * **DynamoDB TTL note:** TTL is configured on the CDK table construct
 * (`timeToLiveAttribute`) — not in the `.bprint` schema. The CDK binder reads
 * the TTL attribute name from the L1 construct and captures it in the snapshot.
 * If a `timestamp.epoch` field is used as the TTL attribute, populate it with
 * epoch **seconds** (DynamoDB requirement): `Instant.getEpochSecond()` in Java,
 * `Math.floor(Date.now() / 1000)` in JS.
 *
 * @example
 *   { "name": "createdAt", "type": "timestamp" }           // → Instant / ISO-8601
 *   { "name": "eventTime", "type": "timestamp.epoch" }     // → Long / epoch ms
 *   { "name": "birthDate", "type": "timestamp.date" }      // → LocalDate / "2024-01-15"
 */
export type TimestampSubType = 'epoch' | 'date';

/**
 * All valid field types, including optional dot-notation sub-type qualifiers.
 *
 * The prefix determines DynamoDB storage type and the base language type.
 * The suffix (after the dot) is a language-level precision or representation hint.
 *
 * Concept → DynamoDB mapping (for reference):
 *   string               → S
 *   number / number.*    → N  (bare "number" defaults to Integer in Java)
 *   boolean              → BOOL
 *   binary               → B  (raw bytes: byte[] in Java, Buffer in Node, bytes in Python)
 *   timestamp            → S  (ISO-8601 instant string)
 *   timestamp.epoch      → N  (epoch milliseconds)
 *   timestamp.date       → S  (ISO-8601 date string, e.g. "2024-01-15")
 *   list                 → L
 *   map                  → M
 *   stringSet            → SS  (unordered collection of unique strings)
 *   numberSet / numberSet.* → NS  (unordered collection of unique numbers)
 *
 * Generators that support sub-types use the suffix to emit the narrowest
 * language type. Generators that do not understand a suffix fall back to
 * the prefix default (e.g., a Go generator ignoring ".decimal" would still
 * emit float64).
 */
export type FieldType =
  | 'string'
  | 'number'
  | `number.${NumberSubType}`
  | 'boolean'
  | 'binary'
  | 'timestamp'
  | `timestamp.${TimestampSubType}`
  | 'list'
  | 'map'
  | 'stringSet'
  | 'numberSet'
  | `numberSet.${NumberSubType}`;

/**
 * Scalar types allowed as list item or nested field types.
 * Collections cannot themselves contain top-level collection types (no list-of-list).
 * "map" is allowed to enable list-of-map and nested map structures.
 */
type ScalarOrMap =
  | 'string'
  | 'number'
  | `number.${NumberSubType}`
  | 'boolean'
  | 'binary'
  | 'timestamp'
  | `timestamp.${TimestampSubType}`
  | 'map';

export interface Field {
  name: string;
  nameOverride?: string;
  /**
   * Field type. Use dot-notation to specify the precise language type for
   * 'number', 'numberSet', and 'timestamp' fields.
   *
   * @example "number.int"        // Integer in Java, int32 in Go
   * @example "number.decimal"    // BigDecimal in Java, Decimal in Python
   * @example "numberSet.long"    // Set<Long> in Java
   * @example "timestamp.epoch"   // Long in Java (epoch ms, stored as DynamoDB N)
   * @example "timestamp.date"    // LocalDate in Java (ISO date, stored as DynamoDB S)
   */
  type: FieldType;
  required?: boolean;
  /**
   * Whether this field explicitly allows null values.
   * When true, generators emit nullable wrapper types instead of primitives
   * (e.g., `Integer` vs `int` in Java, `Optional[int]` in Python).
   * Defaults to false.
   */
  nullable?: boolean;
  default?: string | number | boolean;
  enum?: (string | number)[];
  description?: string;
  constraints?: FieldConstraints;
  annotations?: FieldAnnotations;
  /** Element type definition (required when type is 'list') */
  items?: ListItems;
  /** Nested field definitions (required when type is 'map') */
  fields?: NestedField[];
}

/**
 * Element type definition for list fields.
 * When items.type is 'map', items.fields defines the map structure.
 */
export interface ListItems {
  type: ScalarOrMap;
  /** Nested fields when items type is 'map' */
  fields?: NestedField[];
}

/**
 * Field definition for nested map structures.
 * Supports recursive nesting: nested fields can themselves be maps or lists.
 * Carries the same optional metadata as top-level Field so that snapshot
 * content is a 1:1 match to the .bprint schema at every nesting depth.
 */
export interface NestedField {
  name: string;
  nameOverride?: string;
  /**
   * Field type. Supports the same dot-notation sub-types as top-level fields.
   * Additionally allows 'list' for nested list-of-scalar or list-of-map fields.
   */
  type: ScalarOrMap | 'list';
  required?: boolean;
  nullable?: boolean;
  default?: string | number | boolean;
  enum?: (string | number)[];
  description?: string;
  constraints?: FieldConstraints;
  annotations?: FieldAnnotations;
  /** Element type definition (required when type is 'list') */
  items?: NestedListItems;
  /** Nested field definitions (required when type is 'map') */
  fields?: NestedField[];
}

/**
 * Element type definition for list fields within nested structures.
 * When type is 'map', fields defines the map structure.
 */
export interface NestedListItems {
  type: ScalarOrMap;
  /** Nested fields when type is 'map' */
  fields?: NestedField[];
}

/**
 * Field-level validation constraints
 */
export interface FieldConstraints {
  // String constraints
  /** Minimum string length (applies to string type) */
  minLength?: number;
  /** Maximum string length (applies to string type) */
  maxLength?: number;
  /** Regex pattern for validation (applies to string type) */
  pattern?: string;

  // Number constraints
  /** Minimum value (applies to number and number.* types) */
  min?: number;
  /** Maximum value (applies to number and number.* types) */
  max?: number;
}

/**
 * Field-level metadata annotations (extensible)
 */
export interface FieldAnnotations {
  /** Additional custom annotations */
  [key: string]: unknown;
}
