import * as fs from 'fs';
import * as path from 'path';
import type { RepoChaimConfig } from '../config/types';

/**
 * Name of the project-level Chaim configuration file.
 * Searched in the current working directory.
 */
export const CHAIM_CONFIG_FILENAME = 'chaim.json';

/**
 * Load the project-level `chaim.json` configuration file.
 *
 * Searches for the file starting from `startDir` and walking up toward the
 * filesystem root until it either finds the file or runs out of parent
 * directories.  This lets users run `chaim` from anywhere inside their
 * monorepo and still pick up the root-level config.
 *
 * @param startDir  Directory to begin the search (default: `process.cwd()`)
 * @returns The parsed config, or `null` when no file is found.
 */
export function loadRepoConfig(startDir: string = process.cwd()): RepoChaimConfig | null {
  let dir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(dir, CHAIM_CONFIG_FILENAME);
    if (fs.existsSync(candidate)) {
      try {
        const raw = fs.readFileSync(candidate, 'utf-8');
        return JSON.parse(raw) as RepoChaimConfig;
      } catch (err) {
        throw new Error(
          `Failed to parse ${candidate}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      // Reached the filesystem root without finding the file
      return null;
    }
    dir = parent;
  }
}

/**
 * Find the directory that contains `chaim.json`, if any.
 *
 * @param startDir  Directory to begin the search (default: `process.cwd()`)
 * @returns Absolute path to the directory that contains `chaim.json`, or
 *          `null` when not found.
 */
export function findRepoConfigDir(startDir: string = process.cwd()): string | null {
  let dir = path.resolve(startDir);

  while (true) {
    if (fs.existsSync(path.join(dir, CHAIM_CONFIG_FILENAME))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Derive the effective Java source-root output directory for a given package.
 *
 * Rules (in priority order):
 *  1. Explicit `outputOverride` (e.g., `--output` CLI flag) — resolved
 *     relative to `process.cwd()`.
 *  2. Per-stack `javaRoot` from `chaim.json`.
 *  3. Top-level `generate.javaRoot` from `chaim.json`.
 *  4. Hard-coded Maven/Gradle default: `./src/main/java`.
 *
 * Config-sourced values (2–4) are resolved relative to the directory that
 * contains `chaim.json`, NOT `process.cwd()`.  This ensures the output
 * stays stable regardless of which subdirectory the user runs from.
 *
 * The returned path is the **Java source root**, NOT the full package path.
 * JavaPoet's `.writeTo()` automatically converts the `pkg` dots to
 * subdirectories underneath this root.
 *
 * @param outputOverride   Value of the `--output` CLI flag (may be undefined).
 * @param perStackJavaRoot Per-stack `javaRoot` from `chaim.json` (may be undefined).
 * @param globalJavaRoot   Top-level `generate.javaRoot` from `chaim.json` (may be undefined).
 * @param configDir        Directory containing `chaim.json` (may be undefined).
 * @returns Absolute path to use as the Java source root.
 */
export function resolveJavaRoot(
  outputOverride?: string,
  perStackJavaRoot?: string,
  globalJavaRoot?: string,
  configDir?: string,
): string {
  // CLI --output flag resolves relative to cwd (standard CLI behaviour)
  if (outputOverride) {
    return path.resolve(outputOverride);
  }

  const raw =
    perStackJavaRoot ??
    globalJavaRoot ??
    './src/main/java';

  // Config-sourced values resolve relative to the chaim.json directory
  const base = configDir ?? process.cwd();
  return path.resolve(base, raw);
}
