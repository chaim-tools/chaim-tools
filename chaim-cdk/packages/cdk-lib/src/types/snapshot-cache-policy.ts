/**
 * Policy for managing snapshot cache during CDK synthesis.
 * 
 * The snapshot cache stores metadata used by chaim-cli for code generation.
 * Over time, stale snapshots can accumulate and cause issues.
 * 
 * @example
 * ```typescript
 * // In cdk.json context
 * {
 *   "context": {
 *     "chaimSnapshotCachePolicy": "PRUNE_STACK"
 *   }
 * }
 * ```
 */
export enum SnapshotCachePolicy {
  /**
   * No automatic cleanup (default).
   * 
   * Snapshots are written but never deleted automatically.
   * Users must manually clean ~/.chaim/cache/snapshots.
   * 
   * **Use when:** You want full control over snapshot lifecycle
   * or are debugging snapshot generation.
   */
  NONE = 'NONE',

  /**
   * Delete stack snapshots before synthesis (recommended).
   * 
   * Clears only: ~/.chaim/cache/snapshots/{account}/{region}/{stackName}/
   * 
   * This ensures:
   * - No stale snapshots from previous synth runs
   * - No corrupt snapshots from failed synth attempts
   * - Generated code always matches current stack state
   * 
   * Other stacks and accounts are preserved.
   * 
   * **Use when:** You want clean, predictable snapshot state
   * (recommended for most projects).
   */
  PRUNE_STACK = 'PRUNE_STACK',
}

/**
 * Default snapshot cache policy.
 */
export const DEFAULT_SNAPSHOT_CACHE_POLICY = SnapshotCachePolicy.NONE;

/**
 * CDK context key for snapshot cache policy.
 */
export const SNAPSHOT_CACHE_POLICY_CONTEXT_KEY = 'chaimSnapshotCachePolicy';
