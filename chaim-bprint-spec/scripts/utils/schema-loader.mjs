import { readFile } from 'node:fs/promises';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

let ajvInstance = null;
let compiledSchema = null;

/**
 * Initialize and configure Ajv validator
 * @returns {Ajv} Configured Ajv instance
 */
export const getAjv = () => {
  if (!ajvInstance) {
    ajvInstance = new Ajv({
      allErrors: true,
      strict: false,
      verbose: true,
      validateSchema: false, // Don't validate the schema itself
    });
    addFormats(ajvInstance);
  }
  return ajvInstance;
};

/**
 * Load and compile the bprint schema
 * @param {string} schemaPath - Path to schema file
 * @returns {Function} Compiled validation function
 */
export const loadSchema = async (schemaPath = 'schema/bprint.schema.json') => {
  try {
    if (!compiledSchema) {
      const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
      const ajv = getAjv();

      // Remove the $schema field to avoid validation issues
      const schemaWithoutMeta = { ...schema };
      delete schemaWithoutMeta.$schema;

      compiledSchema = ajv.compile(schemaWithoutMeta);
    }
    return compiledSchema;
  } catch (error) {
    throw new Error(
      `Failed to load schema from ${schemaPath}: ${error.message}`
    );
  }
};

/**
 * Get schema metadata
 * @returns {Object} Schema information
 */
export const getSchemaInfo = () => {
  if (!compiledSchema) {
    throw new Error('Schema not loaded. Call loadSchema() first.');
  }

  return {
    schema: compiledSchema.schema,
    id: compiledSchema.schema.$id,
    title: compiledSchema.schema.title,
    version: '2020-12', // Hardcode since we remove $schema
  };
};

/**
 * Reset schema cache (useful for testing)
 */
export const resetSchema = () => {
  compiledSchema = null;
  ajvInstance = null;
};
