/**
 * Chaim Ingestion Lambda Handler
 * 
 * This is the CANONICAL Lambda handler for Chaim schema ingestion.
 * It implements the presigned upload flow with HMAC authentication:
 * 
 * Create/Update:
 *   1. Read snapshot.json from bundled asset
 *   2. Generate eventId (UUID v4) and nonce (UUID v4) at runtime
 *   3. Compute contentHash (SHA-256 of snapshot bytes)
 *   4. POST /ingest/presign with HMAC signature → get presigned S3 URL
 *   5. PUT snapshot bytes to presigned S3 URL
 * 
 * Delete:
 *   1. Build DELETE snapshot (action: 'DELETE', schema: null)
 *   2. POST /ingest/presign with HMAC signature → get presigned S3 URL
 *   3. PUT DELETE snapshot bytes to presigned S3 URL
 *   4. Return SUCCESS to CloudFormation
 * 
 * FailureMode:
 *   - STRICT: Return FAILED to CloudFormation on any error
 *   - BEST_EFFORT: Log error but return SUCCESS to CloudFormation
 */

const https = require('https');
const { URL } = require('url');
const fs = require('fs');
const crypto = require('crypto');

// Default configuration (can be overridden via environment variables)
const DEFAULT_API_BASE_URL = 'https://ingest.chaim.co';
const DEFAULT_MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024; // 10MB
const DEFAULT_REQUEST_TIMEOUT_MS = 30000;

/**
 * Infer deletion reason from CloudFormation event metadata.
 * 
 * This function attempts to determine why a resource is being deleted by analyzing
 * the CloudFormation event. If the reason cannot be confidently determined from
 * the available metadata, it defaults to 'BINDER_REMOVED' as the most common case.
 * 
 * Inference strategy:
 * 1. Check for stack deletion indicators in ResourceProperties
 * 2. Check for explicit resource removal patterns
 * 3. Fall back to BINDER_REMOVED (default) for uncertain cases
 * 
 * @param {Object} event - CloudFormation custom resource event
 * @param {Object} snapshotPayload - The original snapshot payload
 * @returns {Object} { reason, scope } - Deletion context
 */
function inferDeletionContext(event, snapshotPayload) {
  // Strategy 1: Check if entire stack is being deleted
  // CloudFormation may include StackStatus in ResourceProperties for some events
  const stackStatus = event.ResourceProperties?.StackStatus;
  
  if (stackStatus && stackStatus.includes('DELETE')) {
    return {
      reason: 'STACK_DELETED',
      scope: 'BINDING', // When stack is deleted, binding is removed
    };
  }
  
  // Strategy 2: Check for explicit resource removal indicators
  // The LogicalResourceId pattern can sometimes indicate the operation type
  const logicalResourceId = event.LogicalResourceId;
  if (logicalResourceId && logicalResourceId.includes('IngestionResource')) {
    // This is our custom resource being explicitly removed
    return {
      reason: 'BINDER_REMOVED',
      scope: 'BINDING',
    };
  }
  
  // Strategy 3: FALLBACK - Default to BINDER_REMOVED
  // This is the most common case when a ChaimBinder construct is removed from the CDK app
  // We default to this when we cannot confidently determine the reason from CF metadata
  console.log('Could not confidently determine deletion reason from CF event - defaulting to BINDER_REMOVED');
  return {
    reason: 'BINDER_REMOVED',
    scope: 'BINDING',
  };
}

/**
 * Get package version from embedded metadata in snapshot.
 * Falls back to a default if not available.
 */
function getPackageVersion(snapshotPayload) {
  // Check if snapshot has embedded version
  if (snapshotPayload._packageVersion) {
    return snapshotPayload._packageVersion;
  }
  // Fallback to a default version
  return '0.2.0';
}

/**
 * Lambda handler entry point.
 */
