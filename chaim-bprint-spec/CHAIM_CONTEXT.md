# AI Agent Context: chaim-bprint-spec

**Purpose**: Structured context for AI agents working in the chaim-bprint-spec package.

**Package**: `@chaim-tools/chaim-bprint-spec`
**Version**: 0.2.4
**License**: Apache-2.0

---

## What This Package Does

Defines the Blueprint Specification (`.bprint`) — the schema format that drives the entire Chaim toolchain. Provides:

- **JSON Schema** (`schema/bprint.schema.json`) — the canonical schema definition, usable with any JSON Schema validator
- **TypeScript types** (`src/types/index.ts`) — compile-time type safety for all Chaim packages
- **Validation logic** (`src/validation/index.ts`) — runtime validation beyond what JSON Schema enforces (constraint ranges, regex compilation, reserved keyword checks, collection type rules, duplicate detection)
- **Schema version format** — `SPEC_VERSION_PATTERN` regex for validating `"major.minor"` format

Every other Chaim package depends on this one. Changes here affect the entire toolchain.

---

## Relationship to Other Packages

| Package             | How It Uses This Package                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `chaim-cdk`         | Imports `validateSchema()` to validate `.bprint` files at synth time; imports types for snapshot payloads |
| `chaim-cli`         | Imports types for snapshot deserialization; uses schema types for field resolution                        |
| `chaim-client-java` | Java model (`BprintSchema.java`) mirrors the TypeScript types; reads schema JSON passed by CLI            |

---

## Schema Version

`schemaVersion` is a customer-controlled field that tracks schema revision history. Any valid `"major.minor"` string is accepted (e.g., `"1.0"`, `"2.3"`, `"99.0"`). Customers increment it each time they change their `.bprint` file.

The validator coerces numeric `schemaVersion` values (e.g., `1.0`) to string format (`"1.0"`) for backward compatibility. Format is enforced by `SPEC_VERSION_PATTERN = /^\d+\.\d+$/`.

All field types (scalar and collection) are available at any `schemaVersion`. Use `chaim bump <file>` to increment the version automatically.

---

## Schema Structure

### Top-Level Fields

| Field           | Type             | Required | Description                                                                      |
| --------------- | ---------------- | -------- | -------------------------------------------------------------------------------- |
| `schemaVersion` | string or number | Yes      | Customer-controlled version (any `"major.minor"` format, e.g., `"1.0"`, `"2.3"`) |
| `entityName`    | string           | Yes      | Entity class name (e.g., `"User"`, `"Order"`)                                    |
| `description`   | string           | Yes      | Human-readable entity description                                                |
| `primaryKey`    | object           | Yes      | `partitionKey` (required) and `sortKey` (optional)                               |
| `fields`        | array            | Yes      | Array of field definitions (minimum 1)                                           |

### Field Definition

| Property       | Type                  | Required    | Applies To   | Description                                                                                 |
| -------------- | --------------------- | ----------- | ------------ | ------------------------------------------------------------------------------------------- |
| `name`         | string                | Yes         | All          | DynamoDB attribute name                                                                     |
| `type`         | FieldType             | Yes         | All          | One of: `string`, `number`, `boolean`, `timestamp`, `list`, `map`, `stringSet`, `numberSet` |
| `nameOverride` | string                | No          | All          | Valid identifier to use as Java field name when `name` is not a valid identifier            |
| `required`     | boolean               | No          | All          | Generates null-check validation (default: false)                                            |
| `default`      | string/number/boolean | No          | Scalars only | Default value; type must match field type                                                   |
| `enum`         | string[]              | No          | Scalars only | Non-empty array of allowed values                                                           |
| `description`  | string                | No          | All          | Human-readable field description; generates Javadoc                                         |
| `constraints`  | FieldConstraints      | No          | Scalars only | Validation constraints                                                                      |
| `annotations`  | object                | No          | All          | Extensible metadata (reserved for future use)                                               |
| `items`        | ListItems             | Conditional | `list` only  | Required when `type` is `"list"`. Defines element type                                      |
| `fields`       | NestedField[]         | Conditional | `map` only   | Required when `type` is `"map"`. Defines nested fields                                      |

