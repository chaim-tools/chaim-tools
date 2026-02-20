import * as fs from 'fs';
import { SchemaData, validateSchema } from '@chaim-tools/chaim-bprint-spec';

export class SchemaService {
  /**
   * Validates that the schema file path exists and has a .bprint extension
   */
  static validateSchemaPath(schemaPath: string): void {
    if (!schemaPath) {
      throw new Error('Schema path is required');
    }

    if (!schemaPath.endsWith('.bprint')) {
      throw new Error('Schema file must have a .bprint extension');
    }

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }
  }

  /**
   * Reads and parses the schema file using our local validator based on the official spec
   */
  static readSchema(schemaPath: string): SchemaData {
    try {
      const content = fs.readFileSync(schemaPath, 'utf-8');
      const rawSchema = JSON.parse(content);
      
      // Use the official chaim-bprint-spec validator
      return validateSchema(rawSchema);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in schema file: ${schemaPath}`);
      }
      // Re-throw validation errors with context
      if (error instanceof Error) {
        throw new Error(`Schema validation failed for ${schemaPath}: ${error.message}`);
      }
      throw error;
    }
  }
}
