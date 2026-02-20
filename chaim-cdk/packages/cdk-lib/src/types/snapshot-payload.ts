import { SchemaData } from '@chaim-tools/chaim-bprint-spec';
import { GSIMetadata, LSIMetadata } from './data-store-metadata';

/**
 * Snapshot payload types for Chaim CDK.
 * 
 * ⚠️ CONTRACT: These types define the structure of snapshot files consumed by:
 * - chaim-ingest-service (Java): com.chaim.ingest.model.SnapshotPayload
 * 
 * When modifying these types:
 * 1. For additive/optional changes: bump minor version (3.0 → 3.1)
 * 2. For breaking changes: bump major version (3.x → 4.0)
 * 3. Coordinate with chaim-ingest-service to add version handling
 */

/**
 * Provider/cloud identity metadata.
 * Contains AWS account, region, and deployment system information.
 */
export interface ProviderIdentity {
  /** Cloud provider (e.g., 'aws', 'gcp', 'azure') */
  readonly cloud: 'aws';
  
  /** AWS account ID */
  readonly accountId: string;
  
  /** AWS region */
  readonly region: string;
  
  /** Deployment system (CloudFormation, Terraform, etc.) */
  readonly deploymentSystem: 'cloudformation';
  
  /** CloudFormation stack ID/ARN (may be token in LOCAL mode) */
  readonly deploymentId?: string;
  
  /** CloudFormation request ID (deploy-time only) */
  readonly requestId?: string;
}

/**
 * Binding identity metadata.
 * Contains all information needed to uniquely identify a binding.
 */
export interface BindingIdentity {
  /** Application ID */
  readonly appId: string;
  
  /** Entity name from schema */
  readonly entityName: string;
  
  /** Strategy used to generate stableResourceKey */
  readonly stableResourceKeyStrategy: 'cdk-construct-path';
  
  /** Stable resource key (e.g., dynamodb:path:StackName/TableName) */
  readonly stableResourceKey: string;
  
  /** Generated resource ID: {resourceName}__{entityName}[__N] */
  readonly resourceId: string;
  
  /** Entity identifier: {appId}:{entityName} */
  readonly entityId: string;
  
  /** Stable binding identifier: {appId}:{stableResourceKey}:{entityName} */
  readonly bindingId: string;
}

/**
 * Operation metadata for tracking this binding operation.
 * Generated at synth-time, updated at deploy-time.
 */
export interface OperationMetadata {
  /** UUID for this operation (generated at synth-time) */
  readonly eventId: string;

  /** CloudFormation request type */
  readonly requestType: 'Create' | 'Update' | 'Delete';

  /** Failure handling mode */
  readonly failureMode: 'BEST_EFFORT' | 'STRICT';
}

/**
 * Resolution metadata indicating token resolution status.
 */
export interface ResolutionMetadata {
  /** Snapshot mode: LOCAL (synth-time) or PUBLISHED (deploy-time) */
  readonly mode: 'LOCAL' | 'PUBLISHED';
  
  /** Whether any CDK tokens remain unresolved */
  readonly hasTokens: boolean;
}

/**
 * Delete metadata for DELETE snapshots.
 * Provides context about why and what scope was deleted.
 */
export interface DeleteMetadata {
  /**
   * Why the resource was deleted (enum).
   * - STACK_DELETED: Entire CloudFormation stack was deleted
   * - BINDER_REMOVED: ChaimBinder construct removed from stack
   * - ENTITY_REMOVED: Entity definition removed but binding may persist
   * - UNKNOWN: Deletion reason could not be determined
   */
  readonly reason: 'STACK_DELETED' | 'BINDER_REMOVED' | 'ENTITY_REMOVED' | 'UNKNOWN';

  /**
   * What scope is being deleted (enum).
   * - STACK: Entire stack and all bindings
   * - BINDING: Specific entity binding to a data store
   * - ENTITY: Entity definition across bindings
   * 
   * Should align with reason:
   * - STACK_DELETED -> STACK
   * - BINDER_REMOVED -> BINDING
   * - ENTITY_REMOVED -> ENTITY
   * - UNKNOWN -> BINDING (default)
   */
  readonly scope: 'STACK' | 'BINDING' | 'ENTITY';

  /** ISO 8601 timestamp of deletion */
  readonly deletedAt: string;
}

/**
 * Hash metadata for content integrity and deduplication.
 */
export interface HashMetadata {
  /** SHA-256 hash of schema section (with 'sha256:' prefix) */
  readonly schemaHash: string;

  /** SHA-256 hash of full snapshot content (with 'sha256:' prefix) */
  readonly contentHash: string;
}

/**
 * Resource metadata for the data store.
 * Provider-focused, contains only infrastructure metadata.
 */
export interface ResourceMetadata {
  /** Provider type (e.g., 'dynamodb', 's3', 'postgres') */
  readonly type: 'dynamodb';
  
  /** Resource kind (e.g., 'table', 'bucket', 'database') */
  readonly kind?: 'table';
  
