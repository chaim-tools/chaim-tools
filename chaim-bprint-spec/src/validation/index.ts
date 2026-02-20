import {
  SchemaData,
  Identity,
  Field,
  FieldConstraints,
  ListItems,
  NestedField,
  NestedListItems,
  NumberSubType,
  TimestampSubType,
} from '../types';
import { SPEC_VERSION_PATTERN } from '../spec-version';

/**
 * Regex for a valid identifier in all supported target languages.
 */
const VALID_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Regex for a valid entity name (used as class/type name in generated code).
 * Must start with an uppercase letter, followed by alphanumeric characters.
 * Matches PascalCase conventions across Java, TypeScript, Python, Go, C#.
 */
const VALID_ENTITY_NAME_REGEX = /^[A-Z][a-zA-Z0-9]*$/;

/**
 * Reserved keywords across supported target languages.
 * nameOverride must not collide with these.
 */
const RESERVED_WORDS = new Set<string>([
  // Java reserved keywords
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'try',
  'void',
  'volatile',
  'while',
  // Java literals
  'true',
  'false',
  'null',
  // Python reserved keywords (for future generators)
  'and',
  'as',
  'def',
  'del',
  'elif',
  'except',
  'from',
  'global',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'with',
  'yield',
  // Go reserved keywords (for future generators)
  'chan',
  'defer',
  'fallthrough',
  'func',
  'go',
  'map',
  'range',
  'select',
  'struct',
  'type',
  'var',
  // TypeScript / JavaScript reserved words and operators (for future generators)
  // Strict-mode reserved (ECMA-262 + TypeScript)
  'await',
  'let',
  // Operator keywords that cannot be used as identifiers
  'async',
  'delete',
  'typeof',
  'of',
]);

// Valid sub-type suffixes for number / numberSet fields
const VALID_NUMBER_SUFFIXES = new Set<NumberSubType>([
  'int',
  'long',
  'float',
  'double',
  'decimal',
]);

// Valid sub-type suffixes for timestamp fields
const VALID_TIMESTAMP_SUFFIXES = new Set<TimestampSubType>(['epoch', 'date']);

// Base type prefixes (no dot suffix)
const BASE_TYPE_PREFIXES = new Set<string>([
  'string',
  'number',
  'boolean',
  'binary',
  'timestamp',
  'list',
  'map',
  'stringSet',
  'numberSet',
]);

// =========================================================================
// Type parsing helpers
// =========================================================================

/**
 * Extract the prefix from a potentially dotted type string.
 * "number.int" → "number", "timestamp" → "timestamp"
 */
function getTypePrefix(type: string): string {
  const dot = type.indexOf('.');
  return dot === -1 ? type : type.substring(0, dot);
}

/**
 * Extract the suffix from a potentially dotted type string.
 * "number.int" → "int", "timestamp" → null
 */
function getTypeSuffix(type: string): string | null {
  const dot = type.indexOf('.');
  return dot === -1 ? null : type.substring(dot + 1);
}

/**
 * Return true if the type string is a valid top-level field type.
 * Accepts bare types ("number") and dotted types ("number.int", "numberSet.decimal").
 */
function isValidFieldType(type: string): boolean {
  if (!type) return false;
  const prefix = getTypePrefix(type);
  const suffix = getTypeSuffix(type);

  if (suffix === null) {
    return BASE_TYPE_PREFIXES.has(prefix);
  }

  switch (prefix) {
    case 'number':
    case 'numberSet':
      return VALID_NUMBER_SUFFIXES.has(suffix as NumberSubType);
    case 'timestamp':
      return VALID_TIMESTAMP_SUFFIXES.has(suffix as TimestampSubType);
    default:
      return false;
  }
}

/**
 * Return true if the type can be used as a list item type or nested field type.
 * Scalars, map, and dotted variants of scalars are allowed.
 * Top-level collection types (list, stringSet, numberSet) are not valid item types.
 */
