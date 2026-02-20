/**
 * chaim auth whoami
 *
 * Purpose:
 *   Display the current authenticated user/org context and active profile.
 *   Helps users verify which identity and context they're operating under.
 *
 * Expected Sub-APIs:
 *   - Chaim Auth API: Validate token and get user info
 *   - Chaim API: Get organization details (if org context set)
 *
 * Local Config Read/Write:
 *   - Reads: ~/.chaim/config.json (active profile, profile metadata)
 *   - Reads: Platform keychain or ~/.chaim/credentials (to check token validity)
 *   - Reads: ./chaim.json (linked app context)
 *   - Writes: None
 *
 * Security:
 *   - NEVER display full tokens
 *   - May display masked token prefix for identification
 *   - Display token expiry time
 */

import { Command } from 'commander';

/**
 * Register the `auth whoami` command with the CLI program
 */
export function registerAuthWhoamiCommand(program: Command): Command {
  const authCmd = program.commands.find((cmd) => cmd.name() === 'auth')
    ?? program.command('auth').description('Authentication commands');

  authCmd
    .command('whoami')
    .description('Display current authenticated user and context')
    .option('--profile <name>', 'Check specific profile instead of active')
    .action(async (_options) => {
      console.log('Not implemented yet. See docs/CLI_ROADMAP.md');
      // Future implementation:
      // 1. Load active profile (or specified profile)
      // 2. Check if tokens exist and are valid
      // 3. Call API to get current user info
      // 4. Display: email, user ID, org context, token expiry
      // 5. If repo has linked app, show that context too
    });

  return program;
}


