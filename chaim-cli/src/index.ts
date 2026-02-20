#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateCommand } from './commands/generate';
import { validateCommand } from './commands/validate';
import { doctorCommand } from './commands/doctor';
import { initCommand } from './commands/init';
import { cleanCommand } from './commands/clean';
import { bumpCommand } from './commands/bump';
import { contextCommand } from './commands/context';
import chalk from 'chalk';

const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

/**
 * ==========================
 * Planned Commands (Roadmap)
 * ==========================
 * These are intentionally commented out until implemented.
 * See docs/CLI_ROADMAP.md and src/planned-commands.ts.
 *
 * To enable a command:
 * 1. Uncomment the import statement
 * 2. Uncomment the registration call below
 * 3. Implement the command logic in the stub file
 * 4. Update status in planned-commands.ts and CLI_ROADMAP.md
 */

// ─── TIER 0: Must Have ───────────────────────────────────────────────────────
// import { registerAuthLoginCommand } from './commands/auth/login';
// import { registerAuthWhoamiCommand } from './commands/auth/whoami';
// import { registerAuthLogoutCommand } from './commands/auth/logout';

// ─── TIER 1: Core Productivity ───────────────────────────────────────────────
// import { registerConfigureCommand } from './commands/configure';
// import { registerAppsLinkCommand } from './commands/apps/link';

// ─── TIER 3: Nice to Have ────────────────────────────────────────────────────
// import { registerAuthRefreshCommand } from './commands/auth/refresh';
// import { registerAppsListCommand } from './commands/apps/list';
// import { registerConfigShowCommand } from './commands/config/show';

const program = new Command();

program
  .name('chaim')
  .description('Schema-driven code generation tool for DynamoDB')
  .version(pkg.version);

program
  .command('generate')
  .description('Generate SDK code from LOCAL snapshot (reads from OS cache)')
  .option('--package <packageName>', 'Java package name (e.g., com.example.orders.sdk). Optional when chaim.json is present.')
  .option('-l, --language <language>', 'Target language for code generation (default: java)')
  .option('--output <javaSourceRoot>', 'Java source root (e.g., ./src/main/java). Package subdirs are appended automatically. Optional when chaim.json is present.')
  .option('--stack <stackName>', 'Filter by CDK stack name — or single-stack override (optional)')
  .option('--snapshot-dir <path>', 'Override snapshot directory (default: OS cache)')
  .option('--skip-checks', 'Skip environment and schema validation checks')
  .action(generateCommand);

program
  .command('validate')
  .description('Validate a .bprint schema file')
  .argument('<schemaFile>', 'Schema file to validate')
  .action(validateCommand);

program
  .command('doctor')
  .description('Check system environment and dependencies')
  .action(doctorCommand);

program
  .command('init')
  .description('Verify and install all prerequisites')
  .option('--install', 'Install missing dependencies automatically')
  .option('--verify-only', 'Verify prerequisites only (no installation)')
  .option('--region <region>', 'AWS region for CDK bootstrap', 'us-east-1')
  .action(initCommand);

program
  .command('clean')
  .description('Clean snapshot cache (prune old or stack-specific snapshots)')
  .option('--stack <stackName>', 'Clean snapshots for specific stack')
  .option('--all', 'Clean all snapshots')
  .option('--older-than <days>', 'Clean snapshots older than N days', parseInt)
  .option('--dry-run', 'Show what would be deleted without deleting')
  .option('--verbose', 'Show detailed output')
  .action(cleanCommand);

program
  .command('bump')
  .description('Increment the schemaVersion in a .bprint file')
  .argument('<schemaFile>', '.bprint file to version bump')
  .option('--major', 'Major version bump (X.Y -> X+1.0) instead of minor (X.Y -> X.Y+1)')
  .action(bumpCommand);

program
  .command('context')
  .description('Download AI agent context for using Chaim in your project')
  .option('--agent <name>', 'Target a specific AI tool: cursor, copilot, claude, windsurf, aider, generic, all')
  .option('--no-auto', 'Skip auto-detection; only write canonical .chaim/ file')
  .option('--remove', 'Remove managed Chaim context from all agent locations')
  .option('--list-agents', 'Show supported agents, detection status, and file paths')
  .action(contextCommand);

/**
 * ==========================
 * Planned Command Registration
 * ==========================
 * Uncomment the corresponding import above and the registration call below
 * when implementing each command.
 */

// ─── TIER 0: Must Have ───────────────────────────────────────────────────────
// registerAuthLoginCommand(program);
// registerAuthWhoamiCommand(program);
// registerAuthLogoutCommand(program);

// ─── TIER 1: Core Productivity ───────────────────────────────────────────────
// registerConfigureCommand(program);
// registerAppsLinkCommand(program);

// ─── TIER 3: Nice to Have ────────────────────────────────────────────────────
// registerAuthRefreshCommand(program);
// registerAppsListCommand(program);
// registerConfigShowCommand(program);

// Show help if no command provided
if (process.argv.length <= 2) {
  console.log(chalk.blue('Chaim CLI v0.1.0'));
  console.log('Usage: chaim <command> [options]');
  console.log('');
  console.log(chalk.yellow('Prerequisite: Run "cdk synth" or "cdk deploy" in your CDK project first'));
  console.log('');
  console.log('Commands:');
  console.log('  init      - Verify and install all prerequisites');
  console.log('  generate  - Generate SDK code from CDK snapshot (default: java)');
  console.log('  validate  - Validate a .bprint schema file');
  console.log('  bump      - Increment the schemaVersion in a .bprint file');
  console.log('  doctor    - Check system environment and dependencies');
  console.log('  clean     - Clean snapshot cache (remove old or stale snapshots)');
  console.log('  context   - Download AI agent context for using Chaim in your project');
  console.log('');
  console.log('Use \'chaim <command> --help\' for more information');
  process.exit(0);
}

program.parse();
