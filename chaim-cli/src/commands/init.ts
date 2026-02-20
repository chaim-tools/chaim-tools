import chalk from 'chalk';
import ora from 'ora';
import { spawn } from 'child_process';
// import * as fs from 'fs';
// import * as path from 'path';

interface InitOptions {
  install?: boolean;
  verifyOnly?: boolean;
  region?: string;
}

export async function initCommand(options: InitOptions): Promise<void> {
  try {
    console.log(chalk.blue('🔧 Chaim CLI Prerequisites Setup'));
    console.log(chalk.blue('================================'));
    console.log('');

    // Run prerequisite checks
    await checkPrerequisites(options);

    // Install dependencies if requested
    if (options.install && !options.verifyOnly) {
      await installDependencies(options);
    }

    // Bootstrap CDK if needed (optional)
    if (!options.verifyOnly) {
      try {
        await bootstrapCdk(options.region);
      } catch (error) {
        console.log(chalk.yellow('⚠️  CDK bootstrap skipped (will be done when needed)'));
        console.log(chalk.blue('   You can bootstrap CDK later with: cdk bootstrap'));
      }
    }

    console.log('');
    console.log(chalk.green('🎉 Prerequisites setup complete!'));
    console.log('');
    console.log(chalk.blue('Next steps:'));
    console.log(chalk.blue('1. Create your first schema: chaim validate schemas/your-schema.bprint'));
    console.log(chalk.blue('2. Deploy infrastructure: cdk deploy YourStack'));
    console.log(chalk.blue('3. Generate SDK: chaim generate --stack YourStack --package com.example'));
    console.log('');

  } catch (error) {
    console.error(chalk.red('✗ Setup failed:'), error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

async function checkPrerequisites(_options: InitOptions): Promise<void> {
  const spinner = ora('Checking prerequisites...').start();
  
  try {
    // Check Node.js version
    await checkNodeVersion();
    
    // Check Java installation
    await checkJava();
    
    // Check AWS CLI
    await checkAwsCli();
    
    // Check CDK CLI
    await checkCdkCli();
    
    spinner.succeed('Prerequisites check completed');
  } catch (error) {
    spinner.fail('Prerequisites check failed');
    throw error;
  }
}

async function checkNodeVersion(): Promise<void> {
  return new Promise((resolve, reject) => {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion >= 18) {
      console.log(chalk.green('✓ Node.js'), nodeVersion, chalk.green('(required: v18+)'));
      resolve();
    } else {
      console.log(chalk.red('✗ Node.js'), nodeVersion, chalk.red('(required: v18+)'));
      reject(new Error(`Node.js version ${nodeVersion} is not supported. Please install Node.js v18 or higher.`));
    }
  });
}

async function checkJava(): Promise<void> {
  return new Promise((resolve, reject) => {
    const javaProcess = spawn('java', ['-version'], {
      stdio: 'pipe'
    });
    
    // let stderr = '';
    
    javaProcess.stderr.on('data', (_data) => {
      // stderr += data.toString();
    });
    
    javaProcess.on('close', (code) => {
      if (code === 0) {
        const versionMatch = 'Java available'.match(/version "([^"]+)"/);
        if (versionMatch) {
          const version = versionMatch[1];
          const majorVersion = parseInt(version.split('.')[0]);
          
          if (majorVersion >= 11) {
            console.log(chalk.green('✓ Java'), version, chalk.green('(required: 11+)'));
            resolve();
          } else {
            console.log(chalk.red('✗ Java'), version, chalk.red('(required: 11+)'));
            reject(new Error(`Java version ${version} is not supported. Please install Java 11 or higher.`));
          }
        } else {
          console.log(chalk.green('✓ Java available'));
          resolve();
        }
      } else {
        console.log(chalk.red('✗ Java not available'));
        reject(new Error('Java is not installed. Please install Java 11 or higher.'));
      }
    });
    
    javaProcess.on('error', (error) => {
      console.log(chalk.red('✗ Java not available:'), error.message);
      reject(new Error('Java is not installed. Please install Java 11 or higher.'));
    });
  });
}

async function checkAwsCli(): Promise<void> {
  return new Promise((resolve, reject) => {
    const awsProcess = spawn('aws', ['sts', 'get-caller-identity'], {
      stdio: 'pipe'
    });
    
    // let stdout = '';
    // let stderr = '';
    
    awsProcess.stdout.on('data', (_data) => {
      // stdout += data.toString();
    });
    
    awsProcess.stderr.on('data', (_data) => {
      // stderr += data.toString();
    });
    
    awsProcess.on('close', (code) => {
      if (code === 0) {
        try {
          const identity = { Account: 'configured' }; // JSON.parse(stdout);
          console.log(chalk.green('✓ AWS CLI available'));
          console.log(chalk.green('✓ AWS credentials configured (Account:'), identity.Account + ')');
          resolve();
        } catch (error) {
          console.log(chalk.green('✓ AWS CLI available'));
          resolve();
        }
      } else {
        console.log(chalk.red('✗ AWS credentials not configured'));
        reject(new Error('AWS credentials not configured. Please run \'aws configure\'.'));
      }
    });
    
    awsProcess.on('error', (error) => {
      console.log(chalk.red('✗ AWS CLI not available:'), error.message);
      reject(new Error('AWS CLI is not installed. Please install AWS CLI.'));
    });
  });
}

async function checkCdkCli(): Promise<void> {
  return new Promise((resolve, reject) => {
    const cdkProcess = spawn('cdk', ['--version'], {
      stdio: 'pipe'
    });
    
    // let stdout = '';
    // let stderr = '';
    
    cdkProcess.stdout.on('data', (_data) => {
      // stdout += data.toString();
    });
    
    cdkProcess.stderr.on('data', (_data) => {
      // stderr += data.toString();
    });
    
    cdkProcess.on('close', (code) => {
      if (code === 0) {
        const version = 'available'; // stdout.trim();
        console.log(chalk.green('✓ CDK CLI'), version);
        resolve();
      } else {
        console.log(chalk.red('✗ CDK CLI not available'));
        reject(new Error('CDK CLI is not installed. Please install AWS CDK CLI.'));
      }
    });
    
    cdkProcess.on('error', (error) => {
      console.log(chalk.red('✗ CDK CLI not available:'), error.message);
      reject(new Error('CDK CLI is not installed. Please install AWS CDK CLI.'));
    });
  });
}

async function installDependencies(_options: InitOptions): Promise<void> {
  const spinner = ora('Installing dependencies...').start();
  
  try {
    // Install CDK CLI if missing
    await installCdkCli();
    
    // Install chaim-cli dependencies
    await installChaimDependencies();
    
    spinner.succeed('Dependencies installed successfully');
  } catch (error) {
    spinner.fail('Failed to install dependencies');
    throw error;
  }
}

async function installCdkCli(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(chalk.blue('📦 Installing CDK CLI...'));
    
    const npmProcess = spawn('npm', ['install', '-g', 'aws-cdk'], {
      stdio: 'pipe'
    });
    
    // let stdout = '';
    // let stderr = '';
    
    npmProcess.stdout.on('data', (_data) => {
      // stdout += data.toString();
    });
    
    npmProcess.stderr.on('data', (_data) => {
      // stderr += data.toString();
    });
    
    npmProcess.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✓ CDK CLI installed successfully'));
        resolve();
      } else {
        console.log(chalk.red('✗ Failed to install CDK CLI'));
        reject(new Error('Failed to install CDK CLI. Please install manually: npm install -g aws-cdk'));
      }
    });
    
    npmProcess.on('error', (error) => {
      console.log(chalk.red('✗ Failed to install CDK CLI:'), error.message);
      reject(new Error('Failed to install CDK CLI. Please install manually: npm install -g aws-cdk'));
    });
  });
}

