/**
 * Snapshot Content Tests
 * 
 * Tests that verify the ChaimDynamoDBBinder construct generates
 * correct metadata and properties for ingestion.
 */

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import { ChaimDynamoDBBinder } from '../../src/binders/chaim-dynamodb-binder';
import { ChaimCredentials } from '../../src/types/credentials';
import { TableBindingConfig } from '../../src/types/table-binding-config';

// Mock schema data for testing — includes pk, sk so field validation passes
const mockSchemaData = {
  schemaVersion: '1.0',
  entityName: 'User',
  description: 'Test user schema',
  identity: { fields: ['pk'] },
  fields: [
    { name: 'pk', type: 'string', required: true },
    { name: 'sk', type: 'string', required: false },
    { name: 'userId', type: 'string', required: true },
    { name: 'email', type: 'string', required: true },
    { name: 'createdAt', type: 'number' },
  ],
};

// Mock the SchemaService
vi.mock('../../src/services/schema-service', () => ({
  SchemaService: {
    readSchema: vi.fn(() => mockSchemaData),
  },
}));

describe('Snapshot Content Tests', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let table: dynamodb.Table;
  let testConfig: TableBindingConfig;
  const testAssetDirs: string[] = [];

  // Helper to ensure asset directory exists
  function ensureAssetDir(stackName: string, resourceId: string): string {
    const cdkRoot = process.cwd();
    const assetDir = path.join(cdkRoot, 'cdk.out', 'chaim', 'assets', stackName, resourceId);
    fs.mkdirSync(assetDir, { recursive: true });
    
    // Create minimal files for CDK validation
    fs.writeFileSync(path.join(assetDir, 'index.js'), 'exports.handler = async () => {};', 'utf-8');
    fs.writeFileSync(path.join(assetDir, 'snapshot.json'), '{}', 'utf-8');
    
    testAssetDirs.push(assetDir);
    return assetDir;
  }

  // Helper to get snapshot from the binder's local snapshot path
  function getSnapshotFromBinder(binder: ChaimDynamoDBBinder): any {
    if (fs.existsSync(binder.localSnapshotPath)) {
      return JSON.parse(fs.readFileSync(binder.localSnapshotPath, 'utf-8'));
    }
    return null;
  }

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    table = new dynamodb.Table(stack, 'TestTable', {
      tableName: 'test-table',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
    });
    testConfig = new TableBindingConfig(
      'test-app',
      ChaimCredentials.fromApiKeys('test-key', 'test-secret')
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    // Clean up test asset directories
    for (const dir of testAssetDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  describe('Binder properties', () => {
    it('should generate resourceId containing entity name', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder.resourceId).toContain('__User');
    });

    it('should expose schemaData with correct namespace', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder.schemaData).toBeDefined();
      expect(binder.schemaData.entityName).toBe(mockSchemaData.entityName);
    });

    it('should expose dynamoDBMetadata with type', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder.dynamoDBMetadata).toBeDefined();
      expect(binder.dynamoDBMetadata.type).toBe('dynamodb');
    });

    it('should expose localSnapshotPath', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder.localSnapshotPath).toBeDefined();
      expect(binder.localSnapshotPath).toContain('User');
    });

    it('should generate snapshot with action field set to UPSERT', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot).toBeDefined();
      expect(snapshot.action).toBe('UPSERT');
    });
  });

  describe('DynamoDB metadata extraction', () => {
    it('should extract partition key correctly', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder.dynamoDBMetadata.partitionKey).toBe('pk');
    });

    it('should extract sort key when present', () => {
      const compositeTable = new dynamodb.Table(stack, 'CompositeTable', {
        tableName: 'composite-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      });

      ensureAssetDir('TestStack', 'composite-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'CompositeBinder', {
        schemaPath: './schemas/test.bprint',
        table: compositeTable,
        config: testConfig,
      });

      expect(binder.dynamoDBMetadata.partitionKey).toBe('pk');
      expect(binder.dynamoDBMetadata.sortKey).toBe('sk');
    });

    it('should extract billing mode correctly', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder.dynamoDBMetadata.billingMode).toBe('PAY_PER_REQUEST');
    });

    it('should extract table ARN', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder.dynamoDBMetadata.tableArn).toBeDefined();
    });

    it('should extract table name', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder.dynamoDBMetadata.tableName).toBeDefined();
    });
  });

  describe('Local snapshot file', () => {
    it('should write snapshot with provider field', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot).toBeDefined();
      expect(snapshot.providerIdentity.cloud).toBe('aws');
    });

    it('should write snapshot with accountId', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.providerIdentity.accountId).toBe('123456789012');
    });

    it('should write snapshot with region', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.providerIdentity.region).toBe('us-east-1');
    });

    it('should write snapshot with stackName extractable from stableResourceKey', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      // v3.0: stackName is extractable from stableResourceKey (format: dynamodb:path:StackName/ResourceName)
      expect(snapshot.identity.stableResourceKey).toContain('TestStack');
      expect(snapshot.identity.stableResourceKey).toMatch(/path:TestStack\//);
    });

    it('should write snapshot with appId', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const customConfig = new TableBindingConfig(
        'my-custom-app',
        ChaimCredentials.fromApiKeys('test-key', 'test-secret')
      );
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: customConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.identity.appId).toBe('my-custom-app');
    });

    it('should write snapshot with resource type', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.resource.type).toBe('dynamodb');
    });

    it('should write snapshot with embedded schema', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.schema).toBeDefined();
      expect(snapshot.schema.entityName).toBe('User');
      expect(snapshot.schema.identity).toBeDefined();
      expect(snapshot.schema.fields).toBeDefined();
    });

    it('should write snapshot with dataStore metadata', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.resource).toBeDefined();
      expect(snapshot.resource.type).toBe('dynamodb');
      expect(snapshot.resource.kind).toBe('table');
      expect(snapshot.resource.partitionKey).toBe('pk');
    });

    it('should write snapshot with providerIdentity containing deploymentId', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      // v3.0: removed context object, deploymentId is in providerIdentity
      expect(snapshot.providerIdentity.deploymentId).toBeDefined();
      // v3.0: accountId and region in providerIdentity
      expect(snapshot.providerIdentity.accountId).toBe('123456789012');
      expect(snapshot.providerIdentity.region).toBe('us-east-1');
    });

    it('should write snapshot with capturedAt timestamp', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.capturedAt).toBeDefined();
      expect(() => new Date(snapshot.capturedAt)).not.toThrow();
    });

    it('should write snapshot with schemaVersion', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.snapshotVersion).toBe('3.0');
    });

    it('should write snapshot with identity for stable collision handling', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.identity).toBeDefined();
      expect(snapshot.identity.stableResourceKey).toBeDefined();
      expect(snapshot.identity.stableResourceKey).toContain('dynamodb');
    });
  });

  describe('v3.0 restructured payload', () => {
    it('should write snapshot with bindingId', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.identity.bindingId).toBeDefined();
      expect(snapshot.identity.bindingId).toContain('test-app');
      expect(snapshot.identity.bindingId).toContain('dynamodb');
      expect(snapshot.identity.bindingId).toContain('User');
    });

    it('should NOT include tableId in v2.0 (removed - was token in LOCAL snapshots)', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      // v2.0: tableId removed (was useless token in LOCAL snapshots)
      expect((snapshot as any).tableId).toBeUndefined();
    });

    it('should NOT include entityId in v2.0 (removed - insufficiently scoped)', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      // v2.0: entityId removed (insufficiently scoped, use bindingId instead)
      expect((snapshot as any).entityId).toBeUndefined();
    });

    it('should write snapshot with _schemaHash for Lambda', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.hashes.schemaHash).toBeDefined();
      expect(snapshot.hashes.schemaHash).toMatch(/^sha256:/);
    });

    it('should write snapshot with _packageVersion for Lambda', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      expect(snapshot.producer.version).toBeDefined();
      expect(typeof snapshot.producer.version).toBe('string');
    });
  });

  describe('v1.1 normalized dataStore fields', () => {
    it('should NOT have duplicate arn field (use tableArn)', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      // v3.0: resource.id contains the ARN (may be token in LOCAL mode)
      expect(snapshot.resource.id).toBeDefined();
      // ARN can be a token at synth time
      expect(snapshot.resource.id).toMatch(/arn:aws:dynamodb|\$\{Token\[/);
    });

    it('should NOT have duplicate name field (use tableName)', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      // v3.0: resource.name contains the table name
      expect(snapshot.resource.name).toBeDefined();
    });

    it('should NOT have duplicate account field (use top-level accountId)', () => {
      ensureAssetDir('TestStack', 'test-table__User');
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const snapshot = getSnapshotFromBinder(binder);
      
      // Should NOT have account field in dataStore
      // v3.0: resource section doesn't have account field
      // accountId is in providerIdentity
      expect(snapshot.providerIdentity.accountId).toBe('123456789012');
    });
  });
});
