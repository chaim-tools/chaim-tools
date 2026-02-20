# @chaim-tools/cdk-lib

AWS CDK L2 constructs for binding DynamoDB tables to Chaim schemas.

## Installation

```bash
npm install @chaim-tools/cdk-lib
# or
pnpm add @chaim-tools/cdk-lib
```

## Development

### Build

```bash
pnpm install
pnpm build
```

### Test

```bash
pnpm test              # Run tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage
```

### Clean

```bash
pnpm clean
```

## Quick Start

```typescript
import { ChaimDynamoDBBinder, ChaimCredentials, TableBindingConfig } from '@chaim-tools/cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

// Create a DynamoDB table
const usersTable = new dynamodb.Table(this, 'Users', {
  partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
});

// Create binding configuration
const config = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromSecretsManager('chaim/api-credentials')
);

// Bind schema to table
new ChaimDynamoDBBinder(this, 'UsersBinding', {
  schemaPath: './schemas/users.bprint',
  table: usersTable,
  config,
});
```

## API Reference

### `ChaimDynamoDBBinder`

Construct that binds a DynamoDB table to a Chaim schema.

#### Props

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `schemaPath` | string | Yes | Path to `.bprint` schema file |
| `table` | `ITable` | Yes | DynamoDB table to bind |
| `config` | `TableBindingConfig` | Yes | Binding configuration (appId, credentials, failureMode) |

### `TableBindingConfig`

Configuration for entity bindings. For single-table design, create one config and share across all entity bindings.

```typescript
// Create config with Secrets Manager (recommended for production)
const config = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromSecretsManager('chaim/api-credentials')
);

// Or with direct API keys (for development)
const config = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromApiKeys(apiKey, apiSecret),
  FailureMode.BEST_EFFORT  // Optional - defaults to STRICT
);
```

**Constructor Parameters:**
- `appId` (string) - Application ID for the Chaim platform
- `credentials` (IChaimCredentials) - API credentials
- `failureMode` (FailureMode) - Optional, defaults to STRICT

### `ChaimCredentials`

Factory class for creating Chaim API credentials.

```typescript
// Using AWS Secrets Manager (recommended for production)
const credentials = ChaimCredentials.fromSecretsManager('chaim/api-credentials');

// Using direct API keys (for development/testing)
const credentials = ChaimCredentials.fromApiKeys(apiKey, apiSecret);
```

### `FailureMode`

| Mode | Behavior |
|------|----------|
| `STRICT` (default) | Return FAILED to CloudFormation on any ingestion error |
| `BEST_EFFORT` | Log errors, return SUCCESS to CloudFormation (must be explicitly set) |

## Single-Table Design (Multiple Entities)

For single-table design where multiple entity types share one DynamoDB table, create **one** `TableBindingConfig` and share it across all entity bindings:

```typescript
import { ChaimDynamoDBBinder, ChaimCredentials, TableBindingConfig } from '@chaim-tools/cdk-lib';

const singleTable = new dynamodb.Table(this, 'SingleTable', {
  partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
});

// Create config ONCE for the table
const tableConfig = new TableBindingConfig(
  'my-app',
  ChaimCredentials.fromSecretsManager('chaim/api-credentials')
);

// Share config across all entities in the table
new ChaimDynamoDBBinder(this, 'UserBinding', {
  schemaPath: './schemas/user.bprint',
  table: singleTable,
  config: tableConfig,
});

new ChaimDynamoDBBinder(this, 'OrderBinding', {
  schemaPath: './schemas/order.bprint',
  table: singleTable,
  config: tableConfig, // Same config!
});

new ChaimDynamoDBBinder(this, 'ProductBinding', {
  schemaPath: './schemas/product.bprint',
  table: singleTable,
  config: tableConfig, // Same config!
});
```

**Why this pattern?**

All entities in the same DynamoDB table must belong to the same application (`appId`) with the same credentials. `TableBindingConfig` enforces this by design:

- Sharing the same config object makes consistency automatic
- Validation catches accidental misconfigurations (different appIds)
- Clear intent in your CDK code
- DRY - define credentials once

**Result:**
- 3 separate snapshots (one per entity)
- 3 separate resourceIds: `SingleTable__User`, `SingleTable__Order`, `SingleTable__Product`
- All with the same `appId` and `credentials`
- Each entity can be independently created, updated, or deleted

## How It Works

1. At **synth time**: The construct reads your `.bprint` file, validates it, and writes a snapshot to the CDK asset directory
2. During **deploy**: CloudFormation invokes the ingestion Lambda in your account
3. The Lambda:
   - Reads the bundled snapshot from `./snapshot.json`
   - Generates `eventId` (UUID v4), `nonce` (UUID v4), and `contentHash` (SHA-256)
   - Requests presigned URL: `POST /ingest/presign` with HMAC authentication
   - Uploads snapshot: `PUT <presignedUrl>`

## Ingestion Flow

```
Create/Update:
  1. POST /ingest/presign with HMAC signature → get presigned S3 URL
     Request includes: appId, eventId, contentHash, timestamp, nonce
  2. PUT snapshot bytes to presigned S3 URL
  
Delete:
  1. Build DELETE snapshot (action: 'DELETE', schema: null)
  2. POST /ingest/presign with HMAC signature → get presigned S3 URL
  3. PUT DELETE snapshot bytes to presigned S3 URL
```

## Snapshot Payload

The snapshot payload includes:

**Schema & Identity:**
- `schemaVersion` - Payload version for backward compatibility (current: 1.0)
- `.bprint` schema content (entity definitions, field types, constraints)
- Application ID and resource identifiers

**Infrastructure Metadata:**
- AWS account ID, region, stack information
- DynamoDB table configuration (keys, indexes, TTL, streams)
- CloudFormation context

**Versioning Strategy:**
- **Minor bump** (1.0 → 1.1): Additive or optional field changes
- **Major bump** (1.x → 2.0): Breaking changes (removed/renamed/required fields)

## Configuration

### Environment Configuration

The API defaults to production: `https://ingest.chaim.co`

Override for different environments via CDK context:

```bash
# Production (default - no context needed)
cdk deploy

# Development
cdk deploy --context chaimApiBaseUrl=https://ingest.dev.chaim.co

# Beta
cdk deploy --context chaimApiBaseUrl=https://ingest.beta.chaim.co
```

You can also set a custom API URL via environment variable in the Lambda:
- `CHAIM_API_BASE_URL` - Overrides the default at runtime

## License

Apache-2.0
