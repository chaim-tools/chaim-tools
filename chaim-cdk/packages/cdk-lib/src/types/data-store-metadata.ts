/**
 * Base metadata interface for all data store types.
 * Each data store binder extends this with store-specific fields.
 */
export interface BaseDataStoreMetadata {
  /** Data store type identifier */
  readonly type: string;

  /** AWS region */
  readonly region: string;

  /** Encryption key ARN (if configured) */
  readonly encryptionKeyArn?: string;
}

/**
 * DynamoDB table metadata captured during binding.
 * 
 * Note: Removed duplicate fields from v1.1:
 * - arn (use tableArn instead - globally unique)
 * - name (use tableName instead)
 * - account (use top-level accountId instead)
 */
export interface DynamoDBMetadata extends BaseDataStoreMetadata {
  readonly type: 'dynamodb';

  /** Table name */
  readonly tableName: string;

  /** Table ARN (globally unique identifier) */
  readonly tableArn: string;

  /** Partition key attribute name */
  readonly partitionKey: string;

  /** Sort key attribute name (if composite key) */
  readonly sortKey?: string;

  /** Global Secondary Indexes */
  readonly globalSecondaryIndexes?: GSIMetadata[];

  /** Local Secondary Indexes */
  readonly localSecondaryIndexes?: LSIMetadata[];

  /** TTL attribute name (if enabled) */
  readonly ttlAttribute?: string;

  /** Whether DynamoDB Streams is enabled */
  readonly streamEnabled?: boolean;

  /** Stream view type (if streams enabled) */
  readonly streamViewType?: string;

  /** Billing mode */
  readonly billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';
}

/**
 * Global Secondary Index metadata
 */
export interface GSIMetadata {
  readonly indexName: string;
  readonly partitionKey: string;
  readonly sortKey?: string;
  readonly projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  readonly nonKeyAttributes?: string[];
}

/**
 * Local Secondary Index metadata
 */
export interface LSIMetadata {
  readonly indexName: string;
  readonly sortKey: string;
  readonly projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  readonly nonKeyAttributes?: string[];
}

/**
 * Union type for all supported data store metadata.
 * Extend this union as new data stores are added.
 */
export type DataStoreMetadata = DynamoDBMetadata;
// Future: | AuroraMetadata | RDSMetadata | DocumentDBMetadata;


