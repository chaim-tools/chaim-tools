import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

import { BaseChaimBinder } from './base-chaim-binder';
import { BaseBinderProps } from '../types/base-binder-props';
import {
  DynamoDBMetadata,
  GSIMetadata,
  LSIMetadata,
} from '../types/data-store-metadata';

/**
 * Properties for ChaimDynamoDBBinder construct.
 */
export interface ChaimDynamoDBBinderProps extends BaseBinderProps {
  /** DynamoDB table to bind with the schema */
  table: dynamodb.ITable;
}

/**
 * CDK construct for binding a .bprint schema to a DynamoDB table.
 *
 * Publishes schema and table metadata to Chaim SaaS platform via
 * S3 presigned upload and snapshot-ref commit.
 *
 * @example
 * ```typescript
 * import { ChaimDynamoDBBinder, ChaimCredentials, FailureMode } from '@chaim-tools/cdk-lib';
 *
 * const table = new dynamodb.Table(this, 'UsersTable', {
 *   partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
 * });
 *
 * // failureMode defaults to STRICT
 * new ChaimDynamoDBBinder(this, 'UserSchema', {
 *   schemaPath: './schemas/user.bprint',
 *   table,
 *   appId: 'my-app',
 *   credentials: ChaimCredentials.fromSecretsManager('chaim/api-credentials'),
 *   failureMode: FailureMode.STRICT,  // Optional - rolls back on failure
 * });
 * ```
 */
export class ChaimDynamoDBBinder extends BaseChaimBinder {
  /** The DynamoDB table being bound */
  public readonly table: dynamodb.ITable;

  /** DynamoDB-specific metadata */
  public readonly dynamoDBMetadata: DynamoDBMetadata;

  private readonly dynamoDBProps: ChaimDynamoDBBinderProps;

  constructor(scope: Construct, id: string, props: ChaimDynamoDBBinderProps) {
    // Store props before calling super (which calls extractMetadata)
    super(scope, id, props);

    this.dynamoDBProps = props;
    this.table = props.table;
    this.dynamoDBMetadata = this.dataStoreMetadata as DynamoDBMetadata;
  }

  /**
   * Override to resolve the actual table name when possible.
   * 
   * Uses stack.resolve() to convert CDK tokens to actual values for explicit table names
   * (e.g., 'acme-product-catalog') and dynamic names (e.g., `${stack.stackName}-orders`).
   * Falls back to construct node ID for auto-generated names or cross-stack references.
   * 
   * Note: This is called from BaseChaimBinder constructor before this.table is set,
   * so we access the table from baseProps instead.
   */
  protected getResourceName(): string {
    const props = this.baseProps as ChaimDynamoDBBinderProps;
    const cfnTable = props.table.node.defaultChild as dynamodb.CfnTable;
    const stack = cdk.Stack.of(this);
    
    // Try to resolve the table name token
    // This works for explicit names like 'acme-product-catalog'
    // and dynamic names like `${stack.stackName}-orders`
    const resolvedName = stack.resolve(cfnTable.tableName);
    
    // Check if it's still an unresolved token
    if (!resolvedName || cdk.Token.isUnresolved(resolvedName)) {
      // Fallback to construct ID for auto-generated names
      return props.table.node.id;
    }
    
    // Return the actual resolved table name
    return resolvedName;
  }

  /**
   * Extract DynamoDB table metadata.
   */
  protected extractMetadata(): DynamoDBMetadata {
    const props = this.baseProps as ChaimDynamoDBBinderProps;
    const table = props.table;
    const stack = cdk.Stack.of(this);

    // Validate table
    this.validateTable(table);

    // Get CloudFormation resource for detailed metadata
    const cfnTable = this.getCfnTable(table);

    // Extract key schema
    const { partitionKey, sortKey } = this.extractKeySchema(cfnTable);

    // Extract indexes
    const globalSecondaryIndexes = this.extractGSIs(cfnTable);
    const localSecondaryIndexes = this.extractLSIs(cfnTable);

    // Extract TTL
    const ttlAttribute = this.extractTTL(cfnTable);

    // Extract stream info
    const { streamEnabled, streamViewType } = this.extractStreamInfo(cfnTable);

    // Extract billing mode
    const billingMode = this.extractBillingMode(cfnTable);

    // Validate all key/index attributes exist in schema
    this.validateFieldReferences(partitionKey, sortKey, globalSecondaryIndexes, localSecondaryIndexes, ttlAttribute);

    // Resolve table name from token (same logic as getResourceName)
    const resolvedTableName = stack.resolve(cfnTable.tableName);
    const tableName = (!resolvedTableName || cdk.Token.isUnresolved(resolvedTableName)) 
      ? table.tableName  // Keep token if can't resolve
      : resolvedTableName;

    return {
      type: 'dynamodb',
      // Removed duplicate fields in v1.1:
      // - arn (use tableArn instead)
      // - name (use tableName instead)
      // - account (use top-level accountId instead)
      tableName,
      tableArn: table.tableArn,
      region: stack.region,
      partitionKey,
      sortKey,
      globalSecondaryIndexes,
      localSecondaryIndexes,
      ttlAttribute,
      streamEnabled,
      streamViewType,
      billingMode,
      encryptionKeyArn: table.encryptionKey?.keyArn,
    };
  }

