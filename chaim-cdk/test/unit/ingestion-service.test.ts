import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  IngestionService,
  DEFAULT_INGESTION_CONFIG,
  INGESTION_ENDPOINTS,
} from '../../src/services/ingestion-service';
import { DEFAULT_CHAIM_API_BASE_URL, CHAIM_ENDPOINTS } from '../../src/config/chaim-endpoints';

describe('IngestionService', () => {
  describe('DEFAULT_INGESTION_CONFIG', () => {
    it('should use the centralized base URL', () => {
      expect(DEFAULT_INGESTION_CONFIG.baseUrl).toBe(DEFAULT_CHAIM_API_BASE_URL);
    });

    it('should have a reasonable timeout', () => {
      expect(DEFAULT_INGESTION_CONFIG.timeoutMs).toBe(30000);
    });

    it('should have retry attempts configured', () => {
      expect(DEFAULT_INGESTION_CONFIG.retryAttempts).toBe(3);
    });
  });

  describe('INGESTION_ENDPOINTS', () => {
    it('should re-export endpoints from centralized config', () => {
      expect(INGESTION_ENDPOINTS).toEqual(CHAIM_ENDPOINTS);
    });

    it('should have PRESIGN endpoint', () => {
      expect(INGESTION_ENDPOINTS.PRESIGN).toBe('/ingest/presign');
    });
  });

  describe('getConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return defaults when no env vars set', () => {
      delete process.env.CHAIM_API_BASE_URL;
      delete process.env.CHAIM_API_TIMEOUT;
      delete process.env.CHAIM_RETRY_ATTEMPTS;

      const config = IngestionService.getConfig();

      expect(config.baseUrl).toBe(DEFAULT_CHAIM_API_BASE_URL);
      expect(config.timeoutMs).toBe(30000);
      expect(config.retryAttempts).toBe(3);
    });

    it('should override baseUrl from env', () => {
      process.env.CHAIM_API_BASE_URL = 'https://custom.api.example.com';

      const config = IngestionService.getConfig();

      expect(config.baseUrl).toBe('https://custom.api.example.com');
    });

    it('should override timeoutMs from env', () => {
      process.env.CHAIM_API_TIMEOUT = '60000';

      const config = IngestionService.getConfig();

      expect(config.timeoutMs).toBe(60000);
    });

    it('should override retryAttempts from env', () => {
      process.env.CHAIM_RETRY_ATTEMPTS = '5';

      const config = IngestionService.getConfig();

      expect(config.retryAttempts).toBe(5);
    });
  });

  describe('buildUrl', () => {
    it('should build presign URL with default base', () => {
      const url = IngestionService.buildUrl('PRESIGN');
      expect(url).toBe('https://ingest.chaim.co/ingest/presign');
    });

    it('should use custom base URL when provided', () => {
      const url = IngestionService.buildUrl('PRESIGN', 'https://custom.api.example.com');
      expect(url).toBe('https://custom.api.example.com/ingest/presign');
    });
  });

  describe('computeSignature', () => {
    it('should compute HMAC-SHA256 signature', () => {
      const body = '{"test": "data"}';
      const secret = 'test-secret';

      const signature = IngestionService.computeSignature(body, secret);

      // Should be a hex string
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce consistent signatures for same input', () => {
      const body = '{"test": "data"}';
      const secret = 'test-secret';

      const sig1 = IngestionService.computeSignature(body, secret);
      const sig2 = IngestionService.computeSignature(body, secret);

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different body', () => {
      const secret = 'test-secret';

      const sig1 = IngestionService.computeSignature('{"a": 1}', secret);
      const sig2 = IngestionService.computeSignature('{"b": 2}', secret);

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different secret', () => {
      const body = '{"test": "data"}';

      const sig1 = IngestionService.computeSignature(body, 'secret1');
      const sig2 = IngestionService.computeSignature(body, 'secret2');

      expect(sig1).not.toBe(sig2);
    });
  });
});

