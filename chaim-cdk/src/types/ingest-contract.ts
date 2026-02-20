/**
 * Chaim Ingestion API Contract Types
 * 
 * This file defines the request/response types for the Chaim ingestion API.
 * The ingestion flow is:
 * 1. POST /ingest/upload-url → get presigned S3 URL
 * 2. PUT snapshot bytes to presigned URL
 * 3. POST /ingest/snapshot-ref → commit the snapshot reference
 */

/**
 * Action type for snapshot-ref endpoint.
 */
export type SnapshotAction = 'UPSERT' | 'DELETE';

/**
 * Request payload for POST /ingest/presign
 */
export interface UploadUrlRequest {
  /** Application ID */
  readonly appId: string;
  
  /** Unique event ID (UUID v4) */
  readonly eventId: string;
  
  /** SHA-256 hash of snapshot bytes (format: "sha256:<hex>") */
  readonly contentHash: string;
  
  /** Resource ID for the entity binding (used for schemaVersion validation) */
  readonly resourceId?: string;
  
  /** Schema version from the .bprint file (customer-controlled) */
  readonly schemaVersion?: string;
  
  /** SHA-256 hash of schema content excluding the schemaVersion field.
   *  Allows the server to detect content changes independently of version bumps. */
  readonly schemaContentHash?: string;
}

/**
 * Response from POST /ingest/upload-url
 */
export interface UploadUrlResponse {
  /** Presigned S3 URL for uploading snapshot */
  readonly uploadUrl: string;
  
  /** ISO 8601 timestamp when the URL expires */
  readonly expiresAt: string;
}

/**
 * Request payload for POST /ingest/snapshot-ref (UPSERT action)
 */
export interface SnapshotRefUpsertRequest {
  /** Action type */
  readonly action: 'UPSERT';
  
  /** Application ID */
  readonly appId: string;
  
  /** Unique event ID (UUID v4) */
  readonly eventId: string;
  
  /** SHA-256 hash of snapshot bytes */
  readonly contentHash: string;
  
  /** Data store type (e.g., 'dynamodb') */
  readonly datastoreType: string;
  
  /** Data store ARN */
  readonly datastoreArn: string;
  
  /** Resource ID for the binding */
  readonly resourceId: string;
  
  /** Stack name */
  readonly stackName: string;
}

/**
 * Request payload for POST /ingest/snapshot-ref (DELETE action)
 */
export interface SnapshotRefDeleteRequest {
  /** Action type */
  readonly action: 'DELETE';
  
  /** Application ID */
  readonly appId: string;
  
  /** Unique event ID (UUID v4) */
  readonly eventId: string;
  
  /** Resource ID for the binding */
  readonly resourceId: string;
  
  /** Stack name */
  readonly stackName: string;
  
  /** Data store type (e.g., 'dynamodb') */
  readonly datastoreType: string;
}

/**
 * Union type for snapshot-ref request
 */
export type SnapshotRefRequest = SnapshotRefUpsertRequest | SnapshotRefDeleteRequest;

/**
 * Response from POST /ingest/snapshot-ref
 */
export interface SnapshotRefResponse {
  /** Event ID echoed back */
  readonly eventId: string;
  
  /** Processing status */
  readonly status: 'SUCCESS' | 'FAILED';
  
  /** ISO 8601 timestamp when processed */
  readonly processedAt: string;
  
  /** Error message (if status is FAILED) */
  readonly errorMessage?: string;
}

/**
 * CloudFormation custom resource event types.
 */
export type CloudFormationRequestType = 'Create' | 'Update' | 'Delete';

/**
 * CloudFormation custom resource response data.
 * Kept minimal - actual payload is in S3.
 */
export interface CustomResourceResponseData {
  /** Event ID for tracking */
  readonly EventId: string;
  
  /** Ingestion status */
  readonly IngestStatus: 'SUCCESS' | 'FAILED';
  
  /** Content hash (only for UPSERT) */
  readonly ContentHash?: string;
  
  /** Action performed */
  readonly Action: SnapshotAction;
  
  /** Timestamp */
  readonly Timestamp: string;
  
  /** Error message (if failed) */
  readonly Error?: string;
}

