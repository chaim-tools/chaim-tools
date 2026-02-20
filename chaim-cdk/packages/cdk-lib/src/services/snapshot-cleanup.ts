import * as fs from 'fs';
import * as path from 'path';
import { getSnapshotBaseDir, normalizeAccountId, normalizeRegion } from './os-cache-paths';

/**
 * Options for snapshot cleanup operations.
 */
export interface CleanupOptions {
  /**
   * AWS account ID to scope cleanup.
   * If undefined, operates on 'unknown' account (for local dev).
   */
  accountId?: string;

  /**
   * AWS region to scope cleanup.
   * If undefined, operates on 'unknown' region (for local dev).
   */
  region?: string;

  /**
   * CDK stack name to scope cleanup.
   * REQUIRED for PRUNE_STACK operations.
   */
  stackName: string;

  /**
   * If true, log cleanup operations to console.
   * Default: false
   */
  verbose?: boolean;
}

/**
 * Options for TTL-based cleanup.
 */
export interface TTLCleanupOptions {
  /**
   * Delete snapshots older than this many days.
   * Default: 30 days
   */
  olderThanDays?: number;

  /**
   * If true, perform a dry run without deleting files.
   * Default: false
   */
  dryRun?: boolean;

  /**
   * If true, log cleanup operations to console.
   * Default: false
   */
  verbose?: boolean;
}

/**
 * Result of a cleanup operation.
 */
export interface CleanupResult {
  /** Number of snapshots deleted */
  deletedCount: number;

  /** Number of snapshots found but not deleted (dry run or errors) */
  skippedCount: number;

  /** Paths of deleted snapshot files */
  deletedPaths: string[];

  /** Errors encountered during cleanup */
  errors: string[];
}

/**
 * Delete all snapshots for a specific stack.
 * 
 * This is the PRUNE_STACK behavior - scoped to a single stack only.
 * Deletes: ~/.chaim/cache/snapshots/aws/{account}/{region}/{stackName}/
 * 
 * @param options - Cleanup options
 * @returns Cleanup result summary
 */
export function pruneStackSnapshots(options: CleanupOptions): CleanupResult {
  const { stackName, verbose = false } = options;
  const result: CleanupResult = {
    deletedCount: 0,
    skippedCount: 0,
    deletedPaths: [],
    errors: [],
  };

  if (!stackName) {
    result.errors.push('stackName is required for pruneStackSnapshots');
    return result;
  }

  const accountId = normalizeAccountId(options.accountId);
  const region = normalizeRegion(options.region);

  const stackDir = path.join(
    getSnapshotBaseDir(),
    'aws',
    accountId,
    region,
    stackName
  );

  if (!fs.existsSync(stackDir)) {
    if (verbose) {
      console.log(`[Chaim] No snapshots found for stack: ${stackName}`);
    }
    return result;
  }

  if (verbose) {
    console.log(`[Chaim] Pruning snapshots for stack: ${stackName}`);
    console.log(`[Chaim] Path: ${stackDir}`);
  }

  try {
    // Recursively delete stack directory
    const snapshotFiles = collectSnapshotFiles(stackDir);
    
    for (const filePath of snapshotFiles) {
      try {
        fs.unlinkSync(filePath);
        result.deletedCount++;
        result.deletedPaths.push(filePath);
        
        if (verbose) {
          console.log(`[Chaim]   Deleted: ${path.relative(stackDir, filePath)}`);
        }
      } catch (error) {
        result.errors.push(`Failed to delete ${filePath}: ${error}`);
        result.skippedCount++;
      }
    }

    // Clean up empty directories
    cleanEmptyDirectories(stackDir);

    if (verbose) {
      console.log(`[Chaim] Deleted ${result.deletedCount} snapshot(s)`);
    }
  } catch (error) {
    result.errors.push(`Failed to prune stack snapshots: ${error}`);
  }

  return result;
}

/**
 * Delete snapshots older than a specified age (TTL cleanup).
 * 
 * This is a maintenance operation that can be run periodically
 * to clean up very old snapshots across all stacks.
 * 
 * @param options - TTL cleanup options
 * @returns Cleanup result summary
 */
export function pruneOldSnapshots(options: TTLCleanupOptions = {}): CleanupResult {
  const {
    olderThanDays = 30,
    dryRun = false,
    verbose = false,
  } = options;

  const result: CleanupResult = {
    deletedCount: 0,
    skippedCount: 0,
    deletedPaths: [],
    errors: [],
  };

  const baseDir = getSnapshotBaseDir();
  const now = Date.now();
  const cutoffMs = olderThanDays * 24 * 60 * 60 * 1000;

  if (verbose) {
    console.log(`[Chaim] Scanning for snapshots older than ${olderThanDays} days...`);
    console.log(`[Chaim] Base directory: ${baseDir}`);
    if (dryRun) {
      console.log(`[Chaim] DRY RUN - no files will be deleted`);
    }
  }

  if (!fs.existsSync(baseDir)) {
    if (verbose) {
      console.log(`[Chaim] Snapshot directory does not exist: ${baseDir}`);
    }
    return result;
  }

  try {
    const allSnapshots = collectSnapshotFiles(baseDir);

    for (const filePath of allSnapshots) {
      try {
        const stats = fs.statSync(filePath);
        const ageMs = now - stats.mtimeMs;

        if (ageMs > cutoffMs) {
          const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
          
          if (dryRun) {
            result.skippedCount++;
            if (verbose) {
              console.log(`[Chaim] Would delete (${ageDays} days old): ${filePath}`);
            }
          } else {
            fs.unlinkSync(filePath);
            result.deletedCount++;
            result.deletedPaths.push(filePath);
            
            if (verbose) {
              console.log(`[Chaim] Deleted (${ageDays} days old): ${filePath}`);
            }
          }
        }
      } catch (error) {
        result.errors.push(`Failed to process ${filePath}: ${error}`);
        result.skippedCount++;
      }
    }

    // Clean up empty directories (only if not dry run)
    if (!dryRun) {
      cleanEmptyDirectories(baseDir);
    }

    if (verbose) {
      if (dryRun) {
        console.log(`[Chaim] Would delete ${result.skippedCount} snapshot(s)`);
      } else {
        console.log(`[Chaim] Deleted ${result.deletedCount} snapshot(s)`);
      }
    }
  } catch (error) {
    result.errors.push(`Failed to prune old snapshots: ${error}`);
  }

  return result;
}

/**
 * Recursively collect all .json snapshot files in a directory.
 */
function collectSnapshotFiles(dir: string): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectSnapshotFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Recursively remove empty directories.
 */
function cleanEmptyDirectories(dir: string): void {
  if (!fs.existsSync(dir)) {
    return;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  // First, recursively clean subdirectories
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(dir, entry.name);
      cleanEmptyDirectories(fullPath);
    }
  }

  // Now check if directory is empty and remove it
  const remainingEntries = fs.readdirSync(dir);
  if (remainingEntries.length === 0) {
    try {
      fs.rmdirSync(dir);
    } catch {
      // Ignore errors (directory might not be empty or might be in use)
    }
  }
}
