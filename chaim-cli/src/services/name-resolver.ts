/**
 * Name resolution for code generation.
 *
 * Resolves effective Java identifiers from DynamoDB attribute names,
 * applying auto-conversion when needed and detecting collisions.
 */

import { SupportedLanguage } from '../config/types';

/**
 * Regex for a valid identifier in all supported target languages.
 */
export const VALID_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Resolved field with its original DynamoDB name, code name, and how it was resolved.
 */
export interface ResolvedField {
  originalName: string;
  codeName: string;
  conversionType: 'none' | 'auto' | 'override';
}

/**
 * Collision error when two fields resolve to the same code name.
 */
export interface CollisionError {
  codeName: string;
  conflictingFields: string[];
  message: string;
}

/**
 * Field-like input with name and optional nameOverride.
 */
interface FieldInput {
  name: string;
  nameOverride?: string;
}

/**
 * Convert a DynamoDB attribute name to a valid Java camelCase identifier.
 *
 * Rules:
 * - Split on hyphens and underscores
 * - First segment is lowercased, subsequent segments have first letter capitalized
 * - Leading digits get underscore prefix
 * - All-caps strings are lowercased (e.g., TTL -> ttl)
 */
export function toJavaCamelCase(name: string): string {
  if (!name) return name;

  // Handle all-caps: TTL -> ttl
  if (name === name.toUpperCase() && name.length > 1 && !name.includes('-') && !name.includes('_')) {
    const result = name.toLowerCase();
    return /^\d/.test(result) ? '_' + result : result;
  }

  const parts = name.split(/[-_]/);
  if (parts.length === 0) return name;

  let result = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    if (result.length === 0) {
      result += part[0].toLowerCase() + part.slice(1);
    } else {
      result += part[0].toUpperCase() + part.slice(1);
    }
  }

  if (result && /^\d/.test(result)) {
    result = '_' + result;
  }

  return result;
}

/**
 * Get the auto-conversion function for a given target language.
 */
function getAutoConverter(language: SupportedLanguage): (name: string) => string {
  switch (language) {
    case 'java':
      return toJavaCamelCase;
    default:
      return toJavaCamelCase;
  }
}

/**
 * Resolve field names to their effective code identifiers.
 *
 * For each field:
 * - If nameOverride is set, use it (conversionType = 'override')
 * - If name is already a valid identifier, use it as-is (conversionType = 'none')
 * - Otherwise, auto-convert using language conventions (conversionType = 'auto')
 */
export function resolveFieldNames(
  fields: FieldInput[],
  language: SupportedLanguage
): ResolvedField[] {
  const autoConvert = getAutoConverter(language);

  return fields.map((field) => {
    if (field.nameOverride) {
      return {
        originalName: field.name,
        codeName: field.nameOverride,
        conversionType: 'override' as const,
      };
    }

    if (VALID_IDENTIFIER_REGEX.test(field.name)) {
      return {
        originalName: field.name,
        codeName: field.name,
        conversionType: 'none' as const,
      };
    }

    return {
      originalName: field.name,
      codeName: autoConvert(field.name),
      conversionType: 'auto' as const,
    };
  });
}

/**
 * Detect collisions where multiple fields resolve to the same code name.
 */
export function detectCollisions(resolvedFields: ResolvedField[]): CollisionError[] {
  const codeNameToOriginals = new Map<string, string[]>();

  for (const field of resolvedFields) {
    const existing = codeNameToOriginals.get(field.codeName);
    if (existing) {
      existing.push(field.originalName);
    } else {
      codeNameToOriginals.set(field.codeName, [field.originalName]);
    }
  }

  const errors: CollisionError[] = [];
  for (const [codeName, originals] of codeNameToOriginals) {
    if (originals.length > 1) {
      errors.push({
        codeName,
        conflictingFields: originals,
        message: `Fields ${originals.map(f => `'${f}'`).join(' and ')} both resolve to '${codeName}'. Add nameOverride to one of the conflicting fields.`,
      });
    }
  }

  return errors;
}
