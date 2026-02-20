/**
 * chaim auth login
 *
 * Purpose:
 *   Authenticate a user for CLI usage via browser/device OAuth flow,
 *   obtain scoped access and refresh tokens, and store them securely.
 *
 * Expected Sub-APIs:
 *   - Chaim Auth API: Initiate device authorization flow
 *   - Chaim Auth API: Poll for token completion
 *   - Chaim Auth API: Exchange authorization code for tokens
 *
 * Local Config Read/Write:
 *   - Reads: ~/.chaim/config.json (to check existing profiles)
 *   - Writes: ~/.chaim/config.json (to add/update profile metadata)
 *   - Writes: Platform keychain or ~/.chaim/credentials (encrypted tokens)
 *
 * Security:
 *   - NEVER log tokens or secrets to console
 *   - Store tokens in platform keychain (preferred) or encrypted file
 *   - Clear sensitive data from memory after use
 *   - Use PKCE for OAuth flow
 */

import { Command } from 'commander';

/**
 * Register the `auth login` command with the CLI program
 */
export function registerAuthLoginCommand(program: Command): Command {
  const authCmd = program.commands.find((cmd) => cmd.name() === 'auth') 
    ?? program.command('auth').description('Authentication commands');

  authCmd
    .command('login')
    .description('Authenticate with Chaim (browser/device flow)')
    .option('--profile <name>', 'Profile name to store credentials under', 'default')
    .option('--no-browser', 'Use device code flow instead of browser')
    .action(async (_options) => {
      console.log('Not implemented yet. See docs/CLI_ROADMAP.md');
      // Future implementation:
      // 1. Check if already logged in for this profile
      // 2. Initiate OAuth device flow or browser flow
      // 3. Display instructions (device code or open browser)
      // 4. Poll for completion / handle callback
      // 5. Store tokens securely
      // 6. Update profile metadata in config
    });

  return program;
}


