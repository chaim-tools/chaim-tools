/**
 * Mock Chaim API Server for Integration Testing
 * 
 * This creates a local HTTP server that mimics the Chaim SaaS API
 * for testing the full ingestion flow without real network calls.
 */

import * as http from 'http';
import * as crypto from 'crypto';

export interface MockApiRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body: any;
}

export interface MockApiServerOptions {
  /** Port to listen on (default: random available port) */
  port?: number;
  /** API key to expect in requests */
  expectedApiKey?: string;
  /** API secret for HMAC verification */
  apiSecret?: string;
  /** Whether to validate HMAC signatures */
  validateSignatures?: boolean;
}

export interface MockApiServerState {
  /** Captured requests for assertions */
  requests: MockApiRequest[];
  /** Upload URLs returned */
  uploadUrls: string[];
  /** Snapshot refs committed */
  snapshotRefs: any[];
}

/**
 * Creates a mock Chaim API server for integration testing.
 */
export class MockApiServer {
  private server: http.Server | null = null;
  private state: MockApiServerState = {
    requests: [],
    uploadUrls: [],
    snapshotRefs: [],
  };

  private readonly options: MockApiServerOptions;
  private port: number = 0;

  constructor(options: MockApiServerOptions = {}) {
    this.options = {
      expectedApiKey: 'test-api-key',
      apiSecret: 'test-api-secret',
      validateSignatures: true,
      ...options,
    };
  }

  /**
   * Start the mock server.
   */
  async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.listen(this.options.port || 0, '127.0.0.1', () => {
        const addr = this.server!.address();
        if (addr && typeof addr === 'object') {
          this.port = addr.port;
          resolve(this.port);
        } else {
          reject(new Error('Failed to get server port'));
        }
      });

      this.server.on('error', reject);
    });
  }

  /**
   * Stop the mock server.
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.server) {
        this.server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get the base URL of the mock server.
   */
  getBaseUrl(): string {
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * Get the current state (captured requests, etc.)
   * Returns a deep copy to prevent external mutations.
   */
  getState(): MockApiServerState {
    return {
      requests: [...this.state.requests],
      uploadUrls: [...this.state.uploadUrls],
      snapshotRefs: [...this.state.snapshotRefs],
    };
  }

  /**
   * Reset captured state.
   */
  reset(): void {
    this.state = {
      requests: [],
      uploadUrls: [],
      snapshotRefs: [],
    };
  }

  /**
   * Handle incoming requests.
   */
  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      const parsedBody = body ? JSON.parse(body) : undefined;
      
      // Capture request
      const capturedRequest: MockApiRequest = {
        method: req.method || 'GET',
        path: req.url || '/',
        headers: req.headers as Record<string, string | string[] | undefined>,
        body: parsedBody,
      };
      this.state.requests.push(capturedRequest);

      // Validate API key
      const apiKey = req.headers['x-chaim-key'];
      if (this.options.expectedApiKey && apiKey !== this.options.expectedApiKey) {
        this.sendError(res, 401, 'Invalid API key');
        return;
      }

      // Validate HMAC signature
      if (this.options.validateSignatures && body && this.options.apiSecret) {
        const signature = req.headers['x-chaim-signature'];
        const expectedSignature = crypto
          .createHmac('sha256', this.options.apiSecret)
          .update(body)
          .digest('hex');

        if (signature !== expectedSignature) {
          this.sendError(res, 401, 'Invalid signature');
          return;
        }
      }

      // Route request
      const url = req.url || '/';
      if (url.startsWith('/ingest/upload-url')) {
        this.handleUploadUrl(req, res, parsedBody);
      } else if (url.startsWith('/ingest/snapshot-ref')) {
        this.handleSnapshotRef(req, res, parsedBody);
      } else {
        this.sendError(res, 404, 'Not found');
      }
    });
  }

  /**
   * Handle /ingest/upload-url endpoint.
   */
  private handleUploadUrl(req: http.IncomingMessage, res: http.ServerResponse, body: any): void {
    if (req.method !== 'POST') {
      this.sendError(res, 405, 'Method not allowed');
      return;
    }

    // Generate mock presigned URL
    const eventId = body?.eventId || crypto.randomUUID();
    const uploadUrl = `${this.getBaseUrl()}/mock-s3-upload/${eventId}`;
    this.state.uploadUrls.push(uploadUrl);

    this.sendJson(res, 200, { uploadUrl, eventId });
  }

  /**
   * Handle /ingest/snapshot-ref endpoint.
   */
  private handleSnapshotRef(req: http.IncomingMessage, res: http.ServerResponse, body: any): void {
    if (req.method !== 'POST') {
      this.sendError(res, 405, 'Method not allowed');
      return;
    }

    // Capture snapshot ref
    this.state.snapshotRefs.push(body);

    this.sendJson(res, 200, {
      status: 'ok',
      action: body?.action || 'UPSERT',
      eventId: body?.eventId,
    });
  }

  /**
   * Send JSON response.
   */
  private sendJson(res: http.ServerResponse, statusCode: number, data: any): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Send error response.
   */
  private sendError(res: http.ServerResponse, statusCode: number, message: string): void {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message, statusCode }));
  }
}

/**
 * Create and start a mock API server.
 * Returns a cleanup function.
 */
export async function createMockApiServer(
  options?: MockApiServerOptions
): Promise<{ server: MockApiServer; cleanup: () => Promise<void> }> {
  const server = new MockApiServer(options);
  await server.start();

  return {
    server,
    cleanup: () => server.stop(),
  };
}