### FieldConstraints

| Property    | Applies To | Type                 | Validation Rule                          |
| ----------- | ---------- | -------------------- | ---------------------------------------- |
| `minLength` | `string`   | non-negative integer | Value must be <= `maxLength` if both set |
| `maxLength` | `string`   | non-negative integer | Value must be >= `minLength` if both set |
| `pattern`   | `string`   | string               | Must be a compilable regex               |
| `min`       | `number`   | number               | Value must be <= `max` if both set       |
| `max`       | `number`   | number               | Value must be >= `min` if both set       |

String constraints cannot be applied to number fields and vice versa. Constraints cannot be applied to collection types.

### ListItems

| Property | Type          | Required    | Description                                               |
| -------- | ------------- | ----------- | --------------------------------------------------------- |
| `type`   | string        | Yes         | One of: `string`, `number`, `boolean`, `timestamp`, `map` |
| `fields` | NestedField[] | Conditional | Required when `type` is `"map"`                           |

### NestedField

| Property | Type            | Required    | Description                                                        |
| -------- | --------------- | ----------- | ------------------------------------------------------------------ |
| `name`   | string          | Yes         | Field name (must be unique within parent)                          |
| `type`   | string          | Yes         | One of: `string`, `number`, `boolean`, `timestamp`, `map`, `list`  |
| `items`  | NestedListItems | Conditional | Required when `type` is `"list"`. Defines element type             |
| `fields` | NestedField[]   | Conditional | Required when `type` is `"map"`. Defines nested fields (recursive) |

Nested fields support recursive nesting -- a `map` nested field can contain other `map` or `list` fields, with no hardcoded depth limit. The database itself is the guardrail for nesting depth.

### NestedListItems

| Property | Type          | Required    | Description                                               |
| -------- | ------------- | ----------- | --------------------------------------------------------- |
| `type`   | string        | Yes         | One of: `string`, `number`, `boolean`, `timestamp`, `map` |
| `fields` | NestedField[] | Conditional | Required when `type` is `"map"`                           |

---

## TypeScript Types (src/types/index.ts)

```typescript
export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'timestamp'
  | 'list'
  | 'map'
  | 'stringSet'
  | 'numberSet';

export interface SchemaData {
  schemaVersion: string;
  entityName: string;
  description: string;
  primaryKey: PrimaryKey;
  fields: Field[];
}

export interface PrimaryKey {
  partitionKey: string;
  sortKey?: string;
}

export interface Field {
  name: string;
  nameOverride?: string;
  type: FieldType;
  required?: boolean;
  default?: string | number | boolean;
  enum?: string[];
  description?: string;
  constraints?: FieldConstraints;
  annotations?: FieldAnnotations;
  items?: ListItems;
  fields?: NestedField[];
}

export interface ListItems {
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'map';
  fields?: NestedField[];
}

export interface NestedField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'map' | 'list';
  items?: NestedListItems;
  fields?: NestedField[];
}

export interface NestedListItems {
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'map';
  fields?: NestedField[];
}

export interface FieldConstraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
}

export interface FieldAnnotations {
  [key: string]: unknown;
}
```

---

## Validation Logic (src/validation/index.ts)

### Exported Functions

| Function                                   | Description                                                           |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `validateSchema(raw: unknown): SchemaData` | Main entry point. Validates and returns a normalized schema or throws |

### Internal Validation Functions

