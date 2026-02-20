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

