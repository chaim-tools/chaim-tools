import { readFile } from 'node:fs/promises';
import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { loadSchema } from './utils/schema-loader.mjs';
import {
  validateCustomRules,
  countEntitiesAndFields,
  formatValidationErrors,
} from './utils/validation-helpers.mjs';

const EXAMPLES_DIR = 'examples';

// Recursively find all .bprint files
const findBprintFiles = async dir => {
  const files = [];

  try {
    const items = await readdir(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stats = await stat(fullPath);

      if (stats.isDirectory()) {
        // Recursively search subdirectories
        const subFiles = await findBprintFiles(fullPath);
        files.push(...subFiles);
      } else if (stats.isFile() && extname(item) === '.bprint') {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }

  return files;
};

// Validate a single file with detailed error reporting
const validateFile = async filePath => {
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

// Main validation function
const validateAllExamples = async () => {
  try {
    const files = await findBprintFiles(EXAMPLES_DIR);

    if (files.length === 0) {
      console.log(
        'ℹ️  No .bprint files found in examples directory or subdirectories'
      );
      return;
    }

    console.log(`🔍 Validating ${files.length} .bprint file(s)...\n`);

    let hadError = false;
    let totalEntities = 0;
    let totalFields = 0;

    // Validate files sequentially for better error reporting
    for (const file of files) {
      const result = await validateFile(file);

      if (result.valid) {
        console.log(
          `✅ ${result.file} is valid (${result.entityCount} entities, ${result.fieldCount} fields)`
        );
        totalEntities += result.entityCount;
        totalFields += result.fieldCount;
      } else {
        hadError = true;
        console.error(`❌ ${result.file} failed validation:`);
        console.error(formatValidationErrors(result.errors));
        console.error('');
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Files processed: ${files.length}`);
    console.log(`   Valid files: ${files.length - (hadError ? 1 : 0)}`);
    console.log(`   Total entities: ${totalEntities}`);
    console.log(`   Total fields: ${totalFields}`);

    if (hadError) {
      console.error('\n❌ Validation failed');
      process.exit(1);
    } else {
      console.log('\n🎉 All files validated successfully!');
    }
  } catch (error) {
    console.error('❌ Validation script error:', error.message);
    process.exit(1);
  }
};

// Run validation
await validateAllExamples();
