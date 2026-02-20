import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  discoverSnapshots,
  getLatestSnapshot,
  getSnapshotDirPath,
} from './snapshot-discovery';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

// Mock os-cache-paths
vi.mock('./os-cache-paths', () => {
  return {
    getSnapshotBaseDir: () => '/mock/.chaim/cache/snapshots',
  };
});

describe('snapshot-discovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('discoverSnapshots', () => {
    it('should return empty array when aws directory does not exist', () => {
      (fs.existsSync as any).mockReturnValue(false);

      const result = discoverSnapshots('/mock/cache');
      expect(result).toEqual([]);
    });

    it('should discover snapshots in hierarchical structure', () => {
      const mockStructure = {
        '/mock/cache/aws': true,
        '/mock/cache/aws/123456789012': true,
        '/mock/cache/aws/123456789012/us-east-1': true,
        '/mock/cache/aws/123456789012/us-east-1/MyStack': true,
        '/mock/cache/aws/123456789012/us-east-1/MyStack/dynamodb': true,
      };

      (fs.existsSync as any).mockImplementation((p: string) => !!mockStructure[p]);
      (fs.readdirSync as any).mockImplementation((dir: string) => {
        if (dir === '/mock/cache/aws') return ['123456789012'];
        if (dir === '/mock/cache/aws/123456789012') return ['us-east-1'];
        if (dir === '/mock/cache/aws/123456789012/us-east-1') return ['MyStack'];
        if (dir === '/mock/cache/aws/123456789012/us-east-1/MyStack') return ['dynamodb'];
        if (dir === '/mock/cache/aws/123456789012/us-east-1/MyStack/dynamodb') return ['UsersTable__User.json'];
        return [];
      });
      (fs.statSync as any).mockImplementation(() => ({
        isDirectory: () => true,
        isFile: () => true,
        mtime: new Date('2024-01-01'),
      }));
      (fs.readFileSync as any).mockReturnValue(JSON.stringify({
        capturedAt: '2024-01-01T12:00:00Z',
      }));

      const result = discoverSnapshots('/mock/cache');

      expect(result.length).toBe(1);
      expect(result[0].accountId).toBe('123456789012');
      expect(result[0].region).toBe('us-east-1');
      expect(result[0].stackName).toBe('MyStack');
      expect(result[0].datastoreType).toBe('dynamodb');
      expect(result[0].resourceName).toBe('UsersTable');
      expect(result[0].entityName).toBe('User');
    });

    it('should filter by stack name', () => {
      const mockStructure = {
        '/mock/cache/aws': true,
        '/mock/cache/aws/123456789012': true,
        '/mock/cache/aws/123456789012/us-east-1': true,
        '/mock/cache/aws/123456789012/us-east-1/StackA': true,
        '/mock/cache/aws/123456789012/us-east-1/StackB': true,
        '/mock/cache/aws/123456789012/us-east-1/StackA/dynamodb': true,
        '/mock/cache/aws/123456789012/us-east-1/StackB/dynamodb': true,
      };

      (fs.existsSync as any).mockImplementation((p: string) => !!mockStructure[p]);
      (fs.readdirSync as any).mockImplementation((dir: string) => {
        if (dir === '/mock/cache/aws') return ['123456789012'];
        if (dir === '/mock/cache/aws/123456789012') return ['us-east-1'];
        if (dir === '/mock/cache/aws/123456789012/us-east-1') return ['StackA', 'StackB'];
        if (dir === '/mock/cache/aws/123456789012/us-east-1/StackA') return ['dynamodb'];
        if (dir === '/mock/cache/aws/123456789012/us-east-1/StackB') return ['dynamodb'];
        if (dir.includes('StackA/dynamodb')) return ['Table__Entity.json'];
        if (dir.includes('StackB/dynamodb')) return ['Table__Entity.json'];
        return [];
      });
      (fs.statSync as any).mockImplementation(() => ({
        isDirectory: () => true,
        isFile: () => true,
        mtime: new Date('2024-01-01'),
      }));
      (fs.readFileSync as any).mockReturnValue(JSON.stringify({
        capturedAt: '2024-01-01T12:00:00Z',
      }));

      const result = discoverSnapshots('/mock/cache', { stackName: 'StackA' });

      expect(result.length).toBe(1);
      expect(result[0].stackName).toBe('StackA');
    });

    it('should sort by capturedAt descending (newest first)', () => {
      const mockStructure = {
        '/mock/cache/aws': true,
        '/mock/cache/aws/123456789012': true,
        '/mock/cache/aws/123456789012/us-east-1': true,
        '/mock/cache/aws/123456789012/us-east-1/MyStack': true,
        '/mock/cache/aws/123456789012/us-east-1/MyStack/dynamodb': true,
      };

      (fs.existsSync as any).mockImplementation((p: string) => !!mockStructure[p]);
      (fs.readdirSync as any).mockImplementation((dir: string) => {
        if (dir === '/mock/cache/aws') return ['123456789012'];
        if (dir === '/mock/cache/aws/123456789012') return ['us-east-1'];
        if (dir === '/mock/cache/aws/123456789012/us-east-1') return ['MyStack'];
        if (dir === '/mock/cache/aws/123456789012/us-east-1/MyStack') return ['dynamodb'];
        if (dir.endsWith('dynamodb')) return ['Old__Entity.json', 'New__Entity.json'];
        return [];
      });
      (fs.statSync as any).mockImplementation(() => ({
        isDirectory: () => true,
        isFile: () => true,
        mtime: new Date('2024-01-01'),
      }));
      
      let readCount = 0;
      (fs.readFileSync as any).mockImplementation(() => {
        readCount++;
        if (readCount === 1) {
          return JSON.stringify({ capturedAt: '2024-01-01T12:00:00Z' }); // Old
        }
        return JSON.stringify({ capturedAt: '2024-06-01T12:00:00Z' }); // New
      });

      const result = discoverSnapshots('/mock/cache');

      expect(result.length).toBe(2);
      // Newest should be first
      expect(result[0].resourceName).toBe('New');
    });
  });

  describe('getLatestSnapshot', () => {
    it('should return the first (newest) snapshot', () => {
      const mockStructure = {
        '/mock/cache/aws': true,
        '/mock/cache/aws/123456789012': true,
        '/mock/cache/aws/123456789012/us-east-1': true,
        '/mock/cache/aws/123456789012/us-east-1/MyStack': true,
        '/mock/cache/aws/123456789012/us-east-1/MyStack/dynamodb': true,
      };

      (fs.existsSync as any).mockImplementation((p: string) => !!mockStructure[p]);
      (fs.readdirSync as any).mockImplementation((dir: string) => {
        if (dir === '/mock/cache/aws') return ['123456789012'];
        if (dir === '/mock/cache/aws/123456789012') return ['us-east-1'];
        if (dir === '/mock/cache/aws/123456789012/us-east-1') return ['MyStack'];
        if (dir === '/mock/cache/aws/123456789012/us-east-1/MyStack') return ['dynamodb'];
        if (dir.endsWith('dynamodb')) return ['Table__Entity.json'];
        return [];
      });
      (fs.statSync as any).mockImplementation(() => ({
        isDirectory: () => true,
        isFile: () => true,
        mtime: new Date('2024-01-01'),
      }));
      (fs.readFileSync as any).mockReturnValue(JSON.stringify({
        capturedAt: '2024-01-01T12:00:00Z',
      }));

      const result = getLatestSnapshot('/mock/cache');

      expect(result).toBeDefined();
      expect(result?.resourceName).toBe('Table');
    });

    it('should return undefined when no snapshots found', () => {
      (fs.existsSync as any).mockReturnValue(false);

      const result = getLatestSnapshot('/mock/cache');
      expect(result).toBeUndefined();
    });
  });

  describe('getSnapshotDirPath', () => {
    it('should return OS cache when no path provided', () => {
      // Since module mocking can be tricky with relative imports,
      // we directly test that getSnapshotDirPath returns a path containing expected components
      const result = getSnapshotDirPath();
      // Result should be a string path to the chaim cache directory
      // Note: The mocked getSnapshotBaseDir returns '/mock/.chaim/cache/snapshots'
      // If mock fails, the real function returns ~/.chaim/cache/snapshots
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      // Path should contain 'chaim' and 'snapshots'
      expect(result).toMatch(/chaim.*snapshots/);
    });

    it('should return absolute path as-is', () => {
      const result = getSnapshotDirPath('/custom/absolute/path');
      expect(result).toBe('/custom/absolute/path');
    });

    it('should resolve relative path against cwd', () => {
      const cwd = process.cwd();
      const result = getSnapshotDirPath('relative/path');
      expect(result).toBe(path.join(cwd, 'relative/path'));
    });
  });
});