function isValidItemType(type: string): boolean {
  if (!type) return false;
  const prefix = getTypePrefix(type);
  const suffix = getTypeSuffix(type);

  const ITEM_PREFIXES = new Set([
    'string',
    'number',
    'boolean',
    'binary',
    'timestamp',
    'map',
  ]);
  if (!ITEM_PREFIXES.has(prefix)) return false;

  if (suffix === null) return true;

  switch (prefix) {
    case 'number':
      return VALID_NUMBER_SUFFIXES.has(suffix as NumberSubType);
    case 'timestamp':
      return VALID_TIMESTAMP_SUFFIXES.has(suffix as TimestampSubType);
    default:
      return false;
  }
}

/**
 * Return true if the type can be used as a nested field type.
 * Same as item types but also allows 'list' for nested list fields.
 */
function isValidNestedFieldType(type: string): boolean {
  if (type === 'list') return true;
  return isValidItemType(type);
}

/**
 * Return true if this is a collection type (list, map, stringSet, numberSet or numberSet.*).
 */
function isCollectionType(type: string): boolean {
  const prefix = getTypePrefix(type);
  return (
    prefix === 'list' ||
    prefix === 'map' ||
    prefix === 'stringSet' ||
    prefix === 'numberSet'
  );
}

// =========================================================================
// Schema version coercion
// =========================================================================

/**
 * Coerce and validate the schemaVersion field.
 * Accepts both string ("1.0") and numeric (1.0) for backward compatibility.
 * Returns the normalized string in "major.minor" format.
 */
function coerceSchemaVersion(raw: unknown): string {
  let version: string;
  if (typeof raw === 'number') {
    version = raw.toFixed(1);
  } else if (typeof raw === 'string') {
    version = raw;
  } else if (raw === undefined || raw === null) {
    throw new Error('Schema must include schemaVersion field');
  } else {
    throw new Error(
      'schemaVersion must be a string in "major.minor" format (e.g., "1.0")'
    );
  }

  if (!SPEC_VERSION_PATTERN.test(version)) {
    throw new Error(
      `Invalid schemaVersion format "${version}". Must be "major.minor" (e.g., "1.0", "1.1", "2.0")`
    );
  }

  return version;
}

// =========================================================================
// Public API
// =========================================================================

/**
 * Validates a schema object against the official chaim-bprint-spec
 */
export function validateSchema(schema: any): SchemaData {
  // Validate and coerce schemaVersion
  const schemaVersion = coerceSchemaVersion(schema.schemaVersion);

  // Validate top-level required fields
  if (!schema.entityName) {
    throw new Error('Schema must include entityName field');
  }
  if (
    typeof schema.entityName !== 'string' ||
    !VALID_ENTITY_NAME_REGEX.test(schema.entityName)
  ) {
    throw new Error(
      `entityName '${schema.entityName}' is not a valid type name. ` +
        `Must start with an uppercase letter and contain only alphanumeric characters (e.g., 'User', 'OrderItem').`
    );
  }
  if (RESERVED_WORDS.has(schema.entityName.toLowerCase())) {
    throw new Error(
      `entityName '${schema.entityName}' conflicts with a reserved keyword when lowercased`
    );
  }
  if (!schema.description) {
    throw new Error('Schema must include description field');
  }
  if (!schema.identity) {
    throw new Error('Schema must include identity field');
  }
  if (!Array.isArray(schema.fields) || schema.fields.length === 0) {
    throw new Error('Schema must include fields array with at least one field');
  }

  // Validate fields first so we have the field name set for identity referential integrity
  const fields = validateFields(schema.fields, schemaVersion);
  const fieldNames = new Set(fields.map(f => f.name));
  const identity = validateIdentity(schema.identity, fieldNames);

  // Identity fields must not be nullable
  const fieldMap = new Map(fields.map(f => [f.name, f]));
  for (const idField of identity.fields) {
    const f = fieldMap.get(idField);
    if (f && f.nullable) {
      throw new Error(
        `Identity field '${idField}' cannot be nullable — identity fields must always have a value`
      );
    }
  }

  return {
    schemaVersion,
    entityName: schema.entityName,
    description: schema.description,
    identity,
    fields,
  };
}

