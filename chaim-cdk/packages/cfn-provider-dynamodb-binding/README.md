# @chaim-tools/cfn-provider-dynamodb-binding

CloudFormation Registry provider for `Chaim::DynamoDB::Binding` resource type.

## Overview

This package contains the Lambda handler that implements the CloudFormation Registry resource type. It:

- Accepts binding metadata (`AppId`, `Target.TableArn`, `Schema`)
- Computes `bindingId` and `contentHash`
- Posts to the Chaim ingest API with HMAC authentication
- Returns CloudFormation attributes

## Development

### Build

```bash
pnpm install
pnpm build
```

### Test

```bash
pnpm test
```

### Clean

```bash
pnpm clean
```

## Schema

See `schema.json` for the resource type definition.

## Handler

The handler (`src/handler.ts`) runs in Node.js 20 and uses:
- AWS SDK v3 for Secrets Manager, STS, and DynamoDB
- Global `fetch` API for HTTPS requests
- HMAC-SHA256 for request signing

## License

Apache-2.0

