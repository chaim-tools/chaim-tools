import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { SchemaData } from '@chaim-tools/chaim-bprint-spec';
import { BaseBinderProps, validateBinderProps } from '../types/base-binder-props';
import { DataStoreMetadata } from '../types/data-store-metadata';
import { LocalSnapshotPayload } from '../types/snapshot-payload';
import { SchemaService } from '../services/schema-service';
import { TableBindingConfig } from '../types/table-binding-config';
import {
  SnapshotCachePolicy,
  DEFAULT_SNAPSHOT_CACHE_POLICY,
  SNAPSHOT_CACHE_POLICY_CONTEXT_KEY,
} from '../types/snapshot-cache-policy';
import {
  DEFAULT_CHAIM_API_BASE_URL,
  DEFAULT_MAX_SNAPSHOT_BYTES,
  SNAPSHOT_SCHEMA_VERSION,
} from '../config/chaim-endpoints';
import {
  normalizeAccountId,
  normalizeRegion,
  normalizeResourceName,
  getSnapshotDir,
  getLocalSnapshotPath,
  ensureDirExists,
} from '../services/os-cache-paths';
import { pruneStackSnapshots } from '../services/snapshot-cleanup';

/**
 * Path to the canonical Lambda handler file.
 * This handler implements the presigned upload flow for Chaim ingestion.
 */
const LAMBDA_HANDLER_PATH = path.join(__dirname, '..', 'lambda-handler', 'handler.js');

/**
 * Abstract base class for all Chaim data store binders.
 *
 * Provides shared infrastructure:
 * - Schema loading and validation
 * - Snapshot payload construction
 * - LOCAL snapshot writing during CDK synth (to OS cache)
 * - Lambda-backed custom resource for S3 presigned upload + snapshot-ref
 *
 * Subclasses implement `extractMetadata()` for store-specific metadata extraction
 * and optionally override `getTable()` for DynamoDB-like resources.
 */
export abstract class BaseChaimBinder extends Construct {
  /** Validated schema data */
  public readonly schemaData: SchemaData;

  /** Extracted data store metadata */
  public readonly dataStoreMetadata: DataStoreMetadata;

  /** Generated resource ID ({resourceName}__{entityName}[__N]) */
  public readonly resourceId: string;

  /** Binding configuration */
  public readonly config: TableBindingConfig;

  /**
   * SHA-256 fingerprint of the full snapshot payload computed at synth time.
   * Used as a CloudFormation custom resource property to trigger Lambda
   * re-invocation whenever any snapshot content changes (schema fields,
   * resource metadata, identity, etc.).
   */
  public readonly snapshotFingerprint: string;

  /** Base props (for internal use) */
  protected readonly baseProps: BaseBinderProps;

  constructor(scope: Construct, id: string, props: BaseBinderProps) {
    super(scope, id);

    this.baseProps = props;
    this.config = props.config;

    // Validate props
    validateBinderProps(props);

    // Validate consistency with other bindings to same table
    this.validateTableConsistency();

    // Load and validate schema
    this.schemaData = SchemaService.readSchema(props.schemaPath);

    // Extract data store metadata (implemented by subclass)
    this.dataStoreMetadata = this.extractMetadata();

    // Build stack context
    const stack = cdk.Stack.of(this);
    const stackName = stack.stackName;
    const datastoreType = this.dataStoreMetadata.type;

    // Get resource and entity names
    const resourceName = this.getResourceName();
    const entityName = this.getEntityName();

    // Generate resource ID
    this.resourceId = `${resourceName}__${entityName}`;

    // Normalize values for paths (handle CDK tokens)
    const normalizedAccountId = normalizeAccountId(stack.account);
    const normalizedRegion = normalizeRegion(stack.region);
    const normalizedResourceName = normalizeResourceName(resourceName);

    // Update resource ID with normalized name to avoid special characters
    const normalizedResourceId = `${normalizedResourceName}__${entityName}`;

    // Build LOCAL snapshot payload
    const localSnapshot = this.buildLocalSnapshot({
      accountId: normalizedAccountId,
      region: normalizedRegion,
      stackName,
      datastoreType,
      resourceName: normalizedResourceName,
      resourceId: normalizedResourceId,
    });

    // Compute snapshot fingerprint for CloudFormation change detection.
    // This hash covers the entire snapshot (schema + resource metadata + identity),
    // so any change — schema fields, table config, streams, billing mode, GSIs, etc. —
    // will trigger CloudFormation to re-invoke the ingestion Lambda.
    this.snapshotFingerprint = this.computeSnapshotFingerprint(localSnapshot);

    // Apply snapshot cache policy (cleanup if requested)
    this.applySnapshotCachePolicy({
      accountId: normalizedAccountId,
      region: normalizedRegion,
      stackName,
    });

    // Write LOCAL snapshot to OS cache for chaim-cli consumption
    this.writeLocalSnapshotToDisk(localSnapshot);

    // Get or create asset directory
    const assetDir = this.writeSnapshotAsset(localSnapshot, stackName);

    // Deploy Lambda-backed custom resource for ingestion
    this.deployIngestionResources(assetDir);
  }

