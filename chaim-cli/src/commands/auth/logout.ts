/**
 * chaim auth logout
 *
 * Purpose:
 *   Clear local credentials and optionally revoke tokens server-side.
 *   Supports logging out a specific profile or all profiles.
 *
 * Expected Sub-APIs:
 *   - Chaim Auth API: Revoke token (optional, if --revoke flag used)
 *
 * Local Config Read/Write:
 *   - Reads: ~/.chaim/config.json (profile list)
 *   - Writes: ~/.chaim/config.json (remove profile or clear active)
 *   - Writes: Platform keychain or ~/.chaim/credentials (delete tokens)
 *
 * Security:
 *   - Securely delete tokens from storage
 *   - Clear any cached user data
 *   - Confirm before logging out all profiles
 */

import { Command } from 'commander';

/**
 * Register the `auth logout` command with the CLI program
 */
export function registerAuthLogoutCommand(program: Command): Command {
  const authCmd = program.commands.find((cmd) => cmd.name() === 'auth')
    ?? program.command('auth').description('Authentication commands');

  authCmd
    .command('logout')
    .description('Clear local credentials')
    .option('--profile <name>', 'Logout specific profile (default: active profile)')
    .option('--all', 'Logout all profiles')
    .option('--revoke', 'Also revoke tokens server-side')
    .action(async (_options) => {
      console.log('Not implemented yet. See docs/CLI_ROADMAP.md');
      // Future implementation:
      // 1. Determine which profile(s) to logout
      // 2. If --all, confirm with user
      // 3. If --revoke, call API to revoke tokens
      // 4. Delete tokens from secure storage
      // 5. Update config file (remove profile or clear active)
      // 6. Display confirmation
    });

  return program;
}


