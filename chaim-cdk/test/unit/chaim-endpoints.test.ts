import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHAIM_API_BASE_URL,
  CHAIM_ENDPOINTS,
  DEFAULT_REQUEST_TIMEOUT_MS,
  DEFAULT_MAX_SNAPSHOT_BYTES,
} from '../../src/config/chaim-endpoints';

describe('chaim-endpoints config', () => {
  describe('DEFAULT_CHAIM_API_BASE_URL', () => {
    it('should be a valid HTTPS URL', () => {
      expect(DEFAULT_CHAIM_API_BASE_URL).toMatch(/^https:\/\//);
    });

    it('should be the canonical Chaim API URL', () => {
      expect(DEFAULT_CHAIM_API_BASE_URL).toBe('https://ingest.chaim.co');
    });

    it('should not have a trailing slash', () => {
      expect(DEFAULT_CHAIM_API_BASE_URL).not.toMatch(/\/$/);
    });
  });

  describe('CHAIM_ENDPOINTS', () => {
    it('should define PRESIGN endpoint', () => {
      expect(CHAIM_ENDPOINTS.PRESIGN).toBe('/ingest/presign');
    });

    it('should have endpoints starting with /', () => {
      Object.values(CHAIM_ENDPOINTS).forEach((endpoint) => {
        expect(endpoint).toMatch(/^\//);
      });
    });
  });

  describe('DEFAULT_REQUEST_TIMEOUT_MS', () => {
    it('should be a positive number', () => {
      expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    });

    it('should be 30 seconds', () => {
      expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(30000);
    });
  });

  describe('DEFAULT_MAX_SNAPSHOT_BYTES', () => {
    it('should be a positive number', () => {
      expect(DEFAULT_MAX_SNAPSHOT_BYTES).toBeGreaterThan(0);
    });

    it('should be 10MB', () => {
      expect(DEFAULT_MAX_SNAPSHOT_BYTES).toBe(10 * 1024 * 1024);
    });
  });

  describe('URL construction', () => {
    it('should construct valid full URLs', () => {
      const presignUrl = DEFAULT_CHAIM_API_BASE_URL + CHAIM_ENDPOINTS.PRESIGN;

      expect(presignUrl).toBe('https://ingest.chaim.co/ingest/presign');
    });
  });
});

