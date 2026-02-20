import * as path from 'path';
import { getSnapshotBaseDir, ensureDirExists } from './os-cache-paths';

// Re-export stable identity utilities
export {
  StableIdentity,
  isToken,
  getStableResourceKey,
  buildMatchKey,
  generateResourceId,
  GenerateResourceIdParams,
} from './stable-identity';

/**
 * Parameters for constructing snapshot paths.
 */
export interface SnapshotPathParams {
  /** AWS account ID (or 'unknown' if unresolved) */
  accountId: string;
  /** AWS region (or 'unknown' if unresolved) */
  region: string;
  /** CDK stack name */
  stackName: string;
  /** Data store type: 'dynamodb', 'aurora', etc. */
  datastoreType: string;
  /** Resource ID: {resourceName}__{entityName}[__N] */
  resourceId: string;
}

/**
 * Normalize account ID - handles CDK tokens and unresolved values.
 * 
 * @param accountId - Raw account ID (may be a CDK token)
 * @returns Normalized account ID or 'unknown' if unresolved
 */
export function normalizeAccountId(accountId: string | undefined): string {
  if (!accountId || accountId.includes('${Token') || accountId.includes('${AWS::')) {
    return 'unknown';
  }
  return accountId;
}

/**
 * Normalize region - handles CDK tokens and unresolved values.
 * 
 * @param region - Raw region (may be a CDK token)
 * @returns Normalized region or 'unknown' if unresolved
 */
export function normalizeRegion(region: string | undefined): string {
  if (!region || region.includes('${Token') || region.includes('${AWS::')) {
    return 'unknown';
  }
  return region;
}

/**
 * Get the directory path for LOCAL snapshots (for a specific stack/datastore).
 * 
 * Path structure: {base}/aws/{accountId}/{region}/{stackName}/{datastoreType}/
 */
export function getSnapshotDir(params: Omit<SnapshotPathParams, 'resourceId'>): string {
  return path.join(
    getSnapshotBaseDir(),
    'aws',
    normalizeAccountId(params.accountId),
    normalizeRegion(params.region),
    params.stackName,
    params.datastoreType
  );
}

/**
 * Get the full path to a LOCAL snapshot file.
 * 
 * Path structure: {base}/aws/{accountId}/{region}/{stackName}/{datastoreType}/{resourceId}.json
 */
export function getLocalSnapshotPath(params: SnapshotPathParams): string {
  return path.join(
    getSnapshotDir(params),
    `${params.resourceId}.json`
  );
}

/**
 * Write a LOCAL snapshot to the OS cache.
 * Ensures the directory exists and overwrites any existing file.
 */
export function writeLocalSnapshot(params: SnapshotPathParams, snapshot: object): string {
  const dir = getSnapshotDir(params);
  ensureDirExists(dir);
  
  const filePath = getLocalSnapshotPath(params);
  const fs = require('fs');
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  
  return filePath;
}
