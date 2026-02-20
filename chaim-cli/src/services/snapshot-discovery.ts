import * as fs from 'fs';
import * as path from 'path';
import { getSnapshotBaseDir } from './os-cache-paths';

/**
 * Discovery options for filtering snapshots.
 */
export interface DiscoveryOptions {
  /** Filter by CDK stack name */
  stackName?: string;
}

/**
 * Information about a discovered LOCAL snapshot file.
 *
 * Reflects the hierarchical path structure:
 *   aws/{accountId}/{region}/{stackName}/{datastoreType}/{resourceId}.json
 */
export interface SnapshotFileInfo {
  /** Full path to the snapshot file */
  filePath: string;
  /** AWS account ID (may be 'unknown') */
  accountId: string;
  /** AWS region (may be 'unknown') */
  region: string;
  /** CDK stack name */
  stackName: string;
  /** Data store type (dynamodb, aurora, etc.) */
  datastoreType: string;
  /** Resource ID from filename ({resourceName}__{entityName}[__N]) */
  resourceId: string;
  /** Resource name (parsed from resourceId) */
  resourceName: string;
  /** Entity name (parsed from resourceId) */
  entityName: string;
  /** Captured timestamp from payload (for sorting) */
  capturedAt: Date;
}

/**
 * Result of resolving a snapshot.
 */
export interface ResolvedSnapshot {
  /** Full path to the snapshot file */
  filePath: string;
  /** Parsed snapshot content */
  snapshot: any;
  /** Stack name */
  stackName: string;
  /** AWS account ID */
  accountId: string;
  /** AWS region */
  region: string;
  /** Data store type */
  datastoreType: string;
  /** Resource name */
  resourceName: string;
  /** Entity name */
  entityName: string;
}

/**
 * Parse a resource ID into its components.
 * Format: {resourceName}__{entityName}[__N]
 *
 * @param resourceId - Resource ID to parse
 * @returns Parsed components or null if invalid format
 */
function parseResourceId(resourceId: string): { resourceName: string; entityName: string; suffix?: string } | null {
  const parts = resourceId.split('__');
  if (parts.length < 2) {
    return null;
  }
  return {
    resourceName: parts[0],
    entityName: parts[1],
    suffix: parts.length > 2 ? parts.slice(2).join('__') : undefined,
  };
}

/**
 * Recursively discover all LOCAL snapshot files in the OS cache.
 *
 * Directory structure:
 *   aws/{accountId}/{region}/{stackName}/{datastoreType}/{resourceId}.json
 *
 * @param snapshotDir - Base snapshot directory (defaults to OS cache)
 * @param options - Discovery options for filtering
 * @returns Array of snapshot file info, sorted by capturedAt descending (newest first)
 */
export function discoverSnapshots(
  snapshotDir?: string,
  options: DiscoveryOptions = {}
): SnapshotFileInfo[] {
  const baseDir = snapshotDir ?? getSnapshotBaseDir();
  const snapshots: SnapshotFileInfo[] = [];
  const { stackName: filterStack } = options;

  const awsDir = path.join(baseDir, 'aws');
  if (!fs.existsSync(awsDir)) {
    return [];
  }

  // Scan accounts
  const accounts = safeReadDir(awsDir);

  for (const accountId of accounts) {
    const accountDir = path.join(awsDir, accountId);
    if (!fs.statSync(accountDir).isDirectory()) continue;

    // Scan regions
    const regions = safeReadDir(accountDir);

    for (const region of regions) {
      const regionDir = path.join(accountDir, region);
      if (!fs.statSync(regionDir).isDirectory()) continue;

      // Scan stacks
      const stacks = safeReadDir(regionDir);

      for (const stackName of stacks) {
        // Apply stack filter if provided
        if (filterStack && stackName !== filterStack) continue;

        const stackDir = path.join(regionDir, stackName);
        if (!fs.statSync(stackDir).isDirectory()) continue;

        // Scan data store types
        const datastores = safeReadDir(stackDir);

        for (const datastoreType of datastores) {
          const datastoreDir = path.join(stackDir, datastoreType);
          if (!fs.statSync(datastoreDir).isDirectory()) continue;

          // Scan snapshot files
          const files = safeReadDir(datastoreDir);

          for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const filePath = path.join(datastoreDir, file);
            const stat = fs.statSync(filePath);
            if (!stat.isFile()) continue;

            // Parse filename
            const resourceId = file.slice(0, -5); // Remove .json
            const parsed = parseResourceId(resourceId);
            if (!parsed) continue;

            // Read capturedAt from payload for sorting
            let capturedAt: Date;
            try {
              const content = fs.readFileSync(filePath, 'utf-8');
              const payload = JSON.parse(content);
              capturedAt = new Date(payload.capturedAt || stat.mtime);
            } catch {
              capturedAt = stat.mtime; // Fallback to mtime
            }

            snapshots.push({
              filePath,
              accountId,
              region,
              stackName,
              datastoreType,
              resourceId,
              resourceName: parsed.resourceName,
              entityName: parsed.entityName,
              capturedAt,
            });
          }
        }
      }
    }
  }

  // Sort by capturedAt descending (newest first)
  snapshots.sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());

  return snapshots;
}

