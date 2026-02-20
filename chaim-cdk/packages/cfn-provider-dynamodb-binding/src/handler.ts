import crypto from 'node:crypto';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { STSClient, GetCallerIdentityCommand } from '@aws-sdk/client-sts';
import { CloudFormationEvent, CloudFormationResponse, TypeConfiguration, IngestPayload } from './types';
import { hmac } from './hmac';

export const handler = async (event: CloudFormationEvent): Promise<CloudFormationResponse> => {
  const reqType = event.RequestType;
  const desired = event.ResourceProperties;
  
  // TypeConfiguration comes as a JSON string from CloudFormation Registry
  let cfg: TypeConfiguration | undefined;
  if (event.TypeConfiguration) {
    if (typeof event.TypeConfiguration === 'string') {
      cfg = JSON.parse(event.TypeConfiguration);
    } else {
      cfg = event.TypeConfiguration as TypeConfiguration;
    }
  }

  if (!cfg) {
    throw new Error('TypeConfiguration is required. Ensure the resource type is activated with ApiBaseUrl and SecretArn.');
  }

  // Validate schema size for pilot (≤ 200 KB)
  const schemaString = typeof desired.Schema === 'string' 
    ? desired.Schema 
    : JSON.stringify(desired.Schema);
  
  if (schemaString.length > 200_000) {
    throw new Error('Schema too large for pilot; please reduce or switch to S3 in production.');
  }

  // Get current AWS account ID
  const sts = new STSClient();
  const identity = await sts.send(new GetCallerIdentityCommand({}));
  const accountId = identity.Account!;
  if (!accountId) {
    throw new Error('Failed to get AWS account ID');
  }

  // Compute bindingId
  const bindingId = crypto.createHash('sha256')
    .update(`ddb|${desired.AppId}|${desired.Target.TableArn}`)
    .digest('hex');

  // Compute contentHash
  const contentHash = 'sha256:' + crypto.createHash('sha256')
    .update(schemaString)
    .digest('hex');

  // For Create/Update/Delete operations, post to ingest API
  if (['Create', 'Update', 'Delete'].includes(reqType)) {
    // Fetch credentials from Secrets Manager
    const sm = new SecretsManagerClient();
    const secretResponse = await sm.send(
      new GetSecretValueCommand({ SecretId: cfg.SecretArn })
    );

    if (!secretResponse.SecretString) {
      throw new Error(`Secret ${cfg.SecretArn} has no SecretString`);
    }

    const secret = JSON.parse(secretResponse.SecretString);
    const { apiKey, apiSecret } = secret;

    if (!apiKey || !apiSecret) {
      throw new Error(`Secret ${cfg.SecretArn} must contain apiKey and apiSecret fields`);
    }

    // Build payload
    const payload: IngestPayload = {
      op: reqType as 'Create' | 'Update' | 'Delete',
      appId: desired.AppId,
      accountId,
      bindingId,
      resourceType: 'Chaim::DynamoDB::Binding',
      target: desired.Target,
      schema: desired.Schema,
      contentHash,
      timestamp: new Date().toISOString(),
    };

    const body = JSON.stringify(payload);

    // HMAC sign the request
    const signature = hmac(apiSecret, body);

    // POST to ingest API
    const url = `${cfg.ApiBaseUrl}/bindings`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-chaim-key': apiKey,
        'x-chaim-signature': signature,
      },
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`POST to ${url} failed: ${response.status} ${errorText}`);
    }
  }

  // Return CloudFormation response
  return {
    PhysicalResourceId: bindingId,
    Data: {
      BindingId: bindingId,
      ContentHash: contentHash,
      AppliedAt: new Date().toISOString(),
      Status: 'APPLIED',
    },
  };
};