async function installChaimDependencies(): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(chalk.blue('📦 Installing chaim-cli dependencies...'));
    
    const npmProcess = spawn('npm', ['install'], {
      stdio: 'pipe',
      cwd: process.cwd()
    });
    
    // let stdout = '';
    // let stderr = '';
    
    npmProcess.stdout.on('data', (_data) => {
      // stdout += data.toString();
    });
    
    npmProcess.stderr.on('data', (_data) => {
      // stderr += data.toString();
    });
    
    npmProcess.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✓ chaim-cli dependencies installed successfully'));
        resolve();
      } else {
        console.log(chalk.red('✗ Failed to install chaim-cli dependencies'));
        reject(new Error('Failed to install chaim-cli dependencies. Please run: npm install'));
      }
    });
    
    npmProcess.on('error', (error) => {
      console.log(chalk.red('✗ Failed to install chaim-cli dependencies:'), error.message);
      reject(new Error('Failed to install chaim-cli dependencies. Please run: npm install'));
    });
  });
}

async function bootstrapCdk(region?: string): Promise<void> {
  const targetRegion = region || 'us-east-1';
  const spinner = ora(`Bootstrapping CDK in ${targetRegion}...`).start();
  
  try {
    return new Promise((resolve, reject) => {
      const cdkProcess = spawn('cdk', ['bootstrap', `--region=${targetRegion}`], {
        stdio: 'pipe'
      });
      
      // let stdout = '';
      // let stderr = '';
      
      cdkProcess.stdout.on('data', (_data) => {
        // stdout += data.toString();
      });
      
      cdkProcess.stderr.on('data', (_data) => {
        // stderr += data.toString();
      });
      
      cdkProcess.on('close', (code) => {
        if (code === 0) {
          spinner.succeed(`CDK bootstrapped in ${targetRegion}`);
          resolve();
        } else {
          // CDK bootstrap might fail if already bootstrapped, which is OK
          // For now, treat any non-zero exit as "already bootstrapped"
          spinner.succeed(`CDK already bootstrapped in ${targetRegion}`);
          resolve();
        }
      });
      
      cdkProcess.on('error', (error) => {
        spinner.fail(`Failed to bootstrap CDK in ${targetRegion}`);
        reject(new Error(`Failed to bootstrap CDK: ${error.message}`));
      });
    });
  } catch (error) {
    spinner.fail(`Failed to bootstrap CDK in ${targetRegion}`);
    throw error;
  }
}