  /**
   * Validate that the table is a concrete DynamoDB Table construct.
   * 
   * Note: We use duck typing for instanceof check to handle cross-package
   * type compatibility issues in monorepo setups (e.g., pnpm with isolated node_modules).
   */
  private validateTable(table: dynamodb.ITable): void {
    if (!table) {
      throw new Error('DynamoDB table is required');
    }

    // Duck typing check: a concrete Table has node.defaultChild (CfnTable)
    // This handles cross-package type compatibility in monorepos
    const isConcreteTable = table instanceof dynamodb.Table || 
      (table.node && table.node.defaultChild && 
       (table.node.defaultChild as any).cfnResourceType === 'AWS::DynamoDB::Table');

    if (!isConcreteTable) {
      throw new Error(
        'Table must be a concrete DynamoDB Table construct. Imported tables are not supported.'
      );
    }

    if (!table.tableName) {
      throw new Error('Table must have a valid table name');
    }

    if (!table.tableArn) {
      throw new Error('Table must have a valid table ARN');
    }
  }

  /**
   * Get the underlying CloudFormation table resource.
   * Uses duck typing for cross-package compatibility.
   */
  private getCfnTable(table: dynamodb.ITable): dynamodb.CfnTable {
    // Use duck typing check for cross-package compatibility
    const cfnTable = table.node?.defaultChild as dynamodb.CfnTable | undefined;
    
    if (!cfnTable || (cfnTable as any).cfnResourceType !== 'AWS::DynamoDB::Table') {
      throw new Error('Cannot access CloudFormation resource for imported table');
    }

    return cfnTable;
  }

  /**
   * Extract partition key and sort key from key schema.
   */
  private extractKeySchema(cfnTable: dynamodb.CfnTable): {
    partitionKey: string;
    sortKey?: string;
  } {
    const keySchema = cfnTable.keySchema;

    if (!keySchema || !Array.isArray(keySchema) || keySchema.length === 0) {
      throw new Error('Table must have a key schema');
    }

    let partitionKey: string | undefined;
    let sortKey: string | undefined;

    for (const key of keySchema) {
      if (typeof key === 'object' && 'attributeName' in key && 'keyType' in key) {
        if (key.keyType === 'HASH') {
          partitionKey = key.attributeName;
        } else if (key.keyType === 'RANGE') {
          sortKey = key.attributeName;
        }
      }
    }

    if (!partitionKey) {
      throw new Error('Cannot extract partition key from table key schema');
    }

    return { partitionKey, sortKey };
  }

  /**
   * Extract Global Secondary Index metadata.
   *
   * CDK's L2 Table stores GSIs in an internal array and sets
   * cfnTable.globalSecondaryIndexes to a Lazy/IResolvable token rather than
   * a plain array until CloudFormation template synthesis occurs. Because
   * extractMetadata() runs during construct instantiation (before synthesis),
   * we must force-resolve the token via Stack.resolve() so that Array.isArray()
   * receives the actual array instead of the token object.
   */
  private extractGSIs(cfnTable: dynamodb.CfnTable): GSIMetadata[] | undefined {
    const stack = cdk.Stack.of(this);
    let gsis: any = cfnTable.globalSecondaryIndexes;

    // Resolve lazy/token values that CDK sets before synthesis
    if (gsis && !Array.isArray(gsis) && cdk.Token.isUnresolved(gsis)) {
      try {
        gsis = stack.resolve(gsis);
      } catch {
        // Resolution may fail for cross-stack references; fall through to undefined
        return undefined;
      }
    }

    if (!gsis || !Array.isArray(gsis) || gsis.length === 0) {
      return undefined;
    }

    return gsis.map((gsi: any) => {
      const keySchema = gsi.keySchema || [];
      let partitionKey = '';
      let sortKey: string | undefined;

      for (const key of keySchema) {
        if (key.keyType === 'HASH') {
          partitionKey = key.attributeName;
        } else if (key.keyType === 'RANGE') {
          sortKey = key.attributeName;
        }
      }

      return {
        indexName: gsi.indexName,
        partitionKey,
        sortKey,
        projectionType: gsi.projection?.projectionType || 'ALL',
        nonKeyAttributes: gsi.projection?.nonKeyAttributes,
      };
    });
  }

