/**
 * Validation helper functions for bprint schemas
 */

/**
 * Find duplicate entity names across all entities
 * Since each .bprint file now has only one entity, this is simplified
 */
export const findDuplicateEntityNames = () => {
  const errors = [];

  // Each .bprint file now has only one entity, so no duplicate checking needed
  // This function is kept for future extensibility if we ever support multiple entities again
  return errors;
};

/**
 * Find duplicate field names within a schema
 */
export const findDuplicateFieldNames = schema => {
  const errors = [];
  const fieldNames = {};

  if (!schema.fields) return errors;

  schema.fields.forEach((field, fieldIndex) => {
    if (field.name in fieldNames) {
      errors.push({
        message: `Duplicate field name '${field.name}'`,
        path: `fields[${fieldIndex}]`,
      });
    } else {
      fieldNames[field.name] = fieldIndex;
    }
  });

  return errors;
};

/**
 * Validate custom business rules beyond JSON Schema
 */
export const validateCustomRules = bprint => {
  const errors = [];

  // Check for duplicate field names
  if (bprint.fields) {
    errors.push(...findDuplicateFieldNames(bprint));
  }

  // Validate field constraints for each field
  if (bprint.fields) {
    bprint.fields.forEach(field => {
      errors.push(...validateFieldConstraints(field));
    });
  }

  return errors;
};

/**
 * Count total entities and fields for reporting
 */
export const countEntitiesAndFields = bprint => {
  const entityCount = bprint.fields ? 1 : 0;
  const fieldCount = bprint.fields?.length || 0;

  return { entityCount, fieldCount };
};

/**
 * Format validation errors for display
 * @param {Array} errors - Array of validation errors
 * @returns {string} Formatted error string
 */
export const formatValidationErrors = errors => {
  if (!errors || errors.length === 0) return '';

  return errors
    .map(error => {
      if (error.message) {
        return `   - ${error.message}`;
      } else {
        return `   - ${error.instancePath || 'root'}: ${error.message || error.keyword}`;
      }
    })
    .join('\n');
};

/**
 * Validate field type constraints
 * @param {Object} field - Field object
 * @returns {Array} Array of validation error messages
 */
export const validateFieldConstraints = field => {
  const errors = [];

  // Check if enum values are provided when type is string
  if (field.type === 'string' && field.enum && Array.isArray(field.enum)) {
    if (field.enum.length === 0) {
      errors.push(`Field '${field.name}' has empty enum array`);
    }

    // Check for duplicate enum values
    const duplicateEnumValues = field.enum.filter(
      (value, index) => field.enum.indexOf(value) !== index
    );
    if (duplicateEnumValues.length > 0) {
      errors.push(
        `Field '${field.name}' has duplicate enum values: ${duplicateEnumValues.join(', ')}`
      );
    }
  }

  return errors;
};
