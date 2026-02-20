import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import { ChaimDynamoDBBinder } from '../../src/binders/chaim-dynamodb-binder';
import { ChaimCredentials } from '../../src/types/credentials';
import { TableBindingConfig } from '../../src/types/table-binding-config';

// Mock schema service — includes pk in fields so field validation passes
vi.mock('../../src/services/schema-service', () => ({
  SchemaService: {
    readSchema: vi.fn((schemaPath: string) => ({
      schemaVersion: '1.0',
      entityName: schemaPath.includes('entity1') ? 'Entity1' : 'Entity2',
      namespace: schemaPath.includes('entity1') ? 'test.entity1' : 'test.entity2',
      identity: { fields: ['pk'] },
      fields: [
        { name: 'pk', type: 'string', required: true },
        { name: 'id', type: 'string', required: true },
      ],
    })),
  },
}));

describe('Table Consistency Validation', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let table: dynamodb.Table;
  const testAssetDirs: string[] = [];

  // Helper to create asset directory
  function ensureAssetDir(stackName: string, resourceId: string): string {
    const cdkRoot = process.cwd();
    const assetDir = path.join(cdkRoot, 'cdk.out', 'chaim', 'assets', stackName, resourceId);
    fs.mkdirSync(assetDir, { recursive: true });
    
    fs.writeFileSync(path.join(assetDir, 'index.js'), 'exports.handler = async () => {};', 'utf-8');
    fs.writeFileSync(path.join(assetDir, 'snapshot.json'), '{}', 'utf-8');
    
    testAssetDirs.push(assetDir);
    return assetDir;
  }

  afterAll(() => {
    for (const dir of testAssetDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    table = new dynamodb.Table(stack, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
    });
  });

  it('should allow multiple bindings with same config object', () => {
    ensureAssetDir('TestStack', 'Table__Entity1');
    ensureAssetDir('TestStack', 'Table__Entity2');
    
    const config = new TableBindingConfig(
      'my-app',
      ChaimCredentials.fromApiKeys('key', 'secret')
    );

    expect(() => {
      new ChaimDynamoDBBinder(stack, 'Binding1', {
        schemaPath: './schemas/entity1.bprint',
        table,
        config, // Same object
      });

      new ChaimDynamoDBBinder(stack, 'Binding2', {
        schemaPath: './schemas/entity2.bprint',
        table,
        config, // Same object
      });
    }).not.toThrow();
  });

  it('should reject different appId for same table', () => {
    ensureAssetDir('TestStack', 'Table__Entity1');
    ensureAssetDir('TestStack', 'Table__Entity2');
    
    const config1 = new TableBindingConfig(
      'app-1',
      ChaimCredentials.fromApiKeys('key', 'secret')
    );

    const config2 = new TableBindingConfig(
      'app-2', // Different!
      ChaimCredentials.fromApiKeys('key', 'secret')
    );

    new ChaimDynamoDBBinder(stack, 'Binding1', {
      schemaPath: './schemas/entity1.bprint',
      table,
      config: config1,
    });

    expect(() => {
      new ChaimDynamoDBBinder(stack, 'Binding2', {
        schemaPath: './schemas/entity2.bprint',
        table,
        config: config2,
      });
    }).toThrow(/Configuration conflict[\s\S]*appId/);
  });

  it('should reject different credentials for same table', () => {
    ensureAssetDir('TestStack', 'Table__Entity1');
    ensureAssetDir('TestStack', 'Table__Entity2');
    
    const config1 = new TableBindingConfig(
      'my-app',
      ChaimCredentials.fromApiKeys('key1', 'secret1')
    );

    const config2 = new TableBindingConfig(
      'my-app',
      ChaimCredentials.fromApiKeys('key2', 'secret2') // Different!
    );

    new ChaimDynamoDBBinder(stack, 'Binding1', {
      schemaPath: './schemas/entity1.bprint',
      table,
      config: config1,
    });

    expect(() => {
      new ChaimDynamoDBBinder(stack, 'Binding2', {
        schemaPath: './schemas/entity2.bprint',
        table,
        config: config2,
      });
    }).toThrow(/Configuration conflict[\s\S]*credentials/);
  });

  it('should allow bindings to different tables with different configs', () => {
    const table1 = new dynamodb.Table(stack, 'Table1', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
    });

    const table2 = new dynamodb.Table(stack, 'Table2', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
    });

    ensureAssetDir('TestStack', 'Table1__Entity1');
    ensureAssetDir('TestStack', 'Table2__Entity2');

    const config1 = new TableBindingConfig(
      'app-1',
      ChaimCredentials.fromApiKeys('key1', 'secret1')
    );

    const config2 = new TableBindingConfig(
      'app-2',
      ChaimCredentials.fromApiKeys('key2', 'secret2')
    );

    expect(() => {
      new ChaimDynamoDBBinder(stack, 'Binding1', {
        schemaPath: './schemas/entity1.bprint',
        table: table1, // Different table
        config: config1,
      });

      new ChaimDynamoDBBinder(stack, 'Binding2', {
        schemaPath: './schemas/entity2.bprint',
        table: table2, // Different table
        config: config2, // Different config is fine
      });
    }).not.toThrow();
  });

  it('should allow same config with different tables', () => {
    const table1 = new dynamodb.Table(stack, 'Table1', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
    });

    const table2 = new dynamodb.Table(stack, 'Table2', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
    });

    ensureAssetDir('TestStack', 'Table1__Entity1');
    ensureAssetDir('TestStack', 'Table2__Entity2');

    const sharedConfig = new TableBindingConfig(
      'same-app',
      ChaimCredentials.fromApiKeys('key', 'secret')
    );

    expect(() => {
      new ChaimDynamoDBBinder(stack, 'Binding1', {
        schemaPath: './schemas/entity1.bprint',
        table: table1,
        config: sharedConfig,
      });

      new ChaimDynamoDBBinder(stack, 'Binding2', {
        schemaPath: './schemas/entity2.bprint',
        table: table2,
        config: sharedConfig, // Same config, different tables is OK
      });
    }).not.toThrow();
  });
});
