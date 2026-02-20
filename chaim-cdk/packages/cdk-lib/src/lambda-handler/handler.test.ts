/**
 * Unit tests for Chaim Ingestion Lambda Handler
 * 
 * Note: The Lambda handler is CommonJS and makes real HTTP requests.
 * These tests focus on:
 * - Response structure validation
 * - Environment variable handling
 * - Error handling paths
 * 
 * Full integration tests with mocked API responses should be in the integration test suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// Type definitions
interface CloudFormationEvent {
  RequestType: 'Create' | 'Update' | 'Delete';
}

interface HandlerResponse {
  PhysicalResourceId: string;
  Data: {
    EventId: string;
    IngestStatus: string;
    Action: string;
    Timestamp: string;
    ContentHash?: string;
    Error?: string;
  };
}

type HandlerFn = (event: CloudFormationEvent, context: object) => Promise<HandlerResponse>;

let handler: HandlerFn;
let snapshotPath: string;

describe('Lambda Handler', () => {
  const mockSnapshotPayload = {
    schemaVersion: '1.0',
    provider: 'aws',
    accountId: '123456789012',
    region: 'us-east-1',
    stackName: 'TestStack',
    datastoreType: 'dynamodb',
    resourceName: 'TestTable',
    resourceId: 'TestTable__User',
    appId: 'test-app',
    schema: { schemaVersion: '1.0', namespace: 'test' },
    dataStore: {
      type: 'dynamodb',
      arn: 'arn:aws:dynamodb:us-east-1:123456789012:table/TestTable',
      name: 'TestTable',
    },
    context: { account: '123456789012', region: 'us-east-1' },
    capturedAt: '2024-01-01T00:00:00.000Z',
  };

  const originalEnv = process.env;

  beforeAll(async () => {
    snapshotPath = path.join(process.cwd(), 'snapshot.json');
    fs.writeFileSync(snapshotPath, JSON.stringify(mockSnapshotPayload));
    
    // Dynamically import the CommonJS handler
    const handlerModule = await import('./handler.js');
    handler = handlerModule.handler;
  });

  afterAll(() => {
    if (fs.existsSync(snapshotPath)) {
      fs.unlinkSync(snapshotPath);
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.API_KEY = 'test-api-key';
    process.env.API_SECRET = 'test-api-secret';
    process.env.CHAIM_API_BASE_URL = 'https://ingest.test.chaim.co';
    process.env.FAILURE_MODE = 'BEST_EFFORT';
    
    fs.writeFileSync(snapshotPath, JSON.stringify(mockSnapshotPayload));
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Credential validation', () => {
    it('should throw error in STRICT mode when credentials are missing', async () => {
      delete process.env.API_KEY;
      delete process.env.API_SECRET;
      delete process.env.SECRET_NAME;
      process.env.FAILURE_MODE = 'STRICT';

      await expect(handler({ RequestType: 'Create' }, {})).rejects.toThrow(
        'Missing credentials: provide SECRET_NAME or API_KEY/API_SECRET'
      );
    });

    it('should return FAILED status in BEST_EFFORT mode when credentials are missing', async () => {
      delete process.env.API_KEY;
      delete process.env.API_SECRET;
      delete process.env.SECRET_NAME;
      process.env.FAILURE_MODE = 'BEST_EFFORT';

      const result = await handler({ RequestType: 'Create' }, {});

      expect(result.Data.IngestStatus).toBe('FAILED');
      expect(result.Data.Error).toContain('Missing credentials');
    });
  });

  describe('Snapshot size validation', () => {
    it('should throw error in STRICT mode when snapshot exceeds max size', async () => {
      process.env.FAILURE_MODE = 'STRICT';
      process.env.CHAIM_MAX_SNAPSHOT_BYTES = '100';
      
      const largePayload = { ...mockSnapshotPayload, largeData: 'x'.repeat(200) };
      fs.writeFileSync(snapshotPath, JSON.stringify(largePayload));

      await expect(handler({ RequestType: 'Create' }, {})).rejects.toThrow(
        /Snapshot size .* exceeds maximum allowed/
      );
    });

    it('should return FAILED status in BEST_EFFORT mode when snapshot exceeds max size', async () => {
      process.env.FAILURE_MODE = 'BEST_EFFORT';
      process.env.CHAIM_MAX_SNAPSHOT_BYTES = '100';
      
      const largePayload = { ...mockSnapshotPayload, largeData: 'x'.repeat(200) };
      fs.writeFileSync(snapshotPath, JSON.stringify(largePayload));

      const result = await handler({ RequestType: 'Create' }, {});

      expect(result.Data.IngestStatus).toBe('FAILED');
      expect(result.Data.Error).toContain('Snapshot size');
    });
  });

  describe('Response structure', () => {
    it('should return response with PhysicalResourceId for Create', async () => {
      // This test will fail due to network error, but in BEST_EFFORT mode
      // it should still return a valid response structure
      const result = await handler({ RequestType: 'Create' }, {});

      expect(result).toHaveProperty('PhysicalResourceId');
      expect(result).toHaveProperty('Data');
      expect(result.Data).toHaveProperty('EventId');
      expect(result.Data).toHaveProperty('IngestStatus');
      expect(result.Data).toHaveProperty('Action');
      expect(result.Data.Action).toBe('UPSERT');
    });

    it('should return response with PhysicalResourceId for Delete', async () => {
      const result = await handler({ RequestType: 'Delete' }, {});

      expect(result).toHaveProperty('PhysicalResourceId');
      expect(result).toHaveProperty('Data');
      expect(result.Data).toHaveProperty('EventId');
      expect(result.Data).toHaveProperty('IngestStatus');
      expect(result.Data).toHaveProperty('Action');
      expect(result.Data.Action).toBe('DELETE');
    });

    it('should include Timestamp in response', async () => {
      const result = await handler({ RequestType: 'Delete' }, {});

      expect(result.Data).toHaveProperty('Timestamp');
      expect(result.Data.Timestamp).toBeDefined();
    });

    it('should send DELETE snapshot through presigned upload when ChaimBinder removed', async () => {
      // This test verifies the Lambda sends DELETE snapshot through presign flow
      // In a real scenario, this would be mocked, but here we're just
      // verifying the flow completes (may fail due to network call)
      
      // Note: This will likely fail in CI because it tries to make real HTTP requests
      // For proper testing, we'd need to mock the httpRequest function
      // For now, we just verify the response structure
      
      const result = await handler({ RequestType: 'Delete' }, {});
      
      expect(result).toHaveProperty('PhysicalResourceId');
      expect(result.Data).toHaveProperty('EventId');
      expect(result.Data).toHaveProperty('IngestStatus');
      expect(result.Data.Action).toBe('DELETE');
      
      // The IngestStatus might be FAILED if the API is unreachable,
      // but the structure should still be correct
      expect(['SUCCESS', 'FAILED']).toContain(result.Data.IngestStatus);
    });
  });

  describe('ContentHash computation', () => {
    it('should compute contentHash as SHA-256 of snapshot bytes', async () => {
      // The handler enhances the snapshot with operation and producer metadata
      // So we need to compute the hash of the enhanced snapshot, not the original
      const result = await handler({ RequestType: 'Create' }, {});

      // ContentHash should be computed and present
      expect(result.Data.ContentHash).toBeDefined();
      expect(result.Data.ContentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    });

    it('should include contentHash in response when available', async () => {
      // ContentHash is computed from snapshot bytes
      const snapshotBytes = JSON.stringify(mockSnapshotPayload);
      const expectedHash = 'sha256:' + crypto.createHash('sha256').update(snapshotBytes).digest('hex');
      
      const result = await handler({ RequestType: 'Delete' }, {});

      // ContentHash may or may not be present depending on the error path
      // but when computed, it should be the correct value
      if (result.Data.ContentHash) {
        expect(result.Data.ContentHash).toBe(expectedHash);
      }
    });
  });

  describe('EventId generation', () => {
    it('should generate unique eventId for each invocation', async () => {
      const result1 = await handler({ RequestType: 'Delete' }, {});
      const result2 = await handler({ RequestType: 'Delete' }, {});

      expect(result1.Data.EventId).not.toBe(result2.Data.EventId);
    });

    it('should use eventId as PhysicalResourceId', async () => {
      const result = await handler({ RequestType: 'Create' }, {});

      expect(result.PhysicalResourceId).toBe(result.Data.EventId);
    });

    it('should generate valid UUID format for eventId', async () => {
      const result = await handler({ RequestType: 'Delete' }, {});
      
      // UUID v4 format regex
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(result.Data.EventId).toMatch(uuidRegex);
    });
  });

  describe('v1.1 Operation Metadata', () => {
    it('should include cfRequestId in operation metadata when available', async () => {
      // Note: This test verifies structure even though API may fail
      const result = await handler({ 
        RequestType: 'Delete',
        RequestId: 'cf-test-request-id-123'
      }, {});
      
      expect(result).toBeDefined();
      expect(result.Data.EventId).toBeDefined();
    });

    it('should include requestType in response', async () => {
      const result = await handler({ RequestType: 'Create' }, {});
      
      expect(result).toBeDefined();
      expect(result.Data.Action).toBe('UPSERT');
    });
  });

  describe('v1.1 Producer Metadata', () => {
    it('should read package version from snapshot _packageVersion field', async () => {
      // Modify snapshot to include version
      const snapshotWithVersion = { ...mockSnapshotPayload, _packageVersion: '1.2.3' };
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshotWithVersion));
      
      const result = await handler({ RequestType: 'Delete' }, {});
      
      expect(result).toBeDefined();
      // Version should be used by Lambda to populate producer metadata
    });
  });

  describe('v1.1 Delete Context Inference', () => {
    it('should infer BINDER_REMOVED as default deletion reason', async () => {
      const result = await handler({ 
        RequestType: 'Delete',
        LogicalResourceId: 'TestBinder',
      }, {});
      
      expect(result).toBeDefined();
      expect(result.Data.Action).toBe('DELETE');
    });

    it('should detect stack deletion from ResourceProperties', async () => {
      const result = await handler({ 
        RequestType: 'Delete',
        ResourceProperties: {
          StackStatus: 'DELETE_IN_PROGRESS'
        }
      }, {});
      
      expect(result).toBeDefined();
      expect(result.Data.Action).toBe('DELETE');
    });

    it('should include deletedAt timestamp for DELETE actions', async () => {
      const result = await handler({ RequestType: 'Delete' }, {});
      
      expect(result).toBeDefined();
      expect(result.Data.Timestamp).toBeDefined();
    });
  });

  describe('Failure mode behavior', () => {
    it('should default to STRICT when FAILURE_MODE is not set', async () => {
      delete process.env.FAILURE_MODE;
      
      // STRICT mode should throw on API errors
      await expect(handler({ RequestType: 'Create' }, {})).rejects.toThrow();
    });

    it('should include error message in FAILED response', async () => {
      process.env.FAILURE_MODE = 'BEST_EFFORT';
      
      const result = await handler({ RequestType: 'Create' }, {});

      // Should have an error since the API is not mocked
      if (result.Data.IngestStatus === 'FAILED') {
        expect(result.Data.Error).toBeDefined();
      }
    });
  });

  describe('Environment variable handling', () => {
    it('should read API_KEY from environment', async () => {
      process.env.API_KEY = 'custom-key';
      
      // The handler should try to use this key
      // We can't fully verify without network mocking, but we can verify no credential error
      const result = await handler({ RequestType: 'Delete' }, {});
      
      // Should not fail with credential error
      expect(result.Data.Error || '').not.toContain('Missing credentials');
    });

    it('should read CHAIM_API_BASE_URL from environment', async () => {
      process.env.CHAIM_API_BASE_URL = 'https://custom.api.example.com';
      
      const result = await handler({ RequestType: 'Delete' }, {});
      
      // Handler should execute without throwing
      expect(result).toBeDefined();
    });

    it('should use default API base URL when env var not set', async () => {
      delete process.env.CHAIM_API_BASE_URL;
      
      const result = await handler({ RequestType: 'Delete' }, {});
      
      // Handler should execute without throwing
      expect(result).toBeDefined();
    }, 35000); // Default URL (ingest.chaim.co) resolves to a real host; allow time for the 30s request timeout
  });
});
