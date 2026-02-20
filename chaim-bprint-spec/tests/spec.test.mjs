import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  loadSchema,
  resetSchema,
  getSchemaInfo,
} from '../scripts/utils/schema-loader.mjs';
import {
  validateCustomRules,
  countEntitiesAndFields,
} from '../scripts/utils/validation-helpers.mjs';

// Helper function to load test fixtures
const loadFixture = async path => {
  return JSON.parse(await readFile(path, 'utf8'));
};

// Test suite for schema validation
test('Schema Validation', async t => {
  await t.test('valid examples pass schema validation', async () => {
    const validate = await loadSchema();

    const validFixtures = [
      'tests/fixtures/valid/orders.bprint',
      'tests/fixtures/valid/users.bprint',
      'tests/fixtures/valid/products.bprint',
      'tests/fixtures/valid/order-with-collections.bprint',
      'tests/fixtures/valid/order-with-nested-maps.bprint',
    ];

    for (const fixture of validFixtures) {
      const example = await loadFixture(fixture);
      const ok = validate(example);

      if (!ok) {
        console.error(`Validation failed for ${fixture}:`, validate.errors);
      }
      assert.equal(ok, true, `${fixture} should validate against schema`);
    }
  });

  await t.test('invalid examples fail schema validation', async () => {
    const validate = await loadSchema();

    const invalidFixtures = [
      'tests/fixtures/invalid/missing-identity-fields.bprint',
      'tests/fixtures/invalid/invalid-enum.bprint',
    ];

    for (const fixture of invalidFixtures) {
      const example = await loadFixture(fixture);
      const ok = validate(example);
      assert.equal(ok, false, `${fixture} should fail schema validation`);
    }
  });

  await t.test('custom validation rules work correctly', async () => {
    // Test duplicate field names
    const duplicateFields = await loadFixture(
      'tests/fixtures/invalid/duplicate-field-names.bprint'
    );

    const errors = validateCustomRules(duplicateFields);

    assert.ok(errors.length > 0, 'Should detect duplicate field names');
    assert.ok(
      errors.some(e => e.message && e.message.includes('Duplicate field name')),
      'Should have duplicate field error'
    );
  });

  await t.test('entity and field counting works', async () => {
    const orders = await loadFixture('tests/fixtures/valid/orders.bprint');
    const { entityCount, fieldCount } = countEntitiesAndFields(orders);

    assert.equal(entityCount, 1, 'Should count 1 entity');
    assert.equal(fieldCount, 4, 'Should count 4 fields');
  });
});

// Test suite for field validation
test('Field Validation', async t => {
  await t.test('field types are correctly validated', async () => {
    const validate = await loadSchema();

    const validFieldTypes = ['string', 'number', 'boolean', 'timestamp'];

    for (const fieldType of validFieldTypes) {
      const testSchema = {
        schemaVersion: '1.0',
        entityName: 'Test',
        description: 'Test entity',
        identity: { fields: ['id'] },
        fields: [{ name: 'testField', type: fieldType, required: true }],
      };

      const ok = validate(testSchema);
      assert.equal(ok, true, `Field type '${fieldType}' should be valid`);
    }
  });

  await t.test('invalid field types are rejected', async () => {
    const validate = await loadSchema();

    const testSchema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'testField', type: 'invalid_type', required: true }],
    };

    const ok = validate(testSchema);
    assert.equal(ok, false, 'Invalid field type should be rejected');
  });
});

// Test suite for edge cases
test('Edge Cases', async t => {
  await t.test('missing identity is rejected', async () => {
    const validate = await loadSchema();

    const testSchema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test schema',
      fields: [{ name: 'id', type: 'string', required: true }],
    };

    const ok = validate(testSchema);
    assert.equal(ok, false, 'Missing identity should be rejected');
  });

  await t.test('schema without fields is rejected', async () => {
    const validate = await loadSchema();

    const testSchema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [],
    };

    const ok = validate(testSchema);
    assert.equal(ok, false, 'Schema without fields should be rejected');
  });

  await t.test('missing required fields array is rejected', async () => {
    const validate = await loadSchema();

    const testSchema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      // Missing fields array
    };

    const ok = validate(testSchema);
    assert.equal(ok, false, 'Missing required fields should be rejected');
  });
});

// Test suite for schema metadata
test('Schema Metadata', async t => {
  await t.test('schema info is accessible', async () => {
    await loadSchema();
    const info = getSchemaInfo();

    assert.ok(info.title, 'Schema should have a title');
    assert.ok(info.version, 'Schema should have a version');
    assert.ok(info.id, 'Schema should have an ID');
  });

  await t.test('schema can be reset', async () => {
    await loadSchema();
    resetSchema();

    // Should throw error when trying to get schema info
    assert.throws(() => {
      getSchemaInfo();
    }, 'Schema not loaded');
  });
});

// Test suite for advanced validation scenarios
test('Advanced Validation', async t => {
  await t.test('complex field types with enums and defaults', async () => {
    const validate = await loadSchema();

    const complexSchema = {
      schemaVersion: '1.0',
      entityName: 'Complex',
      description: 'Complex schema with enums and defaults',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'status',
          type: 'string',
          enum: ['active', 'inactive', 'pending'],
          required: false,
        },
        { name: 'priority', type: 'number', default: 1, required: false },
        { name: 'enabled', type: 'boolean', default: true, required: false },
        { name: 'createdAt', type: 'timestamp', required: true },
      ],
    };

    const ok = validate(complexSchema);
    assert.equal(ok, true, 'Complex schema should be valid');
  });

  await t.test('sort key validation', async () => {
    const validate = await loadSchema();

    const sortKeySchema = {
      schemaVersion: '1.0',
      entityName: 'SortKey',
      description: 'Schema with sort key',
      identity: {
        fields: ['userId', 'timestamp'],
      },
      fields: [
        { name: 'userId', type: 'string', required: true },
        { name: 'timestamp', type: 'timestamp', required: true },
        { name: 'data', type: 'string', required: false },
      ],
    };

    const ok = validate(sortKeySchema);
    assert.equal(ok, true, 'Schema with sort key should be valid');
  });

  await t.test('field annotations are preserved', async () => {
    const validate = await loadSchema();

    const annotatedSchema = {
      schemaVersion: '1.0',
      entityName: 'TestAnnotations',
      description: 'Schema with field annotations',
      identity: { fields: ['id'] },
      fields: [
        {
          name: 'id',
          type: 'string',
          required: true,
          annotations: { customTag: 'primary' },
        },
        {
          name: 'email',
          type: 'string',
          required: true,
          annotations: { source: 'registration' },
        },
      ],
    };

    const ok = validate(annotatedSchema);
    assert.equal(ok, true, 'Schema with custom annotations should be valid');
  });
});

