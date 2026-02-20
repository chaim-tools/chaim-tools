import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import chalk from 'chalk';

// Threshold for using file-based schema passing (100KB)
const FILE_THRESHOLD_BYTES = 100000;

export class JavaGenerator {
  private javaGeneratorPath: string;

  constructor() {
    // Path to the Java generator JAR
    // When published: dist/jars/codegen-java-0.1.0.jar (bundled during build)
    // During development: codegen-java/build/libs/codegen-java-0.1.0.jar
    const bundledJar = path.join(__dirname, 'jars', 'codegen-java-0.1.0.jar');
    const devJar = path.join(__dirname, '../codegen-java/build/libs/codegen-java-0.1.0.jar');
    
    this.javaGeneratorPath = fs.existsSync(bundledJar) ? bundledJar : devJar;
  }

  /**
   * Generate code for multiple schemas sharing the same table.
   * This is the primary API for single-table design support.
   * 
   * @param schemas - Array of .bprint schemas for entities in this table
   * @param packageName - Java package name for generated code
   * @param outputDir - Output directory for generated files
   * @param tableMetadata - Table metadata (name, ARN, region, keys)
   */
  async generateForTable(
    schemas: any[], 
    packageName: string, 
    outputDir: string, 
    tableMetadata?: any
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const schemasJson = JSON.stringify(schemas);
      let tempFile: string | null = null;
      
      // Prepare arguments for Java generator
      const args = [
        '-jar',
        this.javaGeneratorPath,
      ];

      // Use file-based passing for large payloads
      if (schemasJson.length > FILE_THRESHOLD_BYTES) {
        tempFile = path.join(os.tmpdir(), `chaim-schemas-${Date.now()}.json`);
        fs.writeFileSync(tempFile, schemasJson);
        args.push('--schemas-file', tempFile);
      } else {
        args.push('--schemas', schemasJson);
      }

      args.push('--package', packageName);
      args.push('--output', outputDir);

      if (tableMetadata) {
        args.push('--table-metadata', JSON.stringify(tableMetadata));
      }

      // Spawn Java process
      const javaProcess = spawn('java', args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      javaProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      javaProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      javaProcess.on('close', (code) => {
        // Clean up temp file if used
        if (tempFile && fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {
            // Ignore cleanup errors
          }
        }

        if (code === 0) {
          if (stdout) {
            console.log(chalk.gray(stdout));
          }
          resolve();
        } else {
          console.error(chalk.red('Java generator failed:'));
          if (stderr) {
            console.error(chalk.red(stderr));
          }
          if (stdout) {
            console.error(chalk.red(stdout));
          }
          reject(new Error(`Java generator exited with code ${code}`));
        }
      });

      javaProcess.on('error', (error) => {
        // Clean up temp file on error
        if (tempFile && fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch {
            // Ignore cleanup errors
          }
        }
        console.error(chalk.red('Failed to start Java generator:'), error.message);
        reject(error);
      });
    });
  }
}
