// Main construct exports
export { ChaimDynamoDBBinder, ChaimDynamoDBBinderProps } from './binders/chaim-dynamodb-binder';

// Base class export (for extension by future data store binders)
export { BaseChaimBinder } from './binders/base-chaim-binder';

// Credentials factory
export {
  ChaimCredentials,
  IChaimCredentials,
} from './types/credentials';

// Failure mode enum
export { FailureMode } from './types/failure-mode';

// Type exports
export {
  BaseBinderProps,
  validateBinderProps,
} from './types/base-binder-props';

// Binding configuration
export { TableBindingConfig } from './types/table-binding-config';

export {
  BaseDataStoreMetadata,
  DynamoDBMetadata,
  GSIMetadata,
  LSIMetadata,
  DataStoreMetadata,
} from './types/data-store-metadata';

// Snapshot payload types
export {
  LocalSnapshotPayload,
  PublishedSnapshotPayload,
  OperationMetadata,
  DeleteMetadata,
  HashMetadata,
  ProducerMetadata,
  IngestResponse,
  CustomResourceResponseData,
} from './types/snapshot-payload';

// Ingest contract types
export {
  SnapshotAction,
  UploadUrlRequest,
  UploadUrlResponse,
  SnapshotRefUpsertRequest,
  SnapshotRefDeleteRequest,
  SnapshotRefRequest,
  SnapshotRefResponse,
  CloudFormationRequestType,
} from './types/ingest-contract';

// Config exports
export {
  DEFAULT_CHAIM_API_BASE_URL,
  CHAIM_ENDPOINTS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_MAX_SNAPSHOT_BYTES,
  SNAPSHOT_SCHEMA_VERSION,
} from './config/chaim-endpoints';

// OS cache utilities
export {
  getSnapshotBaseDir,
  getDefaultSnapshotBaseDir,
  ensureDirExists,
} from './services/os-cache-paths';

// CDK project root discovery
export {
  findCdkProjectRoot,
  getChaimAssetDir,
} from './services/cdk-project-root';

// Snapshot path utilities
export {
  normalizeAccountId,
  normalizeRegion,
  getSnapshotDir,
  getLocalSnapshotPath,
  writeLocalSnapshot,
} from './services/snapshot-paths';

// Stable identity for collision handling
export {
  StableIdentity,
  isToken,
  getStableResourceKey,
  buildMatchKey,
  generateResourceId,
  GenerateResourceIdParams,
} from './services/stable-identity';

// Service exports
export { SchemaService } from './services/schema-service';
export {
  IngestionService,
  IngestionConfig,
  INGESTION_ENDPOINTS,
  DEFAULT_INGESTION_CONFIG,
} from './services/ingestion-service';

// Re-export schema types from bprint-spec for convenience
export { SchemaData, Field, Identity } from '@chaim-tools/chaim-bprint-spec';
