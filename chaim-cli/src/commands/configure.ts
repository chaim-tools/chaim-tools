/**
 * chaim configure
 *
 * Purpose:
 *   Interactive setup wizard to configure CLI defaults. Stores common options
 *   (appId, env, region, stack, output, javaPackage) in global or repo config.
 *
 * Expected Sub-APIs:
 *   - None (purely local configuration)
 *
 * Local Config Read/Write:
 *   - Reads: ~/.chaim/config.json (existing global defaults)
 *   - Reads: ./chaim.json (existing repo config)
 *   - Writes: ~/.chaim/config.json (if --global or no repo context)
 *   - Writes: ./chaim.json (if in a repo and not --global)
 *
 * Security:
 *   - Does not handle credentials (use `auth login` for that)
 *   - Validates inputs where possible (e.g., region format)
 */

import { Command } from 'commander';

/**
 * Register the `configure` command with the CLI program
 */
export function registerConfigureCommand(program: Command): Command {
  program
    .command('configure')
    .description('Interactive setup for CLI defaults')
    .option('--global', 'Configure global defaults (~/.chaim/config.json)')
    .option('--local', 'Configure repo defaults (./chaim.json)')
    .option('--non-interactive', 'Fail if input required (for scripting)')
    .action(async (_options) => {
      console.log('Not implemented yet. See docs/CLI_ROADMAP.md');
      // Future implementation:
      // 1. Determine target config (global vs repo)
      // 2. Load existing config values as defaults
      // 3. Prompt for each configurable option:
      //    - appId (if local)
      //    - environment (if local)
      //    - region
      //    - stackName (if local)
      //    - javaPackage
      //    - output directory
      // 4. Validate inputs
      // 5. Write updated config
      // 6. Display summary of changes
    });

  return program;
}


