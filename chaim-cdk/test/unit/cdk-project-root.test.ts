import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { findCdkProjectRoot, getChaimAssetDir } from '../../src/services/cdk-project-root';

// Mock fs module
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof fs>('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

describe('cdk-project-root', () => {
  const originalCwd = process.cwd;
  const mockCwd = '/mock/workspace/my-project';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue(mockCwd);
    // Suppress console.warn during tests
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findCdkProjectRoot', () => {
    it('should find cdk.json in the start directory', () => {
      const startDir = '/home/user/my-cdk-project/src/services';
      (fs.existsSync as any).mockImplementation((p: string) => {
        return p === '/home/user/my-cdk-project/cdk.json';
      });

      const result = findCdkProjectRoot(startDir);
      expect(result).toBe('/home/user/my-cdk-project');
    });

    it('should walk up directories to find cdk.json', () => {
      const startDir = '/home/user/my-cdk-project/packages/lib/src';
      const cdkRoot = '/home/user/my-cdk-project';
      
      (fs.existsSync as any).mockImplementation((p: string) => {
        return p === path.join(cdkRoot, 'cdk.json');
      });

      const result = findCdkProjectRoot(startDir);
      expect(result).toBe(cdkRoot);
    });

    it('should fall back to process.cwd() if cdk.json not found', () => {
      const startDir = '/home/user/random-dir';
      (fs.existsSync as any).mockReturnValue(false);

      const result = findCdkProjectRoot(startDir);
      expect(result).toBe(mockCwd);
      expect(console.warn).toHaveBeenCalled();
    });

    it('should handle nested CDK projects (finds nearest cdk.json)', () => {
      const startDir = '/home/user/outer-cdk/inner-cdk/src';
      
      (fs.existsSync as any).mockImplementation((p: string) => {
        // Inner cdk.json exists
        if (p === '/home/user/outer-cdk/inner-cdk/cdk.json') return true;
        // Outer cdk.json also exists but inner should be found first
        if (p === '/home/user/outer-cdk/cdk.json') return true;
        return false;
      });

      const result = findCdkProjectRoot(startDir);
      // Should find the inner one first when walking up
      expect(result).toBe('/home/user/outer-cdk/inner-cdk');
    });
  });

  describe('getChaimAssetDir', () => {
    it('should return correct asset directory path', () => {
      const cdkRoot = '/home/user/my-cdk-project';
      (fs.existsSync as any).mockImplementation((p: string) => {
        return p === path.join(cdkRoot, 'cdk.json');
      });

      // Use a start directory within the mock CDK project
      vi.doMock('../../src/services/cdk-project-root', async () => {
        return {
          findCdkProjectRoot: vi.fn().mockReturnValue(cdkRoot),
          getChaimAssetDir: (stackName: string, resourceId: string) => {
            return path.join(cdkRoot, 'cdk.out', 'chaim', 'assets', stackName, resourceId);
          },
        };
      });

      const result = getChaimAssetDir('MyStack', 'UsersTable__User');
      expect(result).toContain('cdk.out');
      expect(result).toContain('chaim');
      expect(result).toContain('assets');
      expect(result).toContain('MyStack');
      expect(result).toContain('UsersTable__User');
    });

    it('should isolate assets by stack and resource ID', () => {
      (fs.existsSync as any).mockReturnValue(false);

      const path1 = getChaimAssetDir('StackA', 'Table1__Entity1');
      const path2 = getChaimAssetDir('StackB', 'Table2__Entity2');
      
      expect(path1).not.toBe(path2);
      expect(path1).toContain('StackA');
      expect(path2).toContain('StackB');
    });
  });
});