// Test suite for error handling and edge cases
test('Error Handling & Edge Cases', async t => {
  await t.test('malformed JSON handling', async () => {
    const validate = await loadSchema();

    // Test with missing required fields
    const missingRequired = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Missing required fields',
      // Missing identity and fields
    };

    const ok = validate(missingRequired);
    assert.equal(ok, false, 'Missing required fields should be rejected');

    // Check specific error messages
    const errors = validate.errors;
    assert.ok(errors.length > 0, 'Should have validation errors');
    assert.ok(
      errors.some(
        e => e.message.includes('identity') || e.message.includes('fields')
      ),
      'Should mention missing identity or fields'
    );
  });

  await t.test('invalid field constraints', async () => {
    const validate = await loadSchema();

    // Test empty enum array
    const emptyEnum = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Empty enum array',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'status', type: 'string', enum: [], required: false },
      ],
    };

    const ok = validate(emptyEnum);
    assert.equal(ok, false, 'Empty enum array should be rejected');
  });

  await t.test('invalid identity structure', async () => {
    const validate = await loadSchema();

    // Test invalid identity - empty string in fields array
    const invalidIdentity = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Invalid identity',
      identity: {
        fields: [''], // Empty string
      },
      fields: [{ name: 'id', type: 'string', required: true }],
    };

    const ok = validate(invalidIdentity);
    assert.equal(ok, false, 'Invalid identity should be rejected');
  });

  await t.test('field name validation', async () => {
    const validate = await loadSchema();

    // Test invalid field names
    const invalidFieldNames = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Invalid field names',
      identity: { fields: ['id'] },
      fields: [
        { name: '', type: 'string', required: true }, // Empty name
        { name: 'validField', type: 'string', required: true },
      ],
    };

    const ok = validate(invalidFieldNames);
    assert.equal(ok, false, 'Invalid field names should be rejected');
  });
});

// Test suite for validation helper functions
test('Validation Helper Functions', async t => {
  await t.test('countEntitiesAndFields with various schemas', async () => {
    // Test with valid schema
    const validSchema = {
      schemaVersion: '1.0',
      entityName: 'test',
      description: 'Valid schema',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'name', type: 'string', required: true },
      ],
    };

    const { entityCount, fieldCount } = countEntitiesAndFields(validSchema);
    assert.equal(entityCount, 1, 'Should count 1 entity');
    assert.equal(fieldCount, 2, 'Should count 2 fields');

    // Test with missing entity
    const missingEntity = {
      schemaVersion: '1.0',
      entityName: 'test',
      description: 'Missing entity',
    };

    const { entityCount: missingEntityCount, fieldCount: missingFieldCount } =
      countEntitiesAndFields(missingEntity);
    assert.equal(missingEntityCount, 0, 'Should count 0 entities when missing');
    assert.equal(
      missingFieldCount,
      0,
      'Should count 0 fields when missing entity'
    );
  });

  await t.test('validateCustomRules with edge cases', async () => {
    // Test with empty schema (no fields)
    const emptySchema = {
      schemaVersion: '1.0',
      entityName: 'test',
      description: 'Empty schema',
    };

    const emptyErrors = validateCustomRules(emptySchema);
    assert.equal(
      emptyErrors.length,
      0,
      'Empty schema should not cause validation errors'
    );

    // Test with no fields
    const noFields = {
      schemaVersion: '1.0',
      entityName: 'test',
      description: 'No fields',
      identity: { fields: ['id'] },
      // No fields array
    };

    const noFieldErrors = validateCustomRules(noFields);
    assert.equal(
      noFieldErrors.length,
      0,
      'Entity without fields should not cause validation errors'
    );
  });
});

// Test suite for CLI script functionality
test('CLI Script Functionality', async t => {
  await t.test(
    'schema loader handles missing schema file gracefully',
    async () => {
      // Test that schema loader can handle errors when schema file is missing
      try {
        // This should throw an error
        await loadSchema('nonexistent/schema.json');
        // If we get here, the function didn't throw an error as expected
        // This might happen if there's a fallback mechanism
        console.log(
          'Note: loadSchema did not throw error for missing file - may have fallback behavior'
        );
      } catch (error) {
        // The error should contain information about the failure
        assert.ok(error.message, 'Should have an error message');
        assert.ok(
          error.message.includes('Failed to load schema') ||
            error.message.includes('nonexistent'),
          `Should mention schema loading failure, got: ${error.message}`
        );
      }
    }
  );

  await t.test('schema loader caches compiled schema', async () => {
    // Load schema multiple times
    const validate1 = await loadSchema();
    const validate2 = await loadSchema();
    const validate3 = await loadSchema();

    // All should be the same function instance
    assert.strictEqual(
      validate1,
      validate2,
      'First and second loads should be cached'
    );
    assert.strictEqual(
      validate2,
      validate3,
      'Second and third loads should be cached'
    );
    assert.strictEqual(
      validate1,
      validate3,
      'First and third loads should be cached'
    );
  });

  await t.test('schema reset functionality', async () => {
    // Load schema first
    await loadSchema();

    // Verify it's loaded
    const info1 = getSchemaInfo();
    assert.ok(info1.title, 'Schema should be loaded');

    // Reset schema
    resetSchema();

    // Verify it's reset
    assert.throws(() => {
      getSchemaInfo();
    }, 'Schema not loaded');

    // Reload should work
    await loadSchema();
    const info2 = getSchemaInfo();
    assert.ok(info2.title, 'Schema should be reloadable after reset');
  });
});

// Test suite for performance and stress testing
test('Performance & Stress Testing', async t => {
  await t.test('handles large field arrays efficiently', async () => {
    const validate = await loadSchema();

    // Create schema with many fields
    const largeSchema = {
      schemaVersion: '1.0',
      entityName: 'TestLarge',
      description: 'Large schema with many fields',
      identity: { fields: ['id'] },
      fields: Array.from({ length: 100 }, (_, i) => ({
        name: `field${i}`,
        type:
          i % 4 === 0
            ? 'string'
            : i % 4 === 1
              ? 'number'
              : i % 4 === 2
                ? 'boolean'
                : 'timestamp',
        required: i < 10, // First 10 fields required
        default: i % 4 === 1 ? i : i % 4 === 2 ? i % 2 === 0 : undefined,
      })),
    };

    const startTime = Date.now();
    const ok = validate(largeSchema);
    const endTime = Date.now();

    assert.equal(ok, true, 'Large schema should be valid');
    assert.ok(
      endTime - startTime < 1000,
      'Large schema validation should complete within 1 second'
    );
  });

  await t.test('handles complex nested structures', async () => {
    const validate = await loadSchema();

    // Create schema with complex field annotations
    const complexSchema = {
      schemaVersion: '1.0',
      entityName: 'TestComplex',
      description: 'Complex schema with custom field annotations',
      identity: { fields: ['id'] },
      fields: [
        {
          name: 'id',
          type: 'string',
          required: true,
          annotations: {
            customFlag: true,
          },
        },
        {
          name: 'metadata',
          type: 'string',
          required: false,
          annotations: {
            source: 'user-input',
          },
        },
      ],
    };

    const ok = validate(complexSchema);
    assert.equal(ok, true, 'Complex field annotations schema should be valid');
  });
});

