# AI Agent Context: chaim-cdk

**Purpose**: Structured context for AI agents working in the chaim-cdk package.

**Package**: `@chaim-tools/cdk-lib`
**Version**: 0.1.12
**License**: Apache-2.0

---

## What This Package Does

Provides AWS CDK L2 constructs that bind `.bprint` schemas to DynamoDB tables. At synth time, the construct validates the schema, extracts table metadata (keys, GSIs, LSIs, TTL, streams, billing, encryption), and writes a LOCAL snapshot to the OS cache for CLI code generation. At deploy time, a Lambda custom resource uploads the snapshot to Chaim SaaS for governance and auditing.

Chaim operates entirely out-of-band — zero impact on your application's request path, no sidecars, no background processes, no runtime instrumentation.

---

## Relationship to Other Packages

| Package | Relationship |
|---------|-------------|
| `@chaim-tools/chaim-bprint-spec` | Dependency — imports `validateSchema()` and types |
| `@chaim-tools/chaim` (chaim-cli) | Downstream consumer — reads LOCAL snapshots from OS cache |
| `@chaim-tools/client-java` | Indirect — CLI passes snapshot data to Java generator |

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Language | TypeScript 5.x |
| Package Manager | pnpm 8+ (monorepo) |
| Runtime | Node.js 20+ |
| Infrastructure | AWS CDK v2, constructs v10+ |
| AWS Services | DynamoDB, Lambda, Secrets Manager, S3 (presigned URLs) |
| Testing | Vitest |

---

## Repository Structure (Monorepo)

```
chaim-cdk/
├── packages/
│   ├── cdk-lib/              # Published npm package (@chaim-tools/cdk-lib)
│   │   ├── src/
│   │   │   ├── binders/
│   │   │   │   ├── base-chaim-binder.ts      # Abstract base class
│   │   │   │   └── chaim-dynamodb-binder.ts   # DynamoDB implementation
│   │   │   ├── lambda-handler/
│   │   │   │   └── handler.js                 # Deploy-time ingestion Lambda
│   │   │   ├── services/
│   │   │   │   ├── schema-service.ts          # Schema loading and validation
│   │   │   │   ├── os-cache-paths.ts          # OS cache directory utilities
│   │   │   │   ├── cdk-project-root.ts        # CDK project root discovery
│   │   │   │   ├── snapshot-paths.ts          # Snapshot file path utilities
│   │   │   │   ├── stable-identity.ts         # Stable identity and collision handling
│   │   │   │   └── ingestion-service.ts       # Ingestion service utilities
│   │   │   ├── types/
│   │   │   │   ├── snapshot-payload.ts        # LOCAL and PUBLISHED payload types
│   │   │   │   ├── ingest-contract.ts         # API request/response types
│   │   │   │   ├── credentials.ts             # ChaimCredentials factory
│   │   │   │   └── failure-mode.ts            # FailureMode enum
│   │   │   ├── config/
│   │   │   │   └── chaim-endpoints.ts         # API URLs and constants
│   │   │   └── index.ts                       # Package exports
│   │   └── package.json
│   ├── activator/             # Internal activation utilities
│   └── cfn-provider-dynamodb-binding/  # CloudFormation custom resource provider
├── package.json               # Root monorepo config
└── CHAIM_CONTEXT.md
```

---

## Architecture

### Construct Hierarchy

```
BaseChaimBinder (abstract)
├── extractMetadata()           # Abstract — subclass implements
├── buildLocalSnapshot()        # Builds LOCAL payload
├── writeLocalSnapshotToDisk()  # Writes to OS cache
├── writeSnapshotAsset()        # Writes to cdk.out for Lambda bundling
├── deployIngestionResources()  # Lambda + custom resource
│
└── ChaimDynamoDBBinder (concrete)
    └── extractMetadata()       # DynamoDB-specific metadata extraction
```

### DynamoDB Metadata Extracted

`ChaimDynamoDBBinder.extractMetadata()` captures:

| Property | Method | Description |
|----------|--------|-------------|
| Table name | `getResourceName()` | Resolved from CDK tokens when possible |
| Table ARN | From CfnTable | Globally unique identifier |
| Partition key | `extractKeySchema()` | Attribute name from key schema |
| Sort key | `extractKeySchema()` | Attribute name (if composite key) |
| GSIs | `extractGSIs()` | indexName, partitionKey, sortKey, projectionType, nonKeyAttributes |
| LSIs | `extractLSIs()` | indexName, sortKey, projectionType, nonKeyAttributes |
| TTL attribute | `extractTTL()` | Attribute name if TTL is enabled |
| Stream config | `extractStreamInfo()` | enabled flag and view type |
| Billing mode | `extractBillingMode()` | PAY_PER_REQUEST or PROVISIONED |
| Encryption key ARN | Direct read | Customer-managed KMS key if configured |

