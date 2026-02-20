import * as fs from 'fs';
import * as path from 'path';

/**
 * Find the CDK project root by walking upward to find cdk.json.
 * 
 * This is necessary because process.cwd() is not reliable in monorepos,
 * pipelines, or when synth is invoked from a different working directory.
 * 
 * @param startDir - Directory to start searching from (defaults to this module's directory)
 * @returns Path to the CDK project root
 */
export function findCdkProjectRoot(startDir: string = __dirname): string {
  let currentDir = startDir;
  
  while (currentDir !== path.parse(currentDir).root) {
    if (fs.existsSync(path.join(currentDir, 'cdk.json'))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  
  // Fallback: use process.cwd() if no cdk.json found
  console.warn(
    '[chaim-cdk] Could not find cdk.json walking up from',
    startDir,
    '- using process.cwd() as CDK project root'
  );
  return process.cwd();
}

/**
 * Get the asset directory for a Chaim Lambda asset.
 * 
 * Asset directory is isolated per {stackName}/{resourceId} to ensure
 * CDK does not accidentally stage stale content across resources.
 * 
 * @param stackName - CDK stack name
 * @param resourceId - Resource ID (resourceName__entityName[__N])
 * @returns Absolute path to the asset directory
 */
export function getChaimAssetDir(stackName: string, resourceId: string): string {
  const cdkRoot = findCdkProjectRoot();
  return path.join(cdkRoot, 'cdk.out', 'chaim', 'assets', stackName, resourceId);
}