  /**
   * Extract Local Secondary Index metadata.
   *
   * Same lazy-resolution handling as extractGSIs() — see that method's
   * comment for the full explanation.
   */
  private extractLSIs(cfnTable: dynamodb.CfnTable): LSIMetadata[] | undefined {
    const stack = cdk.Stack.of(this);
    let lsis: any = cfnTable.localSecondaryIndexes;

    // Resolve lazy/token values that CDK sets before synthesis
    if (lsis && !Array.isArray(lsis) && cdk.Token.isUnresolved(lsis)) {
      try {
        lsis = stack.resolve(lsis);
      } catch {
        return undefined;
      }
    }

    if (!lsis || !Array.isArray(lsis) || lsis.length === 0) {
      return undefined;
    }

    return lsis.map((lsi: any) => {
      const keySchema = lsi.keySchema || [];
      let sortKey = '';

      for (const key of keySchema) {
        if (key.keyType === 'RANGE') {
          sortKey = key.attributeName;
        }
      }

      return {
        indexName: lsi.indexName,
        sortKey,
        projectionType: lsi.projection?.projectionType || 'ALL',
        nonKeyAttributes: lsi.projection?.nonKeyAttributes,
      };
    });
  }

  /**
   * Extract TTL attribute name.
   */
  private extractTTL(cfnTable: dynamodb.CfnTable): string | undefined {
    const ttlSpec = cfnTable.timeToLiveSpecification;
    if (ttlSpec && typeof ttlSpec === 'object' && 'enabled' in ttlSpec) {
      if (ttlSpec.enabled && 'attributeName' in ttlSpec) {
        return ttlSpec.attributeName as string;
      }
    }
    return undefined;
  }

  /**
   * Extract stream configuration.
   */
  private extractStreamInfo(cfnTable: dynamodb.CfnTable): {
    streamEnabled?: boolean;
    streamViewType?: string;
  } {
    const streamSpec = cfnTable.streamSpecification;
    if (streamSpec && typeof streamSpec === 'object' && 'streamViewType' in streamSpec) {
      return {
        streamEnabled: true,
        streamViewType: streamSpec.streamViewType as string,
      };
    }
    return { streamEnabled: false };
  }

  /**
   * Extract billing mode.
   */
  private extractBillingMode(cfnTable: dynamodb.CfnTable): 'PAY_PER_REQUEST' | 'PROVISIONED' | undefined {
    const billingMode = cfnTable.billingMode;
    if (billingMode === 'PAY_PER_REQUEST' || billingMode === 'PROVISIONED') {
      return billingMode;
    }
    return undefined;
  }

  /**
   * Validate that all DynamoDB key attribute names (table PK/SK, GSI keys,
   * LSI keys, TTL attribute) exist as fields in the .bprint schema.
   *
   * Collects all mismatches and throws a single error with all violations,
   * making it easy to fix everything in one pass.
   */
  private validateFieldReferences(
    partitionKey: string,
    sortKey: string | undefined,
    globalSecondaryIndexes: GSIMetadata[] | undefined,
    localSecondaryIndexes: LSIMetadata[] | undefined,
    ttlAttribute: string | undefined,
  ): void {
    const fieldNames = new Set(this.schemaData.fields.map(f => f.name));
    const errors: string[] = [];

    if (!fieldNames.has(partitionKey)) {
      errors.push(`Table partition key '${partitionKey}' is not defined in schema fields`);
    }
    if (sortKey && !fieldNames.has(sortKey)) {
      errors.push(`Table sort key '${sortKey}' is not defined in schema fields`);
    }

    if (globalSecondaryIndexes) {
      for (const gsi of globalSecondaryIndexes) {
        if (!fieldNames.has(gsi.partitionKey)) {
          errors.push(`GSI '${gsi.indexName}' partition key '${gsi.partitionKey}' is not defined in schema fields`);
        }
        if (gsi.sortKey && !fieldNames.has(gsi.sortKey)) {
          errors.push(`GSI '${gsi.indexName}' sort key '${gsi.sortKey}' is not defined in schema fields`);
        }
      }
    }

    if (localSecondaryIndexes) {
      for (const lsi of localSecondaryIndexes) {
        if (lsi.sortKey && !fieldNames.has(lsi.sortKey)) {
          errors.push(`LSI '${lsi.indexName}' sort key '${lsi.sortKey}' is not defined in schema fields`);
        }
      }
    }

    if (ttlAttribute && !fieldNames.has(ttlAttribute)) {
      errors.push(`TTL attribute '${ttlAttribute}' is not defined in schema fields`);
    }

    if (errors.length > 0) {
      throw new Error(
        `Schema field reference validation failed for entity '${this.schemaData.entityName}':\n` +
        errors.map(e => `  - ${e}`).join('\n') + '\n\n' +
        `All DynamoDB key attributes must exist as fields in the .bprint schema.`
      );
    }
  }
}
