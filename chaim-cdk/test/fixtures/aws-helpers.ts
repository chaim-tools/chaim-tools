/**
 * AWS helper utilities for integration tests
 * Validates credentials and provides AWS configuration
 */

/**
 * Validates that AWS credentials are configured.
 * Checks for either:
 * - AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY, or
 * - AWS_PROFILE
 * 
 * @throws Error if credentials are not configured
 */
export function validateAwsCredentials(): void {
  const hasAccessKey = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY;
  const hasProfile = process.env.AWS_PROFILE;
  
  if (!hasAccessKey && !hasProfile) {
    throw new Error(
      'AWS credentials not configured. Please set either:\n' +
      '  - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or\n' +
      '  - AWS_PROFILE\n' +
      'Example: export AWS_PROFILE=my-profile'
    );
  }
}

/**
 * Gets the AWS region from environment variables.
 * Defaults to us-east-1 if not specified.
 * 
 * @returns AWS region string
 */
export function getAwsRegion(): string {
  return process.env.AWS_REGION || 'us-east-1';
}

/**
 * Generates a unique stack name for integration tests.
 * Format: chaim-cdk-test-{timestamp}-{random}
 * 
 * @param prefix - Optional prefix for the stack name (default: 'chaim-cdk-test')
 * @returns Unique stack name
 */
export function generateStackName(prefix: string = 'chaim-cdk-test'): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Gets AWS configuration object for SDK clients.
 * 
 * @returns AWS configuration with region
 */
export function getAwsConfig() {
  return {
    region: getAwsRegion(),
  };
}