| Function                     | What It Checks                                                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coerceSchemaVersion()`      | Converts numeric version to string; validates format matches `^\d+\.\d+$`                                                                                                   |
| `validatePrimaryKey()`       | `partitionKey` exists and is a non-empty string; `sortKey` is a non-empty string if provided                                                                                |
| `validateFields()`           | Non-empty array; each field has valid type; no duplicate names; calls sub-validators                                                                                        |
| `validateListItems()`        | `items.type` is valid; if `items.type === "map"`, requires non-empty `items.fields`; validates nested fields recursively                                                    |
| `validateNestedFields()`     | Each nested field has `name` and valid `type`; no duplicate names within parent; recurses into `map` and `list` nested types (no depth limit)                               |
| `validateNestedListItems()`  | Validates `items` within nested list fields; recurses into `map` items                                                                                                      |
| `validateDefaultValue()`     | Default value type matches field type                                                                                                                                       |
| `validateFieldConstraints()` | String constraints only on string fields; number constraints only on number fields; min <= max; minLength <= maxLength; pattern is valid regex; all values are proper types |

### Collection Type Validation Rules

- Collection types (`list`, `map`, `stringSet`, `numberSet`) are available at any `schemaVersion`
- Collection types cannot have `default`, `enum`, or `constraints`
- `list` fields must have `items` property
- `map` fields must have non-empty `fields` array
- If `items.type === "map"`, then `items.fields` is required and non-empty
- Nested fields within maps support recursive nesting (`map` within `map`, `list` within `map`, etc.)
- Nested `list` fields require an `items` property (same rules as top-level lists)
- There is no hardcoded depth limit for recursive nesting; the database is the guardrail

### nameOverride Validation

- Must match `^[a-zA-Z_][a-zA-Z0-9_]*$` (valid identifier)
- Cannot be a reserved keyword in Java, Python, or Go
- Reserved words list includes: `abstract`, `assert`, `boolean`, `break`, `byte`, `case`, `catch`, `char`, `class`, `const`, `continue`, `default`, `do`, `double`, `else`, `enum`, `extends`, `final`, `finally`, `float`, `for`, `goto`, `if`, `implements`, `import`, `instanceof`, `int`, `interface`, `long`, `native`, `new`, `package`, `private`, `protected`, `public`, `return`, `short`, `static`, `strictfp`, `super`, `switch`, `synchronized`, `this`, `throw`, `throws`, `transient`, `try`, `void`, `volatile`, `while`, `var`, `yield`, `record`, `sealed`, `permits`, `def`, `del`, `elif`, `except`, `exec`, `from`, `global`, `in`, `is`, `lambda`, `nonlocal`, `not`, `or`, `pass`, `print`, `raise`, `with`, `as`, `async`, `await`, `None`, `True`, `False`, `func`, `chan`, `defer`, `fallthrough`, `go`, `map`, `range`, `select`, `struct`, `type`

---

## JSON Schema (schema/bprint.schema.json)

The JSON Schema enforces structural validation using `allOf` with `if/then` conditionals:

- If `type` is `"list"`, `items` is required
- If `type` is `"map"`, `fields` is required
- `$defs/nestedField` defines the schema for nested map fields, supporting recursive self-referencing for `map` and `list` types (maps within maps, lists within maps, etc.)

The JSON Schema is the first line of defense (structural). The TypeScript validation adds semantic checks (constraint ranges, regex validity, reserved words, collection type restrictions).

---

## Exports (src/index.ts)

```typescript
// Types
export {
  SchemaData,
  PrimaryKey,
  Field,
  FieldType,
  ListItems,
  NestedField,
  NestedListItems,
  FieldConstraints,
  FieldAnnotations,
} from './types';

// Validation
export { validateSchema } from './validation';

// Spec version pattern
export { SPEC_VERSION_PATTERN } from './spec-version';

