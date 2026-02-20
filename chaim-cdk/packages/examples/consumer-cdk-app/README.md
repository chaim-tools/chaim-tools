# Consumer CDK App Example

Example CDK application demonstrating `ChaimDynamoDBBinder` usage with two different credential patterns.

## Prerequisites

1. **Chaim API credentials** - Get from your Chaim account
2. **AWS credentials** - For CDK deployment
3. **Node.js 20+** and **pnpm**

## Setup

```bash
# From the chaim-cdk root
pnpm install
pnpm build

# Or from this directory
pnpm install
```

## Usage

### Development (Direct Credentials)

```bash
# Set environment variables
export CHAIM_API_KEY="your-api-key"
export CHAIM_API_SECRET="your-api-secret"

# Synthesize CloudFormation template
pnpm synth

# Deploy
pnpm deploy
```

### Production (Secrets Manager)

First, create the secret in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name chaim/api-credentials \
  --secret-string '{"apiKey":"your-api-key","apiSecret":"your-api-secret"}'
```

Then deploy:

```bash
pnpm synth
pnpm deploy
```

## What This Example Demonstrates

### Two DynamoDB Tables

1. **UsersTable** - User account data
2. **OrdersTable** - Order management data

### Two Credential Patterns

| Table | Credentials | Failure Mode | Use Case |
|-------|-------------|--------------|----------|
| Users | Direct API keys | BEST_EFFORT (explicit) | Development/Testing |
| Orders | Secrets Manager | STRICT (default) | Production |

### Failure Modes

- **STRICT** (default) - Deployment rolls back if Chaim ingestion fails
- **BEST_EFFORT** - Deployment continues even if Chaim ingestion fails (must be explicitly set)

## Project Structure

```
consumer-cdk-app/
├── bin/
│   └── app.ts           # CDK app entry point
├── lib/
│   └── stack.ts         # Stack definition with ChaimDynamoDBBinder
├── schemas/
│   ├── users.bprint     # User entity schema
│   └── orders.bprint    # Order entity schema
├── cdk.json             # CDK configuration
├── package.json
└── tsconfig.json
```

## Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Compile TypeScript |
| `pnpm synth` | Synthesize CloudFormation template |
| `pnpm deploy` | Deploy stack to AWS |
| `pnpm diff` | Compare deployed stack with current state |
| `pnpm clean` | Remove compiled output and cdk.out |

## License

Apache-2.0