All of this metadata flows into the LOCAL snapshot. The CLI passes it to the Java generator as `TableMetadata`, which uses GSIs and LSIs to generate `queryBy{IndexName}()` methods and `INDEX_` constants.

---

## Snapshot Lifecycle

### During `cdk synth` (Constructor Execution)

1. Validate credential reference (ARN/name format, not secret values)
2. Load and validate `.bprint` schema via `@chaim-tools/chaim-bprint-spec`
3. Extract DynamoDB metadata (subclass)
4. Compute stable resource key (physical name > logical ID > construct path)
5. Generate resourceId with collision handling: `{resourceName}__{entityName}[__N]`
6. Compute snapshot fingerprint (SHA-256 excluding volatile fields like `capturedAt`)
7. Write LOCAL snapshot to OS cache (overwritten on each synth)
8. Write `snapshot.json` + `index.js` to CDK asset directory

### During `cdk deploy` (Lambda Execution)

**For UPSERT (Create/Update)**:
1. Read `./snapshot.json` from bundled asset
2. Generate `eventId` (UUID v4 at runtime)
3. Compute `contentHash` (SHA-256 of snapshot bytes)
4. Compute `schemaContentHash` (SHA-256 of schema content excluding `schemaVersion` field)
5. POST `/ingest/presign` with auth, `resourceId`, `schemaVersion`, and `schemaContentHash` → server validates version was bumped if content changed → get presigned S3 URL (or HTTP 409 if version not bumped)
6. PUT snapshot bytes (with `action: "UPSERT"`) to presigned URL
7. Respond to CloudFormation based on FailureMode

**For DELETE**:
1. Read `./snapshot.json` from bundled asset
2. Build DELETE snapshot: set `action: "DELETE"`, `schema: null`
3. Generate `eventId`, compute `contentHash`
4. POST `/ingest/presign` → PUT DELETE snapshot to S3
5. Respond to CloudFormation

---

## Snapshot Locations

### LOCAL Snapshots (OS Cache — for CLI)

| OS | Default Path |
|----|--------------|
| macOS / Linux | `~/.chaim/cache/snapshots/` |
| Windows | `%LOCALAPPDATA%/chaim/cache/snapshots/` |

Override with `CHAIM_SNAPSHOT_DIR`.

```
~/.chaim/cache/snapshots/
└── aws/{accountId}/{region}/{stackName}/dynamodb/{resourceId}.json
```

### Lambda Assets (CDK Output — for Deploy)

```
cdk.out/chaim/assets/{stackName}/{resourceId}/
├── snapshot.json
└── index.js
```

---

## API Endpoints

Default base URL: `https://ingest.chaim.co`

Override via CDK context (`chaimApiBaseUrl`) or env var (`CHAIM_API_BASE_URL`).

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/ingest/presign` | POST | Get presigned S3 URL for snapshot upload. Includes `resourceId`, `schemaVersion`, and `schemaContentHash` for server-side version validation. |

Both UPSERT and DELETE use the same presigned upload flow. The `action` field in the snapshot determines the operation.

**Schema version validation**: The presign request includes `schemaVersion` and a `schemaContentHash` (hash of schema JSON excluding `schemaVersion`). The server rejects (HTTP 409) if content changed but version was not bumped.

---

## Core Construct Usage

### Basic

```typescript
import { ChaimDynamoDBBinder, TableBindingConfig, ChaimCredentials } from '@chaim-tools/cdk-lib';

const config = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromSecretsManager('chaim/credentials')
);

new ChaimDynamoDBBinder(this, 'UserSchema', {
  schemaPath: './schemas/user.bprint',
  table: usersTable,
  config,
});
```

### Single-Table Design

```typescript
const config = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromSecretsManager('chaim/credentials')
);

new ChaimDynamoDBBinder(this, 'UserBinding', {
  schemaPath: './schemas/user.bprint',
  table: singleTable,
  config,  // Same config for all entities on same table
});

new ChaimDynamoDBBinder(this, 'OrderBinding', {
  schemaPath: './schemas/order.bprint',
  table: singleTable,
  config,
});
```

### Strict Failure Mode

```typescript
import { FailureMode } from '@chaim-tools/cdk-lib';

