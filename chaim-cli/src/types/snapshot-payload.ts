/**
 * Type definitions for LOCAL snapshot payloads produced by chaim-cdk.
 * 
 * These types match the snapshot format written to the OS cache by chaim-cdk.
 * The CLI reads these snapshots to generate DTOs and mapper clients.
 */

// ============================================================
// Schema Types (from @chaim-tools/chaim-bprint-spec)
// Duplicated here for self-containment
// ============================================================

/**
 * Identity configuration for the entity.
 */
export interface Identity {
  fields: string[];
}

/**
 * Field definition in the entity schema.
 */
export interface SchemaField {
  name: string;
  nameOverride?: string;
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'list' | 'map' | 'stringSet' | 'numberSet';
  required?: boolean;
  default?: string | number | boolean;
  enum?: string[];
  description?: string;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
  annotations?: Record<string, unknown>;
  items?: {
    type: 'string' | 'number' | 'boolean' | 'timestamp' | 'map';
    fields?: { name: string; type: string }[];
  };
  fields?: { name: string; type: string }[];
}

/**
 * Annotations for schema metadata.
 */
export interface Annotations {
  pii?: boolean;
  retention?: string;
  encryption?: string;
}

/**
 * Complete schema data from a .bprint file.
 * Schema v1.1 - flattened structure (no nested entity object).
 */
export interface SchemaData {
  schemaVersion: string;
  entityName: string;
  description: string;
  identity: Identity;
  fields: SchemaField[];
  annotations?: Annotations;
}

// ============================================================
// Data Store Metadata Types
// ============================================================

/**
 * Global Secondary Index metadata
 */
export interface GSIMetadata {
  indexName: string;
  partitionKey: string;
  sortKey?: string;
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  nonKeyAttributes?: string[];
}

/**
 * Local Secondary Index metadata
 */
export interface LSIMetadata {
  indexName: string;
  sortKey: string;
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  nonKeyAttributes?: string[];
}

/**
 * Base metadata interface for all data store types.
 */
export interface BaseDataStoreMetadata {
  /** Data store type identifier */
  type: string;

  /** AWS ARN of the data store resource */
  arn: string;

  /** Resource name */
  name: string;

  /** AWS region */
  region: string;

  /** AWS account ID */
  account: string;

  /** Encryption key ARN (if configured) */
  encryptionKeyArn?: string;
}

/**
 * DynamoDB table metadata captured during binding.
 */
export interface DynamoDBMetadata extends BaseDataStoreMetadata {
  type: 'dynamodb';

  /** Table name */
  tableName: string;

  /** Table ARN */
  tableArn: string;

  /** Partition key attribute name */
  partitionKey: string;

  /** Sort key attribute name (if composite key) */
  sortKey?: string;

  /** Global Secondary Indexes */
  globalSecondaryIndexes?: GSIMetadata[];

  /** Local Secondary Indexes */
  localSecondaryIndexes?: LSIMetadata[];

  /** TTL attribute name (if enabled) */
  ttlAttribute?: string;

  /** Whether DynamoDB Streams is enabled */
  streamEnabled?: boolean;

  /** Stream view type (if streams enabled) */
  streamViewType?: string;

  /** Billing mode */
  billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';
}

/**
 * Union type for all supported data store metadata.
 */
export type DataStoreMetadata = DynamoDBMetadata;

// ============================================================
// Stack Context
// ============================================================

/**
 * Stack context captured during CDK synthesis.
 */
export interface StackContext {
  /** AWS account ID (may be 'unknown' if unresolved at synth time) */
  account: string;

  /** AWS region (may be 'unknown' if unresolved at synth time) */
  region: string;

  /** CloudFormation stack ID */
  stackId: string;

  /** CloudFormation stack name */
  stackName: string;
}

// ============================================================
// Stable Identity
// ============================================================

/**
 * Stable identity for collision detection.
 * Uses synth-stable fields only (no tokens).
 */
export interface StableIdentity {
  /** Application ID (user input, always stable) */
  appId: string;

  /** CDK stack name */
  stackName: string;

  /** Data store type (e.g., 'dynamodb') */
  datastoreType: string;

  /** Entity name from schema */
  entityName: string;

  /** Best available stable resource key */
  stableResourceKey: string;
}

// ============================================================
// LOCAL Snapshot Payload
// ============================================================

/**
 * LOCAL snapshot payload written to OS cache during CDK synthesis.
 * 
 * This is the primary snapshot type used for CLI code generation.
 * Written at synth-time (runs for both `cdk synth` and `cdk deploy`).
 */
export interface LocalSnapshotPayload {
  /**
   * Action type for this snapshot.
   * - UPSERT: Create or update entity metadata (default)
   * - DELETE: Mark entity as deleted
   * 
   * If omitted, defaults to 'UPSERT' for backward compatibility.
   */
  action?: 'UPSERT' | 'DELETE';

  /** Cloud provider */
  provider: 'aws';

  /** AWS account ID (may be 'unknown' if unresolved at synth) */
  accountId: string;

  /** AWS region (may be 'unknown' if unresolved at synth) */
  region: string;

  /** CDK stack name */
  stackName: string;

  /** Data store type (e.g., 'dynamodb') */
  datastoreType: string;

  /** User-provided display label for the resource */
  resourceName: string;

  /** Generated resource ID: {resourceName}__{entityName}[__N] */
  resourceId: string;

  /** Stable identity for collision detection */
  identity: StableIdentity;

  /** Application ID from ChaimBinder props */
  appId: string;

  /** Validated .bprint schema data (null for DELETE actions) */
  schema: SchemaData | null;

  /** Data store metadata (DynamoDB, Aurora, etc.) */
  dataStore: DataStoreMetadata;

  /** CDK stack context */
  context: StackContext;

  /** ISO 8601 timestamp of snapshot creation */
  capturedAt: string;
}

// ============================================================
// Table Metadata (for Java Generator)
// ============================================================

/**
 * Table metadata object passed to the Java generator.
 * 
 * IMPORTANT: This is a plain object with properties, NOT getter functions.
 * The JavaGenerator serializes this to JSON via JSON.stringify(), and arrow
 * functions are not JSON-serializable (they get stripped).
 */
export interface TableMetadata {
  /** Table name */
  tableName: string;

  /** Table ARN */
  tableArn: string;

  /** AWS region */
  region: string;

  /** Partition key attribute name */
  partitionKey: string;

  /** Sort key attribute name (if composite key) */
  sortKey?: string;

  /** Global Secondary Indexes */
  globalSecondaryIndexes?: GSIMetadata[];

  /** Local Secondary Indexes */
  localSecondaryIndexes?: LSIMetadata[];
}
