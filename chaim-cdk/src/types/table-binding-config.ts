import { IChaimCredentials } from './credentials';
import { FailureMode } from './failure-mode';

/**
 * Configuration for Chaim entity bindings.
 * 
 * For single-table design with multiple entities, create one TableBindingConfig
 * and share it across all bindings to ensure consistency.
 * 
 * @example
 * ```typescript
 * // Create config once
 * const config = new TableBindingConfig(
 *   'my-app',
 *   ChaimCredentials.fromSecretsManager('chaim/api-credentials')
 * );
 * 
 * // Share across multiple entities
 * new ChaimDynamoDBBinder(this, 'UserBinding', {
 *   schemaPath: './schemas/user.bprint',
 *   table: singleTable,
 *   config,
 * });
 * 
 * new ChaimDynamoDBBinder(this, 'OrderBinding', {
 *   schemaPath: './schemas/order.bprint',
 *   table: singleTable,
 *   config, // Same config ensures consistency
 * });
 * ```
 */
export class TableBindingConfig {
  /**
   * Create a binding configuration.
   * 
   * @param appId - Application ID for the Chaim platform
   * @param credentials - API credentials for Chaim ingestion
   * @param failureMode - How to handle ingestion failures (default: STRICT)
   */
  constructor(
    public readonly appId: string,
    public readonly credentials: IChaimCredentials,
    public readonly failureMode: FailureMode = FailureMode.STRICT
  ) {
    if (!appId || appId.trim() === '') {
      throw new Error('TableBindingConfig: appId cannot be empty');
    }
    if (!credentials) {
      throw new Error('TableBindingConfig: credentials are required');
    }
  }
}
