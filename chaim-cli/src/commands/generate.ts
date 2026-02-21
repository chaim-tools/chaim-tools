import chalk from 'chalk';
import ora from 'ora';
import { JavaGenerator } from '@chaim-tools/client-java';
import { doctorCommand } from './doctor';
import {
  resolveAllSnapshots,
  getSnapshotDirPath,
  listSnapshots,
  DiscoveryOptions,
  ResolvedSnapshot,
} from '../services/snapshot-discovery';
import { getSnapshotBaseDir } from '../services/os-cache-paths';
import {
  TableMetadata,
} from '../types';
import {
  SupportedLanguage,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  ChaimStackGenerateConfig,
} from '../config/types';
import { resolveFieldNames, detectCollisions } from '../services/name-resolver';
import {
  loadRepoConfig,
  findRepoConfigDir,
  resolveJavaRoot,
} from '../services/chaim-config-loader';
import * as path from 'path';
import { ensureVsCodeSettings } from '../services/vscode-settings';

interface GenerateOptions {
  stack?: string;
  package?: string;
  output?: string;
  language?: string;
  snapshotDir?: string;
  skipChecks?: boolean;
}

/**
 * Resolved configuration for a single generate run (one stack).
 */
interface ResolvedGenerateRun {
  stackName?: string;
  pkg: string;
  javaRoot: string;
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  try {
    // Load project-level chaim.json (if present)
    const repoConfig = loadRepoConfig();
    const generateConfig = repoConfig?.generate;
    const configDir = findRepoConfigDir() ?? undefined;

    // Resolve and validate language (defaults to Java)
    const language = resolveLanguage(
      options.language ?? generateConfig?.language
    );

    // Pre-generation checks (unless skipped)
    if (!options.skipChecks) {
      await runPreGenerationChecks();
    }

    // Use OS cache by default, or override if specified
    const snapshotDir = options.snapshotDir
      ? getSnapshotDirPath(options.snapshotDir)
      : getSnapshotBaseDir();

    // ── Determine which runs to execute ──────────────────────────────────────
    //
    // Three modes:
    //   A) Config-driven (no --package CLI flag):
    //      Loop over every stack in chaim.json → generate.stacks.
    //      A specific --stack flag narrows this to just that one entry.
    //
    //   B) CLI flags only (--package required):
    //      Single run, no chaim.json needed.
    //
    //   C) Mixed (--package + chaim.json present):
    //      CLI flags win; treat as a single explicit run.
    // ─────────────────────────────────────────────────────────────────────────

    let runs: ResolvedGenerateRun[];

    if (!options.package && generateConfig?.stacks) {
      // Mode A: config-driven multi-stack
      const stackEntries = Object.entries(generateConfig.stacks);

      if (stackEntries.length === 0) {
        console.error(chalk.red('Error: chaim.json → generate.stacks is empty'));
        console.error(chalk.gray('  Add at least one stack entry, e.g.:'));
        console.error(chalk.gray('  { "generate": { "stacks": { "MyStack": { "package": "com.example.sdk" } } } }'));
        process.exit(1);
      }

      // Filter by --stack if provided
      const filtered = options.stack
        ? stackEntries.filter(([name]) => name === options.stack)
        : stackEntries;

      if (filtered.length === 0) {
        console.error(chalk.red(`Error: Stack '${options.stack}' not found in chaim.json → generate.stacks`));
        console.error(chalk.gray(`  Available stacks: ${stackEntries.map(([n]) => n).join(', ')}`));
        process.exit(1);
      }

      runs = filtered.map(([stackName, stackCfg]: [string, ChaimStackGenerateConfig]) => ({
        stackName,
        pkg: stackCfg.package,
        javaRoot: resolveJavaRoot(
          undefined,                    // no CLI override in config mode
          stackCfg.javaRoot,
          generateConfig.javaRoot,
          configDir,
        ),
      }));

    } else if (options.package) {
      // Mode B / C: explicit CLI flags
      runs = [{
        stackName: options.stack,
        pkg: options.package,
        javaRoot: resolveJavaRoot(
          options.output,
          undefined,
          generateConfig?.javaRoot,
          configDir,
        ),
      }];

    } else {
      // Neither --package nor chaim.json stacks config → error
      console.error(chalk.red('Error: --package is required (or add a chaim.json with generate.stacks)'));
      console.error('');
      console.error(chalk.gray('Option 1 – CLI flag:'));
      console.error(chalk.gray('  chaim generate --package com.mycompany.myapp.sdk --output ./src/main/java'));
      console.error('');
      console.error(chalk.gray('Option 2 – chaim.json project config (recommended for multi-stack projects):'));
      console.error(chalk.gray('  {'));
      console.error(chalk.gray('    "generate": {'));
      console.error(chalk.gray('      "javaRoot": "./src/main/java",'));
      console.error(chalk.gray('      "stacks": {'));
      console.error(chalk.gray('        "MyStack": { "package": "com.mycompany.myapp.sdk" }'));
      console.error(chalk.gray('      }'));
      console.error(chalk.gray('    }'));
      console.error(chalk.gray('  }'));
      process.exit(1);
    }

    // ── Execute each run ──────────────────────────────────────────────────────
    for (const run of runs) {
      const discoveryOptions: DiscoveryOptions = {
        stackName: run.stackName,
      };

      const resolvedSnapshots = resolveAllSnapshots(snapshotDir, discoveryOptions);

      if (resolvedSnapshots.length === 0) {
        printSnapshotNotFoundError(snapshotDir, discoveryOptions);
        if (runs.length === 1) {
          process.exit(1);
        }
        console.error(chalk.yellow(`  Skipping stack '${run.stackName ?? '(all)'}'`));
        continue;
      }

      await generateFromSnapshots(resolvedSnapshots, run, language);
    }

    // ── VS Code integration ───────────────────────────────────────────────
    // Automatically configure .vscode/settings.json so *.bprint files get
    // JSON Schema validation and autocomplete out of the box.
    // Opt out via `"vscode": false` in chaim.json → generate.
    if (generateConfig?.vscode !== false) {
      ensureVsCodeSettings(process.cwd());
    }

  } catch (error) {
    console.error(chalk.red('✗ Generation failed:'), error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

/**
 * Print a helpful error message when no snapshot is found.
 */
function printSnapshotNotFoundError(snapshotDir: string, options: DiscoveryOptions): void {
  console.error(chalk.red('\n✗ No snapshot found'));
  console.error('');
  console.error(chalk.yellow('Chaim requires a LOCAL snapshot from chaim-cdk.'));
  console.error('');
  console.error(chalk.white('To create a snapshot, run one of the following in your CDK project:'));
  console.error('');
  console.error(chalk.cyan('  # Synthesize (creates LOCAL snapshot in cache):'));
  console.error(chalk.white('  cdk synth'));
  console.error('');
  console.error(chalk.cyan('  # Or deploy (also creates LOCAL snapshot):'));
  console.error(chalk.white('  cdk deploy'));
  console.error('');
  console.error(chalk.white('Expected snapshot location (OS cache):'));
  console.error(chalk.gray(`  ${snapshotDir}/aws/{accountId}/{region}/{stackName}/{datastoreType}/{resourceId}.json`));
  console.error('');

  // Show applied filters
  if (options.stackName) {
    console.error(chalk.white('Stack filter applied:'), options.stackName);
    console.error('');
  }

  // Show what snapshots DO exist (if any)
  const existingSnapshots = listSnapshots(snapshotDir);
  if (existingSnapshots.length > 0) {
    console.error(chalk.white('Found snapshots (but none matched your criteria):'));

    // Group by account/region/stack for cleaner output
    const grouped = new Map<string, typeof existingSnapshots>();
    for (const snap of existingSnapshots) {
      const key = `${snap.accountId}/${snap.region}/${snap.stackName}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(snap);
    }

    let shown = 0;
    for (const [key, snaps] of grouped) {
      if (shown >= 5) {
        console.error(chalk.gray(`  ... and ${grouped.size - 5} more locations`));
        break;
      }
      const [acct, reg, stack] = key.split('/');
      console.error(chalk.gray(`  Account: ${acct} / Region: ${reg} / Stack: ${stack}`));
      for (const snap of snaps.slice(0, 3)) {
        console.error(chalk.gray(`    - ${snap.entityName} (${snap.resourceName})`));
      }
      if (snaps.length > 3) {
        console.error(chalk.gray(`    ... and ${snaps.length - 3} more entities`));
      }
      shown++;
    }
    console.error('');
    console.error(chalk.white('Hint: Use --stack <stackName> to filter to a specific stack.'));
  }
}

async function runPreGenerationChecks(): Promise<void> {
  const spinner = ora('Running pre-generation checks...').start();

  try {
    // Run environment checks (capture output to avoid duplicate messages)
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    console.log = () => {}; // Suppress doctor output
    console.error = () => {}; // Suppress doctor errors

    await doctorCommand();

    // Restore console
    console.log = originalConsoleLog;
    console.error = originalConsoleError;

    spinner.succeed('Pre-generation checks passed');
  } catch (error) {
    spinner.fail('Pre-generation checks failed');
    throw new Error(`Environment validation failed: ${error instanceof Error ? error.message : error}`);
  }
}

/**
 * Get a unique table identity for grouping entities.
 * Prefers tableArn (globally unique), falls back to composite key.
 */
function getTableIdentity(snapshot: ResolvedSnapshot): string {
  const snap = snapshot.snapshot;
  
  // Support both v3.0 (resource) and legacy (dataStore) structure
  const resource = (snap as any).resource || (snap as any).dataStore;
  const accountId = (snap as any).providerIdentity?.accountId || (snap as any).accountId;
  const region = (snap as any).providerIdentity?.region || (snap as any).region;
  
  // Prefer ARN if it's resolved (not a CDK token)
  const resourceId = resource.id || resource.tableArn || resource.arn;
  if (resourceId && !resourceId.includes('${')) {
    return resourceId;
  }
  
  // Fallback to composite key: {accountId}:{region}:{name}
  const resourceName = resource.name || resource.tableName;
  return `${accountId}:${region}:${resourceName}`;
}

/**
 * Validate that all entities bound to the same table have matching PK/SK field names.
 * This is required because DynamoDB tables have a single key schema that all items must use.
 * 
 * @throws Error if entities have mismatched key definitions
 */
function validateTableKeyConsistency(tableSnapshots: ResolvedSnapshot[], tableName: string): void {
  if (tableSnapshots.length <= 1) {
    return; // Single entity, no consistency check needed
  }

  const first = tableSnapshots[0];
  
  // Check if first snapshot has valid schema (should not be null for UPSERT)
  if (!first.snapshot.schema) {
    throw new Error(`Cannot validate table key consistency: first snapshot has null schema (DELETE action)`);
  }
  
  const firstFields = first.snapshot.schema.identity?.fields;
  const firstEntity = first.entityName;

  for (let i = 1; i < tableSnapshots.length; i++) {
    const snap = tableSnapshots[i];
    
    // Skip DELETE snapshots (null schema)
    if (!snap.snapshot.schema) {
      continue;
    }
    
    const fields = snap.snapshot.schema.identity?.fields;
    const entity = snap.entityName;

    // Check identity fields match
    if (JSON.stringify(firstFields) !== JSON.stringify(fields)) {
      const expectedFields = firstFields?.join(', ') || '(none)';
      const foundFields = fields?.join(', ') || '(none)';
      throw new Error(
        `Entity '${entity}' has incompatible identity fields for table '${tableName}'.\n` +
        `  Expected: identity fields=[${expectedFields}] (from entity '${firstEntity}')\n` +
        `  Found:    identity fields=[${foundFields}]\n\n` +
        `All entities bound to the same table must have matching identity field names.`
      );
    }
  }
}

/**
 * Generate SDK from multiple resolved snapshots.
 * Groups entities by physical table and generates shared infrastructure once per table.
 */
async function generateFromSnapshots(
  snapshots: ResolvedSnapshot[],
  run: ResolvedGenerateRun,
  language: SupportedLanguage
): Promise<void> {
  console.log(chalk.blue(`\nGenerating ${language.toUpperCase()} code from ${snapshots.length} LOCAL snapshot(s)`));
  if (run.stackName) {
    console.log(chalk.gray(`  Stack:    ${run.stackName}`));
  }
  console.log(chalk.gray(`  Package:  ${run.pkg}`));
  console.log(chalk.gray(`  Root:     ${run.javaRoot}`));
  console.log('');

  // Filter out DELETE snapshots (those with null schema or action === 'DELETE')
  // Code generation only works with UPSERT snapshots that have valid schemas
  const upsertSnapshots = snapshots.filter(snap => {
    const action = snap.snapshot.action || 'UPSERT';  // Default to UPSERT for backward compatibility
    return action === 'UPSERT' && snap.snapshot.schema !== null;
  });

  if (upsertSnapshots.length === 0) {
    console.error(chalk.yellow('\n⚠ No UPSERT snapshots found for code generation'));
    console.error(chalk.gray('All snapshots appear to be DELETE actions or have null schemas.'));
    console.error(chalk.gray('Code generation requires valid entity schemas.'));
    process.exit(1);
  }

  if (upsertSnapshots.length < snapshots.length) {
    const skippedCount = snapshots.length - upsertSnapshots.length;
    console.log(chalk.gray(`\nSkipping ${skippedCount} DELETE snapshot(s) - code generation only processes UPSERT actions\n`));
  }

  // Deduplicate by bindingId (stable across accounts and synths).
  // Snapshots are already sorted newest-first so the first occurrence of each
  // bindingId is always the most recent — local `cdk synth` beats a stale
  // deployed snapshot regardless of which accountId directory it lives under.
  const seenBindingIds = new Set<string>();
  const dedupedSnapshots = upsertSnapshots.filter(snap => {
    const bindingId = (snap.snapshot as any).identity?.bindingId
      ?? `${snap.stackName}:${snap.entityName}`;  // fallback for pre-v3 snapshots
    if (seenBindingIds.has(bindingId)) return false;
    seenBindingIds.add(bindingId);
    return true;
  });

  if (dedupedSnapshots.length < upsertSnapshots.length) {
    const dupes = upsertSnapshots.length - dedupedSnapshots.length;
    console.log(chalk.gray(`Deduplicated ${dupes} older snapshot(s) — keeping newest per entity.\n`));
  }

  // Group snapshots by table identity (ARN or composite key)
  // This ensures multiple entities for the same physical table are generated together
  const byTable = new Map<string, ResolvedSnapshot[]>();
  for (const snap of dedupedSnapshots) {
    const tableId = getTableIdentity(snap);
    if (!byTable.has(tableId)) {
      byTable.set(tableId, []);
    }
    byTable.get(tableId)!.push(snap);
  }

  // Validate key consistency for multi-entity tables BEFORE generation
  for (const [_tableId, tableSnapshots] of byTable) {
    const firstSnap = tableSnapshots[0].snapshot;
    const resource = (firstSnap as any).resource || (firstSnap as any).dataStore;
    const tableName = resource.name || resource.tableName;
    validateTableKeyConsistency(tableSnapshots, tableName);
  }

  // Pre-validate field name collisions for each schema before generation
  for (const snap of dedupedSnapshots) {
    if (snap.snapshot.schema?.fields) {
      const resolved = resolveFieldNames(snap.snapshot.schema.fields, language);
      const collisions = detectCollisions(resolved);
      if (collisions.length > 0) {
        for (const collision of collisions) {
          console.error(chalk.red(`\n✗ Name collision in entity '${snap.entityName}': ${collision.message}`));
        }
        process.exit(1);
      }
    }
  }

  const results: { tableId: string; entities: string[]; success: boolean; error?: string }[] = [];
  const spinner = ora('Generating SDK...').start();

  try {
    for (const [tableId, tableSnapshots] of byTable) {
      const firstSnapshot = tableSnapshots[0];
      const resource = (firstSnapshot.snapshot as any).resource || (firstSnapshot.snapshot as any).dataStore;
      const tableName = resource.name || resource.tableName;
      spinner.text = `Generating for table ${tableName} (${tableSnapshots.length} entities)...`;

      // Collect all schemas for this table (filter out any nulls, though they should already be filtered)
      const schemas = tableSnapshots
        .map(s => s.snapshot.schema)
        .filter((schema): schema is NonNullable<typeof schema> => schema !== null);
      
      if (schemas.length === 0) {
        throw new Error(`No valid schemas found for table ${tableName} (all are DELETE actions)`);
      }
      
      const entityNames = tableSnapshots.map(s => s.entityName);
      
      // Create table metadata from the first snapshot (all snapshots share the same table)
      const tableMetadata = createTableMetadataFromSnapshot(firstSnapshot.snapshot);

      try {
        const javaGenerator = new JavaGenerator();
        
        // Use the new generateForTable API that accepts multiple schemas.
        // `run.javaRoot` is the Java source root; JavaPoet appends the
        // package as subdirectories automatically (e.g., com/example/sdk/).
        await javaGenerator.generateForTable(
          schemas,
          run.pkg,
          run.javaRoot,
          tableMetadata
        );

        results.push({
          tableId,
          entities: entityNames,
          success: true,
        });
      } catch (error) {
        results.push({
          tableId,
          entities: entityNames,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    spinner.stop();

    // Print summary
    console.log('');
    let totalEntities = 0;
    let failedTables = 0;

    for (const result of results) {
      const tableSnapshots = byTable.get(result.tableId)!;
      const firstSnap = tableSnapshots[0];
      const resource = (firstSnap.snapshot as any).resource || (firstSnap.snapshot as any).dataStore;
      const tableName = resource.name || resource.tableName;
      
      console.log(chalk.cyan(`  Table: ${tableName}`));
      console.log(chalk.gray(`    Identity: ${result.tableId}`));
      
      if (result.success) {
        for (const entity of result.entities) {
          console.log(chalk.green(`      ✓ ${entity}.java`));
          totalEntities++;
        }
      } else {
        failedTables++;
        for (const entity of result.entities) {
          console.log(chalk.red(`      ✗ ${entity}.java - ${result.error}`));
        }
      }
    }

    console.log('');
    if (failedTables === 0) {
      console.log(chalk.green(`✓ Generated ${totalEntities} entity/entities across ${results.length} table(s) successfully`));
    } else {
      console.log(chalk.yellow(`Generated ${totalEntities} entities, ${failedTables} table(s) failed`));
    }

    console.log(chalk.green('  Language:'), language);
    console.log(chalk.green('  Java source root:'), run.javaRoot);
    console.log(chalk.green('  Package:'), run.pkg);
    console.log(chalk.green('  Written to:'), path.join(run.javaRoot, run.pkg.replace(/\./g, path.sep)));

    if (failedTables > 0) {
      process.exit(1);
    }
  } catch (error) {
    spinner.fail('Failed to generate SDK');
    throw error;
  }
}

/**
 * Resolve and validate the target language for code generation.
 * 
 * Priority: CLI flag > default (Java)
 * Currently only Java is supported. Returns error for unsupported languages.
 */
function resolveLanguage(cliLanguage?: string): SupportedLanguage {
  const language = cliLanguage || DEFAULT_LANGUAGE;
  
  if (!SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
    console.error(chalk.red(`Error: Language '${language}' is not yet supported.`));
    console.error(chalk.gray(`Currently supported: ${SUPPORTED_LANGUAGES.join(', ')}`));
    process.exit(1);
  }
  
  return language as SupportedLanguage;
}

/**
 * Resolve region value, handling 'unknown' from CDK tokens.
 * 
 * When CDK synthesizes with unresolved tokens (e.g., environment-agnostic stacks),
 * it writes 'unknown' to the snapshot. This function resolves to actual region
 * from environment variables or falls back to a sensible default.
 */
function resolveRegion(snapshotRegion: string | undefined): string {
  if (snapshotRegion && snapshotRegion !== 'unknown') {
    return snapshotRegion;
  }
  // Try AWS environment variables
  return process.env.AWS_REGION 
    || process.env.AWS_DEFAULT_REGION 
    || 'us-east-1';
}

/**
 * Create a table metadata object compatible with the Java generator from snapshot data.
 * 
 * IMPORTANT: This returns a plain object with properties, NOT getter functions.
 * The JavaGenerator serializes this to JSON via JSON.stringify(), and arrow functions
 * are not JSON-serializable (they get stripped). Plain properties work correctly.
 * 
 * Handles 'unknown' values from CDK tokens by resolving from environment.
 */
function createTableMetadataFromSnapshot(snapshot: any): TableMetadata {
  // Support both v3.0 (resource) and legacy (dataStore) structure
  const resource = snapshot.resource || snapshot.dataStore;
  const providerIdentity = snapshot.providerIdentity;
  const region = providerIdentity?.region || snapshot.region || resource.region;

  return {
    tableName: resource.name || resource.tableName,
    tableArn: resource.id || resource.tableArn || resource.arn,
    region: resolveRegion(region),
    partitionKey: resource.partitionKey,
    sortKey: resource.sortKey,
    globalSecondaryIndexes: resource.globalSecondaryIndexes,
    localSecondaryIndexes: resource.localSecondaryIndexes,
  };
}
