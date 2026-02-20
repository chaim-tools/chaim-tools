import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Get the default base directory for Chaim snapshots based on OS.
 * - macOS/Linux: ~/.chaim/cache/snapshots
 * - Windows: %LOCALAPPDATA%/chaim/cache/snapshots (or homedir fallback)
 */
export function getDefaultSnapshotBaseDir(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? os.homedir();
    return path.join(localAppData, 'chaim', 'cache', 'snapshots');
  }
  return path.join(os.homedir(), '.chaim', 'cache', 'snapshots');
}

/**
 * Get the snapshot base directory, respecting CHAIM_SNAPSHOT_DIR override.
 */
export function getSnapshotBaseDir(): string {
  return process.env.CHAIM_SNAPSHOT_DIR ?? getDefaultSnapshotBaseDir();
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 */
export function ensureDirExists(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Normalize account ID - handles CDK tokens and unresolved values.
 */
export function normalizeAccountId(accountId: string | undefined): string {
  if (!accountId || accountId.includes('${Token') || accountId.includes('${AWS::')) {
    return 'unknown';
  }
  return accountId;
}

/**
 * Normalize region - handles CDK tokens and unresolved values.
 */
export function normalizeRegion(region: string | undefined): string {
  if (!region || region.includes('${Token') || region.includes('${AWS::')) {
    return 'unknown';
  }
  return region;
}

/**
 * Normalize a resource name by removing CDK tokens and special characters.
 * Used for generating file paths.
 * 
 * IMPORTANT: Preserves double underscores (__) as they are used as delimiters
 * in resource IDs (format: {resourceName}__{entityName}).
 */
export function normalizeResourceName(name: string): string {
  // Replace CDK tokens with 'token'
  let normalized = name.replace(/\$\{Token\[[^\]]+\]\}/g, 'token');
  // Replace special characters with underscores (except existing underscores)
  normalized = normalized.replace(/[^a-zA-Z0-9_-]/g, '_');
  // Remove triple-or-more consecutive underscores, but PRESERVE double underscores (__)
  // This is important because __ is used as delimiter in resource IDs
  normalized = normalized.replace(/_{3,}/g, '__');
  // Trim leading/trailing underscores
  return normalized.replace(/^_|_$/g, '');
}

/**
 * Parameters for constructing snapshot paths.
 */
export interface SnapshotPathParams {
  accountId: string;
  region: string;
  stackName: string;
  datastoreType: string;
  resourceId: string;
}

/**
 * Get the directory path for LOCAL snapshots.
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
 */
export function getLocalSnapshotPath(params: SnapshotPathParams): string {
  // Normalize resource ID to avoid special characters in path
  const normalizedResourceId = normalizeResourceName(params.resourceId);
  return path.join(
    getSnapshotDir(params),
    `${normalizedResourceId}.json`
  );
}

/**
 * Write a LOCAL snapshot to the OS cache.
 */
export function writeLocalSnapshot(params: SnapshotPathParams, snapshot: object): string {
  const dir = getSnapshotDir(params);
  ensureDirExists(dir);
  
  const filePath = getLocalSnapshotPath(params);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
  
  return filePath;
}
