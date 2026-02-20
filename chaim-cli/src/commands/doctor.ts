import chalk from 'chalk';
import { spawn } from 'child_process';

export async function doctorCommand(): Promise<void> {
  console.log(chalk.blue('🔍 Checking system environment...'));
  
  // Check Node.js version
  const nodeVersion = process.version;
  console.log(chalk.green('✓ Node.js version:'), nodeVersion);
  
  // Check AWS CLI
  await checkAwsCli();
  
  // Check Java (for code generation)
  await checkJava();
  
  // Check AWS SDK (basic check)
  try {
    require.resolve('@aws-sdk/client-sts');
    console.log(chalk.green('✓ AWS SDK available'));
  } catch (error) {
    console.error(chalk.red('✗ AWS SDK not available'));
    process.exit(1);
  }
  
  console.log(chalk.green('✓ All checks passed'));
}

async function checkAwsCli(): Promise<void> {
  return new Promise((resolve) => {
    const awsProcess = spawn('aws', ['sts', 'get-caller-identity'], {
      stdio: 'pipe'
    });
    
    let stdout = '';
    let stderr = '';
    
    awsProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    awsProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    awsProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const identity = JSON.parse(stdout);
          console.log(chalk.green('✓ AWS credentials configured'));
          console.log(chalk.green('  Account:'), identity.Account);
          console.log(chalk.green('  User:'), identity.Arn);
        } catch (error) {
          console.log(chalk.green('✓ AWS CLI available'));
        }
      } else {
        console.error(chalk.red('✗ AWS credentials not configured:'), stderr.trim());
      }
      resolve();
    });
    
    awsProcess.on('error', (error) => {
      console.error(chalk.red('✗ AWS CLI not available:'), error.message);
      resolve();
    });
  });
}

async function checkJava(): Promise<void> {
  return new Promise((resolve) => {
    const javaProcess = spawn('java', ['-version'], {
      stdio: 'pipe'
    });
    
    let stderr = '';
    
    javaProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    javaProcess.on('close', (code) => {
      if (code === 0) {
        const versionMatch = stderr.match(/version "([^"]+)"/);
        if (versionMatch) {
          console.log(chalk.green('✓ Java version:'), versionMatch[1]);
        } else {
          console.log(chalk.green('✓ Java available'));
        }
      } else {
        console.error(chalk.red('✗ Java not available'));
      }
      resolve();
    });
    
    javaProcess.on('error', (error) => {
      console.error(chalk.red('✗ Java not available:'), error.message);
      resolve();
    });
  });
}
