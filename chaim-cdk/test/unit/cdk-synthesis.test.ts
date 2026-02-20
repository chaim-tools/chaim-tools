/**
 * CDK Synthesis Tests
 * 
 * Tests that verify the ChaimDynamoDBBinder construct produces
 * valid CloudFormation templates with expected resources.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as fs from 'fs';
import * as path from 'path';
import { ChaimDynamoDBBinder } from '../../src/binders/chaim-dynamodb-binder';
import { ChaimCredentials } from '../../src/types/credentials';
import { TableBindingConfig } from '../../src/types/table-binding-config';
import { FailureMode } from '../../src/types/failure-mode';

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
  ],
};

// Mock the SchemaService
vi.mock('../../src/services/schema-service', () => ({
  SchemaService: {
    readSchema: vi.fn(() => mockSchemaData),
  },
}));

describe('CDK Synthesis Tests', () => {
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

  describe('Lambda function synthesis', () => {
    beforeEach(() => {
      ensureAssetDir('TestStack', 'TestBinder__User');
    });

    it('should create Lambda function with Node.js 20 runtime', () => {
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs20.x',
        Handler: 'index.handler',
      });
    });

    it('should create Lambda function with 5-minute timeout', () => {
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        Timeout: 300, // 5 minutes in seconds
      });
    });

    it('should set APP_ID environment variable', () => {
      const customAppConfig = new TableBindingConfig(
        'my-test-app',
        ChaimCredentials.fromApiKeys('test-key', 'test-secret')
      );
      
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: customAppConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            APP_ID: 'my-test-app',
          },
        },
      });
    });

    it('should set FAILURE_MODE environment variable', () => {
      const strictConfig = new TableBindingConfig(
        'test-app',
        ChaimCredentials.fromApiKeys('test-key', 'test-secret'),
        FailureMode.STRICT
      );
      
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: strictConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            FAILURE_MODE: 'STRICT',
          },
        },
      });
    });

    it('should use STRICT as default failure mode', () => {
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            FAILURE_MODE: 'STRICT',
          },
        },
      });
    });
  });

  describe('IAM permissions synthesis', () => {
    beforeEach(() => {
      ensureAssetDir('TestStack', 'TestBinder__User');
    });

    it('should grant CloudWatch Logs permissions to Lambda', () => {
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      // Lambda should have logs permissions
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: cdk.assertions.Match.arrayWith([
            cdk.assertions.Match.objectLike({
              Action: cdk.assertions.Match.arrayWith([
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ]),
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });

    it('should grant Secrets Manager permissions when using SM credentials', () => {
      const smConfig = new TableBindingConfig(
        'test-app',
        ChaimCredentials.fromSecretsManager('chaim/credentials')
      );
      
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: smConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      // Lambda should have secrets manager permissions
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: cdk.assertions.Match.arrayWith([
            cdk.assertions.Match.objectLike({
              Action: 'secretsmanager:GetSecretValue',
              Effect: 'Allow',
            }),
          ]),
        },
      });
    });
  });

  describe('Custom resource synthesis', () => {
    beforeEach(() => {
      ensureAssetDir('TestStack', 'TestBinder__User');
    });

    it('should create Custom::AWS custom resource', () => {
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      // Should have a custom resource
      template.resourceCountIs('AWS::CloudFormation::CustomResource', 1);
    });

    it('should set ResourceId property on custom resource', () => {
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::CloudFormation::CustomResource', {
        ResourceId: cdk.assertions.Match.stringLikeRegexp('.*__User'),
      });
    });
  });

  describe('Environment variables with direct credentials', () => {
    beforeEach(() => {
      ensureAssetDir('TestStack', 'TestBinder__User');
    });

    it('should set API_KEY and API_SECRET when using direct credentials', () => {
      const customKeyConfig = new TableBindingConfig(
        'test-app',
        ChaimCredentials.fromApiKeys('my-key', 'my-secret')
      );
      
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: customKeyConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            API_KEY: 'my-key',
            API_SECRET: 'my-secret',
          },
        },
      });
    });
  });

  describe('Environment variables with Secrets Manager credentials', () => {
    beforeEach(() => {
      ensureAssetDir('TestStack', 'TestBinder__User');
    });

    it('should set SECRET_NAME when using Secrets Manager credentials', () => {
      const smConfig = new TableBindingConfig(
        'test-app',
        ChaimCredentials.fromSecretsManager('chaim/my-secret')
      );
      
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: smConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            SECRET_NAME: 'chaim/my-secret',
          },
        },
      });
    });
  });

  describe('API configuration', () => {
    beforeEach(() => {
      ensureAssetDir('TestStack', 'TestBinder__User');
    });

    it('should set CHAIM_API_BASE_URL environment variable', () => {
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            CHAIM_API_BASE_URL: cdk.assertions.Match.stringLikeRegexp('https://.*'),
          },
        },
      });
    });

    it('should set CHAIM_MAX_SNAPSHOT_BYTES environment variable', () => {
      new ChaimDynamoDBBinder(stack, 'TestBinder', {
        schemaPath: './schemas/test.bprint',
        table,
        config: testConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            CHAIM_MAX_SNAPSHOT_BYTES: cdk.assertions.Match.stringLikeRegexp('\\d+'),
          },
        },
      });
    });
  });

  describe('Multiple binders in same stack', () => {
    it('should create separate custom resources for each binder', () => {
      // Create asset directories for both binders
      ensureAssetDir('TestStack', 'UserBinder__User');
      ensureAssetDir('TestStack', 'OrderBinder__User');
      
      const table2 = new dynamodb.Table(stack, 'OrdersTable', {
        tableName: 'orders-table',
        partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      });

      new ChaimDynamoDBBinder(stack, 'UserBinder', {
        schemaPath: './schemas/user.bprint',
        table,
        config: testConfig,
      });

      new ChaimDynamoDBBinder(stack, 'OrderBinder', {
        schemaPath: './schemas/order.bprint',
        table: table2,
        config: testConfig,
      });

      const template = cdk.assertions.Template.fromStack(stack);
      
      // Should have 2 custom resources (one for each binder)
      template.resourceCountIs('AWS::CloudFormation::CustomResource', 2);
      
      // Should have at least 2 Lambda functions (binders + framework lambdas)
      const lambdas = template.findResources('AWS::Lambda::Function');
      expect(Object.keys(lambdas).length).toBeGreaterThanOrEqual(2);
    });
  });
});
