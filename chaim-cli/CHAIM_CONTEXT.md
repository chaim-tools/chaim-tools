# AI Agent Context: chaim-cli

**Purpose**: Structured context for AI agents working in the chaim-cli package.

**Package**: `@chaim-tools/chaim`
**Version**: 0.1.5
**License**: Apache-2.0

---

## What This Package Does

The CLI discovers LOCAL snapshots from the OS cache (produced by `chaim-cdk`), groups entities by physical DynamoDB table, validates key consistency, resolves field names, and invokes the Java code generator (`chaim-client-java`) to produce ready-to-use Java source files. The generated code supports all `.bprint` field types including recursive nesting (maps within maps, lists of maps within maps) with no depth limit.

It is the user-facing entry point for code generation. End users run `chaim generate` — everything else happens automatically.

---

## Relationship to Other Packages

| Package | Relationship |
|---------|-------------|
| `@chaim-tools/chaim-bprint-spec` | Dependency — imports schema types and validation. Supports recursive `NestedField` for map-within-map and list-within-map nesting |
| `@chaim-tools/cdk-lib` (chaim-cdk) | Upstream — produces the LOCAL snapshots this CLI reads. Enforces field reference validation at synth-time and defaults to `STRICT` failure mode |
| `@chaim-tools/client-java` (chaim-client-java) | Dependency — the Java code generator invoked by this CLI. `LSIMetadata` shape aligns with CDK snapshots (no `partitionKey` — uses table's PK) |

---

## Commands

### `chaim generate` (Primary Command)

```bash
chaim generate --package com.example.model
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--package <name>` | Yes | — | Java package name |
| `-l, --language <lang>` | No | `java` | Target language |
| `--output <dir>` | No | `./src/main/java` | Output directory |
| `--stack <name>` | No | — | Filter by CDK stack name |
| `--snapshot-dir <path>` | No | OS cache | Override snapshot directory |
| `--skip-checks` | No | `false` | Skip environment validation |

**Processing steps**:

1. Scan OS cache for snapshot files (`discoverSnapshots()`)
2. Filter by `--stack` if provided; discard `DELETE`-action snapshots
3. Parse each snapshot JSON into `ResolvedSnapshot`
4. Group entities by physical table (using `tableArn` or composite key `{accountId}:{region}:{tableName}`)
5. Validate PK/SK consistency — all entities sharing a table must have matching partition/sort key field names
6. Pre-validate field names — resolve code names and detect collisions
7. Build `TableMetadata` from snapshot, including GSI/LSI arrays
8. Call `JavaGenerator.generateForTable(schemas, package, output, tableMetadata)`
9. Write generated `.java` files to output directory

### `chaim validate`

```bash
chaim validate ./schemas/user.bprint
```

Validates a `.bprint` file against the spec. Displays field mapping table and any validation errors.

### `chaim doctor`

```bash
chaim doctor
```

Checks: Node.js version, Java installation, AWS CLI availability.

### `chaim init`

```bash
chaim init              # Verify only
chaim init --install    # Install missing dependencies
```

### `chaim clean`

```bash
chaim clean --all
chaim clean --stack MyStack
chaim clean --older-than 30
chaim clean --dry-run
```

Prunes old or stack-specific snapshots from the local cache.

### `chaim bump`

```bash
chaim bump ./schemas/user.bprint            # minor bump: 1.3 -> 1.4
chaim bump ./schemas/user.bprint --major    # major bump: 1.3 -> 2.0
```

Increments the `schemaVersion` in a `.bprint` file. The `schemaVersion` is customer-controlled; customers increment it each time they change their schema. During `cdk deploy`, the Chaim server validates that the version was bumped when schema content changes.

### Planned Commands (Stubs Only)

- `chaim configure` — interactive setup wizard
- `chaim auth login/logout/whoami/refresh` — Chaim SaaS authentication
- `chaim apps link/list` — application management
- `chaim config show` — display configuration

---

## Snapshot Discovery

### OS Cache Locations

| OS | Default Path |
|----|--------------|
| macOS / Linux | `~/.chaim/cache/snapshots/` |
| Windows | `%LOCALAPPDATA%/chaim/cache/snapshots/` |

Override with `CHAIM_SNAPSHOT_DIR` environment variable or `--snapshot-dir` flag.

### Directory Structure

```
~/.chaim/cache/snapshots/
└── aws/
    └── {accountId}/
        └── {region}/
            └── {stackName}/
                └── dynamodb/
                    └── {resourceId}.json
```

### Discovery Logic (`src/services/snapshot-discovery.ts`)

- `discoverSnapshots()` recursively scans the cache directory
- Returns `SnapshotFileInfo[]` sorted by `capturedAt` (newest first)
- `resolveAllSnapshots()` reads and parses JSON files into `ResolvedSnapshot[]`
- Filters by stack name if `--stack` is provided

---

## Key Types

### LocalSnapshotPayload (`src/types/snapshot-payload.ts`)

```typescript
export interface LocalSnapshotPayload {
  action?: 'UPSERT' | 'DELETE';
  provider: 'aws';
  accountId: string;
  region: string;
  stackName: string;
  datastoreType: string;
  resourceName: string;
  resourceId: string;
  identity: StableIdentity;
  appId: string;
  schema: SchemaData | null;
  dataStore: DataStoreMetadata;
  context: StackContext;
  capturedAt: string;
}
```

### SchemaField

```typescript
export interface SchemaField {
  name: string;
  nameOverride?: string;
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'list' | 'map' | 'stringSet' | 'numberSet';
  required?: boolean;
  default?: string | number | boolean;
  enum?: string[];
  description?: string;
  constraints?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
  annotations?: Record<string, unknown>;
  items?: {
    type: 'string' | 'number' | 'boolean' | 'timestamp' | 'map';
    fields?: NestedField[];  // For list<map> items
  };
  fields?: NestedField[];    // For standalone map fields
}

// Supports recursive nesting: map within map, list within map
interface NestedField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'timestamp' | 'map' | 'list';
  items?: { type: string; fields?: NestedField[] };  // For nested list fields
  fields?: NestedField[];                              // For nested map fields (self-referencing)
}
```

Nested fields support arbitrary recursive nesting — a map can contain maps, lists of maps, and so on. There is no hardcoded depth limit; the database itself is the guardrail.

### DynamoDBMetadata

```typescript
export interface DynamoDBMetadata extends BaseDataStoreMetadata {
  type: 'dynamodb';
  tableName: string;
  tableArn: string;
  partitionKey: string;
  sortKey?: string;
  globalSecondaryIndexes?: GSIMetadata[];
  localSecondaryIndexes?: LSIMetadata[];
  ttlAttribute?: string;
  streamEnabled?: boolean;
  streamViewType?: string;
  billingMode?: 'PAY_PER_REQUEST' | 'PROVISIONED';
  encryptionKeyArn?: string;
}
```

### TableMetadata (Passed to Java Generator)

```typescript
export interface TableMetadata {
  tableName: string;
  tableArn: string;
  region: string;
  partitionKey: string;
  sortKey?: string;
  globalSecondaryIndexes?: GSIMetadata[];
  localSecondaryIndexes?: LSIMetadata[];
}

export interface GSIMetadata {
  indexName: string;
  partitionKey: string;
  sortKey?: string;
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  nonKeyAttributes?: string[];
}

// LSIs always share the table's partition key, so no partitionKey field is needed.
// The Java generator uses the table's PK from schema data when building LSI query methods.
export interface LSIMetadata {
  indexName: string;
  sortKey: string;
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  nonKeyAttributes?: string[];
}
```

---

## CDK Snapshot Alignment

The snapshot format produced by `chaim-cdk` enforces several invariants that affect how the CLI and downstream generator operate:

| Invariant | Description |
|-----------|-------------|
| **Field reference validation** | All DynamoDB key attributes (table PK/SK, GSI/LSI keys, TTL attribute) must exist as fields in the `.bprint` schema. Mismatches fail `cdk synth` |
| **STRICT failure mode** | Deployment defaults to `STRICT`. Customers must explicitly opt into `BEST_EFFORT` for non-blocking ingestion failures |
| **LSI shape** | `LSIMetadata` omits `partitionKey` — LSIs always inherit the table's partition key. The Java generator resolves this from the table's `partitionKey` field |
| **GSI shape** | `GSIMetadata` includes its own `partitionKey` and optional `sortKey`, since GSIs define independent key schemas |

---

## Data Flow: Snapshot to Java Generator

```
Snapshot JSON (OS cache)
    ↓
CLI discovers and parses snapshot
    ↓
createTableMetadataFromSnapshot()
  → Extracts tableName, tableArn, region, PK, SK
  → Passes through globalSecondaryIndexes and localSecondaryIndexes
  → LSI metadata has no partitionKey (uses table's PK)
    ↓
JavaGenerator.generateForTable(schemas, package, output, tableMetadata)
  → TypeScript wrapper serializes schemas + tableMetadata to JSON
  → Spawns Java process: java -jar codegen-java.jar --schemas <json> --package <pkg> --output <dir> --table-metadata <json>
    ↓
Java generator produces .java files
  → Entity DTOs with recursively nested inner classes for map/list<map> fields
  → Repository classes with typed GSI/LSI query methods
  → Validators with constraint checks
```

### Table Grouping Logic (`src/commands/generate.ts`)

The CLI groups entities that share the same physical DynamoDB table:

1. Uses `tableArn` if resolved (not a CDK token like `${Token[...]}`
2. Falls back to composite key: `{accountId}:{region}:{tableName}`
3. All entities in a group must have matching `partitionKey` and `sortKey` names
4. A single call to `generateForTable()` produces shared infrastructure once per table

### CDK Token Handling

Region values from CDK tokens (e.g., `${Token[AWS.REGION.35]}`) resolve to `"unknown"`. The CLI resolves `"unknown"` from:
1. `AWS_REGION` environment variable
2. `AWS_DEFAULT_REGION` environment variable
3. Falls back to `"us-east-1"`

---

## Repository Structure

```
chaim-cli/
├── src/
│   ├── index.ts              # CLI entry point (Commander.js)
│   ├── commands/
│   │   ├── generate.ts       # Main generate command
│   │   ├── validate.ts       # Schema validation command
│   │   ├── bump.ts           # Schema version bump command
│   │   ├── doctor.ts         # Environment check
│   │   ├── init.ts           # Prerequisites verification
│   │   └── clean.ts          # Cache cleanup
│   ├── services/
│   │   ├── snapshot-discovery.ts  # Snapshot file discovery
│   │   └── os-cache-paths.ts     # OS-specific cache paths
│   ├── types/
│   │   ├── snapshot-payload.ts   # All snapshot and metadata types
│   │   └── index.ts             # Re-exports
│   └── config/
│       └── types.ts             # CLI configuration types
├── dist/                     # Compiled output
├── package.json
└── tsconfig.json
```

---

## Key Files to Modify

| Task | File |
|------|------|
| Change generate command logic | `src/commands/generate.ts` |
| Change snapshot discovery | `src/services/snapshot-discovery.ts` |
| Change snapshot/metadata types | `src/types/snapshot-payload.ts` |
| Add a new CLI command | `src/commands/{command}.ts`, register in `src/index.ts` |
| Change cache paths | `src/services/os-cache-paths.ts` |

---

## Configuration

### Supported Languages

Currently only `java`. The `SupportedLanguage` type is defined in `src/config/types.ts`.

### Optional `chaim.json`

Users can create a `chaim.json` in their project root to set defaults:

```json
{
  "defaults": {
    "package": "com.mycompany.myapp.model",
    "output": "./src/main/java"
  }
}
```

---

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm run build` | Compile TypeScript |
| `npm test` | Run tests (Vitest) |
| `npm run clean` | Remove build artifacts |
| `npm run dev` | Run from source via ts-node |

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `@chaim-tools/chaim-bprint-spec` | Schema types and validation |
| `@chaim-tools/client-java` | Java code generation engine |
| `@aws-sdk/client-sts` | AWS account resolution |
| `commander` | CLI framework |
| `chalk` | Terminal colors |
| `ora` | Spinner for long-running operations |
