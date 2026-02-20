import { TableBindingConfig } from './table-binding-config';

/**
 * Base properties shared by all Chaim data store binders.
 */
export interface BaseBinderProps {
  /** Path to the .bprint schema file (JSON format) */
  readonly schemaPath: string;

  /** 
   * Binding configuration (appId, credentials, failureMode).
   * 
   * For single-table design, create one config and share across all entity bindings.
   * 
   * @example
   * ```typescript
   * const config = new TableBindingConfig(
   *   'my-app',
   *   ChaimCredentials.fromSecretsManager('chaim/api-credentials')
   * );
   * 
   * new ChaimDynamoDBBinder(this, 'UserBinding', {
   *   schemaPath: './schemas/user.bprint',
   *   table: usersTable,
   *   config,
   * });
   * ```
   */
  readonly config: TableBindingConfig;
}

/**
 * Validate binder props.
 */
export function validateBinderProps(props: BaseBinderProps): void {
  if (!props.schemaPath || props.schemaPath.trim() === '') {
    throw new Error('schemaPath is required and cannot be empty');
  }

  if (!props.config) {
    throw new Error('config is required. Create a TableBindingConfig with your appId and credentials.');
  }

  // TableBindingConfig validates itself in its constructor
}
