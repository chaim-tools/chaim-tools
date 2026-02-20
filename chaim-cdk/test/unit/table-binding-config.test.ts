import { describe, it, expect } from 'vitest';
import { TableBindingConfig } from '../../src/types/table-binding-config';
import { ChaimCredentials } from '../../src/types/credentials';
import { FailureMode } from '../../src/types/failure-mode';

describe('TableBindingConfig', () => {
  describe('constructor validation', () => {
    it('should create valid config', () => {
      const config = new TableBindingConfig(
        'my-app',
        ChaimCredentials.fromApiKeys('key', 'secret')
      );

      expect(config.appId).toBe('my-app');
      expect(config.credentials).toBeDefined();
      expect(config.failureMode).toBe(FailureMode.STRICT);
    });

    it('should allow custom failureMode', () => {
      const config = new TableBindingConfig(
        'my-app',
        ChaimCredentials.fromApiKeys('key', 'secret'),
        FailureMode.BEST_EFFORT
      );

      expect(config.failureMode).toBe(FailureMode.BEST_EFFORT);
    });

    it('should reject empty appId', () => {
      expect(() => {
        new TableBindingConfig(
          '',
          ChaimCredentials.fromApiKeys('key', 'secret')
        );
      }).toThrow(/appId cannot be empty/);
    });

    it('should reject whitespace-only appId', () => {
      expect(() => {
        new TableBindingConfig(
          '   ',
          ChaimCredentials.fromApiKeys('key', 'secret')
        );
      }).toThrow(/appId cannot be empty/);
    });

    it('should reject missing credentials', () => {
      expect(() => {
        new TableBindingConfig('my-app', null as any);
      }).toThrow(/credentials are required/);
    });

    it('should accept Secrets Manager credentials', () => {
      const config = new TableBindingConfig(
        'my-app',
        ChaimCredentials.fromSecretsManager('my-secret')
      );

      expect(config.credentials.credentialType).toBe('secretsManager');
    });

    it('should accept direct API key credentials', () => {
      const config = new TableBindingConfig(
        'my-app',
        ChaimCredentials.fromApiKeys('key', 'secret')
      );

      expect(config.credentials.credentialType).toBe('direct');
    });
  });

  describe('property access', () => {
    it('should expose appId as readonly', () => {
      const config = new TableBindingConfig(
        'my-app',
        ChaimCredentials.fromApiKeys('key', 'secret')
      );

      expect(config.appId).toBe('my-app');
    });

    it('should expose credentials as readonly', () => {
      const creds = ChaimCredentials.fromApiKeys('key', 'secret');
      const config = new TableBindingConfig('my-app', creds);

      expect(config.credentials).toBe(creds);
    });

    it('should expose failureMode as readonly', () => {
      const config = new TableBindingConfig(
        'my-app',
        ChaimCredentials.fromApiKeys('key', 'secret'),
        FailureMode.STRICT
      );

      expect(config.failureMode).toBe(FailureMode.STRICT);
    });
  });
});