// Test suite for field constraints
test('Field Constraints', async t => {
  // Import the TypeScript validation function for constraint testing
  const { validateSchema } = await import('../dist/src/index.js');

  await t.test('valid string constraints are accepted', async () => {
    const schemaWithStringConstraints = {
      schemaVersion: '1.0',
      entityName: 'TestConstraints',
      description: 'Schema with string constraints',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'stateCode',
          type: 'string',
          required: true,
          constraints: {
            minLength: 2,
            maxLength: 2,
            pattern: '^[A-Z]{2}$',
          },
        },
        {
          name: 'zipCode',
          type: 'string',
          required: false,
          constraints: {
            minLength: 5,
            maxLength: 10,
            pattern: '^[0-9]{5}(-[0-9]{4})?$',
          },
        },
      ],
    };

    // Should not throw
    const validated = validateSchema(schemaWithStringConstraints);
    assert.ok(validated, 'Schema with valid string constraints should pass');
    assert.equal(validated.fields[1].constraints.minLength, 2);
    assert.equal(validated.fields[1].constraints.maxLength, 2);
  });

  await t.test('valid number constraints are accepted', async () => {
    const schemaWithNumberConstraints = {
      schemaVersion: '1.0',
      entityName: 'TestConstraints',
      description: 'Schema with number constraints',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'quantity',
          type: 'number',
          required: true,
          constraints: {
            min: 1,
            max: 1000,
          },
        },
        {
          name: 'price',
          type: 'number',
          required: true,
          constraints: {
            min: 0,
            max: 999999.99,
          },
        },
      ],
    };

    const validated = validateSchema(schemaWithNumberConstraints);
    assert.ok(validated, 'Schema with valid number constraints should pass');
    assert.equal(validated.fields[1].constraints.min, 1);
    assert.equal(validated.fields[1].constraints.max, 1000);
  });

  await t.test(
    'string constraints on non-string field are rejected',
    async () => {
      const invalidSchema = {
        schemaVersion: '1.0',
        entityName: 'TestConstraints',
        description: 'Invalid: string constraints on number field',
        identity: { fields: ['id'] },
        fields: [
          { name: 'id', type: 'string', required: true },
          {
            name: 'count',
            type: 'number',
            required: true,
            constraints: {
              minLength: 5, // Invalid: minLength on number field
            },
          },
        ],
      };

      assert.throws(
        () => validateSchema(invalidSchema),
        /minLength constraint but is not a string type/,
        'Should reject minLength on non-string field'
      );
    }
  );

  await t.test(
    'maxLength constraint on non-string field is rejected',
    async () => {
      const invalidSchema = {
        schemaVersion: '1.0',
        entityName: 'TestConstraints',
        description: 'Invalid: maxLength on boolean field',
        identity: { fields: ['id'] },
        fields: [
          { name: 'id', type: 'string', required: true },
          {
            name: 'isActive',
            type: 'boolean',
            constraints: {
              maxLength: 10, // Invalid: maxLength on boolean field
            },
          },
        ],
      };

      assert.throws(
        () => validateSchema(invalidSchema),
        /maxLength constraint but is not a string type/,
        'Should reject maxLength on non-string field'
      );
    }
  );

  await t.test(
    'pattern constraint on non-string field is rejected',
    async () => {
      const invalidSchema = {
        schemaVersion: '1.0',
        entityName: 'TestConstraints',
        description: 'Invalid: pattern on timestamp field',
        identity: { fields: ['id'] },
        fields: [
          { name: 'id', type: 'string', required: true },
          {
            name: 'createdAt',
            type: 'timestamp',
            constraints: {
              pattern: '^[0-9]+$', // Invalid: pattern on timestamp field
            },
          },
        ],
      };

      assert.throws(
        () => validateSchema(invalidSchema),
        /pattern constraint but is not a string type/,
        'Should reject pattern on non-string field'
      );
    }
  );

  await t.test(
    'number constraints on non-number field are rejected',
    async () => {
      const invalidSchema = {
        schemaVersion: '1.0',
        entityName: 'TestConstraints',
        description: 'Invalid: min/max on string field',
        identity: { fields: ['id'] },
        fields: [
          { name: 'id', type: 'string', required: true },
          {
            name: 'name',
            type: 'string',
            constraints: {
              min: 0, // Invalid: min on string field
            },
          },
        ],
      };

      assert.throws(
        () => validateSchema(invalidSchema),
        /min constraint but is not a number type/,
        'Should reject min on non-number field'
      );
    }
  );

  await t.test('max constraint on non-number field is rejected', async () => {
    const invalidSchema = {
      schemaVersion: '1.0',
      entityName: 'TestConstraints',
      description: 'Invalid: max on boolean field',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'flag',
          type: 'boolean',
          constraints: {
            max: 100, // Invalid: max on boolean field
          },
        },
      ],
    };

    assert.throws(
      () => validateSchema(invalidSchema),
      /max constraint but is not a number type/,
      'Should reject max on non-number field'
    );
  });

  await t.test('minLength greater than maxLength is rejected', async () => {
    const invalidSchema = {
      schemaVersion: '1.0',
      entityName: 'TestConstraints',
      description: 'Invalid: minLength > maxLength',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'code',
          type: 'string',
          constraints: {
            minLength: 10,
            maxLength: 5, // Invalid: min > max
          },
        },
      ],
    };

    assert.throws(
      () => validateSchema(invalidSchema),
      /minLength.*cannot be greater than maxLength/,
      'Should reject minLength > maxLength'
    );
  });

  await t.test('min greater than max is rejected', async () => {
    const invalidSchema = {
      schemaVersion: '1.0',
      entityName: 'TestConstraints',
      description: 'Invalid: min > max',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'quantity',
          type: 'number',
          constraints: {
            min: 100,
            max: 10, // Invalid: min > max
          },
        },
      ],
    };

    assert.throws(
      () => validateSchema(invalidSchema),
      /min.*cannot be greater than max/,
      'Should reject min > max'
    );
  });

  await t.test('invalid regex pattern is rejected', async () => {
    const invalidSchema = {
      schemaVersion: '1.0',
      entityName: 'TestConstraints',
      description: 'Invalid: bad regex pattern',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'code',
          type: 'string',
          constraints: {
            pattern: '[invalid(regex', // Invalid regex
          },
        },
      ],
    };

    assert.throws(
      () => validateSchema(invalidSchema),
      /pattern is not a valid regular expression/,
      'Should reject invalid regex pattern'
    );
  });

  await t.test('negative minLength is rejected', async () => {
    const invalidSchema = {
      schemaVersion: '1.0',
      entityName: 'TestConstraints',
      description: 'Invalid: negative minLength',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'code',
          type: 'string',
          constraints: {
            minLength: -1, // Invalid: negative
          },
        },
      ],
    };

    assert.throws(
      () => validateSchema(invalidSchema),
      /minLength must be a non-negative integer/,
      'Should reject negative minLength'
    );
  });

  await t.test('non-integer minLength is rejected', async () => {
    const invalidSchema = {
      schemaVersion: '1.0',
      entityName: 'TestConstraints',
      description: 'Invalid: non-integer minLength',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'code',
          type: 'string',
          constraints: {
            minLength: 2.5, // Invalid: not an integer
          },
        },
      ],
    };

    assert.throws(
      () => validateSchema(invalidSchema),
      /minLength must be a non-negative integer/,
      'Should reject non-integer minLength'
    );
  });

  await t.test('custom annotations are preserved', async () => {
    const validSchema = {
      schemaVersion: '1.0',
      entityName: 'TestMetadata',
      description: 'Schema with custom annotations',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'email',
          type: 'string',
          annotations: {
            customFlag: true,
            source: 'user-input',
          },
        },
      ],
    };

    const validated = validateSchema(validSchema);
    assert.ok(validated, 'Schema with custom annotations should pass');
    assert.equal(validated.fields[1].annotations.customFlag, true);
    assert.equal(validated.fields[1].annotations.source, 'user-input');
  });

  await t.test('combined constraints and annotations work', async () => {
    const validSchema = {
      schemaVersion: '1.0',
      entityName: 'TestCombined',
      description: 'Schema with combined constraints and annotations',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'ssn',
          type: 'string',
          required: true,
          constraints: {
            minLength: 9,
            maxLength: 11,
            pattern: '^[0-9]{3}-?[0-9]{2}-?[0-9]{4}$',
          },
        },
        {
          name: 'email',
          type: 'string',
          required: true,
          constraints: {
            minLength: 5,
            maxLength: 254,
          },
          annotations: {
            source: 'registration-form',
          },
        },
        {
          name: 'age',
          type: 'number',
          required: false,
          constraints: {
            min: 0,
            max: 150,
          },
        },
      ],
    };

    const validated = validateSchema(validSchema);
    assert.ok(
      validated,
      'Schema with combined constraints and annotations should pass'
    );

    const ssnField = validated.fields[1];
    assert.equal(ssnField.constraints.minLength, 9);

    const emailField = validated.fields[2];
    assert.equal(emailField.constraints.minLength, 5);
    assert.equal(emailField.annotations.source, 'registration-form');

    const ageField = validated.fields[3];
    assert.equal(ageField.constraints.min, 0);
    assert.equal(ageField.constraints.max, 150);
  });

  await t.test('schema without constraints still validates', async () => {
    const simpleSchema = {
      schemaVersion: '1.0',
      entityName: 'TestSimple',
      description: 'Simple schema without constraints',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'name', type: 'string', required: true },
        { name: 'count', type: 'number', required: false },
      ],
    };

    const validated = validateSchema(simpleSchema);
    assert.ok(validated, 'Schema without constraints should pass');
  });
});

