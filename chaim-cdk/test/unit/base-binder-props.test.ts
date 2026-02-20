import { describe, it, expect } from 'vitest';
import { validateBinderProps, BaseBinderProps } from '../../src/types/base-binder-props';
import { ChaimCredentials } from '../../src/types/credentials';
import { TableBindingConfig } from '../../src/types/table-binding-config';

describe('validateBinderProps', () => {
  describe('with valid config', () => {
    it('should accept valid props', () => {
      const config = new TableBindingConfig(
        'test-app',
        ChaimCredentials.fromApiKeys('key', 'secret')
      );

      const props: BaseBinderProps = {
        schemaPath: './schemas/test.bprint',
        config,
      };

      expect(() => validateBinderProps(props)).not.toThrow();
    });

    it('should accept config with Secrets Manager credentials', () => {
      const config = new TableBindingConfig(
        'test-app',
        ChaimCredentials.fromSecretsManager('chaim/credentials')
      );

      const props: BaseBinderProps = {
        schemaPath: './schemas/test.bprint',
        config,
      };

      expect(() => validateBinderProps(props)).not.toThrow();
    });
  });

  describe('missing schemaPath', () => {
    it('should reject empty schemaPath', () => {
      const config = new TableBindingConfig(
        'test-app',
        ChaimCredentials.fromApiKeys('key', 'secret')
      );

      const props: BaseBinderProps = {
        schemaPath: '',
        config,
      };

      expect(() => validateBinderProps(props)).toThrow(/schemaPath.*cannot be empty/);
    });

    it('should reject whitespace-only schemaPath', () => {
      const config = new TableBindingConfig(
        'test-app',
        ChaimCredentials.fromApiKeys('key', 'secret')
      );

      const props: BaseBinderProps = {
        schemaPath: '   ',
        config,
      };

      expect(() => validateBinderProps(props)).toThrow(/schemaPath.*cannot be empty/);
    });
  });

  describe('missing config', () => {
    it('should reject props without config', () => {
      const props = {
        schemaPath: './schemas/test.bprint',
      } as BaseBinderProps;

      expect(() => validateBinderProps(props)).toThrow(/config is required/);
    });
  });
});