exports.handler = async (event, context) => {
  console.log('CloudFormation Event:', JSON.stringify(event, null, 2));
  
  const requestType = event.RequestType; // 'Create', 'Update', or 'Delete'
  const cfRequestId = event.RequestId; // CloudFormation RequestId
  const failureMode = process.env.FAILURE_MODE || 'STRICT';
  const apiBaseUrl = process.env.CHAIM_API_BASE_URL || DEFAULT_API_BASE_URL;
  const maxSnapshotBytes = parseInt(process.env.CHAIM_MAX_SNAPSHOT_BYTES || String(DEFAULT_MAX_SNAPSHOT_BYTES), 10);
  
  // Generate eventId at runtime (not synth-time) for audit/tracking
  const eventId = crypto.randomUUID();
  let contentHash = '';
  
  // PhysicalResourceId contract with CloudFormation:
  // - Create: return a new ID (eventId) — CloudFormation stores it
  // - Update: return the SAME ID from event.PhysicalResourceId — prevents resource replacement
  // - Delete: return the SAME ID from event.PhysicalResourceId — required by CloudFormation
  const physicalResourceId = (requestType === 'Create')
    ? eventId
    : event.PhysicalResourceId;
  
  try {
    // Read snapshot from bundled asset directory
    const snapshotBytes = fs.readFileSync('./snapshot.json', 'utf-8');
    const snapshotPayload = JSON.parse(snapshotBytes);
    
    // Build operation metadata (common for all request types)
    const operation = {
      eventId,
      cfRequestId,
      requestType,
      failureMode,
    };
    
    // Build producer metadata
    const producer = {
      component: 'chaim-cdk',
      version: getPackageVersion(snapshotPayload),
      runtime: 'nodejs20.x',
      mode: 'PUBLISHED',
    };
    
    if (requestType === 'Delete') {
      // DELETE flow: Send DELETE snapshot through presigned upload
      console.log('Processing Delete request - ChaimBinder removed from stack');
      console.log('Resource:', snapshotPayload.resourceId);
      console.log('Entity:', snapshotPayload.identity?.entityName);
      
      // Infer deletion context
      const deleteContext = inferDeletionContext(event, snapshotPayload);
      const deletedAt = new Date().toISOString();
      
      console.log('Deletion reason:', deleteContext.reason);
      console.log('Deletion scope:', deleteContext.scope);
      
      // Build DELETE snapshot with enhanced metadata
      // Remove internal fields before publishing
      const { _schemaHash, _packageVersion, ...cleanPayload } = snapshotPayload;
      
      const deleteSnapshot = {
        ...cleanPayload,
        action: 'DELETE',
        schema: null, // Schema not needed for deletion
        capturedAt: deletedAt,
        
        // NEW: Add operation metadata
        operation,
        
        // NEW: Add delete metadata
        delete: {
          reason: deleteContext.reason,
          scope: deleteContext.scope,
          deletedAt,
        },
        
        // NEW: Add producer metadata
        producer,
      };
      
      const deleteSnapshotBytes = JSON.stringify(deleteSnapshot, null, 2);
      
      // NEW: Compute hashes
      const deleteContentHash = 'sha256:' + crypto.createHash('sha256').update(deleteSnapshotBytes).digest('hex');
      
      deleteSnapshot.hashes = {
        contentHash: deleteContentHash,
        // No schemaHash for DELETE (schema is null)
      };
      
      const finalDeleteBytes = JSON.stringify(deleteSnapshot, null, 2);
      
      console.log('Sending DELETE snapshot through presigned upload...');
      
      // Get API credentials
      const { apiKey, apiSecret } = await getCredentials();
      
      // Step 1: Request presigned upload URL
      console.log('Step 1: Requesting presigned upload URL for DELETE snapshot...');
      const presignResponse = await postPresign({
        apiBaseUrl,
        apiKey,
        apiSecret,
        appId: deleteSnapshot.identity?.appId || deleteSnapshot.appId || process.env.APP_ID,
        eventId,
        contentHash: deleteContentHash,
      });
      
      const { uploadUrl } = presignResponse;
      console.log('Received presigned URL (expires at:', presignResponse.expiresAt + ')');
      
      // Step 2: Upload DELETE snapshot bytes to S3
      console.log('Step 2: Uploading DELETE snapshot to S3...');
      await uploadToS3(uploadUrl, finalDeleteBytes);
      console.log('DELETE snapshot uploaded to S3 successfully');
      console.log('S3 Key:', presignResponse.s3Key);
      
      console.log('Entity marked as deleted successfully');
      return buildResponse(physicalResourceId, eventId, 'SUCCESS', 'DELETE', deletedAt, deleteContentHash);
    }
    
    // CREATE/UPDATE flow: presigned upload
    console.log('Processing Create/Update request - executing ingestion workflow');
    console.log('EventId:', eventId);
    
    // Remove internal fields before publishing
    const { _schemaHash, _packageVersion, ...cleanPayload } = snapshotPayload;
    
    // Add operation and producer metadata to snapshot
    const enhancedSnapshot = {
      ...cleanPayload,
      operation,
      producer,
    };
    
    const enhancedSnapshotBytes = JSON.stringify(enhancedSnapshot, null, 2);
    
    // Compute hashes
    contentHash = 'sha256:' + crypto.createHash('sha256').update(enhancedSnapshotBytes).digest('hex');
    
    // Compute schemaHash if schema exists (use pre-computed from synth if available)
    let schemaHash;
    if (snapshotPayload._schemaHash) {
      schemaHash = snapshotPayload._schemaHash;
    } else if (snapshotPayload.schema) {
      const schemaBytes = JSON.stringify(snapshotPayload.schema);
      schemaHash = 'sha256:' + crypto.createHash('sha256').update(schemaBytes).digest('hex');
    }
    
    // Compute schemaContentHash (excluding schemaVersion) for server-side version validation.
    // This allows the server to detect if schema content changed without a version bump.
    let schemaContentHash;
    if (snapshotPayload.schema) {
      const { schemaVersion: _sv, ...schemaWithoutVersion } = snapshotPayload.schema;
      const schemaContentBytes = JSON.stringify(schemaWithoutVersion);
      schemaContentHash = 'sha256:' + crypto.createHash('sha256').update(schemaContentBytes).digest('hex');
    }
    
    enhancedSnapshot.hashes = {
      contentHash,
      schemaHash,
    };
    
    const finalSnapshotBytes = JSON.stringify(enhancedSnapshot, null, 2);
    
    console.log('ContentHash:', contentHash);
    if (schemaHash) {
      console.log('SchemaHash:', schemaHash);
    }
    
    // Validate snapshot size
    if (finalSnapshotBytes.length > maxSnapshotBytes) {
      throw new Error(
        `Snapshot size (${finalSnapshotBytes.length} bytes) exceeds maximum allowed (${maxSnapshotBytes} bytes)`
      );
    }
    
    // Get API credentials
    const { apiKey, apiSecret } = await getCredentials();
    
    // Step 1: Request presigned upload URL
    console.log('Step 1: Requesting presigned upload URL from /ingest/presign...');
    const presignResponse = await postPresign({
      apiBaseUrl,
      apiKey,
      apiSecret,
      appId: snapshotPayload.identity?.appId || snapshotPayload.appId || process.env.APP_ID,
      eventId,
      contentHash: enhancedSnapshot.hashes.contentHash,
      resourceId: snapshotPayload.resourceId,
      schemaVersion: snapshotPayload.schema?.schemaVersion,
      schemaContentHash,
    });
    
    const { uploadUrl } = presignResponse;
    console.log('Received presigned URL (expires at:', presignResponse.expiresAt + ')');
    
    // Step 2: Upload snapshot bytes to S3
    console.log('Step 2: Uploading snapshot to S3...');
    await uploadToS3(uploadUrl, finalSnapshotBytes);
    console.log('Snapshot uploaded to S3 successfully');
    console.log('S3 Key:', presignResponse.s3Key);
    
    return buildResponse(physicalResourceId, eventId, 'SUCCESS', 'UPSERT', snapshotPayload.capturedAt, contentHash);
    
  } catch (error) {
    console.error('Ingestion error:', error.message);
    console.error('Stack trace:', error.stack);
    
    if (failureMode === 'STRICT') {
      // STRICT mode: fail the CloudFormation deployment
      throw error;
    }
    
    // BEST_EFFORT mode: log error but return success to CloudFormation
    console.log('BEST_EFFORT mode: returning SUCCESS despite error');
    return buildResponse(physicalResourceId, eventId, 'FAILED', requestType === 'Delete' ? 'DELETE' : 'UPSERT', new Date().toISOString(), contentHash, error.message);
  }
};

