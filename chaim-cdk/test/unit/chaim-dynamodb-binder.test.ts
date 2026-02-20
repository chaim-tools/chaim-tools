import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import { ChaimDynamoDBBinder } from '../../src/binders/chaim-dynamodb-binder';
import { ChaimCredentials } from '../../src/types/credentials';
import { TableBindingConfig } from '../../src/types/table-binding-config';
import { FailureMode } from '../../src/types/failure-mode';
import { SchemaService } from '../../src/services/schema-service';

// Mock schema data — includes pk, sk, email so existing table/index tests pass field validation
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
  ],
};

// Mock schema service
vi.mock('../../src/services/schema-service', () => ({
  SchemaService: {
    readSchema: vi.fn(() => mockSchemaData),
  },
}));

describe('ChaimDynamoDBBinder', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let table: dynamodb.Table;
  let testConfig: TableBindingConfig;
  const testAssetDirs: string[] = [];

  // Clean up test asset directories after all tests
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
    vi.restoreAllMocks();
  });

  // Helper to create asset directory for testing
  function ensureAssetDir(stackName: string, resourceId: string): string {
    const cdkRoot = process.cwd();
    const assetDir = path.join(cdkRoot, 'cdk.out', 'chaim', 'assets', stackName, resourceId);
    fs.mkdirSync(assetDir, { recursive: true });
    
    // Create a minimal index.js to satisfy CDK validation
    const handlerPath = path.join(assetDir, 'index.js');
    fs.writeFileSync(handlerPath, 'exports.handler = async () => {};', 'utf-8');
    
    // Create snapshot.json
    const snapshotPath = path.join(assetDir, 'snapshot.json');
    fs.writeFileSync(snapshotPath, '{}', 'utf-8');
    
    testAssetDirs.push(assetDir);
    return assetDir;
  }

  describe('constructor', () => {
    beforeEach(() => {
      // Pre-create asset directories for tests
      ensureAssetDir('TestStack', 'TestBinder__User');
    });

    it('should create binder with direct credentials', () => {
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder).toBeDefined();
      expect(binder.resourceId).toBeDefined();
      expect(binder.schemaData).toBeDefined();
      expect(binder.dataStoreMetadata).toBeDefined();
      expect(binder.dataStoreMetadata.type).toBe('dynamodb');
    });

    it('should create binder with Secrets Manager', () => {
      const smConfig = new TableBindingConfig(
        'test-app',
        ChaimCredentials.fromSecretsManager('chaim/credentials')
      );
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: smConfig,
      });

      expect(binder).toBeDefined();
      expect(binder.resourceId).toBeDefined();
    });

    it('should throw error when no config provided', () => {
      expect(() => {
        new ChaimDynamoDBBinder(stack, 'TestBinder', {
          schemaPath: './schemas/test.bprint',
          table,
        } as any);
      }).toThrow(/config is required/);
    });
  });

  describe('metadata extraction', () => {
    beforeEach(() => {
      ensureAssetDir('TestStack', 'TestBinder__User');
      ensureAssetDir('TestStack', 'CompositeBinder__User');
      ensureAssetDir('TestStack', 'GSIBinder__User');
    });

    it('should extract DynamoDB metadata correctly', () => {
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const metadata = binder.dynamoDBMetadata;

      expect(metadata.type).toBe('dynamodb');
      expect(metadata.tableName).toBeDefined();
      expect(metadata.partitionKey).toBe('pk');
      expect(metadata.billingMode).toBe('PAY_PER_REQUEST');
    });

    it('should extract sort key when present', () => {
      const compositeTable = new dynamodb.Table(stack, 'CompositeTable', {
        tableName: 'composite-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      });

      const binder = new ChaimDynamoDBBinder(stack, 'CompositeBinder', {
        schemaPath: './schemas/test.bprint',
        table: compositeTable,
        config: testConfig,
      });

      expect(binder.dynamoDBMetadata.sortKey).toBe('sk');
    });

    it('should extract GSI metadata when present', () => {
      const tableWithGSI = new dynamodb.Table(stack, 'GSITable', {
        tableName: 'gsi-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      });

      tableWithGSI.addGlobalSecondaryIndex({
        indexName: 'email-index',
        partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      });

      const binder = new ChaimDynamoDBBinder(stack, 'GSIBinder', {
        schemaPath: './schemas/test.bprint',
        table: tableWithGSI,
        config: testConfig,
      });

      if (binder.dynamoDBMetadata.globalSecondaryIndexes) {
        expect(binder.dynamoDBMetadata.globalSecondaryIndexes.length).toBeGreaterThan(0);
      }
    });
  });

  describe('failure modes', () => {
    beforeEach(() => {
      ensureAssetDir('TestStack', 'TestBinder__User');
    });

    it('should use STRICT by default', () => {
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder).toBeDefined();
    });

    it('should accept STRICT failure mode', () => {
      const strictConfig = new TableBindingConfig(
        'test-app',
        ChaimCredentials.fromApiKeys('test-key', 'test-secret'),
        FailureMode.STRICT
      );
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: strictConfig,
      });

      expect(binder).toBeDefined();
      expect(binder.config.failureMode).toBe(FailureMode.STRICT);
    });

    it('should accept BEST_EFFORT failure mode when explicitly set', () => {
      const bestEffortConfig = new TableBindingConfig(
        'test-app',
        ChaimCredentials.fromApiKeys('test-key', 'test-secret'),
        FailureMode.BEST_EFFORT
      );
      
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: bestEffortConfig,
      });

      expect(binder).toBeDefined();
      expect(binder.config.failureMode).toBe(FailureMode.BEST_EFFORT);
    });
  });

  describe('snapshot writing', () => {
    beforeEach(() => {
      ensureAssetDir('TestStack', 'TestBinder__User');
    });

    it('should write LOCAL snapshot during construction', () => {
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder.localSnapshotPath).toBeDefined();
      expect(binder.localSnapshotPath).toContain('.json');
    });

    it('should expose localSnapshotPath property', () => {
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      expect(binder.localSnapshotPath).toBeDefined();
      expect(binder.localSnapshotPath).toContain('/dynamodb/');
      expect(binder.localSnapshotPath).toContain('.json');
    });

    it('should generate resourceId based on construct ID when tableName is token', () => {
      const binder = new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      // resourceId should contain entity name from schema
      expect(binder.resourceId).toContain('__User');
    });
  });

  describe('field reference validation', () => {
    it('should pass when all key fields exist in schema', () => {
      ensureAssetDir('TestStack', 'ValidBinder__User');

      const tableWithSK = new dynamodb.Table(stack, 'ValidTable', {
        tableName: 'valid-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      });

      tableWithSK.addGlobalSecondaryIndex({
        indexName: 'email-index',
        partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      });

      expect(() => {
        new ChaimDynamoDBBinder(stack, 'ValidBinder', {
          schemaPath: './schemas/test.bprint',
          table: tableWithSK,
          config: testConfig,
        });
      }).not.toThrow();
    });

    it('should throw when table partition key is not in schema', () => {
      ensureAssetDir('TestStack', 'BadPKBinder__MissingPK');

      const schemaWithoutPK = {
        ...mockSchemaData,
        entityName: 'MissingPK',
        fields: [
          { name: 'userId', type: 'string', required: true },
          { name: 'email', type: 'string', required: true },
        ],
      };
      vi.mocked(SchemaService.readSchema).mockReturnValueOnce(schemaWithoutPK);

      const badPKTable = new dynamodb.Table(stack, 'BadPKTable', {
        tableName: 'bad-pk-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      });

      expect(() => {
        new ChaimDynamoDBBinder(stack, 'BadPKBinder', {
          schemaPath: './schemas/test.bprint',
          table: badPKTable,
          config: testConfig,
        });
      }).toThrow(/Table partition key 'pk' is not defined in schema fields/);
    });

    it('should throw when table sort key is not in schema', () => {
      ensureAssetDir('TestStack', 'BadSKBinder__MissingSK');

      const schemaWithoutSK = {
        ...mockSchemaData,
        entityName: 'MissingSK',
        fields: [
          { name: 'pk', type: 'string', required: true },
          { name: 'email', type: 'string', required: true },
        ],
      };
      vi.mocked(SchemaService.readSchema).mockReturnValueOnce(schemaWithoutSK);

      const badSKTable = new dynamodb.Table(stack, 'BadSKTable', {
        tableName: 'bad-sk-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      });

      expect(() => {
        new ChaimDynamoDBBinder(stack, 'BadSKBinder', {
          schemaPath: './schemas/test.bprint',
          table: badSKTable,
          config: testConfig,
        });
      }).toThrow(/Table sort key 'sk' is not defined in schema fields/);
    });

    it('should throw when GSI partition key is not in schema', () => {
      ensureAssetDir('TestStack', 'BadGSIPKBinder__BadGSIPK');

      const schemaNoGSIField = {
        ...mockSchemaData,
        entityName: 'BadGSIPK',
        fields: [
          { name: 'pk', type: 'string', required: true },
          { name: 'email', type: 'string', required: true },
        ],
      };
      vi.mocked(SchemaService.readSchema).mockReturnValueOnce(schemaNoGSIField);

      const gsiTable = new dynamodb.Table(stack, 'GSIPKTable', {
        tableName: 'gsi-pk-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      });

      // Directly set CfnTable GSI property (CDK uses lazy evaluation for addGlobalSecondaryIndex)
      const cfnGSITable = gsiTable.node.defaultChild as dynamodb.CfnTable;
      cfnGSITable.globalSecondaryIndexes = [{
        indexName: 'status-index',
        keySchema: [{ attributeName: 'status', keyType: 'HASH' }],
        projection: { projectionType: 'ALL' },
      }];

      expect(() => {
        new ChaimDynamoDBBinder(stack, 'BadGSIPKBinder', {
          schemaPath: './schemas/test.bprint',
          table: gsiTable,
          config: testConfig,
        });
      }).toThrow(/GSI 'status-index' partition key 'status' is not defined in schema fields/);
    });

    it('should throw when GSI sort key is not in schema', () => {
      ensureAssetDir('TestStack', 'BadGSISKBinder__BadGSISK');

      const schemaNoGSISK = {
        ...mockSchemaData,
        entityName: 'BadGSISK',
        fields: [
          { name: 'pk', type: 'string', required: true },
          { name: 'email', type: 'string', required: true },
        ],
      };
      vi.mocked(SchemaService.readSchema).mockReturnValueOnce(schemaNoGSISK);

      const gsiSKTable = new dynamodb.Table(stack, 'GSISKTable', {
        tableName: 'gsi-sk-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      });

      const cfnGSISKTable = gsiSKTable.node.defaultChild as dynamodb.CfnTable;
      cfnGSISKTable.globalSecondaryIndexes = [{
        indexName: 'email-created-index',
        keySchema: [
          { attributeName: 'email', keyType: 'HASH' },
          { attributeName: 'createdAt', keyType: 'RANGE' },
        ],
        projection: { projectionType: 'ALL' },
      }];

      expect(() => {
        new ChaimDynamoDBBinder(stack, 'BadGSISKBinder', {
          schemaPath: './schemas/test.bprint',
          table: gsiSKTable,
          config: testConfig,
        });
      }).toThrow(/GSI 'email-created-index' sort key 'createdAt' is not defined in schema fields/);
    });

    it('should throw when LSI sort key is not in schema', () => {
      ensureAssetDir('TestStack', 'BadLSIBinder__BadLSI');

      const schemaNoLSIField = {
        ...mockSchemaData,
        entityName: 'BadLSI',
        fields: [
          { name: 'pk', type: 'string', required: true },
          { name: 'sk', type: 'string', required: true },
        ],
      };
      vi.mocked(SchemaService.readSchema).mockReturnValueOnce(schemaNoLSIField);

      const lsiTable = new dynamodb.Table(stack, 'LSITable', {
        tableName: 'lsi-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
        sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      });

      const cfnLSITable = lsiTable.node.defaultChild as dynamodb.CfnTable;
      cfnLSITable.localSecondaryIndexes = [{
        indexName: 'status-lsi',
        keySchema: [
          { attributeName: 'pk', keyType: 'HASH' },
          { attributeName: 'localStatus', keyType: 'RANGE' },
        ],
        projection: { projectionType: 'ALL' },
      }];

      expect(() => {
        new ChaimDynamoDBBinder(stack, 'BadLSIBinder', {
          schemaPath: './schemas/test.bprint',
          table: lsiTable,
          config: testConfig,
        });
      }).toThrow(/LSI 'status-lsi' sort key 'localStatus' is not defined in schema fields/);
    });

    it('should collect multiple errors and report them all', () => {
      ensureAssetDir('TestStack', 'MultiBadBinder__MultiError');

      const minimalSchema = {
        ...mockSchemaData,
        entityName: 'MultiError',
        fields: [
          { name: 'onlyField', type: 'string', required: true },
        ],
      };
      vi.mocked(SchemaService.readSchema).mockReturnValueOnce(minimalSchema);

      const multiTable = new dynamodb.Table(stack, 'MultiTable', {
        tableName: 'multi-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      });

      const cfnMultiTable = multiTable.node.defaultChild as dynamodb.CfnTable;
      cfnMultiTable.globalSecondaryIndexes = [{
        indexName: 'missing-gsi',
        keySchema: [{ attributeName: 'gsiField', keyType: 'HASH' }],
        projection: { projectionType: 'ALL' },
      }];

      expect(() => {
        new ChaimDynamoDBBinder(stack, 'MultiBadBinder', {
          schemaPath: './schemas/test.bprint',
          table: multiTable,
          config: testConfig,
        });
      }).toThrow(/Table partition key 'pk' is not defined.*GSI 'missing-gsi' partition key 'gsiField' is not defined/s);
    });

    it('should include entity name in the error message', () => {
      ensureAssetDir('TestStack', 'EntityErrBinder__EntityErr');

      const entitySchema = {
        ...mockSchemaData,
        entityName: 'EntityErr',
        fields: [
          { name: 'onlyField', type: 'string', required: true },
        ],
      };
      vi.mocked(SchemaService.readSchema).mockReturnValueOnce(entitySchema);

      const errTable = new dynamodb.Table(stack, 'EntityErrTable', {
        tableName: 'entity-err-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      });

      expect(() => {
        new ChaimDynamoDBBinder(stack, 'EntityErrBinder', {
          schemaPath: './schemas/test.bprint',
          table: errTable,
          config: testConfig,
        });
      }).toThrow(/Schema field reference validation failed for entity 'EntityErr'/);
    });
  });
});