// Test suite for nameOverride validation
test('nameOverride Validation', async t => {
  await t.test('valid nameOverride passes JSON schema validation', async () => {
    const validate = await loadSchema();

    const schema = {
      schemaVersion: '1.1',
      entityName: 'Order',
      description: 'Order with nameOverride',
      identity: { fields: ['order-id'] },
      fields: [
        { name: 'order-id', type: 'string', required: true },
        {
          name: '2fa-verified',
          nameOverride: 'twoFactorVerified',
          type: 'boolean',
          required: false,
        },
      ],
    };

    const ok = validate(schema);
    if (!ok) {
      console.error('Validation errors:', validate.errors);
    }
    assert.equal(ok, true, 'Schema with valid nameOverride should pass');
  });

  await t.test(
    'nameOverride with hyphens is rejected by JSON schema',
    async () => {
      const validate = await loadSchema();

      const schema = {
        schemaVersion: '1.1',
        entityName: 'Test',
        description: 'Test entity',
        identity: { fields: ['id'] },
        fields: [
          { name: 'id', type: 'string', required: true },
          {
            name: 'some-field',
            nameOverride: 'some-field',
            type: 'string',
            required: false,
          },
        ],
      };

      const ok = validate(schema);
      assert.equal(ok, false, 'nameOverride with hyphens should be rejected');
    }
  );

  await t.test(
    'nameOverride with leading digit is rejected by JSON schema',
    async () => {
      const validate = await loadSchema();

      const schema = {
        schemaVersion: '1.1',
        entityName: 'Test',
        description: 'Test entity',
        identity: { fields: ['id'] },
        fields: [
          { name: 'id', type: 'string', required: true },
          {
            name: '2fa',
            nameOverride: '2fa',
            type: 'string',
            required: false,
          },
        ],
      };

      const ok = validate(schema);
      assert.equal(
        ok,
        false,
        'nameOverride with leading digit should be rejected'
      );
    }
  );

  await t.test(
    'nameOverride with spaces is rejected by JSON schema',
    async () => {
      const validate = await loadSchema();

      const schema = {
        schemaVersion: '1.1',
        entityName: 'Test',
        description: 'Test entity',
        identity: { fields: ['id'] },
        fields: [
          { name: 'id', type: 'string', required: true },
          {
            name: 'some field',
            nameOverride: 'some field',
            type: 'string',
            required: false,
          },
        ],
      };

      const ok = validate(schema);
      assert.equal(ok, false, 'nameOverride with spaces should be rejected');
    }
  );

  await t.test(
    'missing nameOverride on clean name works (backward compat)',
    async () => {
      const validate = await loadSchema();

      const schema = {
        schemaVersion: '1.0',
        entityName: 'User',
        description: 'User entity',
        identity: { fields: ['userId'] },
        fields: [
          { name: 'userId', type: 'string', required: true },
          { name: 'email', type: 'string', required: true },
        ],
      };

      const ok = validate(schema);
      assert.equal(ok, true, 'Schema without nameOverride should still work');
    }
  );

  await t.test(
    'missing nameOverride on hyphenated name passes JSON schema',
    async () => {
      const validate = await loadSchema();

      const schema = {
        schemaVersion: '1.1',
        entityName: 'Order',
        description: 'Order with hyphenated field names',
        identity: { fields: ['order-id'] },
        fields: [
          { name: 'order-id', type: 'string', required: true },
          { name: 'order-date', type: 'timestamp', required: true },
        ],
      };

      const ok = validate(schema);
      assert.equal(
        ok,
        true,
        'Hyphenated names without nameOverride should pass JSON schema'
      );
    }
  );

  await t.test('nameOverride with underscore prefix is valid', async () => {
    const validate = await loadSchema();

    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: '2fa-code',
          nameOverride: '_2faCode',
          type: 'string',
          required: false,
        },
      ],
    };

    const ok = validate(schema);
    assert.equal(
      ok,
      true,
      'nameOverride starting with underscore should be valid'
    );
  });

  await t.test(
    'order-with-name-overrides fixture passes JSON schema validation',
    async () => {
      const validate = await loadSchema();

      const fixture = await loadFixture(
        'tests/fixtures/valid/order-with-name-overrides.bprint'
      );
      const ok = validate(fixture);

      if (!ok) {
        console.error('Validation errors:', validate.errors);
      }
      assert.equal(
        ok,
        true,
        'order-with-name-overrides fixture should be valid'
      );
    }
  );
});

// Test suite for nameOverride TypeScript validation
test('nameOverride TypeScript Validation', async t => {
  const { validateSchema } = await import('../dist/src/index.js');

  await t.test('reserved keyword as nameOverride is rejected', async () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'some-field',
          nameOverride: 'class',
          type: 'string',
          required: false,
        },
      ],
    };

    assert.throws(
      () => validateSchema(schema),
      /reserved keyword/,
      'Should reject reserved keyword as nameOverride'
    );
  });

  await t.test('invalid identifier as nameOverride is rejected', async () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'some-field',
          nameOverride: 'invalid-name',
          type: 'string',
          required: false,
        },
      ],
    };

    assert.throws(
      () => validateSchema(schema),
      /not a valid identifier/,
      'Should reject invalid identifier as nameOverride'
    );
  });

  await t.test('nameOverride is preserved in validated output', async () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Order',
      description: 'Order entity',
      identity: { fields: ['orderId'] },
      fields: [
        { name: 'orderId', type: 'string', required: true },
        {
          name: '2fa-verified',
          nameOverride: 'twoFactorVerified',
          type: 'boolean',
          required: false,
        },
        { name: 'customerId', type: 'string', required: true },
      ],
    };

    const validated = validateSchema(schema);
    assert.ok(validated, 'Schema should validate');

    const tfaField = validated.fields.find(f => f.name === '2fa-verified');
    assert.equal(
      tfaField.nameOverride,
      'twoFactorVerified',
      'nameOverride should be preserved'
    );

    const customerField = validated.fields.find(f => f.name === 'customerId');
    assert.equal(
      customerField.nameOverride,
      undefined,
      'Missing nameOverride should be undefined'
    );
  });

  await t.test('valid nameOverride passes TS validation', async () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Order',
      description: 'Order entity',
      identity: { fields: ['orderId'] },
      fields: [
        { name: 'orderId', type: 'string', required: true },
        {
          name: 'order-date',
          nameOverride: 'orderDate',
          type: 'timestamp',
          required: true,
        },
        {
          name: 'TTL',
          nameOverride: 'ttl',
          type: 'number',
          required: false,
        },
      ],
    };

    const validated = validateSchema(schema);
    assert.ok(validated, 'Schema with valid nameOverrides should pass');
    assert.equal(validated.fields[1].nameOverride, 'orderDate');
    assert.equal(validated.fields[2].nameOverride, 'ttl');
  });

  await t.test('multiple reserved keywords are rejected', async () => {
    const reservedWords = [
      'int',
      'return',
      'void',
      'public',
      'static',
      'while',
      'for',
    ];

    for (const word of reservedWords) {
      const schema = {
        schemaVersion: '1.0',
        entityName: 'Test',
        description: 'Test entity',
        identity: { fields: ['id'] },
        fields: [
          { name: 'id', type: 'string', required: true },
          {
            name: 'field1',
            nameOverride: word,
            type: 'string',
            required: false,
          },
        ],
      };

      assert.throws(
        () => validateSchema(schema),
        /reserved keyword/,
        `Should reject '${word}' as nameOverride`
      );
    }
  });
});

