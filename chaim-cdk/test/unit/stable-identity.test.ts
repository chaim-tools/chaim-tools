import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  isToken,
  getStableResourceKey,
  buildMatchKey,
  generateResourceId,
  StableIdentity,
} from '../../src/services/stable-identity';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('stable-identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isToken', () => {
    it('should return true for undefined', () => {
      expect(isToken(undefined)).toBe(true);
    });

    it('should return true for empty string', () => {
      expect(isToken('')).toBe(true);
    });

    it('should return true for CDK Token pattern', () => {
      expect(isToken('${Token[AWS.AccountId.4]}')).toBe(true);
      expect(isToken('arn:aws:dynamodb:${Token[AWS.Region.3]}:table')).toBe(true);
    });

    it('should return true for CloudFormation intrinsic pattern', () => {
      expect(isToken('${AWS::AccountId}')).toBe(true);
      expect(isToken('${AWS::Region}')).toBe(true);
    });

    it('should return false for concrete values', () => {
      expect(isToken('123456789012')).toBe(false);
      expect(isToken('us-east-1')).toBe(false);
      expect(isToken('my-table-name')).toBe(false);
    });
  });

  describe('buildMatchKey', () => {
    it('should build match key from identity fields', () => {
      const result = buildMatchKey({
        appId: 'my-app',
        stackName: 'MyStack',
        datastoreType: 'dynamodb',
        entityName: 'User',
        stableResourceKey: 'dynamodb:tableName:UsersTable',
      });
      expect(result).toBe('my-app:MyStack:dynamodb:User:dynamodb:tableName:UsersTable');
    });

    it('should handle identity with path-based key', () => {
      const result = buildMatchKey({
        appId: 'app',
        stackName: 'Stack',
        datastoreType: 'dynamodb',
        entityName: 'Entity',
        stableResourceKey: 'dynamodb:path:Stack/Construct/Table',
      });
      expect(result).toBe('app:Stack:dynamodb:Entity:dynamodb:path:Stack/Construct/Table');
    });
  });

  describe('generateResourceId', () => {
    it('should generate base resource ID when no file exists', () => {
      (fs.existsSync as any).mockReturnValue(false);

      const result = generateResourceId(
        {
          resourceName: 'UsersTable',
          entityName: 'User',
          appId: 'my-app',
          stackName: 'MyStack',
          datastoreType: 'dynamodb',
          stableResourceKey: 'dynamodb:tableName:UsersTable',
        },
        '/cache/dir'
      );

      expect(result).toBe('UsersTable__User');
    });

    it('should return same ID when existing file has matching identity', () => {
      const existingSnapshot = {
        appId: 'my-app',
        stackName: 'MyStack',
        datastoreType: 'dynamodb',
        schema: { entityName: 'User' },
        identity: {
          stableResourceKey: 'dynamodb:tableName:UsersTable',
        },
      };

      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(existingSnapshot));

      const result = generateResourceId(
        {
          resourceName: 'UsersTable',
          entityName: 'User',
          appId: 'my-app',
          stackName: 'MyStack',
          datastoreType: 'dynamodb',
          stableResourceKey: 'dynamodb:tableName:UsersTable',
        },
        '/cache/dir'
      );

      expect(result).toBe('UsersTable__User');
    });

    it('should allocate suffix when existing file has different identity', () => {
      const existingSnapshot = {
        appId: 'my-app',
        stackName: 'MyStack',
        datastoreType: 'dynamodb',
        schema: { entityName: 'User' },
        identity: {
          stableResourceKey: 'dynamodb:tableName:DifferentTable', // Different resource
        },
      };

      // First file exists with different identity
      // Second file doesn't exist
      let callCount = 0;
      (fs.existsSync as any).mockImplementation(() => {
        callCount++;
        return callCount === 1; // First exists, second doesn't
      });
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(existingSnapshot));

      const result = generateResourceId(
        {
          resourceName: 'UsersTable',
          entityName: 'User',
          appId: 'my-app',
          stackName: 'MyStack',
          datastoreType: 'dynamodb',
          stableResourceKey: 'dynamodb:tableName:UsersTable',
        },
        '/cache/dir'
      );

      expect(result).toBe('UsersTable__User__2');
    });

    it('should allocate suffix when existing file lacks identity', () => {
      const existingSnapshot = {
        // No identity field
        schema: {},
      };

      let callCount = 0;
      (fs.existsSync as any).mockImplementation(() => {
        callCount++;
        return callCount === 1;
      });
      (fs.readFileSync as any).mockReturnValue(JSON.stringify(existingSnapshot));

      const result = generateResourceId(
        {
          resourceName: 'Table',
          entityName: 'Entity',
          appId: 'my-app',
          stackName: 'MyStack',
          datastoreType: 'dynamodb',
          stableResourceKey: 'dynamodb:tableName:UsersTable',
        },
        '/cache/dir'
      );

      expect(result).toBe('Table__Entity__2');
    });

    it('should handle file read errors gracefully', () => {
      let callCount = 0;
      (fs.existsSync as any).mockImplementation(() => {
        callCount++;
        return callCount === 1;
      });
      (fs.readFileSync as any).mockImplementation(() => {
        throw new Error('File read error');
      });

      const result = generateResourceId(
        {
          resourceName: 'Table',
          entityName: 'Entity',
          appId: 'my-app',
          stackName: 'MyStack',
          datastoreType: 'dynamodb',
          stableResourceKey: 'dynamodb:tableName:UsersTable',
        },
        '/cache/dir'
      );

      // Should treat read error as non-match and allocate suffix
      expect(result).toBe('Table__Entity__2');
    });

    it('should continue allocating suffixes for multiple collisions', () => {
      const existingSnapshot1 = {
        appId: 'my-app',
        stackName: 'MyStack',
        datastoreType: 'dynamodb',
        schema: { entityName: 'Entity' },
        identity: {
          stableResourceKey: 'dynamodb:path:Different/Path/1',
        },
      };
      const existingSnapshot2 = {
        appId: 'my-app',
        stackName: 'MyStack',
        datastoreType: 'dynamodb',
        schema: { entityName: 'Entity' },
        identity: {
          stableResourceKey: 'dynamodb:path:Different/Path/2',
        },
      };

      let callCount = 0;
      (fs.existsSync as any).mockImplementation(() => {
        callCount++;
        return callCount <= 2; // First two exist, third doesn't
      });
      (fs.readFileSync as any)
        .mockReturnValueOnce(JSON.stringify(existingSnapshot1))
        .mockReturnValueOnce(JSON.stringify(existingSnapshot2));

      const result = generateResourceId(
        {
          resourceName: 'Table',
          entityName: 'Entity',
          appId: 'my-app',
          stackName: 'MyStack',
          datastoreType: 'dynamodb',
          stableResourceKey: 'dynamodb:tableName:UsersTable',
        },
        '/cache/dir'
      );

      expect(result).toBe('Table__Entity__3');
    });
  });
});

