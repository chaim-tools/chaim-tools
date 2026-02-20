/**
 * Chaim API endpoint configuration.
 * 
 * This is the single source of truth for all Chaim API URLs.
 */

/**
 * Default Chaim API base URL.
 * Can be overridden via:
 * - CDK context: `chaimApiBaseUrl`
 * - Environment variable: `CHAIM_API_BASE_URL`
 */
export const DEFAULT_CHAIM_API_BASE_URL = 'https://ingest.chaim.co';

/**
 * Chaim ingestion API endpoints (relative paths).
 */
export const CHAIM_ENDPOINTS = {
  /** Request presigned S3 upload URL with HMAC authentication */
  PRESIGN: '/ingest/presign',
} as const;

/**
 * Default request timeout in milliseconds.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/**
 * Default maximum snapshot size in bytes (10MB).
 */
export const DEFAULT_MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;

/**
 * Current schema version for snapshot payloads.
 * Increment when making changes to LocalSnapshotPayload.
 * 
 * Version history:
 * - 1.0: Initial schema
 * - 1.1: Added operation identity, normalized identity fields (bindingId, tableId, entityId),
 *        enhanced DELETE metadata (reason, scope), content hashing (contentHash, schemaHash),
 *        producer metadata (component, version, runtime, mode), and removed duplicate
 *        dataStore fields (arn, name, account)
 * - 2.0: BREAKING - Removed redundant top-level fields (appId, stackName, datastoreType, tableId, entityId),
 *        made identity object required, all binding metadata now in identity object only
 * - 3.0: BREAKING - Complete restructuring into logical sections: providerIdentity (cloud/infra metadata),
 *        identity (binding metadata with moved stableResourceKey/resourceId/entityId), operation (event tracking),
 *        resolution (token status), resource (simplified, provider-focused, renamed from dataStore),
 *        producer (explicit component tracking). Renamed schemaVersion to snapshotVersion.
 * 
 * @see LocalSnapshotPayload.snapshotVersion
 */
export const SNAPSHOT_SCHEMA_VERSION = '3.0' as const;