/**
 * Safely read a directory, returning empty array if it doesn't exist.
 */
function safeReadDir(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) {
      return [];
    }
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * List all snapshot files with optional stack filtering.
 *
 * @param snapshotDir - Base snapshot directory (defaults to OS cache)
 * @param stackName - Optional stack name filter
 * @returns Array of snapshot file info, sorted by capturedAt descending (newest first)
 */
export function listSnapshots(snapshotDir?: string, stackName?: string): SnapshotFileInfo[] {
  return discoverSnapshots(snapshotDir, { stackName });
}

/**
 * Get the latest snapshot matching the given options.
 *
 * @param snapshotDir - Base snapshot directory (defaults to OS cache)
 * @param options - Discovery options for filtering
 * @returns The latest snapshot file info, or undefined if none found
 */
export function getLatestSnapshot(
  snapshotDir?: string,
  options: DiscoveryOptions = {}
): SnapshotFileInfo | undefined {
  const snapshots = discoverSnapshots(snapshotDir, options);
  return snapshots[0]; // Already sorted by capturedAt descending
}

/**
 * Resolve which snapshot to use based on the requested options.
 *
 * Selection logic:
 * 1. Find all snapshots matching filter (--stack if provided)
 * 2. Select the newest by capturedAt
 * 3. If none found, return undefined
 *
 * @param snapshotDir - Base snapshot directory (defaults to OS cache)
 * @param stackName - Optional stack name filter
 * @returns Resolved snapshot info, or undefined if no snapshot found
 */
export function resolveSnapshot(
  snapshotDir?: string,
  stackName?: string
): ResolvedSnapshot | undefined {
  const snapshotInfo = getLatestSnapshot(snapshotDir, { stackName });

  if (!snapshotInfo) {
    return undefined;
  }

  // Read and parse the snapshot file
  const content = fs.readFileSync(snapshotInfo.filePath, 'utf-8');
  const snapshot = JSON.parse(content);

  return {
    filePath: snapshotInfo.filePath,
    snapshot,
    stackName: snapshotInfo.stackName,
    accountId: snapshotInfo.accountId,
    region: snapshotInfo.region,
    datastoreType: snapshotInfo.datastoreType,
    resourceName: snapshotInfo.resourceName,
    entityName: snapshotInfo.entityName,
  };
}

/**
 * Resolve all snapshots matching the given options.
 * Used for multi-entity generation.
 *
 * @param snapshotDir - Base snapshot directory (defaults to OS cache)
 * @param options - Discovery options for filtering
 * @returns Array of resolved snapshots, or empty array if none found
 */
export function resolveAllSnapshots(
  snapshotDir?: string,
  options: DiscoveryOptions = {}
): ResolvedSnapshot[] {
  const snapshotInfos = discoverSnapshots(snapshotDir, options);

  return snapshotInfos.map((info) => {
    const content = fs.readFileSync(info.filePath, 'utf-8');
    const snapshot = JSON.parse(content);

    return {
      filePath: info.filePath,
      snapshot,
      stackName: info.stackName,
      accountId: info.accountId,
      region: info.region,
      datastoreType: info.datastoreType,
      resourceName: info.resourceName,
      entityName: info.entityName,
    };
  });
}

/**
 * Get the full path to the snapshot directory.
 *
 * @param snapshotDir - Snapshot directory (relative or absolute, or undefined for OS cache)
 * @returns Absolute path to the snapshot directory
 */
export function getSnapshotDirPath(snapshotDir?: string): string {
  if (!snapshotDir) {
    return getSnapshotBaseDir();
  }
  if (path.isAbsolute(snapshotDir)) {
    return snapshotDir;
  }
  return path.join(process.cwd(), snapshotDir);
}
