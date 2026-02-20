/**
 * chaim config show
 *
 * Purpose:
 *   Print the resolved configuration, showing values from both global and
 *   repo configs with their sources. Useful for debugging configuration issues.
 *
 * Expected Sub-APIs:
 *   - None (purely local)
 *
 * Local Config Read/Write:
 *   - Reads: ~/.chaim/config.json
 *   - Reads: ./chaim.json
 *   - Writes: None
 *
 * Security:
 *   - Does not display tokens or credentials
 *   - May mask sensitive values if present
 */

import { Command } from 'commander';

/**
 * Register the `config show` command with the CLI program
 */
export function registerConfigShowCommand(program: Command): Command {
  const configCmd = program.commands.find((cmd) => cmd.name() === 'config')
    ?? program.command('config').description('Configuration commands');

  configCmd
    .command('show')
    .description('Print resolved configuration')
    .option('--json', 'Output as JSON')
    .option('--source', 'Show source of each value (global/repo/default)')
    .action(async (_options) => {
      console.log('Not implemented yet. See docs/CLI_ROADMAP.md');
      // Future implementation:
      // 1. Load global config from ~/.chaim/config.json
      // 2. Load repo config from ./chaim.json (if exists)
      // 3. Merge configs (repo overrides global)
      // 4. If --source, track origin of each value
      // 5. Display resolved config
      //    - If --json, output as JSON
      //    - Otherwise, pretty-print with labels
      // 6. Mask any sensitive values
    });

  return program;
}