function validateIdentity(identity: any, fieldNames: Set<string>): Identity {
  if (
    !identity.fields ||
    !Array.isArray(identity.fields) ||
    identity.fields.length === 0
  ) {
    throw new Error('Identity must include a non-empty fields array');
  }
  const seen = new Set<string>();
  for (const f of identity.fields) {
    if (typeof f !== 'string' || f.length === 0) {
      throw new Error('Each identity field must be a non-empty string');
    }
    if (seen.has(f)) {
      throw new Error(`Duplicate identity field: ${f}`);
    }
    if (!fieldNames.has(f)) {
      throw new Error(
        `Identity field '${f}' does not exist in the fields array`
      );
    }
    seen.add(f);
  }
  return { fields: identity.fields };
}

function validateFields(fields: any[], schemaVersion: string): Field[] {
  const validatedFields: Field[] = [];
  const fieldNames = new Set<string>();

  for (const field of fields) {
    if (!field.name || typeof field.name !== 'string') {
      throw new Error('Field must include name as a string');
    }
    if (!field.type || !isValidFieldType(field.type)) {
      const prefix = field.type ? getTypePrefix(field.type) : '(missing)';
      const suffix = field.type ? getTypeSuffix(field.type) : null;
      let hint = `Valid base types: ${[...BASE_TYPE_PREFIXES].join(', ')}.`;
      if (prefix === 'number' || prefix === 'numberSet') {
        hint = `Valid suffixes for ${prefix}: ${[...VALID_NUMBER_SUFFIXES].join(', ')} (e.g. "${prefix}.int").`;
      } else if (prefix === 'timestamp') {
        hint = `Valid suffixes for timestamp: ${[...VALID_TIMESTAMP_SUFFIXES].join(', ')} (e.g. "timestamp.epoch").`;
      } else if (suffix !== null) {
        hint = `Type prefix '${prefix}' does not support sub-type suffixes.`;
      }
      throw new Error(
        `Field '${field.name}' has invalid type '${field.type}'. ${hint}`
      );
    }

    // Check for duplicate field names
    if (fieldNames.has(field.name)) {
      throw new Error(`Duplicate field name: ${field.name}`);
    }
    fieldNames.add(field.name);

    // Check field name against reserved words (without a nameOverride, the raw name becomes a code identifier)
    if (RESERVED_WORDS.has(field.name) && !field.nameOverride) {
      throw new Error(
        `Field '${field.name}' is a reserved keyword in one or more target languages. ` +
          `Add a 'nameOverride' to provide an alternative identifier for generated code.`
      );
    }

    // Validate nameOverride if present
    if (field.nameOverride !== undefined && field.nameOverride !== null) {
      if (typeof field.nameOverride !== 'string') {
        throw new Error(`Field '${field.name}' nameOverride must be a string`);
      }
      if (!VALID_IDENTIFIER_REGEX.test(field.nameOverride)) {
        throw new Error(
          `Field '${field.name}' nameOverride '${field.nameOverride}' is not a valid identifier. Must match ${VALID_IDENTIFIER_REGEX}`
        );
      }
      if (RESERVED_WORDS.has(field.nameOverride)) {
        throw new Error(
          `Field '${field.name}' nameOverride '${field.nameOverride}' is a reserved keyword`
        );
      }
    }

    const collection = isCollectionType(field.type);

    // Reject default, enum, constraints on binary fields
    if (getTypePrefix(field.type) === 'binary') {
      if (field.default !== undefined) {
        throw new Error(
          `Field '${field.name}' of type 'binary' cannot have a default value`
        );
      }
      if (field.enum) {
        throw new Error(
          `Field '${field.name}' of type 'binary' cannot have enum values`
        );
      }
    }

    // Reject default, enum, constraints on collection types
    if (collection) {
      if (field.default !== undefined) {
        throw new Error(
          `Field '${field.name}' of type '${field.type}' cannot have a default value`
        );
      }
      if (field.enum) {
        throw new Error(
          `Field '${field.name}' of type '${field.type}' cannot have enum values`
        );
      }
      if (field.constraints) {
        throw new Error(
          `Field '${field.name}' of type '${field.type}' cannot have constraints`
        );
      }
    }

    // Validate enum values if present (scalar types only)
    if (field.enum && (!Array.isArray(field.enum) || field.enum.length === 0)) {
      throw new Error(`Field '${field.name}' enum must be a non-empty array`);
    }
    if (field.enum && Array.isArray(field.enum) && field.enum.length > 0) {
      const prefix = getTypePrefix(field.type);
      for (const val of field.enum) {
        if (prefix === 'number' && typeof val !== 'number') {
          throw new Error(
            `Field '${field.name}' has type '${field.type}' but enum contains non-numeric value '${val}'`
          );
        }
        if (prefix === 'string' && typeof val !== 'string') {
          throw new Error(
            `Field '${field.name}' has type 'string' but enum contains non-string value '${val}'`
          );
        }
      }
    }

    // Validate default value type matches field type
    if (field.default !== undefined) {
      const isValidDefault = validateDefaultValue(field.default, field.type);
      if (!isValidDefault) {
        throw new Error(
          `Field '${field.name}' default value type does not match field type`
        );
      }
    }

    // Validate field constraints
    if (field.constraints) {
      validateFieldConstraints(field.name, field.type, field.constraints);
    }

    // Validate list type: items is required
    let validatedItems: ListItems | undefined;
    if (field.type === 'list') {
      if (!field.items || typeof field.items !== 'object') {
        throw new Error(
          `Field '${field.name}' of type 'list' must include an 'items' definition`
        );
      }
      validatedItems = validateListItems(field.name, field.items);
    }

    // Validate map type: fields is required
    let validatedNestedFields: NestedField[] | undefined;
    if (field.type === 'map') {
      if (!Array.isArray(field.fields) || field.fields.length === 0) {
        throw new Error(
          `Field '${field.name}' of type 'map' must include a non-empty 'fields' array`
        );
      }
      validatedNestedFields = validateNestedFields(field.name, field.fields);
    }

    // Validate nullable if present
    if (field.nullable !== undefined && typeof field.nullable !== 'boolean') {
      throw new Error(`Field '${field.name}' nullable must be a boolean`);
    }

    validatedFields.push({
      name: field.name,
      nameOverride: field.nameOverride,
      type: field.type,
      required: field.required ?? false,
      nullable: field.nullable ?? false,
      default: field.default,
      enum: field.enum,
      description: field.description,
      constraints: field.constraints,
      annotations: field.annotations,
      items: validatedItems,
      fields: validatedNestedFields,
    });
  }

  return validatedFields;
}

