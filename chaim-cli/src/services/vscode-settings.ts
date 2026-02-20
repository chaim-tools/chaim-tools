/**
 * VS Code workspace settings integration.
 *
 * Automatically configures `.vscode/settings.json` so that VS Code (and
 * Cursor) validates `.bprint` files against the bundled JSON Schema from
 * `@chaim-tools/chaim-bprint-spec` without any manual setup by the user.
 *
 * Two entries are written / merged into `.vscode/settings.json`:
 *   1. `files.associations`  – tells VS Code to treat `.bprint` as JSON
 *   2. `json.schemas`        – points to the local bprint schema for
 *                              validation, autocomplete, and hover docs
 */

import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

/**
 * Relative path (from any project root) to the bundled JSON Schema that
 * ships inside `@chaim-tools/chaim-bprint-spec`.  This works because
 * `cdk-lib` declares `chaim-bprint-spec` as a runtime dependency, so it
 * is always present in the user's `node_modules` after `npm install`.
 */
const SCHEMA_LOCAL_PATH =
  './node_modules/@chaim-tools/chaim-bprint-spec/schema/bprint.schema.json';

/** VS Code `json.schemas` entry that maps `*.bprint` to the local schema. */
interface JsonSchemaEntry {
  fileMatch: string[];
  url: string;
}

/**
 * Merge Chaim-required entries into `.vscode/settings.json`.
 *
 * - Creates `.vscode/` and `settings.json` if they do not exist.
 * - Never removes or overwrites existing keys — only adds/merges.
 * - Skips silently if the local schema file is not present on disk
 *   (e.g. `npm install` has not been run yet).
 * - Skips if `projectRoot` cannot be determined.
 *
 * @param projectRoot  Absolute path to the project root (where `chaim.json`
 *                     and `.vscode/` live).  Defaults to `process.cwd()`.
 */
export function ensureVsCodeSettings(projectRoot: string = process.cwd()): void {
  const schemaAbsPath = path.resolve(projectRoot, SCHEMA_LOCAL_PATH);

  // Only wire up the local path if the schema is actually installed.
  if (!fs.existsSync(schemaAbsPath)) {
    return;
  }

  const vscodeDir = path.join(projectRoot, '.vscode');
  const settingsFile = path.join(vscodeDir, 'settings.json');

  // Ensure .vscode/ exists.
  if (!fs.existsSync(vscodeDir)) {
    fs.mkdirSync(vscodeDir, { recursive: true });
  }

  // Read existing settings (handle JSONC line-comments and empty files).
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsFile)) {
    try {
      const raw = fs.readFileSync(settingsFile, 'utf8');
      const stripped = stripJsonComments(raw);
      if (stripped.trim()) {
        settings = JSON.parse(stripped);
      }
    } catch {
      // Corrupted / unparseable settings — don't touch the file.
      console.warn(
        chalk.yellow(
          `  ⚠  Could not parse .vscode/settings.json — skipping VS Code integration.\n` +
            `     Fix or delete the file and re-run \`chaim generate\`.`
        )
      );
      return;
    }
  }

  let changed = false;

  // ── 1. files.associations ────────────────────────────────────────────────
  if (!settings['files.associations']) {
    settings['files.associations'] = {};
  }
  const assoc = settings['files.associations'] as Record<string, string>;
  if (assoc['*.bprint'] !== 'json') {
    assoc['*.bprint'] = 'json';
    changed = true;
  }

  // ── 2. json.schemas ──────────────────────────────────────────────────────
  if (!Array.isArray(settings['json.schemas'])) {
    settings['json.schemas'] = [];
  }
  const schemas = settings['json.schemas'] as JsonSchemaEntry[];
  const alreadyLinked = schemas.some(
    (entry) =>
      Array.isArray(entry.fileMatch) && entry.fileMatch.includes('*.bprint')
  );
  if (!alreadyLinked) {
    schemas.push({
      fileMatch: ['*.bprint'],
      url: SCHEMA_LOCAL_PATH,
    });
    changed = true;
  }

  if (!changed) {
    return;
  }

  // Write back with 2-space indent to keep diffs readable.
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n', 'utf8');
  console.log(
    chalk.green('  ✓ VS Code .bprint validation enabled') +
      chalk.gray(' (.vscode/settings.json updated)')
  );
}

/**
 * Minimal single-line comment stripper for JSONC.
 * Removes `// …` comments that appear outside string literals so that
 * `JSON.parse` can handle VS Code's settings.json format.
 *
 * This intentionally does NOT handle block comments (`/* … * /`) since
 * VS Code itself only writes line comments into settings.json.
 */
function stripJsonComments(jsonc: string): string {
  return jsonc
    .split('\n')
    .map((line) => {
      // Remove trailing `// comment`, but only when not inside a string.
      // Simple heuristic: find `//` that is not preceded by an odd number
      // of unescaped quotes.
      let inString = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"' && (i === 0 || line[i - 1] !== '\\')) {
          inString = !inString;
        }
        if (!inString && ch === '/' && line[i + 1] === '/') {
          return line.slice(0, i);
        }
      }
      return line;
    })
    .join('\n');
}
