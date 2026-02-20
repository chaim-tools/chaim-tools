/**
 * Interface for Chaim API credentials.
 * Use ChaimCredentials factory methods to create instances.
 */
export interface IChaimCredentials {
  /** The type of credential configuration */
  readonly credentialType: 'secretsManager' | 'direct';

  /** Secret name in AWS Secrets Manager (only for secretsManager type) */
  readonly secretName?: string;

  /** API key for direct authentication (only for direct type) */
  readonly apiKey?: string;

  /** API secret for direct authentication (only for direct type) */
  readonly apiSecret?: string;
}

/**
 * Internal implementation for Secrets Manager credentials.
 */
class SecretsManagerCredentials implements IChaimCredentials {
  public readonly credentialType = 'secretsManager' as const;
  public readonly secretName: string;

  constructor(secretName: string) {
    if (!secretName || secretName.trim() === '') {
      throw new Error('secretName is required and cannot be empty');
    }
    this.secretName = secretName;
  }
}

/**
 * Internal implementation for direct API credentials.
 */
class DirectCredentials implements IChaimCredentials {
  public readonly credentialType = 'direct' as const;
  public readonly apiKey: string;
  public readonly apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    if (!apiKey || apiKey.trim() === '') {
      throw new Error('apiKey is required and cannot be empty');
    }
    if (!apiSecret || apiSecret.trim() === '') {
      throw new Error('apiSecret is required and cannot be empty');
    }
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }
}

/**
 * Factory class for creating Chaim API credentials.
 *
 * @example
 * ```typescript
 * // Using AWS Secrets Manager (recommended for production)
 * const credentials = ChaimCredentials.fromSecretsManager('chaim/api-credentials');
 *
 * // Using direct API keys (for development/testing)
 * const credentials = ChaimCredentials.fromApiKeys(
 *   process.env.CHAIM_API_KEY!,
 *   process.env.CHAIM_API_SECRET!
 * );
 * ```
 */
export class ChaimCredentials {
  /**
   * Create credentials from AWS Secrets Manager.
   *
   * The secret must contain JSON with `apiKey` and `apiSecret` fields:
   * ```json
   * {
   *   "apiKey": "your-chaim-api-key",
   *   "apiSecret": "your-chaim-api-secret"
   * }
   * ```
   *
   * @param secretName - The name or ARN of the secret in AWS Secrets Manager
   * @returns Credentials configured to use Secrets Manager
   */
  public static fromSecretsManager(secretName: string): IChaimCredentials {
    return new SecretsManagerCredentials(secretName);
  }

  /**
   * Create credentials from direct API key and secret.
   *
   * Note: For production deployments, prefer `fromSecretsManager()` to avoid
   * exposing credentials in CDK code or environment variables.
   *
   * @param apiKey - The Chaim API key
   * @param apiSecret - The Chaim API secret
   * @returns Credentials configured with direct API keys
   */
  public static fromApiKeys(apiKey: string, apiSecret: string): IChaimCredentials {
    return new DirectCredentials(apiKey, apiSecret);
  }
}

