import { describe, it, expect } from 'vitest';
import {
  toJavaCamelCase,
  resolveFieldNames,
  detectCollisions,
  VALID_IDENTIFIER_REGEX,
} from './name-resolver';

describe('toJavaCamelCase', () => {
  it('converts hyphenated names to camelCase', () => {
    expect(toJavaCamelCase('order-date')).toBe('orderDate');
    expect(toJavaCamelCase('user-id')).toBe('userId');
    expect(toJavaCamelCase('first-name')).toBe('firstName');
    expect(toJavaCamelCase('my-long-field-name')).toBe('myLongFieldName');
  });

  it('converts underscore names to camelCase', () => {
    expect(toJavaCamelCase('order_date')).toBe('orderDate');
    expect(toJavaCamelCase('user_id')).toBe('userId');
  });

  it('prefixes underscore for leading digits', () => {
    expect(toJavaCamelCase('2fa-enabled')).toBe('_2faEnabled');
    expect(toJavaCamelCase('3rd-party')).toBe('_3rdParty');
  });

  it('lowercases all-caps strings', () => {
    expect(toJavaCamelCase('TTL')).toBe('ttl');
    expect(toJavaCamelCase('ABC')).toBe('abc');
  });

  it('handles single character names', () => {
    expect(toJavaCamelCase('a')).toBe('a');
    expect(toJavaCamelCase('A')).toBe('a');
  });

  it('handles empty/null inputs', () => {
    expect(toJavaCamelCase('')).toBe('');
  });
});

describe('VALID_IDENTIFIER_REGEX', () => {
  it('accepts valid identifiers', () => {
    expect(VALID_IDENTIFIER_REGEX.test('userId')).toBe(true);
    expect(VALID_IDENTIFIER_REGEX.test('_private')).toBe(true);
    expect(VALID_IDENTIFIER_REGEX.test('MyClass')).toBe(true);
    expect(VALID_IDENTIFIER_REGEX.test('field123')).toBe(true);
  });

  it('rejects invalid identifiers', () => {
    expect(VALID_IDENTIFIER_REGEX.test('user-id')).toBe(false);
    expect(VALID_IDENTIFIER_REGEX.test('2fa')).toBe(false);
    expect(VALID_IDENTIFIER_REGEX.test('my field')).toBe(false);
    expect(VALID_IDENTIFIER_REGEX.test('')).toBe(false);
  });
});

describe('resolveFieldNames', () => {
  it('returns none for clean field names', () => {
    const fields = [
      { name: 'userId', type: 'string' as const },
      { name: 'email', type: 'string' as const },
    ];

    const resolved = resolveFieldNames(fields, 'java');

    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toEqual({
      originalName: 'userId',
      codeName: 'userId',
      conversionType: 'none',
    });
    expect(resolved[1]).toEqual({
      originalName: 'email',
      codeName: 'email',
      conversionType: 'none',
    });
  });

  it('auto-converts hyphenated names', () => {
    const fields = [
      { name: 'order-date', type: 'timestamp' as const },
      { name: 'user-id', type: 'string' as const },
    ];

    const resolved = resolveFieldNames(fields, 'java');

    expect(resolved[0]).toEqual({
      originalName: 'order-date',
      codeName: 'orderDate',
      conversionType: 'auto',
    });
    expect(resolved[1]).toEqual({
      originalName: 'user-id',
      codeName: 'userId',
      conversionType: 'auto',
    });
  });

  it('uses nameOverride when provided', () => {
    const fields = [
      { name: '2fa-verified', nameOverride: 'twoFactorVerified', type: 'boolean' as const },
    ];

    const resolved = resolveFieldNames(fields, 'java');

    expect(resolved[0]).toEqual({
      originalName: '2fa-verified',
      codeName: 'twoFactorVerified',
      conversionType: 'override',
    });
  });

  it('handles mixed conversion types', () => {
    const fields = [
      { name: 'orderId' },
      { name: 'order-date' },
      { name: '2fa-code', nameOverride: 'twoFactorCode' },
      { name: 'TTL' },
    ];

    const resolved = resolveFieldNames(fields, 'java');

    expect(resolved[0].conversionType).toBe('none');
    expect(resolved[1].conversionType).toBe('auto');
    expect(resolved[2].conversionType).toBe('override');
    // TTL is a valid identifier, so no conversion needed at the CLI level.
    // The Java generator handles all-caps lowering internally.
    expect(resolved[3].conversionType).toBe('none');
    expect(resolved[3].codeName).toBe('TTL');
  });
});

describe('detectCollisions', () => {
  it('returns no errors when no collisions', () => {
    const resolved = [
      { originalName: 'orderId', codeName: 'orderId', conversionType: 'none' as const },
      { originalName: 'orderDate', codeName: 'orderDate', conversionType: 'none' as const },
      { originalName: 'email', codeName: 'email', conversionType: 'none' as const },
    ];

    const errors = detectCollisions(resolved);
    expect(errors).toHaveLength(0);
  });

  it('detects collision between auto-converted and original name', () => {
    const resolved = [
      { originalName: 'order-date', codeName: 'orderDate', conversionType: 'auto' as const },
      { originalName: 'orderDate', codeName: 'orderDate', conversionType: 'none' as const },
    ];

    const errors = detectCollisions(resolved);

    expect(errors).toHaveLength(1);
    expect(errors[0].codeName).toBe('orderDate');
    expect(errors[0].conflictingFields).toContain('order-date');
    expect(errors[0].conflictingFields).toContain('orderDate');
    expect(errors[0].message).toContain('order-date');
    expect(errors[0].message).toContain('orderDate');
  });

  it('detects multiple collisions', () => {
    const resolved = [
      { originalName: 'a-b', codeName: 'aB', conversionType: 'auto' as const },
      { originalName: 'aB', codeName: 'aB', conversionType: 'none' as const },
      { originalName: 'x-y', codeName: 'xY', conversionType: 'auto' as const },
      { originalName: 'xY', codeName: 'xY', conversionType: 'none' as const },
    ];

    const errors = detectCollisions(resolved);
    expect(errors).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(detectCollisions([])).toHaveLength(0);
  });
});
