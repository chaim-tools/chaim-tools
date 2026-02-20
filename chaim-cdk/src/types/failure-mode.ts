/**
 * Behavior when schema ingestion fails during deployment.
 */
export enum FailureMode {
  /**
   * Log errors but return SUCCESS to CloudFormation.
   * Deployment continues even if ingestion fails.
   * Must be explicitly opted into.
   */
  BEST_EFFORT = 'BEST_EFFORT',

  /**
   * Return FAILED to CloudFormation on any ingestion error.
   * Deployment will roll back if ingestion fails.
   * This is the default.
   */
  STRICT = 'STRICT',
}