// Test suite for collection types (list, map, stringSet, numberSet)
test('Collection Types - JSON Schema Validation', async t => {
  await t.test('list of strings is valid', async () => {
    const validate = await loadSchema();
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity with list',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'tags', type: 'list', items: { type: 'string' } },
      ],
    };
    const ok = validate(schema);
    if (!ok) console.error('Validation errors:', validate.errors);
    assert.equal(ok, true, 'List of strings should be valid');
  });

  await t.test('list of numbers is valid', async () => {
    const validate = await loadSchema();
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'scores', type: 'list', items: { type: 'number' } },
      ],
    };
    const ok = validate(schema);
    assert.equal(ok, true, 'List of numbers should be valid');
  });

  await t.test('list of maps is valid', async () => {
    const validate = await loadSchema();
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Order',
      description: 'Order with line items',
      identity: { fields: ['orderId'] },
      fields: [
        { name: 'orderId', type: 'string', required: true },
        {
          name: 'lineItems',
          type: 'list',
          items: {
            type: 'map',
            fields: [
              { name: 'productId', type: 'string' },
              { name: 'quantity', type: 'number' },
            ],
          },
        },
      ],
    };
    const ok = validate(schema);
    if (!ok) console.error('Validation errors:', validate.errors);
    assert.equal(ok, true, 'List of maps should be valid');
  });

  await t.test('standalone map is valid', async () => {
    const validate = await loadSchema();
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Config',
      description: 'Config entity with map',
      identity: { fields: ['configId'] },
      fields: [
        { name: 'configId', type: 'string', required: true },
        {
          name: 'metadata',
          type: 'map',
          fields: [
            { name: 'source', type: 'string' },
            { name: 'version', type: 'number' },
          ],
        },
      ],
    };
    const ok = validate(schema);
    if (!ok) console.error('Validation errors:', validate.errors);
    assert.equal(ok, true, 'Standalone map should be valid');
  });

  await t.test('stringSet is valid', async () => {
    const validate = await loadSchema();
    const schema = {
      schemaVersion: '1.1',
      entityName: 'User',
      description: 'User with roles',
      identity: { fields: ['userId'] },
      fields: [
        { name: 'userId', type: 'string', required: true },
        { name: 'roles', type: 'stringSet' },
      ],
    };
    const ok = validate(schema);
    assert.equal(ok, true, 'stringSet should be valid');
  });

  await t.test('numberSet is valid', async () => {
    const validate = await loadSchema();
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Score',
      description: 'Score with tiers',
      identity: { fields: ['scoreId'] },
      fields: [
        { name: 'scoreId', type: 'string', required: true },
        { name: 'tiers', type: 'numberSet' },
      ],
    };
    const ok = validate(schema);
    assert.equal(ok, true, 'numberSet should be valid');
  });

  await t.test('list without items is rejected', async () => {
    const validate = await loadSchema();
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'tags', type: 'list' },
      ],
    };
    const ok = validate(schema);
    assert.equal(ok, false, 'List without items should be rejected');
  });

  await t.test('map without fields is rejected', async () => {
    const validate = await loadSchema();
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'metadata', type: 'map' },
      ],
    };
    const ok = validate(schema);
    assert.equal(ok, false, 'Map without fields should be rejected');
  });

  await t.test('list-of-list is rejected (no list in items type)', async () => {
    const validate = await loadSchema();
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'nested', type: 'list', items: { type: 'list' } },
      ],
    };
    const ok = validate(schema);
    assert.equal(ok, false, 'List-of-list should be rejected');
  });

  await t.test('collection type fixture passes validation', async () => {
    const validate = await loadSchema();
    const fixture = await loadFixture(
      'tests/fixtures/valid/order-with-collections.bprint'
    );
    const ok = validate(fixture);
    if (!ok) console.error('Validation errors:', validate.errors);
    assert.equal(ok, true, 'order-with-collections fixture should be valid');
  });
});

