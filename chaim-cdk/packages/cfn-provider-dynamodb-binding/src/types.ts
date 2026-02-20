/**
 * Type configuration passed to the provider via CloudFormation TypeActivation
 */
export interface TypeConfiguration {
  ApiBaseUrl: string;
  SecretArn: string;
}

/**
 * CloudFormation resource properties
 */
export interface ResourceProperties {
  AppId: string;
  Target: {
    TableArn: string;
  };
  Schema: unknown; // object or string
}

/**
 * CloudFormation handler event
 */
export interface CloudFormationEvent {
  RequestType: 'Create' | 'Update' | 'Delete' | 'Read' | 'List';
  ResourceProperties: ResourceProperties;
  TypeConfiguration?: TypeConfiguration | string; // Can be object or JSON string
  PreviousResourceProperties?: ResourceProperties;
}

/**
 * CloudFormation handler response
 */
export interface CloudFormationResponse {
  PhysicalResourceId: string;
  Data: {
    BindingId: string;
    ContentHash: string;
    AppliedAt: string;
    Status: string;
  };
}

/**
 * Ingest API payload
 */
export interface IngestPayload {
  op: 'Create' | 'Update' | 'Delete';
  appId: string;
  accountId: string;
  bindingId: string;
  resourceType: string;
  target: {
    TableArn: string;
  };
  schema: unknown;
  contentHash: string;
  timestamp: string;
}