// JSON Schema
export { default as schema } from '../schema/bprint.schema.json';
```

---

## Test Structure

**Test runner**: `node --test` (Node.js built-in test runner)
**Test file**: `tests/spec.test.mjs`
**Fixtures**: `tests/fixtures/valid/` and `tests/fixtures/invalid/`

### Valid Fixtures

| File                               | Description                                                         |
| ---------------------------------- | ------------------------------------------------------------------- |
| `orders.bprint`                    | Basic v1.0 schema with partition key only                           |
| `users.bprint`                     | Basic v1.0 with default value                                       |
| `products.bprint`                  | Composite key (PK + SK), enum field                                 |
| `user-with-constraints.bprint`     | String and number constraints                                       |
| `order-with-name-overrides.bprint` | nameOverride with hyphenated field names                            |
| `order-with-collections.bprint`    | Collection types: list, list<map>, map, stringSet, numberSet        |
| `order-with-nested-maps.bprint`    | Recursive nesting: maps within maps, lists of maps with nested maps |
| `deeply-nested-maps.bprint`        | Deeply nested map structures (6+ levels) validating no depth limit  |

### Invalid Fixtures

| File                                              | Description               |
| ------------------------------------------------- | ------------------------- |
| `missing-partition-key.bprint`                    | Empty primaryKey object   |
| `invalid-enum.bprint`                             | Empty enum array          |
| `duplicate-field-names.bprint`                    | Duplicate field name      |
| `invalid-min-greater-than-max.bprint`             | min > max                 |
| `invalid-minlength-greater-than-maxlength.bprint` | minLength > maxLength     |
| `invalid-regex-pattern.bprint`                    | Malformed regex           |
| `invalid-number-constraint-on-string.bprint`      | min/max on string field   |
| `invalid-string-constraint-on-number.bprint`      | minLength on number field |

### Test Suites (~80+ tests)

- Schema Validation, Field Validation, Edge Cases, Schema Metadata
- Advanced Validation, Error Handling, Validation Helpers, CLI Script Functionality
- Performance & Stress Testing (100 fields, complex nested structures)
- Field Constraints (15 tests)
- nameOverride Validation (9 JSON Schema + 6 TypeScript)
- Collection Types (10 JSON Schema + 12 TypeScript)
- Recursive Nested Maps (JSON Schema + TypeScript validation for maps within maps, lists within maps, deeply nested structures)

---

## Key Files to Modify

| Task                        | File                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Add/change a field property | `schema/bprint.schema.json`, `src/types/index.ts`, `src/validation/index.ts`                                                 |
| Add a new field type        | `schema/bprint.schema.json` (type enum), `src/types/index.ts` (FieldType union), `src/validation/index.ts` (ALL_FIELD_TYPES) |
| Change validation rules     | `src/validation/index.ts`                                                                                                    |
| Add test coverage           | `tests/spec.test.mjs`, `tests/fixtures/valid/`, `tests/fixtures/invalid/`                                                    |
| Bump spec version           | `npm run spec:bump` or `npm run spec:bump:minor`                                                                             |

---

## Development Commands

| Command                     | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `npm run build`             | Compile TypeScript to `dist/`                              |
| `npm test`                  | Run test suite (~70+ tests)                                |
| `npm run check`             | Full validation: format, lint, spec check, examples, tests |
| `npm run validate:examples` | Validate all example fixtures                              |
| `npm run validate:single`   | Validate a single .bprint file                             |
| `npm run clean`             | Remove build artifacts                                     |

---

## Downstream Impact of Changes

Any change to the schema format or types here requires corresponding updates in:

1. `chaim-cli/src/types/snapshot-payload.ts` — `SchemaField` interface
2. `chaim-client-java/schema-core/.../BprintSchema.java` — Java model (updated: `NestedField` is now self-referencing with `items` and `fields` for recursive nesting)
3. `chaim-client-java/codegen-java/.../JavaGenerator.java` — Code generation logic (updated: recursively generates inner `@DynamoDbBean` classes for nested maps)
4. `chaim-cdk` — Synth-time validation and metadata extraction. The `ChaimDynamoDBBinder` now validates that all DynamoDB key attributes (table PK/SK, GSI/LSI keys, TTL attribute) exist as fields in the `.bprint` schema, failing the CDK synth immediately on mismatch
