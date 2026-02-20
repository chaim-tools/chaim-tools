#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { loadSchema, getSchemaInfo } from './utils/schema-loader.mjs';
import {
  validateCustomRules,
  countEntitiesAndFields,
  formatValidationErrors,
} from './utils/validation-helpers.mjs';

/**
 * Validate a single .bprint file
 * @param {string} filePath - Path to the .bprint file
 * @returns {Object} Validation result
 */
const validateSingleFile = async filePath => {
  try {
    // Load schema
    const validate = await loadSchema();

    // Read and parse file
    const raw = await readFile(filePath, 'utf8');
    const json = JSON.parse(raw);

    // JSON Schema validation
    const schemaValid = validate(json);
    const schemaErrors = schemaValid ? [] : validate.errors || [];

    // Custom business rule validation
    const customErrors = validateCustomRules(json);

    const allErrors = [...schemaErrors, ...customErrors];
    const { entityCount, fieldCount } = countEntitiesAndFields(json);

    return {
      file: filePath,
      valid: allErrors.length === 0,
      errors: allErrors,
      entityCount,
      fieldCount,
      schemaInfo: getSchemaInfo(),
    };
  } catch (error) {
    return {
      file: filePath,
      valid: false,
      errors: [{ message: `File parsing error: ${error.message}` }],
      entityCount: 0,
      fieldCount: 0,
    };
  }
};

/**
 * Main function
 */
const main = async () => {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node validate-single.mjs <path-to-bprint-file>');
    console.error('Example: node validate-single.mjs examples/orders.bprint');
    process.exit(1);
  }

  const filePath = args[0];

  try {
    const result = await validateSingleFile(filePath);

    if (result.valid) {
      console.log(`✅ ${result.file} is valid`);
      console.log(`   Entities: ${result.entityCount}`);
      console.log(`   Fields: ${result.fieldCount}`);
      console.log(
        `   Schema: ${result.schemaInfo.title} (${result.schemaInfo.version})`
      );
    } else {
      console.error(`❌ ${result.file} failed validation:`);
      console.error(formatValidationErrors(result.errors));
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Validation error:', error.message);
    process.exit(1);
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { validateSingleFile };
