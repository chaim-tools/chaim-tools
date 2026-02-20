import { execSync } from 'child_process';
import { CloudFormationClient, DescribeStacksCommand, DeleteStackCommand } from '@aws-sdk/client-cloudformation';
import { getAwsConfig, getAwsRegion } from './aws-helpers';
import * as path from 'path';
import * as fs from 'fs';

const cfnClient = new CloudFormationClient(getAwsConfig());

/**
 * CloudFormation stack status types
 */
export type StackStatus =
  | 'CREATE_COMPLETE'
  | 'CREATE_FAILED'
  | 'UPDATE_COMPLETE'
  | 'UPDATE_FAILED'
  | 'DELETE_COMPLETE'
  | 'DELETE_FAILED'
  | 'ROLLBACK_COMPLETE'
  | 'ROLLBACK_FAILED';

/**
 * Waits for a CloudFormation stack to reach a stable state.
 * 
 * @param stackName - Name of the stack
 * @param targetStatus - Target status to wait for
 * @param timeoutMs - Maximum time to wait in milliseconds (default: 10 minutes)
 * @returns Final stack status
 */
export async function waitForStackDeployment(
  stackName: string,
  targetStatus: StackStatus | StackStatus[],
  timeoutMs: number = 10 * 60 * 1000
): Promise<StackStatus> {
  const targetStatuses = Array.isArray(targetStatus) ? targetStatus : [targetStatus];
  const startTime = Date.now();
  const pollInterval = 5000; // 5 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      const command = new DescribeStacksCommand({ StackName: stackName });
      const response = await cfnClient.send(command);
      
      if (response.Stacks && response.Stacks.length > 0) {
        const status = response.Stacks[0].StackStatus as StackStatus;
        
        if (targetStatuses.includes(status)) {
          return status;
        }
        
        // Check for failure statuses
        if (status.includes('FAILED') || status.includes('ROLLBACK')) {
          throw new Error(`Stack ${stackName} failed with status: ${status}`);
        }
      }
    } catch (error: any) {
      // If stack doesn't exist and we're waiting for DELETE_COMPLETE, that's success
      if (error.name === 'ValidationError' && targetStatuses.includes('DELETE_COMPLETE')) {
        return 'DELETE_COMPLETE';
      }
      throw error;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Timeout waiting for stack ${stackName} to reach ${targetStatuses.join(' or ')}`);
}

/**
 * Deploys a CDK stack to AWS.
 * 
 * @param stackName - Name of the stack to deploy
 * @param stackFilePath - Path to the TypeScript file that defines the stack
 * @param stackClass - Name of the stack class to instantiate
 * @returns Promise that resolves when deployment is complete
 */
export async function deployStack(
  stackName: string,
  stackFilePath: string,
  stackClass: string
): Promise<void> {
  const projectRoot = path.resolve(__dirname, '../..');
  const region = getAwsRegion();

  // Create a temporary CDK app file for deployment
  const tempAppFile = path.join(projectRoot, 'test', 'integration', 'temp-deploy-app.ts');
  
  try {
    // Write temporary app file
    const appContent = `
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { ${stackClass} } from '${path.relative(path.dirname(tempAppFile), stackFilePath).replace(/\\.[^/.]+$/, '')}';

const app = new cdk.App();
new ${stackClass}(app, '${stackName}', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: '${region}',
  },
});
`;
    fs.writeFileSync(tempAppFile, appContent);

    // Deploy using CDK CLI
    console.log(`Deploying stack ${stackName}...`);
    execSync(
      `cd ${projectRoot} && npx cdk deploy ${stackName} --require-approval never --outputs-file cdk-outputs.json`,
      {
        stdio: 'inherit',
        cwd: projectRoot,
      }
    );

    // Wait for stack to be fully deployed
    await waitForStackDeployment(stackName, ['CREATE_COMPLETE', 'UPDATE_COMPLETE']);
    console.log(`Stack ${stackName} deployed successfully`);
  } finally {
    // Clean up temporary file
    if (fs.existsSync(tempAppFile)) {
      fs.unlinkSync(tempAppFile);
    }
  }
}

/**
 * Deletes a CloudFormation stack and waits for deletion to complete.
 * 
 * @param stackName - Name of the stack to delete
 * @returns Promise that resolves when deletion is complete
 */
export async function deleteStack(stackName: string): Promise<void> {
  try {
    console.log(`Deleting stack ${stackName}...`);
    const command = new DeleteStackCommand({ StackName: stackName });
    await cfnClient.send(command);

    // Wait for deletion to complete
    await waitForStackDeployment(stackName, 'DELETE_COMPLETE');
    console.log(`Stack ${stackName} deleted successfully`);
  } catch (error: any) {
    // If stack doesn't exist, that's fine
    if (error.name === 'ValidationError' && error.message?.includes('does not exist')) {
      console.log(`Stack ${stackName} does not exist (already deleted)`);
      return;
    }
    throw error;
  }
}

/**
 * Retrieves CloudFormation stack outputs.
 * 
 * @param stackName - Name of the stack
 * @returns Map of output key to output value
 */
export async function getStackOutputs(stackName: string): Promise<Record<string, string>> {
  const command = new DescribeStacksCommand({ StackName: stackName });
  const response = await cfnClient.send(command);

  if (!response.Stacks || response.Stacks.length === 0) {
    throw new Error(`Stack ${stackName} not found`);
  }

  const stack = response.Stacks[0];
  const outputs: Record<string, string> = {};

  if (stack.Outputs) {
    for (const output of stack.Outputs) {
      if (output.OutputKey && output.OutputValue) {
        outputs[output.OutputKey] = output.OutputValue;
      }
    }
  }

  return outputs;
}