/**
 * Build CloudFormation custom resource response.
 *
 * @param {string} physicalResourceId - Stable ID for CloudFormation (preserved on Update/Delete)
 * @param {string} eventId - Unique ID for this ingestion event (audit/tracking)
 */
function buildResponse(physicalResourceId, eventId, status, action, timestamp, contentHash, errorMessage) {
  const response = {
    PhysicalResourceId: physicalResourceId,
    Data: {
      EventId: eventId,
      IngestStatus: status,
      Action: action,
      Timestamp: timestamp,
    },
  };
  
  if (contentHash) {
    response.Data.ContentHash = contentHash;
  }
  
  if (errorMessage) {
    response.Data.Error = errorMessage;
  }
  
  return response;
}

/**
 * Get API credentials from Secrets Manager or environment variables.
 */
async function getCredentials() {
  const secretName = process.env.SECRET_NAME;
  
  if (secretName) {
    // Secrets Manager mode
    console.log('Retrieving credentials from Secrets Manager...');
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient();
    
    const response = await client.send(new GetSecretValueCommand({
      SecretId: secretName,
    }));
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty');
    }
    
    const secret = JSON.parse(response.SecretString);
    
    if (!secret.apiKey || !secret.apiSecret) {
      throw new Error('Secret must contain apiKey and apiSecret fields');
    }
    
    console.log('Successfully retrieved credentials from Secrets Manager');
    return { apiKey: secret.apiKey, apiSecret: secret.apiSecret };
  }
  
  // Direct credentials mode
  const apiKey = process.env.API_KEY;
  const apiSecret = process.env.API_SECRET;
  
  if (!apiKey || !apiSecret) {
    throw new Error('Missing credentials: provide SECRET_NAME or API_KEY/API_SECRET');
  }
  
  return { apiKey, apiSecret };
}

