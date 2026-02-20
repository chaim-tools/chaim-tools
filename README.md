# Chaim Tools

Schema-driven code generation and data governance platform for DynamoDB. Author `.bprint` schema files, bind them to DynamoDB tables via CDK, and generate production-ready Java SDKs with a single CLI command.

## How It Works

```
.bprint schema → CDK synth (snapshot) → chaim generate → Java SDK
```

1. Define your entity shape in a `.bprint` file (fields, types, constraints, identity)
2. Bind it to a DynamoDB table using `ChaimDynamoDBBinder` in your CDK stack
3. Run `cdk synth` to create a local snapshot with table metadata
4. Run `chaim generate` to produce a complete Java SDK (entities, repositories, validators)

Zero runtime impact — everything happens at build/deploy time.

## Packages

| Directory | npm Package | Description |
|-----------|-------------|-------------|
| `chaim-bprint-spec` | `@chaim-tools/chaim-bprint-spec` | `.bprint` schema specification, JSON Schema, TypeScript types, validation |
| `chaim-client-java` | `@chaim-tools/client-java` | Java code generator (JavaPoet-based, produces DynamoDB Enhanced Client code) |
| `chaim-cdk` | `@chaim-tools/cdk-lib` | AWS CDK constructs that bind schemas to DynamoDB tables |
| `chaim-cli` | `@chaim-tools/chaim` | CLI tool — discovers snapshots, invokes the generator |
| `chaim-examples-java` | _(not published)_ | Reference implementation with example schemas and CDK stacks |

### Dependency Graph

```
chaim-bprint-spec (leaf)
├── chaim-client-java
├── chaim-cdk/packages/cdk-lib
└── chaim-cli (depends on spec + client-java)
```

## Quick Start

### Prerequisites

- Node.js >= 18
- Java 17+
- AWS CDK v2
- pnpm

### Install

```bash
npm install -g @chaim-tools/chaim@latest
npm install @chaim-tools/cdk-lib@latest @chaim-tools/chaim-bprint-spec@latest
```

### Define a Schema

Create `schemas/users.bprint`:

```json
{
  "schemaVersion": "1.0",
  "entityName": "User",
  "description": "Application user",
  "identity": {
    "fields": ["userId"]
  },
  "fields": [
    { "name": "userId", "type": "string", "required": true },
    { "name": "email", "type": "string", "required": true },
    { "name": "age", "type": "number.int" },
    { "name": "createdAt", "type": "timestamp" },
    { "name": "active", "type": "boolean" }
  ]
}
```

### Bind in CDK

```typescript
import { ChaimDynamoDBBinder } from '@chaim-tools/cdk-lib';

new ChaimDynamoDBBinder(this, 'UsersSchema', {
  table: usersTable,
  schemaPath: path.join(__dirname, '../schemas/users.bprint'),
  chaim: chaimConfig,
});
```

### Generate SDK

```bash
cdk synth
chaim generate --package com.example.sdk --output ./src/main/java
```

This produces `User.java`, `UserRepository.java`, `UserValidator.java`, `UserKeys.java`, and shared infrastructure classes.

## Supported Field Types

### Scalar Types

| Type | Sub-types | Java Mapping | Description |
|------|-----------|-------------|-------------|
| `string` | — | `String` | Text values |
| `number` | `.int`, `.long`, `.float`, `.double`, `.decimal` | `Integer` (default) | Numeric values |
| `boolean` | — | `Boolean` | True/false |
| `binary` | — | `byte[]` | Raw byte data |
| `timestamp` | `.epoch`, `.date` | `Instant` (default) | Date/time values |

### Collection Types

| Type | Sub-types | Java Mapping |
|------|-----------|-------------|
| `list` | scalar or map items | `List<T>` |
| `map` | nested fields | Generated `@DynamoDbBean` class |
| `stringSet` | — | `Set<String>` |
| `numberSet` | `.int`, `.long`, `.float`, `.double`, `.decimal` | `Set<Integer>` (default) |

### Field Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Field name (checked against reserved words) |
| `type` | `string` | Dot-notation type (e.g., `number.long`, `timestamp.epoch`) |
| `required` | `boolean` | Whether the field is required |
| `nullable` | `boolean` | Explicitly allows null values |
| `description` | `string` | Human-readable description |
| `default` | `any` | Default value |
| `enum` | `(string \| number)[]` | Allowed values (type-matched) |
| `constraints` | `object` | `minLength`, `maxLength`, `pattern`, `min`, `max` |
| `nameOverride` | `string` | Java identifier override for non-Java-safe names |

## Schema vs Infrastructure Boundary

The `.bprint` schema defines **data structure** only. Infrastructure concerns belong in CDK:

| Concern | Defined In |
|---------|-----------|
| Fields, types, constraints, identity | `.bprint` schema |
| GSIs, LSIs (indexes) | CDK construct |
| TTL attribute | CDK construct |
| Billing mode | CDK construct |
| Streams configuration | CDK construct |

## Development

This is a pnpm workspace monorepo.

```bash
# Install all dependencies
pnpm install

# Build a specific package
cd chaim-bprint-spec && npm run build

# Run tests
cd chaim-bprint-spec && npm test
cd chaim-client-java && npm test
cd chaim-cdk/packages/cdk-lib && npm test
cd chaim-cli && npm test
```

## Releasing

A single script handles version bumps, builds, tests, npm publish, and git push across all packages:

```bash
./scripts/release.sh patch            # 0.2.7 → 0.2.8 (all packages)
./scripts/release.sh minor            # 0.2.7 → 0.3.0
./scripts/release.sh major            # 0.2.7 → 1.0.0
./scripts/release.sh patch --dry-run  # preview without changes
```

Prerequisite: `npm login` (one-time setup, token persists in `~/.npmrc`).

## License

Apache-2.0
