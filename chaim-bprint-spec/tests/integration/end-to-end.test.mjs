import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadSchema } from '../../scripts/utils/schema-loader.mjs';
import {
  validateCustomRules,
  countEntitiesAndFields,
} from '../../scripts/utils/validation-helpers.mjs';

/**
 * Integration test that demonstrates the full validation workflow
 */
test('End-to-End Validation Workflow', async t => {
  await t.test('complete validation workflow with real examples', async () => {
    // 1. Load schema
    const validate = await loadSchema();

    // 2. Test a complex valid example
    const productsExample = JSON.parse(
      await readFile('tests/fixtures/valid/products.bprint', 'utf8')
    );

    // 3. Validate against JSON Schema
    const schemaValid = validate(productsExample);
    assert.equal(
      schemaValid,
      true,
      'Products example should pass schema validation'
    );

    // 4. Apply custom business rules
    const customErrors = validateCustomRules(productsExample);
    assert.equal(
      customErrors.length,
      0,
      'Products example should pass custom validation'
    );

    // 5. Count entities and fields
    const { entityCount, fieldCount } = countEntitiesAndFields(productsExample);
    assert.equal(entityCount, 1, 'Should have 1 entity');
    assert.equal(fieldCount, 7, 'Should have 7 fields');

    // 6. Verify description is present
    assert.ok(productsExample.description, 'Should have description');
    assert.equal(productsExample.description, 'Product catalog schema');

    // 7. Verify complex field types
    const tagsField = productsExample.fields.find(f => f.name === 'tags');
    assert.ok(tagsField.enum, 'Tags field should have enum values');
    assert.deepEqual(tagsField.enum, ['electronics', 'clothing', 'books']);
  });

  await t.test('validation rejects invalid schemas appropriately', async () => {
    const validate = await loadSchema();

    // Test invalid enum
    const invalidEnumExample = JSON.parse(
      await readFile('tests/fixtures/invalid/invalid-enum.bprint', 'utf8')
    );

    const isValid = validate(invalidEnumExample);
    assert.equal(isValid, false, 'Invalid enum should be rejected');

    // Test missing identity fields
    const missingKeyExample = JSON.parse(
      await readFile(
        'tests/fixtures/invalid/missing-identity-fields.bprint',
        'utf8'
      )
    );

    const isKeyValid = validate(missingKeyExample);
    assert.equal(
      isKeyValid,
      false,
      'Missing identity fields should be rejected'
    );
  });

  await t.test(
    'custom validation rules catch business logic errors',
    async () => {
      // Test duplicate field names
      const duplicateFields = {
        schemaVersion: '1.0',
        entityName: 'test',
        description: 'Test with duplicate fields',
        identity: { fields: ['id'] },
        fields: [
          { name: 'id', type: 'string', required: true },
          { name: 'id', type: 'string', required: true },
        ],
      };

      const fieldErrors = validateCustomRules(duplicateFields);
      assert.ok(fieldErrors.length > 0, 'Should detect duplicate field names');
      assert.ok(
        fieldErrors.some(
          e => e.message && e.message.includes('Duplicate field name')
        ),
        'Should have duplicate field error'
      );
    }
  );

  await t.test('field constraints are validated correctly', async () => {
    // Import the TypeScript validation function
    const { validateSchema } = await import('../../dist/src/index.js');

    // Test valid schema with constraints
    const constrainedSchema = JSON.parse(
      await readFile(
        'tests/fixtures/valid/user-with-constraints.bprint',
        'utf8'
      )
    );

    // Should not throw - validates with constraints
    const validated = validateSchema(constrainedSchema);
    assert.ok(validated, 'Schema with constraints should pass validation');
    assert.equal(validated.fields.length, 9, 'Should have 9 fields');

    // Verify constraints are preserved
    const emailField = validated.fields.find(f => f.name === 'email');
    assert.ok(emailField.constraints, 'Email field should have constraints');
    assert.equal(emailField.constraints.minLength, 5);
    assert.equal(emailField.constraints.maxLength, 254);

    const ageField = validated.fields.find(f => f.name === 'age');
    assert.equal(ageField.constraints.min, 0);
    assert.equal(ageField.constraints.max, 150);

    // Test invalid constraint: string constraint on number field
    const invalidStringConstraint = JSON.parse(
      await readFile(
        'tests/fixtures/invalid/invalid-string-constraint-on-number.bprint',
        'utf8'
      )
    );

    assert.throws(
      () => validateSchema(invalidStringConstraint),
      /minLength constraint but is not a string type/,
      'Should reject string constraint on number field'
    );

    // Test invalid constraint: number constraint on string field
    const invalidNumberConstraint = JSON.parse(
      await readFile(
        'tests/fixtures/invalid/invalid-number-constraint-on-string.bprint',
        'utf8'
      )
    );

    assert.throws(
      () => validateSchema(invalidNumberConstraint),
      /min constraint but is not a number type/,
      'Should reject number constraint on string field'
    );

    // Test invalid: min > max
    const invalidMinMax = JSON.parse(
      await readFile(
        'tests/fixtures/invalid/invalid-min-greater-than-max.bprint',
        'utf8'
      )
    );

    assert.throws(
      () => validateSchema(invalidMinMax),
      /min.*cannot be greater than max/,
      'Should reject min > max'
    );

    // Test invalid: minLength > maxLength
    const invalidMinMaxLength = JSON.parse(
      await readFile(
        'tests/fixtures/invalid/invalid-minlength-greater-than-maxlength.bprint',
        'utf8'
      )
    );

    assert.throws(
      () => validateSchema(invalidMinMaxLength),
      /minLength.*cannot be greater than maxLength/,
      'Should reject minLength > maxLength'
    );

    // Test invalid: bad regex pattern
    const invalidRegex = JSON.parse(
      await readFile(
        'tests/fixtures/invalid/invalid-regex-pattern.bprint',
        'utf8'
      )
    );

    assert.throws(
      () => validateSchema(invalidRegex),
      /pattern is not a valid regular expression/,
      'Should reject invalid regex pattern'
    );
  });

  await t.test('schema loading and caching works correctly', async () => {
    // Test that schema is properly cached
    const validate1 = await loadSchema();
    const validate2 = await loadSchema();

    // Both should be the same function instance (cached)
    assert.strictEqual(
      validate1,
      validate2,
      'Schema should be cached between calls'
    );

    // Test validation works with cached schema
    const testSchema = {
      schemaVersion: '1.0',
      entityName: 'Test',
      description: 'Test schema',
      identity: { fields: ['id'] },
      fields: [{ name: 'id', type: 'string', required: true }],
    };

    const isValid = validate1(testSchema);
    assert.equal(isValid, true, 'Cached schema should work correctly');
  });

  await t.test(
    'nested maps fixture passes full end-to-end validation',
    async () => {
      const fixture = JSON.parse(
        await readFile(
          'tests/fixtures/valid/order-with-nested-maps.bprint',
          'utf8'
        )
      );
      const validate = await loadSchema();
      const jsonSchemaValid = validate(fixture);
      assert.equal(
        jsonSchemaValid,
        true,
        'Nested maps fixture should pass JSON schema validation'
      );

      const { validateSchema } = await import('../../dist/src/index.js');
      const validated = validateSchema(fixture);
      assert.ok(
        validated,
        'Nested maps fixture should pass TypeScript validation'
      );
      assert.equal(validated.entityName, 'Order');
      const shipping = validated.fields[1];
      assert.equal(shipping.name, 'shippingAddress');
      assert.equal(shipping.fields[2].type, 'map');
      assert.equal(shipping.fields[3].type, 'list');
    }
  );
});