/**
 * Validate the items definition for a list field.
 */
function validateListItems(fieldName: string, items: any): ListItems {
  if (!items.type || !isValidItemType(items.type)) {
    throw new Error(
      `Field '${fieldName}' items has invalid type '${items.type}'. ` +
        `Valid item types: string, number, number.<suffix>, boolean, timestamp, timestamp.<suffix>, map.`
    );
  }

  let validatedFields: NestedField[] | undefined;
  if (items.type === 'map') {
    if (!Array.isArray(items.fields) || items.fields.length === 0) {
      throw new Error(
        `Field '${fieldName}' items of type 'map' must include a non-empty 'fields' array`
      );
    }
    validatedFields = validateNestedFields(fieldName, items.fields);
  }

  return {
    type: items.type,
    fields: validatedFields,
  };
}

/**
 * Validate nested field definitions for map types.
 * Supports recursive nesting: nested fields can themselves be maps or lists.
 */
function validateNestedFields(
  parentFieldName: string,
  fields: any[]
): NestedField[] {
  const nestedNames = new Set<string>();
  const validated: NestedField[] = [];

  for (const nf of fields) {
    if (!nf.name || typeof nf.name !== 'string') {
      throw new Error(
        `Nested field in '${parentFieldName}' must include name as a string`
      );
    }
    if (!nf.type || !isValidNestedFieldType(nf.type)) {
      throw new Error(
        `Nested field '${nf.name}' in '${parentFieldName}' must have a valid type. ` +
          `Got '${nf.type}'. Valid: string, number, number.<suffix>, boolean, timestamp, timestamp.<suffix>, map, list.`
      );
    }
    if (nestedNames.has(nf.name)) {
      throw new Error(
        `Duplicate nested field name '${nf.name}' in '${parentFieldName}'`
      );
    }
    nestedNames.add(nf.name);

    // Validate enum values against the field type (same as top-level fields)
    if (nf.enum !== undefined) {
      if (!Array.isArray(nf.enum) || nf.enum.length === 0) {
        throw new Error(
          `Nested field '${nf.name}' in '${parentFieldName}' enum must be a non-empty array`
        );
      }
      const nfPrefix = getTypePrefix(nf.type);
      for (const val of nf.enum) {
        if (nfPrefix === 'number' && typeof val !== 'number') {
          throw new Error(
            `Nested field '${nf.name}' in '${parentFieldName}' has type '${nf.type}' but enum contains non-numeric value '${val}'`
          );
        }
        if (nfPrefix === 'string' && typeof val !== 'string') {
          throw new Error(
            `Nested field '${nf.name}' in '${parentFieldName}' has type 'string' but enum contains non-string value '${val}'`
          );
        }
      }
    }

    let validatedNestedFields: NestedField[] | undefined;
    let validatedItems: NestedListItems | undefined;

    if (nf.type === 'map') {
      if (!Array.isArray(nf.fields) || nf.fields.length === 0) {
        throw new Error(
          `Nested field '${nf.name}' in '${parentFieldName}' of type 'map' must include a non-empty 'fields' array`
        );
      }
      validatedNestedFields = validateNestedFields(nf.name, nf.fields);
    }

    if (nf.type === 'list') {
      if (!nf.items || typeof nf.items !== 'object') {
        throw new Error(
          `Nested field '${nf.name}' in '${parentFieldName}' of type 'list' must include an 'items' definition`
        );
      }
      validatedItems = validateNestedListItems(nf.name, nf.items);
    }

    const result: NestedField = {
      name: nf.name,
      type: nf.type,
      required: nf.required ?? false,
      nullable: nf.nullable ?? false,
    };
    if (nf.nameOverride !== undefined) result.nameOverride = nf.nameOverride;
    if (nf.description !== undefined) result.description = nf.description;
    if (nf.default !== undefined) result.default = nf.default;
    if (nf.enum !== undefined) result.enum = nf.enum;
    if (nf.constraints !== undefined) result.constraints = nf.constraints;
    if (nf.annotations !== undefined) result.annotations = nf.annotations;
    if (validatedNestedFields) result.fields = validatedNestedFields;
    if (validatedItems) result.items = validatedItems;
    validated.push(result);
  }

  return validated;
}

