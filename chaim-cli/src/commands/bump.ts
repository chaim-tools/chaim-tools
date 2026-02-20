import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Increment the schemaVersion in a .bprint file.
 *
 * Default is a minor bump (e.g., 1.3 -> 1.4).
 * With --major, performs a major bump (e.g., 1.3 -> 2.0).
 */
export async function bumpCommand(
  schemaFile: string,
  options: { major?: boolean }
): Promise<void> {
  try {
    const resolvedPath = path.resolve(schemaFile);

    if (!fs.existsSync(resolvedPath)) {
      console.error(chalk.red(`Error: File not found: ${schemaFile}`));
      process.exit(1);
    }

    if (!schemaFile.endsWith('.bprint')) {
      console.error(chalk.red('Error: File must have a .bprint extension'));
      process.exit(1);
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8');
    let schema: any;
    try {
      schema = JSON.parse(content);
    } catch {
      console.error(chalk.red('Error: File is not valid JSON'));
      process.exit(1);
    }

    const currentVersion = schema.schemaVersion;
    if (!currentVersion || typeof currentVersion !== 'string') {
      console.error(chalk.red('Error: File does not contain a valid schemaVersion field'));
      process.exit(1);
    }

    const versionPattern = /^\d+\.\d+$/;
    if (!versionPattern.test(currentVersion)) {
      console.error(
        chalk.red(`Error: Current schemaVersion "${currentVersion}" is not in "major.minor" format`)
      );
      process.exit(1);
    }

    const [major, minor] = currentVersion.split('.').map(Number);
    let newVersion: string;

    if (options.major) {
      newVersion = `${major + 1}.0`;
    } else {
      newVersion = `${major}.${minor + 1}`;
    }

    schema.schemaVersion = newVersion;
    fs.writeFileSync(resolvedPath, JSON.stringify(schema, null, 2) + '\n', 'utf-8');

    const fileName = path.basename(schemaFile);
    const bumpType = options.major ? 'major' : 'minor';
    console.log(
      chalk.green(`Bumped ${fileName}: ${currentVersion} -> ${newVersion}`) +
        chalk.gray(` (${bumpType})`)
    );
  } catch (error) {
    console.error(
      chalk.red('Error:'),
      error instanceof Error ? error.message : error
    );
    process.exit(1);
  }
}