// Test suite for collection types - TypeScript validation
test('Collection Types - TypeScript Validation', async t => {
  const { validateSchema } = await import('../dist/src/index.js');

  await t.test('list of strings passes TS validation', async () => {
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity with list',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'tags', type: 'list', items: { type: 'string' } },
      ],
    };
    const validated = validateSchema(schema);
    assert.ok(validated, 'List of strings should pass TS validation');
    assert.equal(validated.fields[1].type, 'list');
    assert.equal(validated.fields[1].items.type, 'string');
  });

  await t.test(
    'list of maps passes TS validation with nested fields',
    async () => {
      const schema = {
        schemaVersion: '1.1',
        entityName: 'Order',
        description: 'Order entity',
        identity: { fields: ['orderId'] },
        fields: [
          { name: 'orderId', type: 'string', required: true },
          {
            name: 'addresses',
            type: 'list',
            items: {
              type: 'map',
              fields: [
                { name: 'street', type: 'string' },
                { name: 'city', type: 'string' },
                { name: 'zip', type: 'string' },
              ],
            },
          },
        ],
      };
      const validated = validateSchema(schema);
      assert.ok(validated, 'List of maps should pass TS validation');
      assert.equal(validated.fields[1].items.type, 'map');
      assert.equal(validated.fields[1].items.fields.length, 3);
      assert.equal(validated.fields[1].items.fields[0].name, 'street');
    }
  );

  await t.test('standalone map passes TS validation', async () => {
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Config',
      description: 'Config entity',
      identity: { fields: ['configId'] },
      fields: [
        { name: 'configId', type: 'string', required: true },
        {
          name: 'metadata',
          type: 'map',
          fields: [
            { name: 'source', type: 'string' },
            { name: 'version', type: 'number' },
          ],
        },
      ],
    };
    const validated = validateSchema(schema);
    assert.ok(validated, 'Map should pass TS validation');
    assert.equal(validated.fields[1].type, 'map');
    assert.equal(validated.fields[1].fields.length, 2);
  });

  await t.test('list without items is rejected by TS validation', async () => {
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'tags', type: 'list' },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /must include an 'items' definition/,
      'List without items should be rejected by TS validation'
    );
  });

  await t.test('map without fields is rejected by TS validation', async () => {
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'metadata', type: 'map' },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /must include a non-empty 'fields' array/,
      'Map without fields should be rejected by TS validation'
    );
  });

  await t.test('list-of-map without nested fields is rejected', async () => {
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'items', type: 'list', items: { type: 'map' } },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /must include a non-empty 'fields' array/,
      'List of map without fields should be rejected'
    );
  });

  await t.test('constraints on collection type are rejected', async () => {
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'tags',
          type: 'list',
          items: { type: 'string' },
          constraints: { minLength: 1 },
        },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /cannot have constraints/,
      'Constraints on list type should be rejected'
    );
  });

  await t.test('default on collection type is rejected', async () => {
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'roles', type: 'stringSet', default: 'admin' },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /cannot have a default value/,
      'Default on stringSet should be rejected'
    );
  });

  await t.test('enum on collection type is rejected', async () => {
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'data', type: 'numberSet', enum: ['a'] },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /cannot have enum values/,
      'Enum on numberSet should be rejected'
    );
  });

  await t.test('duplicate nested field names are rejected', async () => {
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'addr',
          type: 'map',
          fields: [
            { name: 'street', type: 'string' },
            { name: 'street', type: 'string' },
          ],
        },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /Duplicate nested field name/,
      'Duplicate nested field names should be rejected'
    );
  });

  await t.test('invalid nested field type is rejected', async () => {
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'addr',
          type: 'map',
          fields: [{ name: 'data', type: 'blob' }],
        },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /must have a valid type/,
      'Nested field with unsupported type should be rejected'
    );
  });

  await t.test('required field on collection type is valid', async () => {
    const schema = {
      schemaVersion: '1.1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'tags',
          type: 'list',
          items: { type: 'string' },
          required: true,
        },
        { name: 'roles', type: 'stringSet', required: true },
      ],
    };
    const validated = validateSchema(schema);
    assert.ok(validated, 'Required on collection types should be allowed');
    assert.equal(validated.fields[1].required, true);
    assert.equal(validated.fields[2].required, true);
  });
});

// Test suite for schema version validation
test('Schema Version Validation', async t => {
  const { validateSchema, SPEC_VERSION_PATTERN } =
    await import('../dist/src/index.js');

  await t.test('SPEC_VERSION_PATTERN is exported and valid', () => {
    assert.ok(SPEC_VERSION_PATTERN, 'SPEC_VERSION_PATTERN should be exported');
    assert.ok(SPEC_VERSION_PATTERN instanceof RegExp, 'Should be a RegExp');
    assert.ok(SPEC_VERSION_PATTERN.test('1.0'), 'Should match "1.0"');
    assert.ok(SPEC_VERSION_PATTERN.test('99.0'), 'Should match "99.0"');
    assert.ok(!SPEC_VERSION_PATTERN.test('abc'), 'Should not match "abc"');
  });

  await t.test('string schemaVersion "1.0" is accepted', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.schemaVersion, '1.0');
  });

  await t.test(
    'numeric schemaVersion 1.0 is coerced to "1.0" (backward compat)',
    () => {
      const schema = {
        schemaVersion: 1.0,
        entityName: 'Test',
        description: 'Test entity',
        identity: { fields: ['id'] },
        fields: [{ name: 'id', type: 'string', required: true }],
      };
      const validated = validateSchema(schema);
      assert.equal(validated.schemaVersion, '1.0');
    }
  );

  await t.test(
    'numeric schemaVersion 1.1 is coerced to "1.1" (backward compat)',
    () => {
      const schema = {
        schemaVersion: 1.1,
        entityName: 'Test',
        description: 'Test entity',
        identity: { fields: ['id'] },
        fields: [{ name: 'id', type: 'string', required: true }],
      };
      const validated = validateSchema(schema);
      assert.equal(validated.schemaVersion, '1.1');
    }
  );

  await t.test('any valid "major.minor" schemaVersion is accepted', () => {
    const schema = {
      schemaVersion: '99.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    const validated = validateSchema(schema);
    assert.equal(
      validated.schemaVersion,
      '99.0',
      'Any valid major.minor version should be accepted'
    );
  });

  await t.test('invalid format "1" is rejected', () => {
    const schema = {
      schemaVersion: '1',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.throws(
      () => validateSchema(schema),
      /Invalid schemaVersion format/,
      'Should reject version without minor component'
    );
  });

  await t.test('invalid format "1.0.0" is rejected', () => {
    const schema = {
      schemaVersion: '1.0.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.throws(
      () => validateSchema(schema),
      /Invalid schemaVersion format/,
      'Should reject semver-style version'
    );
  });

  await t.test('invalid format "abc" is rejected', () => {
    const schema = {
      schemaVersion: 'abc',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.throws(
      () => validateSchema(schema),
      /Invalid schemaVersion format/,
      'Should reject non-numeric version string'
    );
  });

  await t.test('missing schemaVersion is rejected', () => {
    const schema = {
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.throws(
      () => validateSchema(schema),
      /schemaVersion/,
      'Should reject missing schemaVersion'
    );
  });

  await t.test('collection types are accepted at any schemaVersion', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'tags', type: 'list', items: { type: 'string' } },
      ],
    };
    const validated = validateSchema(schema);
    assert.ok(
      validated,
      'Collection types should be accepted at any valid schemaVersion'
    );
  });
});

// Test suite for recursive nested maps
test('Recursive Nested Maps - JSON Schema Validation', async t => {
  await t.test('nested map fixture passes JSON schema validation', async () => {
    const validate = await loadSchema();
    const fixture = await loadFixture(
      'tests/fixtures/valid/order-with-nested-maps.bprint'
    );
    const ok = validate(fixture);
    if (!ok) {
      console.error('Validation errors:', validate.errors);
    }
    assert.equal(
      ok,
      true,
      'Nested maps fixture should pass JSON schema validation'
    );
  });

  await t.test(
    'deeply nested maps fixture passes JSON schema validation',
    async () => {
      const validate = await loadSchema();
      const fixture = await loadFixture(
        'tests/fixtures/valid/deeply-nested-maps.bprint'
      );
      const ok = validate(fixture);
      assert.equal(
        ok,
        true,
        'Deeply nested maps should pass JSON schema validation'
      );
    }
  );
});

