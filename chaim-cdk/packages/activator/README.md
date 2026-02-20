# @chaim-tools/activator

CDK stack to activate the `Chaim::DynamoDB::Binding` CloudFormation Registry type.

## Development

### Build

```bash
pnpm install
pnpm build
```

### Deploy

```bash
pnpm cdk synth         # Synthesize stack
pnpm cdk deploy        # Deploy to AWS
pnpm cdk diff          # Show changes
```

### Clean

```bash
pnpm clean
```

## Usage

### Option 1: Using CDK Context Parameters (Recommended)

```bash
pnpm cdk deploy \
  --context apiBaseUrl=https://ingest.chaim.co/v1 \
  --context apiKey=your-api-key \
  --context apiSecret=your-api-secret \
  --context schemaHandlerPackageS3Uri=s3://bucket/provider.zip  # Optional
```

### Option 2: Using Environment Variables

```bash
# Set environment variables
export CHAIM_API_BASE_URL=https://ingest.chaim.co/v1
export CHAIM_API_KEY=your-api-key
export CHAIM_API_SECRET=your-api-secret

# Optional: For private provider
export CHAIM_SCHEMA_HANDLER_PACKAGE_S3_URI=s3://bucket/provider.zip

# Deploy
pnpm cdk deploy
```

## What It Creates

- **Secrets Manager secret** with API credentials
- **Execution role** for the provider (least-privilege)
- **CloudFormation TypeActivation** for `Chaim::DynamoDB::Binding`

## License

Apache-2.0

