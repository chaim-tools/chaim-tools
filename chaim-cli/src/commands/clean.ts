import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { getSnapshotBaseDir } from '../services/os-cache-paths';

/**
 * Options for clean command.
 */
export interface CleanOptions {
  /** Stack name to clean (if specified, only clean this stack) */
  stack?: string;

  /** Delete all snapshots */
  all?: boolean;

  /** Delete snapshots older than N days */
  olderThan?: number;

  /** Dry run - show what would be deleted without actually deleting */
  dryRun?: boolean;

  /** Verbose output */
  verbose?: boolean;
}

/**
 * Clean snapshot cache command.
 * 
 * Provides options for:
 * - Cleaning specific stack snapshots
 * - Cleaning all snapshots
 * - TTL-based cleanup (snapshots older than N days)
 */
export async function cleanCommand(options: CleanOptions): Promise<void> {
  const {
    stack,
    all = false,
    olderThan,
    dryRun = false,
    verbose = false,
  } = options;

  const baseDir = getSnapshotBaseDir();

  console.log(chalk.cyan('Chaim Snapshot Cache Cleanup'));
  console.log('');
  
  if (dryRun) {
    console.log(chalk.yellow('DRY RUN - no files will be deleted'));
    console.log('');
  }

  // Validate options
  if (all && stack) {
    console.error(chalk.red('Error: Cannot specify both --all and --stack'));
    process.exit(1);
  }

  if (all && olderThan) {
    console.error(chalk.red('Error: Cannot specify both --all and --older-than'));
    process.exit(1);
  }

  if (!all && !stack && !olderThan) {
    console.error(chalk.red('Error: Must specify one of: --all, --stack, or --older-than'));
    console.error('');
    console.error(chalk.white('Examples:'));
    console.error(chalk.gray('  chaim clean --stack ProductCatalogStack'));
    console.error(chalk.gray('  chaim clean --older-than 30'));
    console.error(chalk.gray('  chaim clean --all'));
    process.exit(1);
  }

  // Check if snapshot directory exists
  if (!fs.existsSync(baseDir)) {
    console.log(chalk.yellow('Snapshot cache directory does not exist:'));
    console.log(chalk.gray(`  ${baseDir}`));
    console.log('');
    console.log(chalk.green('Nothing to clean'));
    return;
  }

  try {
    if (all) {
      await cleanAllSnapshots(baseDir, dryRun, verbose);
    } else if (stack) {
      await cleanStackSnapshots(baseDir, stack, dryRun, verbose);
    } else if (olderThan !== undefined) {
      await cleanOldSnapshots(baseDir, olderThan, dryRun, verbose);
    }
  } catch (error) {
    console.error(chalk.red('Cleanup failed:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Clean all snapshots.
 */
async function cleanAllSnapshots(
  baseDir: string,
  dryRun: boolean,
  verbose: boolean
): Promise<void> {
  console.log(chalk.white('Cleaning all snapshots...'));
  console.log(chalk.gray(`Base directory: ${baseDir}`));
  console.log('');

  const result = collectAllSnapshots(baseDir);

  if (result.count === 0) {
    console.log(chalk.yellow('No snapshots found'));
    return;
  }

  console.log(chalk.white(`Found ${result.count} snapshot(s)`));
  
  if (verbose) {
    console.log('');
    result.files.forEach(file => {
      console.log(chalk.gray(`  ${path.relative(baseDir, file)}`));
    });
  }

  console.log('');

  if (dryRun) {
    console.log(chalk.yellow(`Would delete ${result.count} snapshot(s)`));
  } else {
    // Delete files
    let deleted = 0;
    let failed = 0;

    for (const file of result.files) {
      try {
        fs.unlinkSync(file);
        deleted++;
      } catch (error) {
        failed++;
        if (verbose) {
          console.error(chalk.red(`Failed to delete: ${file}`));
        }
      }
    }

    // Clean up empty directories
    cleanEmptyDirectories(baseDir);

    console.log(chalk.green(`Deleted ${deleted} snapshot(s)`));
    
    if (failed > 0) {
      console.log(chalk.yellow(`Failed to delete ${failed} snapshot(s)`));
    }
  }
}

/**
 * Clean snapshots for a specific stack.
 */
async function cleanStackSnapshots(
  baseDir: string,
  stackName: string,
  dryRun: boolean,
  verbose: boolean
): Promise<void> {
  console.log(chalk.white(`Cleaning snapshots for stack: ${stackName}`));
  console.log('');

  const stackDirs = findStackDirectories(baseDir, stackName);

  if (stackDirs.length === 0) {
    console.log(chalk.yellow(`No snapshots found for stack: ${stackName}`));
    return;
  }

  let totalCount = 0;
  let deleted = 0;
  let failed = 0;

  for (const stackDir of stackDirs) {
    const result = collectAllSnapshots(stackDir);
    totalCount += result.count;

    console.log(chalk.gray(`Found ${result.count} snapshot(s) in ${path.relative(baseDir, stackDir)}`));

    if (verbose && result.count > 0) {
      result.files.forEach(file => {
        console.log(chalk.gray(`  ${path.basename(file)}`));
      });
    }

    if (!dryRun) {
      for (const file of result.files) {
        try {
          fs.unlinkSync(file);
          deleted++;
        } catch (error) {
          failed++;
          if (verbose) {
            console.error(chalk.red(`Failed to delete: ${file}`));
          }
        }
      }
    }
  }

  console.log('');

  if (dryRun) {
    console.log(chalk.yellow(`Would delete ${totalCount} snapshot(s)`));
  } else {
    // Clean up empty directories
    cleanEmptyDirectories(baseDir);

    console.log(chalk.green(`Deleted ${deleted} snapshot(s)`));
    
    if (failed > 0) {
      console.log(chalk.yellow(`Failed to delete ${failed} snapshot(s)`));
    }
  }
}

/**
 * Clean snapshots older than specified days.
 */
async function cleanOldSnapshots(
  baseDir: string,
  days: number,
  dryRun: boolean,
  verbose: boolean
): Promise<void> {
  console.log(chalk.white(`Cleaning snapshots older than ${days} days...`));
  console.log('');

  const now = Date.now();
  const cutoffMs = days * 24 * 60 * 60 * 1000;

  const allSnapshots = collectAllSnapshots(baseDir);

  if (allSnapshots.count === 0) {
    console.log(chalk.yellow('No snapshots found'));
    return;
  }

  let oldCount = 0;
  let deleted = 0;
  let failed = 0;
  const oldFiles: Array<{ path: string; ageDays: number }> = [];

  for (const file of allSnapshots.files) {
    try {
      const stats = fs.statSync(file);
      const ageMs = now - stats.mtimeMs;

      if (ageMs > cutoffMs) {
        const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
        oldCount++;
        oldFiles.push({ path: file, ageDays });
      }
    } catch (error) {
      if (verbose) {
        console.error(chalk.red(`Failed to stat: ${file}`));
      }
    }
  }

  if (oldCount === 0) {
    console.log(chalk.yellow(`No snapshots older than ${days} days found`));
    return;
  }

  console.log(chalk.white(`Found ${oldCount} snapshot(s) older than ${days} days`));
  
  if (verbose) {
    console.log('');
    oldFiles.slice(0, 10).forEach(({ path: filePath, ageDays }) => {
      console.log(chalk.gray(`  ${path.relative(baseDir, filePath)} (${ageDays} days old)`));
    });
    if (oldFiles.length > 10) {
      console.log(chalk.gray(`  ... and ${oldFiles.length - 10} more`));
    }
  }

  console.log('');

  if (dryRun) {
    console.log(chalk.yellow(`Would delete ${oldCount} snapshot(s)`));
  } else {
    for (const { path: file } of oldFiles) {
      try {
        fs.unlinkSync(file);
        deleted++;
      } catch (error) {
        failed++;
        if (verbose) {
          console.error(chalk.red(`Failed to delete: ${file}`));
        }
      }
    }

    // Clean up empty directories
    cleanEmptyDirectories(baseDir);

    console.log(chalk.green(`Deleted ${deleted} snapshot(s)`));
    
    if (failed > 0) {
      console.log(chalk.yellow(`Failed to delete ${failed} snapshot(s)`));
    }
  }
}

/**
 * Collect all snapshot files in a directory.
 */
function collectAllSnapshots(dir: string): { count: number; files: string[] } {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return { count: 0, files: [] };
  }

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);

  return { count: files.length, files };
}

/**
 * Find all directories for a given stack name.
 */
function findStackDirectories(baseDir: string, stackName: string): string[] {
  const stackDirs: string[] = [];

  if (!fs.existsSync(baseDir)) {
    return stackDirs;
  }

  const awsDir = path.join(baseDir, 'aws');
  if (!fs.existsSync(awsDir)) {
    return stackDirs;
  }

  function walk(currentDir: string, depth: number) {
    if (depth > 4) return; // aws/account/region/stack/datastore

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const fullPath = path.join(currentDir, entry.name);

      // Check if this is a stack directory
      if (entry.name === stackName) {
        stackDirs.push(fullPath);
      } else {
        walk(fullPath, depth + 1);
      }
    }
  }

  walk(awsDir, 0);

  return stackDirs;
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
      // Ignore errors
    }
  }
}
