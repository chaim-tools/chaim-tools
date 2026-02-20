/**
 * Test utilities and helpers for the Chaim CDK package
 */

// Re-export test utilities for convenience
export * from './unit/schema-service.test';
export * from './unit/table-metadata.test';
export * from './unit/props-validator.test';
export * from './integration/chaim-binder-integration.test';

// Test utilities
export const createMockTable = () => {
  // This would create a mock DynamoDB table for testing
  // Implementation would depend on your testing needs
};

export const createMockSchema = (overrides = {}) => {
  return {
    chaim_version: 1,
    model_name: 'TestModel',
    fields: [
      {
        name: 'id',
        type: 'string',
        required: true,
        partition_key: true,
      },
    ],
    ...overrides,
  };
};
