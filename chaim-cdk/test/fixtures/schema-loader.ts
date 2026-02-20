import * as path from 'path';
// Use require to get the real fs module, not the mocked one
const fs = require('fs');

/**
 * Loads an actual .bprint schema file from the example/schemas/ directory.
 * This mirrors how applications use schema files in the real world.
 * 
 * @param filename - The name of the schema file (e.g., 'user.bprint' or 'order.bprint')
 * @returns The raw file content as a string (ready for fs mocking)
 * @throws Error if the file doesn't exist
 */
export function loadSchemaFile(filename: string): string {
  // Resolve path relative to project root
  const projectRoot = path.resolve(__dirname, '../..');
  const schemaPath = path.join(projectRoot, 'example', 'schemas', filename);
  
  // Validate file exists
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found: ${schemaPath}`);
  }
  
  // Read and return file content
  return fs.readFileSync(schemaPath, 'utf-8');
}

/**
 * Gets the relative path to a schema file (as it would be used in ChaimBinder props).
 * 
 * @param filename - The name of the schema file (e.g., 'user.bprint' or 'order.bprint')
 * @returns The relative path string (e.g., './example/schemas/user.bprint')
 */
export function getSchemaPath(filename: string): string {
  return `./example/schemas/${filename}`;
}

