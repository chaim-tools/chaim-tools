/**
 * Type definitions for chaim-cli.
 * 
 * These types match the snapshot format produced by chaim-cdk and
 * provide type safety for snapshot consumption and code generation.
 */

export {
  // Schema types
  Identity,
  SchemaField,
  SchemaData,
  Annotations,
  
  // Data store metadata
  GSIMetadata,
  LSIMetadata,
  BaseDataStoreMetadata,
  DynamoDBMetadata,
  DataStoreMetadata,
  
  // Context and identity
  StackContext,
  StableIdentity,
  
  // Snapshot payload
  LocalSnapshotPayload,
  
  // Java generator adapter
  TableMetadata,
} from './snapshot-payload';
