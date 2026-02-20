# chaim-cdk

The AWS CDK construct library that connects your DynamoDB tables to the Chaim platform. It reads your `.bprint` schema files at synth time, extracts table metadata (keys, indexes, TTL, streams, billing), writes a local snapshot for CLI code generation, and optionally publishes the snapshot to Chaim SaaS at deploy time for governance and auditing.

**npm**: [`@chaim-tools/cdk-lib`](https://www.npmjs.com/package/@chaim-tools/cdk-lib)

## Where This Fits

```
 .bprint file  ──>  chaim-cdk  ──>  chaim-cli  ──>  chaim-client-java
                        ^                                    │
                        │                                    v
                  YOUR CDK STACK                     Generated Java SDK
```

The CDK construct is the bridge between your infrastructure and the code generation pipeline. It captures everything the Java generator needs — schema content, table name, ARN, region, primary key, GSIs, LSIs — and writes it to a local snapshot that the CLI reads.

## Installation

```bash
npm install @chaim-tools/cdk-lib
```

**Requirements**: Node.js 20+, AWS CDK v2, `constructs` v10+

## Quick Start

```typescript
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import {
  ChaimDynamoDBBinder,
  TableBindingConfig,
  ChaimCredentials,
} from '@chaim-tools/cdk-lib';

// Your existing DynamoDB table
const usersTable = new dynamodb.Table(this, 'UsersTable', {
  partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
});

// Create a binding config (shared across all entities on this table)
const config = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromSecretsManager('chaim/credentials')
);

// Bind your schema to the table — 3 lines of CDK
new ChaimDynamoDBBinder(this, 'UsersSchema', {
  schemaPath: './schemas/user.bprint',
  table: usersTable,
  config,
});
```

Your table deploys exactly as before. Chaim captures the schema and table metadata automatically.

## Two Workflows

### Local-Only (Development)

Generate code without deploying to AWS — ideal for rapid iteration:

```bash
cdk synth                             # Writes LOCAL snapshot to OS cache
chaim generate --package com.example  # Generates Java SDK from snapshot
```

### Full (Production)

Deploy and publish the schema to Chaim SaaS for governance:

```bash
cdk deploy                            # Writes LOCAL snapshot + publishes to Chaim SaaS
chaim generate --package com.example  # Generates Java SDK from snapshot
```

**LOCAL** = snapshot written to OS cache at synth time for CLI consumption.
**PUBLISHED** = snapshot sent to Chaim SaaS at deploy time for governance and audit.

## What Happens at Each Stage

### During `cdk synth` (and `cdk deploy`)

1. Validates the `.bprint` schema against the spec
2. Extracts database metadata (e.g., keys, indexes, TTL, streams, billing mode)
3. Writes a LOCAL snapshot to `~/.chaim/cache/snapshots/` for the CLI
4. Bundles a Lambda asset to `cdk.out/chaim/assets/` for deploy-time ingestion

### During `cdk deploy` (Lambda execution)

5. Requests a presigned upload URL from the Chaim API (`POST /ingest/presign`), including `schemaVersion` and a `schemaContentHash` (a hash of the schema content excluding the version field). The server validates that the `schemaVersion` was incremented if schema content changed since the last deploy — if not, it rejects the request with HTTP 409.
6. Uploads the snapshot to Chaim SaaS via the S3 presigned URL

If you see a `409 Conflict` error during deploy, bump the schema version with `chaim bump <file>` and redeploy.

The CDK construct and Lambda run only during CloudFormation operations. There is zero runtime impact on your application — no sidecars, no background processes, no instrumentation.

## Single-Table Design

For single-table design for NoSQL tables with multiple entities, create one `TableBindingConfig` and share it:

```typescript
const singleTable = new dynamodb.Table(this, 'DataTable', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
});

const config = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromSecretsManager('chaim/credentials')
);

new ChaimDynamoDBBinder(this, 'UserBinding', {
  schemaPath: './schemas/user.bprint',
  table: singleTable,
  config,
});

new ChaimDynamoDBBinder(this, 'OrderBinding', {
  schemaPath: './schemas/order.bprint',
  table: singleTable,
  config,
});
```

All entities bound to the same table share the same `appId` and credentials. `TableBindingConfig` enforces this by design.

##  Metadata Captured

The construct extracts the following from your CDK table definition:

### DynamoDB

| Property | Captured |
|----------|----------|
| Table name | Yes |
| Table ARN | Yes |
| Region | Yes |
| Partition key | Yes |
| Sort key | Yes |
| Global Secondary Indexes (name, keys, projection) | Yes |
| Local Secondary Indexes (name, sort key, projection) | Yes |
| TTL attribute | Yes |
| Stream configuration (enabled, view type) | Yes |
| Billing mode | Yes |
| Encryption key ARN (customer-managed KMS) | Yes |

This metadata flows through the CLI to the Java generator, which uses it to generate GSI/LSI query methods and index constants.

## Credentials Setup

### Secrets Manager (Recommended for Production)

```bash
aws secretsmanager create-secret \
  --name chaim/credentials \
  --secret-string '{"apiKey":"your-api-key","apiSecret":"your-api-secret"}'
```

```typescript
const config = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromSecretsManager('chaim/credentials')
);
```

The Secret ARN is captured as a reference only. The deploy-time Lambda reads Secrets Manager at runtime. No credentials appear in synthesized templates or logs.

### Direct API Keys (Development Only)

```typescript
const config = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromApiKeys(
    process.env.CHAIM_API_KEY!,
    process.env.CHAIM_API_SECRET!
  )
);
```

## Failure Handling

| Mode | Behavior |
|------|----------|
| `STRICT` (default) | Deployment rolls back if ingestion fails |
| `BEST_EFFORT` | Deployment succeeds even if Chaim ingestion fails (must be explicitly set) |

```typescript
import { FailureMode } from '@chaim-tools/cdk-lib';

// Default is STRICT - no need to specify
const config = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromSecretsManager('chaim/credentials')
);

// Opt into BEST_EFFORT explicitly for development/testing
const devConfig = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromApiKeys('key', 'secret'),
  FailureMode.BEST_EFFORT
);
```

## Snapshot Output Locations

### LOCAL Snapshots (for CLI Code Generation)

| OS | Path |
|----|------|
| macOS / Linux | `~/.chaim/cache/snapshots/` |
| Windows | `%LOCALAPPDATA%/chaim/cache/snapshots/` |

Override with `CHAIM_SNAPSHOT_DIR` environment variable.

Directory structure:
```
~/.chaim/cache/snapshots/aws/{accountId}/{region}/{stackName}/dynamodb/{resourceId}.json
```

### Lambda Assets (for Deploy-Time Ingestion)

```
cdk.out/chaim/assets/{stackName}/{resourceId}/
├── snapshot.json
└── index.js
```

## Props Reference

### ChaimDynamoDBBinder

| Property | Required | Description |
|----------|----------|-------------|
| `schemaPath` | Yes | Path to your `.bprint` schema file |
| `table` | Yes | Your `dynamodb.Table` construct |
| `config` | Yes | `TableBindingConfig` with appId, credentials, and failure mode |

### TableBindingConfig

```typescript
new TableBindingConfig(appId, credentials, failureMode?)
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `appId` | Yes | Your Chaim application identifier |
| `credentials` | Yes | `ChaimCredentials.fromSecretsManager()` or `.fromApiKeys()` |
| `failureMode` | No | `FailureMode.STRICT` (default) or `FailureMode.BEST_EFFORT` |

## Data Sent to Chaim SaaS

**Sent**: `.bprint` schema content, entity/field definitions, DynamoDB table metadata (name, ARN, keys, indexes, TTL, streams, billing), `appId`, `stackName`, `accountId`, `region`.

**Never sent**: table data or records, sampled data, IAM credentials or secret values, application code.

All data transmits over HTTPS. Snapshots upload to Chaim S3 via presigned URLs and are encrypted at rest.

## Testing Against Non-Production Environments

```bash
cdk deploy --context chaimApiBaseUrl=https://ingest.dev.chaim.co   # Dev
cdk deploy --context chaimApiBaseUrl=https://ingest.beta.chaim.co  # Beta
cdk deploy                                                          # Production (default)
```

## Development

```bash
npm install
npm run build         
npm run test          
npm run test:packages  
npm run clean          
```

### Publishing

```bash
cd packages/cdk-lib
npm version patch      # or minor / major
npm publish --access public
```

## Using in Your CDK Application

Add `@chaim-tools/cdk-lib` as a dependency in your CDK project:

```bash
cd my-cdk-project
npm install @chaim-tools/cdk-lib
```

Place `.bprint` schema files in a `schemas/` directory (or anywhere accessible at synth time). Reference them in your stack:

```typescript
import { ChaimDynamoDBBinder, TableBindingConfig, ChaimCredentials } from '@chaim-tools/cdk-lib';

export class MyStack extends cdk.Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    const table = new dynamodb.Table(this, 'OrdersTable', {
      partitionKey: { name: 'orderId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'customerId', type: dynamodb.AttributeType.STRING },
    });

    // Add a GSI — Chaim captures it automatically
    table.addGlobalSecondaryIndex({
      indexName: 'customer-index',
      partitionKey: { name: 'customerId', type: dynamodb.AttributeType.STRING },
    });

    const config = new TableBindingConfig(
      'my-app',
      ChaimCredentials.fromSecretsManager('chaim/credentials')
    );

    new ChaimDynamoDBBinder(this, 'OrderSchema', {
      schemaPath: './schemas/order.bprint',
      table,
      config,
    });
  }
}
```

After `cdk synth`, run `chaim generate --package com.mycompany.model` to produce the Java SDK with query methods for the `customer-index` GSI.

## License

Apache-2.0