test('Recursive Nested Maps - TypeScript Validation', async t => {
  const { validateSchema } = await import('../dist/src/index.js');

  await t.test('map containing a map (2 levels) passes validation', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'address',
          type: 'map',
          fields: [
            { name: 'street', type: 'string' },
            {
              name: 'coordinates',
              type: 'map',
              fields: [
                { name: 'lat', type: 'number' },
                { name: 'lng', type: 'number' },
              ],
            },
          ],
        },
      ],
    };
    const validated = validateSchema(schema);
    assert.ok(validated, 'Map in map should pass validation');
    assert.equal(validated.fields[1].fields[1].type, 'map');
    assert.equal(validated.fields[1].fields[1].fields.length, 2);
    assert.equal(validated.fields[1].fields[1].fields[0].name, 'lat');
  });

  await t.test(
    'map containing a list of maps (2 levels) passes validation',
    () => {
      const schema = {
        schemaVersion: '1.0',
        entityName: 'Test',
        description: 'Test entity',
        identity: { fields: ['id'] },
        fields: [
          { name: 'id', type: 'string', required: true },
          {
            name: 'profile',
            type: 'map',
            fields: [
              { name: 'name', type: 'string' },
              {
                name: 'previousAddresses',
                type: 'list',
                items: {
                  type: 'map',
                  fields: [
                    { name: 'street', type: 'string' },
                    { name: 'city', type: 'string' },
                  ],
                },
              },
            ],
          },
        ],
      };
      const validated = validateSchema(schema);
      assert.ok(validated, 'Map with list of maps should pass validation');
      assert.equal(validated.fields[1].fields[1].type, 'list');
      assert.equal(validated.fields[1].fields[1].items.type, 'map');
      assert.equal(validated.fields[1].fields[1].items.fields.length, 2);
    }
  );

  await t.test('map > map > map (3 levels) passes validation', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'level1',
          type: 'map',
          fields: [
            {
              name: 'level2',
              type: 'map',
              fields: [
                {
                  name: 'level3',
                  type: 'map',
                  fields: [{ name: 'value', type: 'string' }],
                },
              ],
            },
          ],
        },
      ],
    };
    const validated = validateSchema(schema);
    assert.ok(validated, 'Three levels of nested maps should pass validation');
    assert.equal(
      validated.fields[1].fields[0].fields[0].fields[0].name,
      'value'
    );
  });

  await t.test('list of maps containing nested maps passes validation', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'items',
          type: 'list',
          items: {
            type: 'map',
            fields: [
              { name: 'name', type: 'string' },
              {
                name: 'metadata',
                type: 'map',
                fields: [
                  { name: 'key', type: 'string' },
                  { name: 'value', type: 'string' },
                ],
              },
            ],
          },
        },
      ],
    };
    const validated = validateSchema(schema);
    assert.ok(
      validated,
      'List of maps with nested maps should pass validation'
    );
    assert.equal(validated.fields[1].items.fields[1].type, 'map');
    assert.equal(validated.fields[1].items.fields[1].fields.length, 2);
  });

  await t.test('nested list within a map passes validation', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'container',
          type: 'map',
          fields: [
            { name: 'label', type: 'string' },
            {
              name: 'tags',
              type: 'list',
              items: { type: 'string' },
            },
          ],
        },
      ],
    };
    const validated = validateSchema(schema);
    assert.ok(
      validated,
      'Nested list of scalars within a map should pass validation'
    );
    assert.equal(validated.fields[1].fields[1].type, 'list');
    assert.equal(validated.fields[1].fields[1].items.type, 'string');
  });

  await t.test(
    'deeply nested maps (6+ levels) pass validation with no depth limit',
    async () => {
      const fixture = await loadFixture(
        'tests/fixtures/valid/deeply-nested-maps.bprint'
      );
      const validated = validateSchema(fixture);
      assert.ok(
        validated,
        'Deeply nested maps should pass TS validation -- no depth limit enforced'
      );
      assert.equal(validated.entityName, 'TooDeep');
    }
  );

  await t.test('nested map without fields is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'container',
          type: 'map',
          fields: [{ name: 'nested', type: 'map' }],
        },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /must include a non-empty 'fields' array/,
      'Nested map without fields should be rejected'
    );
  });

  await t.test('nested list without items is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'container',
          type: 'map',
          fields: [{ name: 'nested', type: 'list' }],
        },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /must include an 'items' definition/,
      'Nested list without items should be rejected'
    );
  });

  await t.test(
    'nested maps fixture passes full TypeScript validation',
    async () => {
      const fixture = await loadFixture(
        'tests/fixtures/valid/order-with-nested-maps.bprint'
      );
      const validated = validateSchema(fixture);
      assert.ok(validated, 'Nested maps fixture should pass TS validation');
      assert.equal(validated.entityName, 'Order');
      const shipping = validated.fields[1];
      assert.equal(shipping.name, 'shippingAddress');
      assert.equal(shipping.type, 'map');
      const coords = shipping.fields[2];
      assert.equal(coords.name, 'coordinates');
      assert.equal(coords.type, 'map');
      assert.equal(coords.fields[0].name, 'lat');
      const history = shipping.fields[3];
      assert.equal(history.name, 'history');
      assert.equal(history.type, 'list');
      assert.equal(history.items.type, 'map');
      const innerAddress = history.items.fields[1];
      assert.equal(innerAddress.name, 'address');
      assert.equal(innerAddress.type, 'map');
      assert.equal(innerAddress.fields[0].name, 'street');
    }
  );
});

// Test suite for identity validation
test('Identity Validation', async t => {
  const { validateSchema } = await import('../dist/src/index.js');

  await t.test(
    'identity referential integrity - field not in fields array',
    () => {
      const schema = {
        schemaVersion: '1.0',
        entityName: 'Test',
        description: 'Test entity',
        identity: { fields: ['nonExistentField'] },
        fields: [{ name: 'id', type: 'string', required: true }],
      };
      assert.throws(
        () => validateSchema(schema),
        /Identity field 'nonExistentField' does not exist in the fields array/,
        'Should reject identity field not present in fields'
      );
    }
  );

  await t.test('duplicate identity field is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id', 'id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.throws(
      () => validateSchema(schema),
      /Duplicate identity field: id/,
      'Should reject duplicate identity field'
    );
  });

  await t.test('empty identity fields array is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: [] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.throws(
      () => validateSchema(schema),
      /Identity must include a non-empty fields array/,
      'Should reject empty identity fields'
    );
  });

  await t.test('single identity field is accepted', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    const validated = validateSchema(schema);
    assert.deepStrictEqual(validated.identity.fields, ['id']);
  });

  await t.test('composite identity (2 fields) is accepted', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['tenantId', 'itemId'] },
      fields: [
        { name: 'tenantId', type: 'string', required: true },
        { name: 'itemId', type: 'string', required: true },
        { name: 'data', type: 'string' },
      ],
    };
    const validated = validateSchema(schema);
    assert.deepStrictEqual(validated.identity.fields, ['tenantId', 'itemId']);
  });
});

// Test suite for type-matched enum validation
test('Type-Matched Enum Validation', async t => {
  const { validateSchema } = await import('../dist/src/index.js');

  await t.test('numeric enum on number.int field passes', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'priority', type: 'number.int', enum: [1, 2, 3] },
      ],
    };
    const validated = validateSchema(schema);
    assert.deepStrictEqual(validated.fields[1].enum, [1, 2, 3]);
  });

  await t.test('string enum on number field is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'priority', type: 'number', enum: ['high', 'low'] },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /enum contains non-numeric value/,
      'Should reject string enum on number field'
    );
  });

  await t.test('numeric enum on string field is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'status', type: 'string', enum: [1, 2, 3] },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /enum contains non-string value/,
      'Should reject numeric enum on string field'
    );
  });

  await t.test('string enum on string field passes', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'status', type: 'string', enum: ['active', 'inactive'] },
      ],
    };
    const validated = validateSchema(schema);
    assert.deepStrictEqual(validated.fields[1].enum, ['active', 'inactive']);
  });

  await t.test('numeric enum on bare number field passes', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'level', type: 'number', enum: [100, 200, 300] },
      ],
    };
    const validated = validateSchema(schema);
    assert.deepStrictEqual(validated.fields[1].enum, [100, 200, 300]);
  });
});