/**
 * Validate the items definition for a list field within nested structures.
 */
function validateNestedListItems(
  fieldName: string,
  items: any
): NestedListItems {
  if (!items.type || !isValidItemType(items.type)) {
    throw new Error(
      `Nested field '${fieldName}' items has invalid type '${items.type}'. ` +
        `Valid item types: string, number, number.<suffix>, boolean, timestamp, timestamp.<suffix>, map.`
    );
  }

  let validatedFields: NestedField[] | undefined;
  if (items.type === 'map') {
    if (!Array.isArray(items.fields) || items.fields.length === 0) {
      throw new Error(
        `Nested field '${fieldName}' items of type 'map' must include a non-empty 'fields' array`
      );
    }
    validatedFields = validateNestedFields(fieldName, items.fields);
  }

  return {
    type: items.type,
    fields: validatedFields,
  };
}

/**
 * Validates that the default value type matches the field type.
 * - number / number.*     → JavaScript number
 * - timestamp.epoch       → JavaScript number (epoch milliseconds)
 * - timestamp / timestamp.date → JavaScript string (ISO-8601)
 * - string                → JavaScript string
 * - boolean               → JavaScript boolean
 */
function validateDefaultValue(defaultValue: any, fieldType: string): boolean {
  const prefix = getTypePrefix(fieldType);
  const suffix = getTypeSuffix(fieldType);

  switch (prefix) {
    case 'string':
      return typeof defaultValue === 'string';
    case 'number':
      return typeof defaultValue === 'number';
    case 'boolean':
      return typeof defaultValue === 'boolean';
    case 'timestamp':
      // epoch stored as N: accept numeric default (ms since epoch)
      if (suffix === 'epoch') return typeof defaultValue === 'number';
      // bare and .date stored as S: accept ISO string default
      return typeof defaultValue === 'string';
    default:
      return false;
  }
}

