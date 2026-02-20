import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { getAwsConfig } from './aws-helpers';
import { getStackOutputs } from './stack-deployment';
import { SchemaData } from '@chaim-tools/chaim-bprint-spec';
import { loadSchemaFile } from './schema-loader';

const dynamoClient = new DynamoDBClient(getAwsConfig());

/**
 * Verifies that a DynamoDB table exists in AWS.
 * 
 * @param tableName - Name of the table to verify
 * @returns Promise that resolves to true if table exists, throws error if not
 */
export async function verifyDynamoDBTableExists(tableName: string): Promise<boolean> {
  try {
    const command = new DescribeTableCommand({ TableName: tableName });
    const response = await dynamoClient.send(command);
    
    if (response.Table && response.Table.TableStatus === 'ACTIVE') {
      return true;
    }
    
    throw new Error(`Table ${tableName} exists but is not in ACTIVE state`);
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      throw new Error(`DynamoDB table ${tableName} does not exist`);
    }
    throw error;
  }
}

/**
 * Finds a CloudFormation output by prefix (CDK adds hash suffixes to output keys).
 * 
 * @param outputs - Map of all stack outputs
 * @param prefix - Prefix to search for (e.g., 'UserChaimBinderSchemaData')
 * @returns The matching output key and value, or throws if not found
 */
export function findOutputByPrefix(
  outputs: Record<string, string>,
  prefix: string
): { key: string; value: string } {
  const matchingKey = Object.keys(outputs).find((key) => key.startsWith(prefix));
  
  if (!matchingKey) {
    throw new Error(`No output found with prefix: ${prefix}`);
  }
  
  const value = outputs[matchingKey];
  if (!value || value.trim() === '') {
    throw new Error(`Output ${matchingKey} is empty`);
  }
  
  return { key: matchingKey, value };
}

/**
 * Verifies that CloudFormation outputs exist and contain expected keys.
 * CDK adds hash suffixes to output keys, so we search by prefix.
 * 
 * @param stackName - Name of the CloudFormation stack
 * @param expectedOutputPrefixes - Array of output key prefixes that must exist
 * @returns Promise that resolves to a map of prefix -> {key, value}
 */
export async function verifyCloudFormationOutputs(
  stackName: string,
  expectedOutputPrefixes: string[]
): Promise<Record<string, { key: string; value: string }>> {
  const outputs = await getStackOutputs(stackName);
  const result: Record<string, { key: string; value: string }> = {};
  
  for (const prefix of expectedOutputPrefixes) {
    result[prefix] = findOutputByPrefix(outputs, prefix);
  }
  
  return result;
}

/**
 * Parses and validates the SchemaData CloudFormation output.
 * 
 * @param schemaDataJson - JSON string from CloudFormation output
 * @returns Parsed SchemaData object
 */
export function parseSchemaDataOutput(schemaDataJson: string): SchemaData {
  try {
    const schemaData = JSON.parse(schemaDataJson);
    
    // Validate required fields
    if (!schemaData.schemaVersion) {
      throw new Error('SchemaData missing schemaVersion');
    }
    if (!schemaData.entityName) {
      throw new Error('SchemaData missing entityName');
    }
    if (!schemaData.description) {
      throw new Error('SchemaData missing description');
    }
    if (!schemaData.identity) {
      throw new Error('SchemaData missing identity');
    }
    if (!schemaData.fields || !Array.isArray(schemaData.fields)) {
      throw new Error('SchemaData missing fields array');
    }
    
    return schemaData as SchemaData;
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in SchemaData output: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parses and validates the TableMetadata CloudFormation output.
 * 
 * @param tableMetadataJson - JSON string from CloudFormation output
 * @returns Parsed table metadata object
 */
export function parseTableMetadataOutput(tableMetadataJson: string): {
  tableName: string;
  tableArn: string;
  partitionKey: string;
  sortKey?: string;
} {
  try {
    const metadata = JSON.parse(tableMetadataJson);
    
    // Validate required fields
    if (!metadata.tableName) {
      throw new Error('TableMetadata missing tableName');
    }
    if (!metadata.tableArn) {
      throw new Error('TableMetadata missing tableArn');
    }
    if (!metadata.partitionKey) {
      throw new Error('TableMetadata missing partitionKey');
    }
    
    return metadata;
  } catch (error: any) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in TableMetadata output: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Verifies that the SchemaData output matches the expected schema file.
 * 
 * @param schemaDataJson - JSON string from CloudFormation output
 * @param schemaFilename - Name of the .bprint file to compare against
 * @returns Promise that resolves if schema matches
 */
export async function verifySchemaDataMatchesFile(
  schemaDataJson: string,
  schemaFilename: string
): Promise<void> {
  const outputSchema = parseSchemaDataOutput(schemaDataJson);
  const expectedSchemaContent = loadSchemaFile(schemaFilename);
  const expectedSchema = JSON.parse(expectedSchemaContent);
  
  // Compare key fields
  if (outputSchema.schemaVersion !== expectedSchema.schemaVersion) {
    throw new Error(
      `Schema version mismatch: expected ${expectedSchema.schemaVersion}, got ${outputSchema.schemaVersion}`
    );
  }
  
  if (outputSchema.namespace !== expectedSchema.namespace) {
    throw new Error(
      `Schema namespace mismatch: expected ${expectedSchema.namespace}, got ${outputSchema.namespace}`
    );
  }
  
  // Compare identity fields arrays
  const outputFields = outputSchema.identity?.fields || [];
  const expectedFields = expectedSchema.identity?.fields || [];
  if (JSON.stringify(outputFields) !== JSON.stringify(expectedFields)) {
    throw new Error(
      `Identity fields mismatch: expected [${expectedFields.join(', ')}], got [${outputFields.join(', ')}]`
    );
  }
  
  // Verify field count matches
  if (outputSchema.fields.length !== expectedSchema.fields.length) {
    throw new Error(
      `Field count mismatch: expected ${expectedSchema.fields.length}, got ${outputSchema.fields.length}`
    );
  }
}

/**
 * Verifies that the ingestion status output is successful.
 * 
 * @param statusOutput - IngestStatus value from CloudFormation output
 * @returns True if status is SUCCESS
 */
export function verifyIngestStatus(statusOutput: string): boolean {
  if (statusOutput !== 'SUCCESS') {
    throw new Error(`Ingestion status is not SUCCESS: got ${statusOutput}`);
  }
  return true;
}

