import { describe, it, expect } from 'vitest';
import { ChaimCredentials, IChaimCredentials } from '../../src/types/credentials';

describe('ChaimCredentials', () => {
  describe('fromSecretsManager', () => {
    it('should create valid Secrets Manager credentials', () => {
      const credentials = ChaimCredentials.fromSecretsManager('chaim/api-credentials');

      expect(credentials.credentialType).toBe('secretsManager');
      expect(credentials.secretName).toBe('chaim/api-credentials');
      expect(credentials.apiKey).toBeUndefined();
      expect(credentials.apiSecret).toBeUndefined();
    });

    it('should throw error for empty secret name', () => {
      expect(() => ChaimCredentials.fromSecretsManager('')).toThrow('secretName is required');
    });

    it('should throw error for whitespace-only secret name', () => {
      expect(() => ChaimCredentials.fromSecretsManager('   ')).toThrow('secretName is required');
    });
  });

  describe('fromApiKeys', () => {
    it('should create valid direct credentials', () => {
      const credentials = ChaimCredentials.fromApiKeys('my-api-key', 'my-api-secret');

      expect(credentials.credentialType).toBe('direct');
      expect(credentials.apiKey).toBe('my-api-key');
      expect(credentials.apiSecret).toBe('my-api-secret');
      expect(credentials.secretName).toBeUndefined();
    });

    it('should throw error for empty API key', () => {
      expect(() => ChaimCredentials.fromApiKeys('', 'secret')).toThrow('apiKey is required');
    });

    it('should throw error for whitespace-only API key', () => {
      expect(() => ChaimCredentials.fromApiKeys('   ', 'secret')).toThrow('apiKey is required');
    });

    it('should throw error for empty API secret', () => {
      expect(() => ChaimCredentials.fromApiKeys('key', '')).toThrow('apiSecret is required');
    });

    it('should throw error for whitespace-only API secret', () => {
      expect(() => ChaimCredentials.fromApiKeys('key', '   ')).toThrow('apiSecret is required');
    });
  });

  describe('type safety', () => {
    it('should return IChaimCredentials interface', () => {
      const secretsManagerCreds: IChaimCredentials = ChaimCredentials.fromSecretsManager('my-secret');
      const directCreds: IChaimCredentials = ChaimCredentials.fromApiKeys('key', 'secret');

      expect(secretsManagerCreds.credentialType).toBe('secretsManager');
      expect(directCreds.credentialType).toBe('direct');
    });
  });
});

