import { vi } from 'vitest';
import * as fs from 'fs';
import { loadSchemaFile } from './schema-loader';

// Mock fs module
vi.mock('fs');
const mockFs = vi.mocked(fs);

/**
 * Sets up fs mocks for a specific schema file.
 * This configures existsSync and readFileSync to work with the given schema path.
 * 
 * @param schemaPath - The path to the schema file (as used in ChaimBinder props)
 * @param schemaContent - The content of the schema file (from loadSchemaFile)
 */
export function mockSchemaFile(schemaPath: string, schemaContent: string): void {
  mockFs.existsSync.mockImplementation((path: string) => {
    return path === schemaPath;
  });
  
  mockFs.readFileSync.mockImplementation((path: string) => {
    if (path === schemaPath) {
      return schemaContent;
    }
    throw new Error(`File not found: ${path}`);
  });
}

/**
 * Sets up fs mocks for multiple schema files.
 * Useful when testing with multiple schemas.
 * 
 * @param schemaMap - Map of schema paths to their content
 */
export function mockSchemaFiles(schemaMap: Record<string, string>): void {
  mockFs.existsSync.mockImplementation((path: string) => {
    return path in schemaMap;
  });
  
  mockFs.readFileSync.mockImplementation((path: string) => {
    if (path in schemaMap) {
      return schemaMap[path];
    }
    throw new Error(`File not found: ${path}`);
  });
}

/**
 * Sets up fs mocks using an actual .bprint file from example/schemas/.
 * This is the recommended way to mock schema files in tests.
 * 
 * @param schemaPath - The path to the schema file (as used in ChaimBinder props)
 * @param filename - The name of the schema file (e.g., 'user.bprint')
 */
export function mockSchemaFileFromExample(schemaPath: string, filename: string): void {
  const schemaContent = loadSchemaFile(filename);
  mockSchemaFile(schemaPath, schemaContent);
}

/**
 * Resets all fs mocks.
 * Call this in beforeEach or afterEach to ensure clean test state.
 */
export function resetFsMocks(): void {
  vi.clearAllMocks();
}

/**
 * Gets the mocked fs module for direct access if needed.
 * 
 * @returns The mocked fs module
 */
export function getMockFs(): typeof mockFs {
  return mockFs;
}

