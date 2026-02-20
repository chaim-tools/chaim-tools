/**
 * chaim apps link
 *
 * Purpose:
 *   Associate the CLI with a specific Chaim application. This establishes
 *   the project context so other commands know which app to operate on.
 *
 * Expected Sub-APIs:
 *   - Chaim API: Get application details (to validate access)
 *   - Chaim API: Get application descriptor (for caching)
 *
 * Local Config Read/Write:
 *   - Reads: ~/.chaim/config.json (auth profile for API calls)
 *   - Reads: ./chaim.json (check if already linked)
 *   - Writes: ./chaim.json (store appId and cached descriptor)
 *
 * Security:
 *   - Validate user has access to the app before linking
 *   - Do not cache sensitive app secrets locally
 */

import { Command } from 'commander';

/**
 * Register the `apps link` command with the CLI program
 */
export function registerAppsLinkCommand(program: Command): Command {
  const appsCmd = program.commands.find((cmd) => cmd.name() === 'apps')
    ?? program.command('apps').description('Application management commands');

  appsCmd
    .command('link')
    .description('Associate CLI with a Chaim application')
    .argument('[appId]', 'Application ID to link (prompts if not provided)')
    .option('--force', 'Overwrite existing link without confirmation')
    .action(async (_appId, _options) => {
      console.log('Not implemented yet. See docs/CLI_ROADMAP.md');
      // Future implementation:
      // 1. Check if authenticated (require auth)
      // 2. If appId not provided, prompt or list available apps
      // 3. Call API to validate user has access to the app
      // 4. Fetch app descriptor
      // 5. If already linked and not --force, confirm overwrite
      // 6. Write appId to ./chaim.json
      // 7. Cache app descriptor for offline use
    });

  return program;
}