/**
 * POST to /ingest/presign endpoint.
 * 
 * Request body includes:
 * - appId: Application identifier
 * - eventId: UUID v4 for this upload
 * - contentHash: SHA-256 hash with 'sha256:' prefix
 * - timestamp: ISO 8601 timestamp (must be within 5 minutes of server time)
 * - nonce: UUID v4 for replay protection
 * 
 * HMAC signature computed over the entire request body.
 * 
 * @returns {Object} { uploadUrl, s3Key, expiresAt }
 */
async function postPresign({ apiBaseUrl, apiKey, apiSecret, appId, eventId, contentHash, resourceId, schemaVersion, schemaContentHash }) {
  const url = `${apiBaseUrl}/ingest/presign`;
  
  // Generate nonce (UUID v4) for replay protection
  const nonce = crypto.randomUUID();
  
  // Generate timestamp (ISO 8601) - must be within 5 minutes of server time
  const timestamp = new Date().toISOString();
  
  const payload = {
    appId,
    eventId,
    contentHash,
    timestamp,
    nonce,
    resourceId,
    schemaVersion,
    schemaContentHash,
  };
  
  const body = JSON.stringify(payload);
  
  console.log('Presign request:', { appId, eventId, contentHash, timestamp, nonce, resourceId, schemaVersion, schemaContentHash });
  
  const responseText = await httpRequest({
    method: 'POST',
    url,
    headers: {
      'Content-Type': 'application/json',
      'x-chaim-key': apiKey,
    },
    body,
    apiSecret,
  });
  
  const response = JSON.parse(responseText);
  
  // Validate response structure
  if (!response.uploadUrl) {
    throw new Error('Invalid presign response: missing uploadUrl');
  }
  
  return response;
}

/**
 * PUT snapshot bytes to S3 presigned URL.
 * 
 * Important:
 * - Use HTTP PUT method
 * - Set Content-Type: application/json
 * - Do NOT add AWS signature headers (presigned URL handles auth)
 * - Upload must complete within 5 minutes (URL expiry)
 */
async function uploadToS3(presignedUrl, snapshotBytes) {
  await httpRequest({
    method: 'PUT',
    url: presignedUrl,
    headers: {
      'Content-Type': 'application/json',
    },
    body: snapshotBytes,
    // No HMAC signature for S3 presigned URL - authentication is in the URL
  });
}

/**
 * Make an HTTP/HTTPS request.
 * 
 * @param {Object} options - Request options
 * @param {string} options.method - HTTP method
 * @param {string} options.url - Full URL
 * @param {Object} options.headers - Request headers
 * @param {string} [options.body] - Request body
 * @param {string} [options.apiSecret] - API secret for HMAC signature
 * @returns {Promise<string>} Response body
 */
async function httpRequest({ method, url, headers, body, apiSecret }) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    
    const finalHeaders = { ...headers };
    
    // Add HMAC signature if apiSecret provided and body exists
    if (apiSecret && body) {
      const signature = crypto
        .createHmac('sha256', apiSecret)
        .update(body)
        .digest('hex');
      finalHeaders['x-chaim-signature'] = signature;
    }
    
    // Add Content-Length when body is provided (required for S3 presigned URLs
    // which do not support Transfer-Encoding: chunked)
    if (body) {
      finalHeaders['Content-Length'] = Buffer.byteLength(body);
    }
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers: finalHeaders,
    };
    
    const protocol = parsedUrl.protocol === 'https:' ? https : require('http');
    
    const req = protocol.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          // Try to parse error response
          let errorMessage = `HTTP ${res.statusCode}: ${data}`;
          try {
            const errorBody = JSON.parse(data);
            if (errorBody.errorMessage) {
              errorMessage = `HTTP ${res.statusCode}: ${errorBody.errorMessage}`;
            }
          } catch (e) {
            // Use default error message if JSON parsing fails
          }
          reject(new Error(errorMessage));
        }
      });
    });
    
    req.on('error', reject);
    
    req.setTimeout(DEFAULT_REQUEST_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (body) {
      req.write(body);
    }
    req.end();
  });
}
