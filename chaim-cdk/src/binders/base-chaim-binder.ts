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
import { ensureDirExists } from '../services/os-cache-paths';
import { getChaimAssetDir } from '../services/cdk-project-root';
import {
  normalizeAccountId,
  normalizeRegion,
  getSnapshotDir,
  getLocalSnapshotPath,
} from '../services/snapshot-paths';
import {
  StableIdentity,
  getStableResourceKey,
  generateResourceId,
} from '../services/stable-identity';
import {
  DEFAULT_CHAIM_API_BASE_URL,
  DEFAULT_MAX_SNAPSHOT_BYTES,
  SNAPSHOT_SCHEMA_VERSION,
} from '../config/chaim-endpoints';

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

  /** Path to the LOCAL snapshot file written during synth */
  public readonly localSnapshotPath: string;

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

    // Build stack context and identity
    const stack = cdk.Stack.of(this);
    const accountId = normalizeAccountId(stack.account);
    const region = normalizeRegion(stack.region);
    const stackName = stack.stackName;
    const datastoreType = this.dataStoreMetadata.type;

    // Get resource and entity names
    const resourceName = this.getResourceName();
    const entityName = this.getEntityName();

    // Build stable identity for collision detection
    const stableResourceKey = this.computeStableResourceKey(datastoreType);
    const identity: StableIdentity = {
      stableResourceKey,
    };

    // Determine cache directory and generate resource ID with collision handling
    const cacheDir = getSnapshotDir({ accountId, region, stackName, datastoreType });
    ensureDirExists(cacheDir);
    this.resourceId = generateResourceId({
      resourceName,
      entityName,
      appId: this.config.appId,
      stackName,
      datastoreType,
      stableResourceKey,
    }, cacheDir);

    // Build LOCAL snapshot payload
    const localSnapshot = this.buildLocalSnapshot({
      accountId,
      region,
      stackName,
      datastoreType,
      resourceName,
      identity,
    });

    // Compute snapshot fingerprint for CloudFormation change detection.
    // This hash covers the entire snapshot (schema + resource metadata + identity),
    // so any change — schema fields, table config, streams, billing mode, GSIs, etc. —
    // will trigger CloudFormation to re-invoke the ingestion Lambda.
    this.snapshotFingerprint = this.computeSnapshotFingerprint(localSnapshot);

    // Write LOCAL snapshot to OS cache (OVERWRITE on each synth)
    this.localSnapshotPath = this.writeLocalSnapshotToDisk(localSnapshot);

    // Write snapshot to CDK asset directory for Lambda (OVERWRITE)
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
   * Compute the best available stable resource key for collision detection.
   * Preference: physical table name > logical ID > construct path.
   * 
   * The key is namespaced with datastoreType to prevent collisions across
   * different datastore types.
   * 
   * Note: resourceName is display-only; do not use as physical identity.
   * logicalId/physicalName may be unavailable; fallback to constructPath.
   */
  private computeStableResourceKey(datastoreType: string): string {
    const table = this.getTable();
    if (table) {
      return getStableResourceKey(table, this, datastoreType);
    }
    // No table available - use construct path as fallback
    return `${datastoreType}:path:${this.node.path}`;
  }

  /**
   * Get the resource name for display and filenames.
   * For DynamoDB, this is the user label (not necessarily the physical table name).
   * 
   * Note: If the table name is a CDK token (unresolved at synth), we use
   * a sanitized construct ID instead to avoid special characters in file paths.
   */
  private getResourceName(): string {
    const metadata = this.dataStoreMetadata as any;
    const tableName = metadata.tableName || metadata.name;
    
    // Check if the name is a CDK token (unresolved)
    if (tableName && !this.isTokenValue(tableName)) {
      return tableName;
    }
    
    // Fallback to construct ID (always available and token-safe)
    return this.node.id;
  }

  /**
   * Check if a value is a CDK token (unresolved at synth-time).
   */
  private isTokenValue(value: string): boolean {
    return value.includes('${Token') || value.includes('${AWS::');
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
    const { capturedAt, operation, hashes, ...stableFields } = snapshot;
    const { eventId, ...stableOperation } = operation;
    const { contentHash, ...stableHashes } = hashes;

    const fingerprintPayload = {
      ...stableFields,
      operation: stableOperation,
      hashes: stableHashes,
    };

    const bytes = JSON.stringify(fingerprintPayload);
    return 'sha256:' + crypto.createHash('sha256').update(bytes).digest('hex');
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
   * Build a LOCAL snapshot payload for CLI consumption (v3.0).
   */
  private buildLocalSnapshot(params: {
    accountId: string;
    region: string;
    stackName: string;
    datastoreType: string;
    resourceName: string;
    identity: StableIdentity;
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

    // Build binding identity (using computed StableIdentity)
    const stableResourceKey = params.identity.stableResourceKey;
    const entityId = `${this.config.appId}:${this.schemaData.entityName}`;
    const bindingId = `${this.config.appId}:${stableResourceKey}:${this.schemaData.entityName}`;

    const identity = {
      appId: this.config.appId,
      entityName: this.schemaData.entityName,
      stableResourceKeyStrategy: 'cdk-construct-path' as const,
      stableResourceKey,
      resourceId: this.resourceId,
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
      runtime: process.version
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
   * Write the LOCAL snapshot to OS cache during CDK synth.
   * Uses hierarchical path structure: aws/{accountId}/{region}/{stackName}/{datastoreType}/{resourceId}.json
   *
   * @returns The path where the snapshot was written
   */
  private writeLocalSnapshotToDisk(snapshot: LocalSnapshotPayload): string {
    const stackName = this.extractStackNameFromResourceKey(snapshot.identity.stableResourceKey);
    
    const filePath = getLocalSnapshotPath({
      accountId: snapshot.providerIdentity.accountId,
      region: snapshot.providerIdentity.region,
      stackName,
      datastoreType: snapshot.resource.type,
      resourceId: snapshot.identity.resourceId,
    });

    const dir = getSnapshotDir({
      accountId: snapshot.providerIdentity.accountId,
      region: snapshot.providerIdentity.region,
      stackName,
      datastoreType: snapshot.resource.type,
    });
    ensureDirExists(dir);

    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');

    return filePath;
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
    const assetDir = getChaimAssetDir(stackName, this.resourceId);
    ensureDirExists(assetDir);

    // Write snapshot.json (OVERWRITE each synth)
    const snapshotPath = path.join(assetDir, 'snapshot.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');

    // Copy canonical Lambda handler (OVERWRITE each synth)
    // The handler is shipped as JS in the package - no compilation needed
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