/**
 * Validates field constraints are appropriate for the field type.
 * - String constraints (minLength, maxLength, pattern) → string prefix only
 * - Number constraints (min, max)                      → number prefix only
 */
function validateFieldConstraints(
  fieldName: string,
  fieldType: string,
  constraints: FieldConstraints
): void {
  const prefix = getTypePrefix(fieldType);

  if (constraints.minLength !== undefined) {
    if (prefix !== 'string') {
      throw new Error(
        `Field '${fieldName}' has minLength constraint but is not a string type`
      );
    }
    if (
      typeof constraints.minLength !== 'number' ||
      constraints.minLength < 0 ||
      !Number.isInteger(constraints.minLength)
    ) {
      throw new Error(
        `Field '${fieldName}' minLength must be a non-negative integer`
      );
    }
  }

  if (constraints.maxLength !== undefined) {
    if (prefix !== 'string') {
      throw new Error(
        `Field '${fieldName}' has maxLength constraint but is not a string type`
      );
    }
    if (
      typeof constraints.maxLength !== 'number' ||
      constraints.maxLength < 0 ||
      !Number.isInteger(constraints.maxLength)
    ) {
      throw new Error(
        `Field '${fieldName}' maxLength must be a non-negative integer`
      );
    }
  }

  // Validate minLength <= maxLength when both are specified
  if (
    constraints.minLength !== undefined &&
    constraints.maxLength !== undefined
  ) {
    if (constraints.minLength > constraints.maxLength) {
      throw new Error(
        `Field '${fieldName}' minLength (${constraints.minLength}) cannot be greater than maxLength (${constraints.maxLength})`
      );
    }
  }

  if (constraints.pattern !== undefined) {
    if (prefix !== 'string') {
      throw new Error(
        `Field '${fieldName}' has pattern constraint but is not a string type`
      );
    }
    if (typeof constraints.pattern !== 'string') {
      throw new Error(`Field '${fieldName}' pattern must be a string`);
    }
    try {
      new RegExp(constraints.pattern);
    } catch {
      throw new Error(
        `Field '${fieldName}' pattern is not a valid regular expression`
      );
    }
  }

  if (constraints.min !== undefined) {
    if (prefix !== 'number') {
      throw new Error(
        `Field '${fieldName}' has min constraint but is not a number type`
      );
    }
    if (typeof constraints.min !== 'number') {
      throw new Error(`Field '${fieldName}' min must be a number`);
    }
  }

  if (constraints.max !== undefined) {
    if (prefix !== 'number') {
      throw new Error(
        `Field '${fieldName}' has max constraint but is not a number type`
      );
    }
    if (typeof constraints.max !== 'number') {
      throw new Error(`Field '${fieldName}' max must be a number`);
    }
  }

  if (constraints.min !== undefined && constraints.max !== undefined) {
    if (constraints.min > constraints.max) {
      throw new Error(
        `Field '${fieldName}' min (${constraints.min}) cannot be greater than max (${constraints.max})`
      );
    }
  }
}