  /** Resource ARN or provider-specific ID */
  readonly id: string;
  
  /** Resource name */
  readonly name: string;
  
  /** AWS region */
  readonly region: string;
  
  // DynamoDB-specific metadata
  readonly partitionKey: string;
  readonly sortKey?: string;
  readonly globalSecondaryIndexes?: GSIMetadata[];
  readonly localSecondaryIndexes?: LSIMetadata[];
  readonly ttlAttribute?: string;
  readonly streamEnabled?: boolean;
  readonly streamViewType?: string;
  readonly billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';
  readonly encryptionKeyArn?: string;
}

/**
 * Producer metadata for debugging and support.
 * Identifies what component produced the snapshot.
 */
export interface ProducerMetadata {
  /** Component name */
  readonly component: 'chaim-cdk';

  /** Component version from package.json */
  readonly version: string;

  /** Lambda runtime (e.g., 'nodejs20.x') */
  readonly runtime: string;

}

/**
 * LOCAL snapshot payload written to OS cache during synthesis (v3.0).
 * 
 * This is the primary snapshot type used for CLI code generation
 * and Lambda bundling at synth-time.
 * 
 * v3.0 restructures the payload into logical sections for better clarity
 * and multi-provider support.
 * 
 * @contract chaim-ingest-service: com.chaim.ingest.model.SnapshotPayload
 */
export interface LocalSnapshotPayload {
  /**
   * Snapshot version for backward compatibility.
   * The chaim-ingest-service uses this to parse different payload versions.
   * 
   * Versioning strategy:
   * - Minor bump (3.0 → 3.1): Additive, optional field changes
   * - Major bump (3.x → 4.0): Breaking changes (removed/renamed/required fields)
   * 
   * @contract chaim-ingest-service: com.chaim.ingest.model.SnapshotPayload
   */
  readonly snapshotVersion: '3.0';

  /**
   * Action type for this snapshot.
   * - UPSERT: Create or update entity metadata
   * - DELETE: Mark entity as deleted
   */
  readonly action: 'UPSERT' | 'DELETE';

  /** ISO 8601 timestamp of snapshot creation */
  readonly capturedAt: string;

  /** Provider/cloud identity (AWS account, region, deployment system) */
  readonly providerIdentity: ProviderIdentity;

  /** Binding identity (appId, entityName, resourceId, bindingId, etc.) */
  readonly identity: BindingIdentity;

  /** Operation metadata (eventId, requestType, failureMode) */
  readonly operation: OperationMetadata;

  /** Resolution metadata (mode, hasTokens) */
  readonly resolution: ResolutionMetadata;

  /** Hash metadata (schemaHash, contentHash) */
  readonly hashes: HashMetadata;

  /** Validated .bprint schema data (null for DELETE actions) */
  readonly schema: SchemaData | null;

  /** Resource metadata (simplified, provider-focused) */
  readonly resource: ResourceMetadata;

  /** Producer metadata (component, version, runtime, mode) */
  readonly producer: ProducerMetadata;
}

/**
 * PUBLISHED snapshot payload enhanced by Lambda handler at deploy-time.
 * 
 * This extends LocalSnapshotPayload with additional metadata added during deployment:
 * - operation: eventId, cfRequestId, requestType, failureMode
 * - hashes: contentHash, schemaHash
 * - producer: component, version, runtime, mode
 * - delete: (DELETE only) reason, scope, deletedAt
 * 
 * This is the format uploaded to S3 and consumed by chaim-ingest-service.
 */
export interface PublishedSnapshotPayload extends Omit<LocalSnapshotPayload, 'action' | '_schemaHash' | '_packageVersion'> {
  /** Action is required for published snapshots */
  readonly action: 'UPSERT' | 'DELETE';

  /** Operation metadata (added at deploy-time) */
  readonly operation: OperationMetadata;

  /** Hash metadata (added at deploy-time) */
  readonly hashes: HashMetadata;

  /** Producer metadata (added at deploy-time) */
  readonly producer: ProducerMetadata;

  /** Delete metadata (only for DELETE actions) */
  readonly delete?: DeleteMetadata;
}

/**
 * Response from Chaim ingestion API after snapshot-ref commit.
 */
export interface IngestResponse {
  /** Event ID echoed back */
  readonly eventId: string;

  /** Ingestion status */
  readonly status: 'SUCCESS' | 'FAILED';

  /** Error message (if failed) */
  readonly errorMessage?: string;

  /** Timestamp when ingestion was processed */
  readonly processedAt: string;
}

/**
 * CloudFormation custom resource response data.
 * Kept minimal - actual payload is in S3.
 */
export interface CustomResourceResponseData {
  /** Event ID for tracking */
  readonly EventId: string;

  /** Ingestion status */
  readonly IngestStatus: 'SUCCESS' | 'FAILED';

  /** Content hash for change detection */
  readonly ContentHash: string;

  /** Timestamp */
  readonly Timestamp: string;
}
