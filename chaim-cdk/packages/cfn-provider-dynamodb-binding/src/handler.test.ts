import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { handler } from './handler';
import { CloudFormationEvent } from './types';

// Mock AWS SDK clients
vi.mock('@aws-sdk/client-sts', () => ({
  STSClient: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({ Account: '123456789012' }),
  })),
  GetCallerIdentityCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn(() => ({
    send: vi.fn().mockResolvedValue({
      SecretString: JSON.stringify({ apiKey: 'test-key', apiSecret: 'test-secret' }),
    }),
  })),
  GetSecretValueCommand: vi.fn(),
}));

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  text: async () => 'OK',
});

describe('handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const baseEvent: CloudFormationEvent = {
    RequestType: 'Create',
    ResourceProperties: {
      AppId: 'test-app',
      Target: {
        TableArn: 'arn:aws:dynamodb:us-east-1:123456789012:table/TestTable',
      },
      Schema: { schemaVersion: '1.0', namespace: 'test' },
    },
    TypeConfiguration: {
      ApiBaseUrl: 'https://api.example.com',
      SecretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-secret',
    },
  };

  it('should compute bindingId correctly', async () => {
    const response = await handler(baseEvent);

    // Expected bindingId = sha256("ddb|test-app|arn:aws:dynamodb:us-east-1:123456789012:table/TestTable")
    const expectedBindingId = crypto
      .createHash('sha256')
      .update('ddb|test-app|arn:aws:dynamodb:us-east-1:123456789012:table/TestTable')
      .digest('hex');

    expect(response.PhysicalResourceId).toBe(expectedBindingId);
    expect(response.Data.BindingId).toBe(expectedBindingId);
  });

  it('should compute contentHash correctly', async () => {
    const response = await handler(baseEvent);

    const schemaString = JSON.stringify(baseEvent.ResourceProperties.Schema);
    const expectedContentHash =
      'sha256:' +
      crypto.createHash('sha256').update(schemaString).digest('hex');

    expect(response.Data.ContentHash).toBe(expectedContentHash);
  });

  it('should return correct response structure', async () => {
    const response = await handler(baseEvent);

    expect(response).toHaveProperty('PhysicalResourceId');
    expect(response).toHaveProperty('Data');
    expect(response.Data).toHaveProperty('BindingId');
    expect(response.Data).toHaveProperty('ContentHash');
    expect(response.Data).toHaveProperty('AppliedAt');
    expect(response.Data).toHaveProperty('Status');
    expect(response.Data.Status).toBe('APPLIED');
  });

  it('should POST to ingest API for Create operation', async () => {
    await handler(baseEvent);

    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/bindings'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-chaim-key': 'test-key',
          'x-chaim-signature': expect.stringMatching(/^sha256=/),
        }),
      })
    );
  });

  it('should throw error if schema exceeds 200KB', async () => {
    const largeSchema = { data: 'x'.repeat(201_000) };
    const event = {
      ...baseEvent,
      ResourceProperties: {
        ...baseEvent.ResourceProperties,
        Schema: largeSchema,
      },
    };

    await expect(handler(event)).rejects.toThrow('Schema too large for pilot');
  });

  it('should throw error if TypeConfiguration is missing', async () => {
    const event = {
      ...baseEvent,
      TypeConfiguration: undefined,
    };

    await expect(handler(event)).rejects.toThrow('TypeConfiguration is required');
  });
});

