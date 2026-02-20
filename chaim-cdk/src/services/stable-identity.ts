import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as fs from 'fs';
import * as path from 'path';
import { Construct } from 'constructs';

/**
 * Stable identity for collision detection.
 * Uses synth-stable fields only (no tokens).
 * 
 * Note: This only contains the unique stableResourceKey.
 * Other identity fields (appId, stackName, datastoreType, entityName)
 * are stored at the top level of the snapshot to avoid redundancy.
 */
export interface StableIdentity {
  /** Best available stable resource key */
  readonly stableResourceKey: string;
}

/**
 * Check if a value looks like a CDK token (unresolved at synth-time).
 * 
 * This is ONLY used for CDK-resolved values (account/region, tableName, logicalId),
 * NOT for user inputs (resourceName, entityName, appId).
 */
export function isToken(value: string | undefined): boolean {
  if (!value) return true;
  return value.includes('${Token') || value.includes('${AWS::');
}

/**
 * Get the best available stable resource key for collision detection.
 * 
 * The key is namespaced with the datastore type to prevent collisions
 * across different datastore types and enable use as a graph node key.
 * 
 * Format: `{datastoreType}:{qualifier}:{value}`
 * 
 * Preference chain:
 * 1. Physical table name (if not a token) => `{datastoreType}:tableName:<name>`
 * 2. CloudFormation logical ID (via correct CDK API) => `{datastoreType}:logicalId:<id>`
 * 3. Construct path (always available) => `{datastoreType}:path:<path>`
 * 
 * Note: resourceName is display-only; do not use as physical identity.
 * logicalId/physicalName may be unavailable; fallback to constructPath.
 */
export function getStableResourceKey(
  table: dynamodb.ITable,
  construct: Construct,
  datastoreType: string
): string {
  // 1. Prefer physical table name (actual DynamoDB table name, not user label)
  try {
    const tableName = table.tableName;
    if (tableName && !isToken(tableName)) {
      return `${datastoreType}:tableName:${tableName}`;
    }
  } catch {
    // tableName may not be accessible
  }
  
  // 2. Prefer CloudFormation logical ID (using correct CDK API)
  try {
    const stack = cdk.Stack.of(construct);
    const cfn = table.node.defaultChild as cdk.CfnResource | undefined;
    if (cfn) {
      const logicalId = stack.getLogicalId(cfn);
      if (logicalId && !isToken(logicalId)) {
        return `${datastoreType}:logicalId:${logicalId}`;
      }
    }
  } catch {
    // logicalId may not be available for imported tables
  }
  
  // 3. Fallback to construct path (always available)
  return `${datastoreType}:path:${construct.node.path}`;
}

/**
 * Build a match key string from stable identity fields.
 * Used for collision detection.
 */
export function buildMatchKey(params: {
  appId: string;
  stackName: string;
  datastoreType: string;
  entityName: string;
  stableResourceKey: string;
}): string {
  return `${params.appId}:${params.stackName}:${params.datastoreType}:${params.entityName}:${params.stableResourceKey}`;
}

/**
 * Parameters for generating a resource ID.
 */
export interface GenerateResourceIdParams {
  /** User-provided display label for filename */
  resourceName: string;
  /** Entity name from schema */
  entityName: string;
  /** Application ID */
  appId: string;
  /** Stack name */
  stackName: string;
  /** Datastore type */
  datastoreType: string;
  /** Stable resource key */
  stableResourceKey: string;
}

/**
 * Generate a unique resource ID with collision handling.
 * 
 * Filename format: {resourceName}__{entityName}[__N]
 * 
 * Collision behavior:
 * - If file doesn't exist: use base ID
 * - If file exists with same identity: overwrite (return same ID)
 * - If file exists with different identity: allocate suffix __2, __3, etc.
 * - If existing snapshot lacks identity fields: treat as non-match (safer)
 */
export function generateResourceId(
  params: GenerateResourceIdParams,
  cacheDir: string
): string {
  const { resourceName, entityName, appId, stackName, datastoreType, stableResourceKey } = params;
  const baseId = `${resourceName}__${entityName}`;
  const matchKey = buildMatchKey({ appId, stackName, datastoreType, entityName, stableResourceKey });
  
  let candidateId = baseId;
  let suffix = 1;
  
  while (true) {
    const filePath = path.join(cacheDir, `${candidateId}.json`);
    
    // No collision - use this ID
    if (!fs.existsSync(filePath)) {
      return candidateId;
    }
    
    // File exists - check if it's the same resource
    try {
      const existingContent = fs.readFileSync(filePath, 'utf-8');
      const existing = JSON.parse(existingContent);
      
      // Extract fields from top-level (new format) or fallback to nested (old format)
      const existingAppId = existing.appId || existing.identity?.appId;
      const existingStackName = existing.stackName || existing.identity?.stackName;
      const existingDatastoreType = existing.datastoreType || existing.identity?.datastoreType;
      const existingEntityName = existing.schema?.entityName || existing.identity?.entityName;
      const existingStableResourceKey = existing.identity?.stableResourceKey;
      
      // If existing snapshot lacks required fields, treat as non-match (never overwrite)
      if (!existingStableResourceKey || !existingAppId || !existingStackName || !existingDatastoreType || !existingEntityName) {
        suffix++;
        candidateId = `${baseId}__${suffix}`;
        continue;
      }
      
      const existingKey = buildMatchKey({
        appId: existingAppId,
        stackName: existingStackName,
        datastoreType: existingDatastoreType,
        entityName: existingEntityName,
        stableResourceKey: existingStableResourceKey,
      });
      
      if (existingKey === matchKey) {
        return candidateId; // Same resource, overwrite
      }
    } catch {
      // If we can't read/parse existing file, treat as non-match
    }
    
    // Different resource or error - allocate suffix
    suffix++;
    candidateId = `${baseId}__${suffix}`;
  }
}

