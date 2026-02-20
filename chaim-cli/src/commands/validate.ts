import chalk from 'chalk';
import { validateSchema } from '@chaim-tools/chaim-bprint-spec';
import * as fs from 'fs';
import * as path from 'path';
import { resolveFieldNames, detectCollisions, ResolvedField } from '../services/name-resolver';

export async function validateCommand(schemaFile: string): Promise<void> {
  try {
    console.log(chalk.blue('🔍 Validating schema:'), schemaFile);
    
    // Check if file exists
    if (!fs.existsSync(schemaFile)) {
      console.error(chalk.red(`Error: Schema file not found: ${schemaFile}`));
      process.exit(1);
    }
    
    // Load and validate schema
    const schemaContent = fs.readFileSync(path.resolve(schemaFile), 'utf-8');
    const schema = JSON.parse(schemaContent);
    const validatedSchema = validateSchema(schema);
    
    console.log(chalk.green('✓ Schema is valid'));
    console.log(chalk.green('  Entity:'), validatedSchema.entityName);
    console.log(chalk.green('  Identity:'), validatedSchema.identity.fields.join(', '));
    console.log(chalk.green('  Schema Version:'), validatedSchema.schemaVersion);
    console.log(chalk.green('  Fields:'), validatedSchema.fields.length);

    // Resolve field names for Java and display mapping table
    const resolvedFields = resolveFieldNames(validatedSchema.fields, 'java');
    const collisions = detectCollisions(resolvedFields);

    // Display field mapping table
    printFieldMappingTable(resolvedFields);

    // Report auto-conversions
    const autoConverted = resolvedFields.filter(f => f.conversionType === 'auto');
    if (autoConverted.length > 0) {
      console.log(chalk.yellow(`\n  ⚠ ${autoConverted.length} field(s) will be auto-converted. Add "nameOverride" to override.`));
    }

    // Report collisions
    if (collisions.length > 0) {
      console.log('');
      for (const collision of collisions) {
        console.error(chalk.red(`  ✗ Collision: ${collision.message}`));
      }
      process.exit(1);
    } else {
      console.log(chalk.green('  ✓ No collisions detected'));
    }

    console.log(chalk.green('  ✓ All resolved names are valid Java identifiers'));
    
  } catch (error) {
    console.error(chalk.red('✗ Schema validation failed:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Print a formatted table showing how each field name maps to its Java identifier.
 */
function printFieldMappingTable(resolvedFields: ResolvedField[]): void {
  if (resolvedFields.length === 0) return;

  console.log(chalk.blue('\n  Field mappings (Java):'));

  // Calculate column widths for alignment
  const maxOrigLen = Math.max(...resolvedFields.map(f => f.originalName.length));
  const maxCodeLen = Math.max(...resolvedFields.map(f => f.codeName.length));

  for (const field of resolvedFields) {
    const orig = field.originalName.padEnd(maxOrigLen);
    const code = field.codeName.padEnd(maxCodeLen);

    let label: string;
    switch (field.conversionType) {
      case 'none':
        label = chalk.gray('(no conversion)');
        break;
      case 'auto':
        label = chalk.yellow('(auto-converted)');
        break;
      case 'override':
        label = chalk.cyan('(nameOverride)');
        break;
    }

    console.log(`    ${orig} → ${code}  ${label}`);
  }
}