// Test suite for entityName PascalCase validation
test('entityName PascalCase Validation', async t => {
  const { validateSchema } = await import('../dist/src/index.js');

  await t.test('PascalCase entityName passes', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'OrderItem',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.entityName, 'OrderItem');
  });

  await t.test('single uppercase word passes', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'User',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.entityName, 'User');
  });

  await t.test('lowercase entityName is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'order',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.throws(
      () => validateSchema(schema),
      /not a valid type name/,
      'Lowercase entityName should be rejected'
    );
  });

  await t.test('dotted entityName is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'my.entity',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.throws(
      () => validateSchema(schema),
      /not a valid type name/,
      'Dotted entityName should be rejected'
    );
  });

  await t.test('entityName with hyphen is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Order-Item',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.throws(
      () => validateSchema(schema),
      /not a valid type name/,
      'Hyphenated entityName should be rejected'
    );
  });

  await t.test('entityName conflicting with reserved word is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Class',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.throws(
      () => validateSchema(schema),
      /reserved keyword/,
      'entityName that conflicts with reserved word should be rejected'
    );
  });

  await t.test('entityName PascalCase in JSON schema', async () => {
    const validate = await loadSchema();
    const valid = {
      schemaVersion: '1.0',
      entityName: 'Customer',
      description: 'Test',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.equal(
      validate(valid),
      true,
      'PascalCase entityName should pass JSON schema'
    );

    const invalid = {
      schemaVersion: '1.0',
      entityName: 'customer',
      description: 'Test',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };
    assert.equal(
      validate(invalid),
      false,
      'Lowercase entityName should fail JSON schema'
    );
  });
});

// Test suite for field name reserved word check
test('Field Name Reserved Word Check', async t => {
  const { validateSchema } = await import('../dist/src/index.js');

  await t.test('field named "class" without nameOverride is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'class', type: 'string' },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /reserved keyword.*nameOverride/,
      'Reserved field name without nameOverride should be rejected'
    );
  });

  await t.test('field named "type" without nameOverride is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'type', type: 'string' },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /reserved keyword.*nameOverride/,
      'Reserved field name "type" without nameOverride should be rejected'
    );
  });

  await t.test('field named "class" WITH nameOverride is accepted', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'class', nameOverride: 'classType', type: 'string' },
      ],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.fields[1].name, 'class');
    assert.equal(validated.fields[1].nameOverride, 'classType');
  });

  await t.test('non-reserved field name is accepted', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'customerId', type: 'string' },
      ],
    };
    const validated = validateSchema(schema);
    assert.ok(validated, 'Non-reserved field name should pass');
  });
});

// Test suite for nested field enum type matching
test('Nested Field Enum Type Matching', async t => {
  const { validateSchema } = await import('../dist/src/index.js');

  await t.test('string enum on nested string field passes', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'address',
          type: 'map',
          fields: [{ name: 'state', type: 'string', enum: ['CA', 'NY', 'TX'] }],
        },
      ],
    };
    const validated = validateSchema(schema);
    assert.deepStrictEqual(validated.fields[1].fields[0].enum, [
      'CA',
      'NY',
      'TX',
    ]);
  });

  await t.test('numeric enum on nested number field passes', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'config',
          type: 'map',
          fields: [{ name: 'level', type: 'number', enum: [1, 2, 3] }],
        },
      ],
    };
    const validated = validateSchema(schema);
    assert.deepStrictEqual(validated.fields[1].fields[0].enum, [1, 2, 3]);
  });

  await t.test('string enum on nested number field is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'config',
          type: 'map',
          fields: [{ name: 'level', type: 'number', enum: ['high', 'low'] }],
        },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /enum contains non-numeric value/,
      'String enum on nested number field should be rejected'
    );
  });

  await t.test('numeric enum on nested string field is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'config',
          type: 'map',
          fields: [{ name: 'region', type: 'string', enum: [1, 2, 3] }],
        },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /enum contains non-string value/,
      'Numeric enum on nested string field should be rejected'
    );
  });

  await t.test('empty enum on nested field is rejected', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'config',
          type: 'map',
          fields: [{ name: 'mode', type: 'string', enum: [] }],
        },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /enum must be a non-empty array/,
      'Empty enum on nested field should be rejected'
    );
  });
});

// Test suite for nullable property
test('Nullable Property', async t => {
  const { validateSchema } = await import('../dist/src/index.js');

  await t.test('nullable field is accepted', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'middleName', type: 'string', nullable: true },
      ],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.fields[1].nullable, true);
  });

  await t.test('nullable defaults to false', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'email', type: 'string' },
      ],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.fields[1].nullable, false);
  });

  await t.test('identity field cannot be nullable', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true, nullable: true }],
    };
    assert.throws(
      () => validateSchema(schema),
      /Identity field 'id' cannot be nullable/,
      'Nullable identity field should be rejected'
    );
  });

  await t.test('nullable on number.int field is accepted', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'score', type: 'number.int', nullable: true },
      ],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.fields[1].nullable, true);
    assert.equal(validated.fields[1].type, 'number.int');
  });

  await t.test('nullable on nested field is accepted', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'profile',
          type: 'map',
          fields: [{ name: 'bio', type: 'string', nullable: true }],
        },
      ],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.fields[1].fields[0].nullable, true);
  });

  await t.test('nullable in JSON schema is accepted', async () => {
    const validate = await loadSchema();
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'optField', type: 'string', nullable: true },
      ],
    };
    const ok = validate(schema);
    if (!ok) console.error('Validation errors:', validate.errors);
    assert.equal(ok, true, 'Nullable field should pass JSON schema');
  });
});

// Test suite for binary type
test('Binary Type', async t => {
  const { validateSchema } = await import('../dist/src/index.js');

  await t.test('binary field is accepted', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Document',
      description: 'Document entity',
      identity: { fields: ['docId'] },
      fields: [
        { name: 'docId', type: 'string', required: true },
        { name: 'content', type: 'binary' },
      ],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.fields[1].type, 'binary');
  });

  await t.test('binary field cannot have default', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'data', type: 'binary', default: 'abc' },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /cannot have a default value/,
      'Binary field with default should be rejected'
    );
  });

  await t.test('binary field cannot have enum', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'data', type: 'binary', enum: ['a', 'b'] },
      ],
    };
    assert.throws(
      () => validateSchema(schema),
      /cannot have enum values/,
      'Binary field with enum should be rejected'
    );
  });

  await t.test('binary can be nullable', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'avatar', type: 'binary', nullable: true },
      ],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.fields[1].type, 'binary');
    assert.equal(validated.fields[1].nullable, true);
  });

  await t.test('binary in JSON schema is accepted', async () => {
    const validate = await loadSchema();
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        { name: 'payload', type: 'binary' },
      ],
    };
    const ok = validate(schema);
    if (!ok) console.error('Validation errors:', validate.errors);
    assert.equal(ok, true, 'Binary type should pass JSON schema');
  });

  await t.test('binary as nested field type is accepted', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'attachment',
          type: 'map',
          fields: [
            { name: 'fileName', type: 'string' },
            { name: 'data', type: 'binary' },
          ],
        },
      ],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.fields[1].fields[1].type, 'binary');
  });

  await t.test('binary as list item type is accepted', () => {
    const schema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test entity',
      identity: { fields: ['id'] },
      fields: [
        { name: 'id', type: 'string', required: true },
        {
          name: 'chunks',
          type: 'list',
          items: { type: 'binary' },
        },
      ],
    };
    const validated = validateSchema(schema);
    assert.equal(validated.fields[1].items.type, 'binary');
  });
});

// Cleanup after tests
test.after(async () => {
  resetSchema();
});
