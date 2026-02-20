/**
 * chaim apps list
 *
 * Purpose:
 *   List all Chaim applications the authenticated user can access.
 *   Helps users discover available apps for linking.
 *
 * Expected Sub-APIs:
 *   - Chaim API: List applications (with pagination)
 *
 * Local Config Read/Write:
 *   - Reads: ~/.chaim/config.json (auth profile for API calls)
 *   - Reads: ./chaim.json (to highlight currently linked app)
 *   - Writes: None
 *
 * Security:
 *   - Requires authentication
 *   - Only shows apps user has access to
 */

import { Command } from 'commander';

/**
 * Register the `apps list` command with the CLI program
 */
export function registerAppsListCommand(program: Command): Command {
  const appsCmd = program.commands.find((cmd) => cmd.name() === 'apps')
    ?? program.command('apps').description('Application management commands');

  appsCmd
    .command('list')
    .description('List applications you can access')
    .option('--json', 'Output as JSON')
    .option('--limit <n>', 'Maximum number of apps to show', '20')
    .action(async (_options) => {
      console.log('Not implemented yet. See docs/CLI_ROADMAP.md');
      // Future implementation:
      // 1. Check if authenticated (require auth)
      // 2. Call API to list accessible applications
      // 3. Load repo config to check current link
      // 4. Display apps (highlight linked app if any)
      // 5. Support pagination for large lists
    });

  return program;
}


