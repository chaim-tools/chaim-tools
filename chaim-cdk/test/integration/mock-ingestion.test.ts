/**
 * Mock API Server Tests
 * 
 * Tests the mock API server functionality itself.
 * The full integration with the Lambda handler requires real network setup.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as http from 'http';
import * as crypto from 'crypto';
import { createMockApiServer, MockApiServer } from './mock-api-server';

// NOTE: These tests are for the old API contract (upload-url + snapshot-ref endpoints).
// They need to be updated to test the new /ingest/presign endpoint with HMAC auth.
describe.skip('Mock API Server Tests (OLD API - NEEDS UPDATE)', () => {
  let server: MockApiServer;
  let cleanup: () => Promise<void>;
  let baseUrl: string;

  beforeAll(async () => {
    const result = await createMockApiServer({
      expectedApiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      validateSignatures: true,
    });
    server = result.server;
    cleanup = result.cleanup;
    baseUrl = server.getBaseUrl();
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    server.reset();
  });

  // Helper to make HTTP request
  async function makeRequest(
    method: string,
    path: string,
    body?: any,
    headers?: Record<string, string>
  ): Promise<{ statusCode: number; body: any }> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, baseUrl);
      const bodyStr = body ? JSON.stringify(body) : undefined;
      
      const finalHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        'x-chaim-key': 'test-api-key',
        ...headers,
      };

      // Add HMAC signature if body provided
      if (bodyStr) {
        const signature = crypto
          .createHmac('sha256', 'test-api-secret')
          .update(bodyStr)
          .digest('hex');
        finalHeaders['x-chaim-signature'] = signature;
      }

      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname,
          method,
          headers: finalHeaders,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 500,
              body: data ? JSON.parse(data) : null,
            });
          });
        }
      );

      req.on('error', reject);
      
      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  }

  describe('Server lifecycle', () => {
    it('should start and return valid base URL', () => {
      expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    });

    it('should be accessible via HTTP', async () => {
      const response = await makeRequest('GET', '/health');
      // 404 is expected since we don't have a health endpoint
      expect(response.statusCode).toBe(404);
    });
  });

  describe('/ingest/upload-url endpoint', () => {
    it('should return 200 with uploadUrl for valid request', async () => {
      const response = await makeRequest('POST', '/ingest/upload-url', {
        appId: 'test-app',
        eventId: 'test-event-123',
        contentHash: 'sha256:abc123',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.uploadUrl).toBeDefined();
      expect(response.body.uploadUrl).toContain('/mock-s3-upload/');
    });

    it('should capture request in state', async () => {
      await makeRequest('POST', '/ingest/upload-url', {
        appId: 'test-app',
        eventId: 'event-456',
        contentHash: 'sha256:def456',
      });

      const state = server.getState();
      expect(state.requests.length).toBe(1);
      expect(state.requests[0].path).toBe('/ingest/upload-url');
      expect(state.requests[0].body.appId).toBe('test-app');
      expect(state.uploadUrls.length).toBe(1);
    });

    it('should reject request with invalid API key', async () => {
      const response = await makeRequest(
        'POST',
        '/ingest/upload-url',
        { appId: 'test-app' },
        { 'x-chaim-key': 'wrong-key' }
      );

      expect(response.statusCode).toBe(401);
      expect(response.body.error).toContain('Invalid API key');
    });

    it('should reject request with invalid signature', async () => {
      const body = JSON.stringify({ appId: 'test-app' });
      
      const response = await new Promise<{ statusCode: number; body: any }>((resolve, reject) => {
        const url = new URL('/ingest/upload-url', baseUrl);
        const req = http.request(
          {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-chaim-key': 'test-api-key',
              'x-chaim-signature': 'wrong-signature',
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
              resolve({
                statusCode: res.statusCode || 500,
                body: data ? JSON.parse(data) : null,
              });
            });
          }
        );

        req.on('error', reject);
        req.write(body);
        req.end();
      });

      expect(response.statusCode).toBe(401);
      expect(response.body.error).toContain('Invalid signature');
    });
  });

  describe('/ingest/snapshot-ref endpoint', () => {
    it('should return 200 for valid UPSERT request', async () => {
      const response = await makeRequest('POST', '/ingest/snapshot-ref', {
        action: 'UPSERT',
        appId: 'test-app',
        eventId: 'event-123',
        contentHash: 'sha256:abc',
        resourceId: 'table__entity',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.action).toBe('UPSERT');
    });

    it('should return 200 for valid DELETE request', async () => {
      const response = await makeRequest('POST', '/ingest/snapshot-ref', {
        action: 'DELETE',
        appId: 'test-app',
        eventId: 'event-456',
        resourceId: 'table__entity',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.action).toBe('DELETE');
    });

    it('should capture snapshot ref in state', async () => {
      await makeRequest('POST', '/ingest/snapshot-ref', {
        action: 'UPSERT',
        appId: 'my-app',
        eventId: 'event-789',
        resourceId: 'my-table__MyEntity',
      });

      const state = server.getState();
      expect(state.snapshotRefs.length).toBe(1);
      expect(state.snapshotRefs[0].action).toBe('UPSERT');
      expect(state.snapshotRefs[0].appId).toBe('my-app');
    });
  });

  describe('State management', () => {
    it('should reset all captured state', async () => {
      // Make some requests
      await makeRequest('POST', '/ingest/upload-url', { appId: 'test' });
      await makeRequest('POST', '/ingest/snapshot-ref', { action: 'UPSERT' });

      // Verify state has data
      let state = server.getState();
      expect(state.requests.length).toBeGreaterThan(0);

      // Reset
      server.reset();

      // Verify state is empty
      state = server.getState();
      expect(state.requests).toHaveLength(0);
      expect(state.uploadUrls).toHaveLength(0);
      expect(state.snapshotRefs).toHaveLength(0);
    });

    it('should return copy of state (not reference)', async () => {
      await makeRequest('POST', '/ingest/upload-url', { appId: 'test' });

      const state1 = server.getState();
      const state2 = server.getState();

      expect(state1).not.toBe(state2);
      expect(state1.requests).not.toBe(state2.requests);
    });
  });
});
