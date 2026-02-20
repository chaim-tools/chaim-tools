// Export the main types
export {
  SchemaData,
  Identity,
  Field,
  FieldType,
  NumberSubType,
  TimestampSubType,
  ListItems,
  NestedField,
  NestedListItems,
  FieldConstraints,
  FieldAnnotations,
} from './types';

// Export validation functions
export { validateSchema } from './validation';

// Export spec version pattern
export { SPEC_VERSION_PATTERN } from './spec-version';

// Export the JSON schema
export { default as schema } from '../schema/bprint.schema.json';