  /**
   * Validate that all bindings to the same table use the same config.
   * 
   * This is a safety check - sharing the same TableBindingConfig object
   * already ensures consistency, but this catches cases where users
   * create separate configs with identical values.
   */
  private validateTableConsistency(): void {
    // Only for DynamoDB binders (has table property)
    const table = (this.baseProps as any).table;
    if (!table) {
      return;
    }

    // Find other binders for the same table
    const stack = cdk.Stack.of(this);
    const otherBinders = stack.node.findAll()
      .filter(node => node instanceof BaseChaimBinder)
      .filter(binder => binder !== this)
      .filter(binder => {
        const otherTable = ((binder as BaseChaimBinder).baseProps as any).table;
        return otherTable === table;
      })
      .map(binder => binder as BaseChaimBinder);

    if (otherBinders.length === 0) {
      return; // First binding for this table
    }

    const firstBinder = otherBinders[0];

    // Check if they're using the exact same config object (recommended)
    if (this.config === firstBinder.config) {
      return; // Perfect - same config object
    }

    // Different config objects - validate they have same values
    if (this.config.appId !== firstBinder.config.appId) {
      throw new Error(
        `Configuration conflict for table "${table.tableName}".\n\n` +
        `Binder "${firstBinder.node.id}" uses appId: "${firstBinder.config.appId}"\n` +
        `Binder "${this.node.id}" uses appId: "${this.config.appId}"\n\n` +
        `All bindings to the same table MUST use the same appId.\n\n` +
        `RECOMMENDED: Share the same TableBindingConfig object:\n` +
        `  const config = new TableBindingConfig('${firstBinder.config.appId}', credentials);\n` +
        `  new ChaimDynamoDBBinder(this, '${firstBinder.node.id}', { ..., config });\n` +
        `  new ChaimDynamoDBBinder(this, '${this.node.id}', { ..., config });`
      );
    }

    // Validate credentials match
    const firstCreds = JSON.stringify(firstBinder.config.credentials);
    const thisCreds = JSON.stringify(this.config.credentials);
    
    if (firstCreds !== thisCreds) {
      throw new Error(
        `Configuration conflict for table "${table.tableName}".\n\n` +
        `Binder "${firstBinder.node.id}" uses different credentials than "${this.node.id}".\n\n` +
        `All bindings to the same table MUST use the same credentials.\n\n` +
        `RECOMMENDED: Share the same TableBindingConfig object to avoid this error.`
      );
    }

    // Warn about different failureMode (not an error)
    if (this.config.failureMode !== firstBinder.config.failureMode) {
      console.warn(
        `Warning: Different failureMode for table "${table.tableName}".\n` +
        `  "${firstBinder.node.id}": ${firstBinder.config.failureMode}\n` +
        `  "${this.node.id}": ${this.config.failureMode}\n` +
        `Consider sharing the same TableBindingConfig object.`
      );
    }
  }

  /**
   * Abstract method - subclasses implement store-specific metadata extraction.
   */
  protected abstract extractMetadata(): DataStoreMetadata;

  /**
   * Override in subclasses to provide the table construct for stable identity.
   * Default returns undefined (will fall back to construct path).
   */
  protected getTable(): dynamodb.ITable | undefined {
    return undefined;
  }

  /**
   * Get the resource name for display and filenames.
   * For DynamoDB, this is the user label (not necessarily the physical table name).
   * 
   * Subclasses can override this to provide a more meaningful name
   * (e.g., construct node ID instead of physical resource name which may contain tokens).
   */
  protected getResourceName(): string {
    const metadata = this.dataStoreMetadata as any;
    return metadata.tableName || metadata.name || 'resource';
  }

  /**
   * Get the entity name from schema.
   */
  private getEntityName(): string {
    return this.schemaData.entityName;
  }

