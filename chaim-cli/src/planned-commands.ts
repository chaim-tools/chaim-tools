/**
 * Planned Commands Registry
 *
 * This module provides a single source of truth for all CLI commands,
 * both implemented and planned. It serves as a typed roadmap for
 * development and can be used to generate documentation or CLI help.
 *
 * See also: docs/CLI_ROADMAP.md
 */

/**
 * Priority tier for command implementation
 */
export type CommandTier = 'TIER_0' | 'TIER_1' | 'TIER_2' | 'TIER_3';

/**
 * Implementation status of a command
 */
export type CommandStatus = 'PLANNED' | 'STUB' | 'IMPLEMENTED';

/**
 * Specification for a planned or implemented CLI command
 */
export interface PlannedCommandSpec {
  /** Unique identifier (e.g., "auth.login") */
  id: string;
  /** Command path as typed by user (e.g., "auth login") */
  commandPath: string;
  /** Priority tier */
  tier: CommandTier;
  /** One-line summary */
  summary: string;
  /** Detailed intent notes */
  intentNotes: string[];
  /** Current implementation status */
  status: CommandStatus;
}

/**
 * All planned and implemented commands in priority order
 */
export const PLANNED_COMMANDS: PlannedCommandSpec[] = [
  // ===================
  // TIER 0 - Must Have
  // ===================
  {
    id: 'auth.login',
    commandPath: 'auth login',
    tier: 'TIER_0',
    summary: 'Authenticate a user for CLI usage',
    intentNotes: [
      'Initiate browser/device OAuth flow',
      'Obtain scoped access and refresh tokens',
      'Store tokens securely in local keychain or encrypted file',
      'Support multiple profiles/accounts',
    ],
    status: 'STUB',
  },
  {
    id: 'auth.whoami',
    commandPath: 'auth whoami',
    tier: 'TIER_0',
    summary: 'Display current authenticated user/org context',
    intentNotes: [
      'Show authenticated user email/ID',
      'Show current organization context',
      'Show active profile/app context if set',
      'Indicate token expiry status',
    ],
    status: 'STUB',
  },
  {
    id: 'auth.logout',
    commandPath: 'auth logout',
    tier: 'TIER_0',
    summary: 'Clear local credentials',
    intentNotes: [
      'Remove stored tokens from local storage',
      'Optionally revoke tokens server-side',
      'Support logging out specific profile or all profiles',
    ],
    status: 'STUB',
  },

  // ==========================
  // TIER 1 - Core Productivity
  // ==========================
  {
    id: 'configure',
    commandPath: 'configure',
    tier: 'TIER_1',
    summary: 'Interactive setup for CLI defaults',
    intentNotes: [
      'Prompt for common options: appId, env, region, stack, output, javaPackage',
      'Store in global (~/.chaim/config.json) or repo (./chaim.json) config',
      'Validate inputs where possible',
      'Support --global and --local flags',
    ],
    status: 'STUB',
  },
  {
    id: 'apps.link',
    commandPath: 'apps link',
    tier: 'TIER_1',
    summary: 'Associate CLI with a Chaim application',
    intentNotes: [
      'Accept app ID or prompt interactively',
      'Validate user has access to the application',
      'Cache app descriptor locally for offline use',
      'Store link in repo config (./chaim.json)',
    ],
    status: 'STUB',
  },

  // ==========================
  // TIER 2 - Existing Commands
  // ==========================
  {
    id: 'init',
    commandPath: 'init',
    tier: 'TIER_2',
    summary: 'Verify and install all prerequisites',
    intentNotes: [
      'Check Node.js, Java, AWS CLI, CDK CLI versions',
      'Optionally install missing dependencies',
      'Bootstrap CDK if needed',
    ],
    status: 'IMPLEMENTED',
  },
  {
    id: 'generate',
    commandPath: 'generate',
    tier: 'TIER_2',
    summary: 'Generate SDK from schema or CDK stack',
    intentNotes: [
      'Read CloudFormation stack metadata',
      'Validate schemas using chaim-bprint-spec',
      'Generate language-specific SDK (Java first)',
      'Future: use defaults from config, require auth for Chaim APIs',
    ],
    status: 'IMPLEMENTED',
  },
  {
    id: 'validate',
    commandPath: 'validate',
    tier: 'TIER_2',
    summary: 'Validate a .bprint schema file',
    intentNotes: [
      'Parse and validate against chaim-bprint-spec',
      'Report detailed validation errors',
    ],
    status: 'IMPLEMENTED',
  },
  {
    id: 'doctor',
    commandPath: 'doctor',
    tier: 'TIER_2',
    summary: 'Check system environment and dependencies',
    intentNotes: [
      'Verify Node.js, Java, AWS CLI, AWS credentials',
      'Future: validate auth status and config files',
    ],
    status: 'IMPLEMENTED',
  },

  // =======================
  // TIER 3 - Nice to Have
  // =======================
  {
    id: 'auth.refresh',
    commandPath: 'auth refresh',
    tier: 'TIER_3',
    summary: 'Manually refresh authentication tokens',
    intentNotes: [
      'Force refresh of access token using refresh token',
      'Useful for debugging token issues',
      'Rarely needed in normal flow (auto-refresh handled internally)',
    ],
    status: 'STUB',
  },
  {
    id: 'apps.list',
    commandPath: 'apps list',
    tier: 'TIER_3',
    summary: 'List applications the user can access',
    intentNotes: [
      'Query Chaim API for accessible applications',
      'Display app ID, name, and access level',
      'Support filtering and pagination',
    ],
    status: 'STUB',
  },
  {
    id: 'config.show',
    commandPath: 'config show',
    tier: 'TIER_3',
    summary: 'Print resolved configuration',
    intentNotes: [
      'Load global and repo config files',
      'Show merged/resolved values',
      'Indicate source of each value (global vs repo)',
      'Useful for debugging configuration issues',
    ],
    status: 'STUB',
  },
];

/**
 * Get commands by tier
 */
export function getCommandsByTier(tier: CommandTier): PlannedCommandSpec[] {
  return PLANNED_COMMANDS.filter((cmd) => cmd.tier === tier);
}

/**
 * Get commands by status
 */
export function getCommandsByStatus(status: CommandStatus): PlannedCommandSpec[] {
  return PLANNED_COMMANDS.filter((cmd) => cmd.status === status);
}

/**
 * Get a command by ID
 */
export function getCommandById(id: string): PlannedCommandSpec | undefined {
  return PLANNED_COMMANDS.find((cmd) => cmd.id === id);
}