const config = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromSecretsManager('chaim/credentials'),
  FailureMode.STRICT  // Rolls back deployment on ingestion failure
);
```

---

## Props Reference

### ChaimDynamoDBBinderProps

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `schemaPath` | string | Yes | Path to `.bprint` schema file |
| `table` | `ITable` | Yes | DynamoDB table construct |
| `config` | `TableBindingConfig` | Yes | Binding configuration |

### TableBindingConfig

```typescript
new TableBindingConfig(appId, credentials, failureMode?)
```

| Parameter | Type | Required | Default |
|-----------|------|----------|---------|
| `appId` | string | Yes | — |
| `credentials` | `IChaimCredentials` | Yes | — |
| `failureMode` | `FailureMode` | No | `STRICT` |

### ChaimCredentials

| Factory Method | Use Case |
|---------------|----------|
| `ChaimCredentials.fromSecretsManager(secretName)` | Production — reads at deploy time |
| `ChaimCredentials.fromApiKeys(apiKey, apiSecret)` | Development only |

---

## Credential Security Model

- Synth never reads secret values — only captures Secret ARN/name as reference
- Deploy-time Lambda reads Secrets Manager and signs outbound API requests
- No credentials appear in synthesized CloudFormation templates, logs, or CDK assets

---

## Snapshot Payload Structure

```typescript
export interface LocalSnapshotPayload {
  schemaVersion: string;
  action: 'UPSERT' | 'DELETE';
  provider: 'aws';
  accountId: string;
  region: string;
  stackName: string;
  datastoreType: string;
  resourceName: string;
  resourceId: string;
  identity: StableIdentity;
  appId: string;
  schema: SchemaData | null;         // null for DELETE
  resource: DynamoDBMetadata;
  providerIdentity: { account: string; region: string; stackId: string; stackName: string };
  operation: { eventId: string; requestType: string; failureMode: string };
  resolution: { mode: 'LOCAL' | 'PUBLISHED'; hasTokens: boolean };
  hashes: { schemaHash: string; contentHash: string };
  producer: { component: string; version: string; runtime: string };
  capturedAt: string;
}
```

---

## Idempotency Model

| Key | Purpose |
|-----|---------|
| `resourceId + contentHash` | Deduplication — SaaS ignores duplicate content |
| `eventId` | Audit trail — unique per CloudFormation operation |
| CloudFormation `RequestId` | Retry detection — same RequestId reuses eventId |

---

## Failure Modes

| Mode | Behavior |
|------|----------|
| `STRICT` (default) | Return FAILED to CloudFormation, triggering rollback |
| `BEST_EFFORT` | Log errors, return SUCCESS to CloudFormation (must be explicitly set) |

---

## Data Sent to Chaim SaaS

**Sent**: `.bprint` schema content, entity/field definitions, DynamoDB metadata (name, ARN, keys, indexes, TTL, streams, billing, encryption), `appId`, `stackName`, `accountId`, `region`, producer metadata.

**Never sent**: table data, sampled data, IAM credentials, secret values, application code.

All transmission over HTTPS. Snapshots uploaded to S3 via presigned URLs and encrypted at rest.

---

## Key Files to Modify

| Task | File |
|------|------|
| Change DynamoDB metadata extraction | `src/binders/chaim-dynamodb-binder.ts` |
| Change snapshot structure | `src/binders/base-chaim-binder.ts`, `src/types/snapshot-payload.ts` |
| Change Lambda ingestion logic | `src/lambda-handler/handler.js` |
| Change API endpoints | `src/config/chaim-endpoints.ts` |
| Change credential handling | `src/types/credentials.ts` |
| Change OS cache paths | `src/services/os-cache-paths.ts` |
| Change CDK asset paths | `src/services/cdk-project-root.ts`, `src/services/snapshot-paths.ts` |
| Change stable identity logic | `src/services/stable-identity.ts` |
| Add a new data store binder | Create new file in `src/binders/`, extend `BaseChaimBinder` |

---

## IAM Permissions (Lambda Execution Role)

- `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`
- `secretsmanager:GetSecretValue` (if using Secrets Manager)
- Outbound HTTPS to Chaim API endpoints and AWS S3 presigned URLs

---

## Development Commands

| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies |
| `npm run build` | Build all packages |
| `npm test` | Run test suite (Vitest) |
| `npm run clean` | Remove build artifacts |

### Publishing

```bash
cd packages/cdk-lib
npm version patch   # or minor / major
npm publish --access public
```

---

## Non-Goals

This package does NOT:
- Deploy customer DynamoDB tables (that is standard CDK)
- Access or scan customer data
- Run at application request time
- Generate code (that is `chaim-client-java` via `chaim-cli`)
- Support non-AWS providers (separate repos planned)