  /**
   * Read package version from package.json.
   * Used to populate producer metadata in snapshots.
   */
  private getPackageVersion(): string {
    try {
      const packagePath = path.join(__dirname, '..', '..', 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      return packageJson.version || '0.0.0';
    } catch (error) {
      console.warn('Failed to read package version:', error);
      return '0.0.0';
    }
  }



  /**
   * Build a LOCAL snapshot payload for CLI consumption.
   * Does not include eventId or contentHash - those are generated at deploy-time.
   */
  private buildLocalSnapshot(params: {
    accountId: string;
    region: string;
    stackName: string;
    datastoreType: string;
    resourceName: string;
    resourceId: string;
  }): LocalSnapshotPayload {
    const capturedAt = new Date().toISOString();
    const stack = cdk.Stack.of(this);

    // Build provider identity
    const providerIdentity = {
      cloud: 'aws' as const,
      accountId: params.accountId,
      region: params.region,
      deploymentSystem: 'cloudformation' as const,
      deploymentId: stack.stackId,
    };

    // Build binding identity
    const stableResourceKey = `${params.datastoreType}:path:${params.stackName}/${params.resourceName}`;
    const entityId = `${this.config.appId}:${this.schemaData.entityName}`;
    const bindingId = `${this.config.appId}:${stableResourceKey}:${this.schemaData.entityName}`;

    const identity = {
      appId: this.config.appId,
      entityName: this.schemaData.entityName,
      stableResourceKeyStrategy: 'cdk-construct-path' as const,
      stableResourceKey,
      resourceId: params.resourceId,
      entityId,
      bindingId,
    };

    // Build operation metadata
    const operation = {
      eventId: this.generateUuid(),
      requestType: 'Create' as const,
      failureMode: this.config.failureMode,
    };

    // Build resolution metadata
    const hasTokens = this.detectUnresolvedTokens(this.dataStoreMetadata);
    const resolution = {
      mode: 'LOCAL' as const,
      hasTokens,
    };

    // Build hashes
    const schemaBytes = JSON.stringify(this.schemaData);
    const schemaHash = 'sha256:' + crypto.createHash('sha256').update(schemaBytes).digest('hex');
    const hashes = {
      schemaHash,
      contentHash: '',
    };

    // Build resource metadata
    const resource = this.buildResourceMetadata(params);

    // Build producer metadata
    const producer = {
      component: 'chaim-cdk' as const,
      version: this.getPackageVersion(),
      runtime: process.version,
    };

    return {
      snapshotVersion: SNAPSHOT_SCHEMA_VERSION,
      action: 'UPSERT',
      capturedAt,
      providerIdentity,
      identity,
      operation,
      resolution,
      hashes,
      schema: this.schemaData,
      resource,
      producer,
    };
  }

  /**
   * Build resource metadata from dataStore metadata.
   */
  private buildResourceMetadata(params: any): any {
    const dynamoMetadata = this.dataStoreMetadata as any;
    
    return {
      type: 'dynamodb',
      kind: 'table',
      id: dynamoMetadata.tableArn,
      name: dynamoMetadata.tableName,
      region: params.region,
      partitionKey: dynamoMetadata.partitionKey,
      sortKey: dynamoMetadata.sortKey,
      globalSecondaryIndexes: dynamoMetadata.globalSecondaryIndexes,
      localSecondaryIndexes: dynamoMetadata.localSecondaryIndexes,
      ttlAttribute: dynamoMetadata.ttlAttribute,
      streamEnabled: dynamoMetadata.streamEnabled,
      streamViewType: dynamoMetadata.streamViewType,
      billingMode: dynamoMetadata.billingMode,
      encryptionKeyArn: dynamoMetadata.encryptionKeyArn,
    };
  }

  /**
   * Detect if metadata contains unresolved CDK tokens.
   */
  private detectUnresolvedTokens(metadata: any): boolean {
    const str = JSON.stringify(metadata);
    return str.includes('${Token[');
  }

  /**
   * Generate a UUID v4 for operation tracking.
   */
  private generateUuid(): string {
    return crypto.randomUUID();
  }

  /**
   * Compute a SHA-256 fingerprint of the full snapshot payload.
   *
   * This fingerprint is used as a CloudFormation custom resource property
   * so that any change to the snapshot content triggers a Lambda re-invocation.
   * It is NOT the canonical contentHash used by Chaim SaaS for deduplication —
   * that is computed at Lambda runtime over the final enhanced payload.
   *
   * Fields excluded from fingerprinting:
   * - capturedAt: changes every synth (timestamp), would cause unnecessary invocations
   * - operation.eventId: regenerated every synth (UUID), would cause unnecessary invocations
   * - hashes.contentHash: always empty at synth time
   */
  private computeSnapshotFingerprint(snapshot: LocalSnapshotPayload): string {
    // Exclude volatile fields that change every synth but don't represent meaningful content changes
    const { capturedAt: _capturedAt, operation, hashes, ...stableFields } = snapshot;
    const { eventId: _eventId, ...stableOperation } = operation;
    const { contentHash: _contentHash, ...stableHashes } = hashes;

    const fingerprintPayload = {
      ...stableFields,
      operation: stableOperation,
      hashes: stableHashes,
    };

    const bytes = JSON.stringify(fingerprintPayload);
    return 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
  }

  /**
   * Apply snapshot cache policy based on CDK context.
   * 
   * Checks the `chaimSnapshotCachePolicy` context value:
   * - NONE (default): No cleanup
   * - PRUNE_STACK: Delete existing stack snapshots before writing new ones
   * 
   * This runs once per stack (tracked by static flag) to avoid
   * multiple cleanup attempts when binding multiple entities.
   */
  private applySnapshotCachePolicy(params: {
    accountId: string;
    region: string;
    stackName: string;
  }): void {
    // Get policy from CDK context (defaults to NONE)
    const policyValue = this.node.tryGetContext(SNAPSHOT_CACHE_POLICY_CONTEXT_KEY);
    const policy = this.parseSnapshotCachePolicy(policyValue);

    if (policy === SnapshotCachePolicy.NONE) {
      return; // No cleanup
    }

    // Check if we've already cleaned this stack in this synth
    const stack = cdk.Stack.of(this);
    const cleanupKey = `__chaim_snapshot_cleanup_${params.stackName}`;
    
    if ((stack.node as any)[cleanupKey]) {
      return; // Already cleaned in this synth
    }

    // Mark as cleaned to avoid duplicate cleanup
    (stack.node as any)[cleanupKey] = true;

    if (policy === SnapshotCachePolicy.PRUNE_STACK) {
      const result = pruneStackSnapshots({
        accountId: params.accountId,
        region: params.region,
        stackName: params.stackName,
        verbose: false, // Don't spam console during synth
      });

      // Only log if verbose mode or errors
      if (result.deletedCount > 0 || result.errors.length > 0) {
        console.log(`[Chaim] Pruned ${result.deletedCount} snapshot(s) for stack: ${params.stackName}`);
        
        if (result.errors.length > 0) {
          console.warn(`[Chaim] Cleanup warnings:`, result.errors);
        }
      }
    }
  }

  /**
   * Parse snapshot cache policy from context value.
   */
  private parseSnapshotCachePolicy(value: unknown): SnapshotCachePolicy {
    if (typeof value !== 'string') {
      return DEFAULT_SNAPSHOT_CACHE_POLICY;
    }

    const upperValue = value.toUpperCase();
    
    if (upperValue === 'NONE' || upperValue === 'DISABLED') {
      return SnapshotCachePolicy.NONE;
    }
    
    if (upperValue === 'PRUNE_STACK' || upperValue === 'PRUNE') {
      return SnapshotCachePolicy.PRUNE_STACK;
    }

    console.warn(
      `[Chaim] Unknown chaimSnapshotCachePolicy: "${value}". ` +
      `Valid values: NONE, PRUNE_STACK. Defaulting to NONE.`
    );
    
    return DEFAULT_SNAPSHOT_CACHE_POLICY;
  }

  /**
   * Extract stack name from stableResourceKey.
   * Format: dynamodb:path:StackName/ResourceName
   */
  private extractStackNameFromResourceKey(stableResourceKey: string): string {
    const match = stableResourceKey.match(/path:([^/]+)/);
    return match ? match[1] : 'unknown';
  }

  /**
   * Write LOCAL snapshot to OS cache for chaim-cli consumption.
   * Uses hierarchical path: aws/{accountId}/{region}/{stackName}/{datastoreType}/{resourceId}.json
   * 
   * @param snapshot - The snapshot payload to write
   * @returns The path where snapshot was written
   */
  private writeLocalSnapshotToDisk(snapshot: LocalSnapshotPayload): string {
    const stackName = this.extractStackNameFromResourceKey(snapshot.identity.stableResourceKey);
    
    const dir = getSnapshotDir({
      accountId: snapshot.providerIdentity.accountId,
      region: snapshot.providerIdentity.region,
      stackName,
      datastoreType: snapshot.resource.type,
    });
    
    ensureDirExists(dir);
    
    const filePath = getLocalSnapshotPath({
      accountId: snapshot.providerIdentity.accountId,
      region: snapshot.providerIdentity.region,
      stackName,
      datastoreType: snapshot.resource.type,
      resourceId: snapshot.identity.resourceId,
    });
    
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
    
    return filePath;
  }


  /**
   * Find the CDK project root by walking up from current module.
   */
  private findCdkProjectRoot(): string {
    let currentDir = __dirname;
    for (let i = 0; i < 10; i++) {
      const cdkJsonPath = path.join(currentDir, 'cdk.json');
      if (fs.existsSync(cdkJsonPath)) {
        return currentDir;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break;
      }
      currentDir = parentDir;
    }
    // Fallback to cwd
    return process.cwd();
  }

  /**
   * Write snapshot and Lambda handler to isolated CDK asset directory for Lambda bundling.
   * 
   * Asset directory is per {stackName}/{resourceId} and MUST NOT be shared.
   * The Lambda reads ./snapshot.json from its bundle, NOT from env vars or OS cache.
   * 
   * The handler is copied from the canonical handler file (src/lambda-handler/handler.js)
   * rather than being generated inline - this ensures a single source of truth.
   *
   * @returns The asset directory path
   */
  private writeSnapshotAsset(snapshot: LocalSnapshotPayload, stackName: string): string {
    const cdkRoot = this.findCdkProjectRoot();
    const assetDir = path.join(cdkRoot, 'cdk.out', 'chaim', 'assets', stackName, this.resourceId);
    ensureDirExists(assetDir);

    // Write snapshot.json (OVERWRITE each synth)
    const snapshotPath = path.join(assetDir, 'snapshot.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');

    // Copy canonical Lambda handler (OVERWRITE each synth)
    const handlerDestPath = path.join(assetDir, 'index.js');
    fs.copyFileSync(LAMBDA_HANDLER_PATH, handlerDestPath);

    return assetDir;
  }

  /**
   * Deploy Lambda function and custom resource for ingestion.
   */
  private deployIngestionResources(assetDir: string): void {
    const handler = this.createIngestionLambda(assetDir);
    this.createCustomResource(handler);
  }

  /**
   * Create Lambda function for ingestion workflow.
   * Lambda reads snapshot from its bundled asset directory.
   */
  private createIngestionLambda(assetDir: string): lambda.Function {
    const handler = new lambda.Function(this, 'IngestionHandler', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(assetDir),
      timeout: cdk.Duration.minutes(5),
      environment: this.buildLambdaEnvironment(),
    });

    // Grant CloudWatch Logs permissions
    handler.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: ['*'],
      })
    );

    // Grant Secrets Manager permissions if using secrets
    const { credentials } = this.config;
    if (credentials.credentialType === 'secretsManager' && credentials.secretName) {
      handler.addToRolePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['secretsmanager:GetSecretValue'],
          resources: [`arn:aws:secretsmanager:*:*:secret:${credentials.secretName}*`],
        })
      );
    }

    return handler;
  }

  /**
   * Build Lambda environment variables.
   * Note: Snapshot is NOT passed via env - Lambda reads from bundled asset.
   */
  private buildLambdaEnvironment(): Record<string, string> {
    // Allow maintainer override via CDK context, otherwise use default
    const apiBaseUrl = this.node.tryGetContext('chaimApiBaseUrl') ?? DEFAULT_CHAIM_API_BASE_URL;
    const { credentials, failureMode } = this.config;

    const env: Record<string, string> = {
      APP_ID: this.config.appId,
      FAILURE_MODE: failureMode,
      CHAIM_API_BASE_URL: apiBaseUrl,
      CHAIM_MAX_SNAPSHOT_BYTES: String(DEFAULT_MAX_SNAPSHOT_BYTES),
    };

    if (credentials.credentialType === 'secretsManager') {
      env.SECRET_NAME = credentials.secretName!;
    } else {
      env.API_KEY = credentials.apiKey!;
      env.API_SECRET = credentials.apiSecret!;
    }

    return env;
  }

  /**
   * Create CloudFormation custom resource.
   *
   * SnapshotFingerprint is included as a property so that CloudFormation
   * detects changes and triggers an Update invocation of the Lambda whenever
   * the snapshot content changes (schema, resource metadata, identity, etc.).
   * Without this, CloudFormation would only invoke the Lambda on initial Create
   * or Delete — not when the bundled snapshot.json is updated.
   */
  private createCustomResource(handler: lambda.Function): void {
    const provider = new cr.Provider(this, 'IngestionProvider', {
      onEventHandler: handler,
    });

    new cdk.CustomResource(this, 'IngestionResource', {
      serviceToken: provider.serviceToken,
      properties: {
        ResourceId: this.resourceId,
        SnapshotFingerprint: this.snapshotFingerprint,
      },
    });
  }
}
