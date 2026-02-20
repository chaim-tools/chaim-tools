import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initCommand } from './init';
import { spawn } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

describe('initCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should check prerequisites successfully', async () => {
    const mockJavaProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockAwsProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockCdkProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    vi.mocked(spawn).mockImplementation((command: string) => {
      if (command === 'java') {
        return mockJavaProcess as any;
      } else if (command === 'aws') {
        return mockAwsProcess as any;
      } else if (command === 'cdk') {
        return mockCdkProcess as any;
      }
      return {} as any;
    });

    // Mock successful Java response
    mockJavaProcess.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('java version "11.0.19" 2023-04-18 LTS'));
      }
    });

    mockJavaProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    // Mock successful AWS CLI response
    mockAwsProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from(JSON.stringify({ Account: '123456789012' })));
      }
    });

    mockAwsProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    // Mock successful CDK CLI response
    mockCdkProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('2.100.0'));
      }
    });

    mockCdkProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    await expect(initCommand({})).resolves.not.toThrow();

    expect(spawn).toHaveBeenCalledWith('java', ['-version'], expect.any(Object));
    expect(spawn).toHaveBeenCalledWith('aws', ['sts', 'get-caller-identity'], expect.any(Object));
    expect(spawn).toHaveBeenCalledWith('cdk', ['--version'], expect.any(Object));
  });

  it('should handle Node.js version check', async () => {
    // Mock process.version
    const originalVersion = process.version;
    Object.defineProperty(process, 'version', {
      value: 'v18.17.0',
      configurable: true
    });

    const mockJavaProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockAwsProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockCdkProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    vi.mocked(spawn).mockImplementation((command: string) => {
      if (command === 'java') {
        return mockJavaProcess as any;
      } else if (command === 'aws') {
        return mockAwsProcess as any;
      } else if (command === 'cdk') {
        return mockCdkProcess as any;
      }
      return {} as any;
    });

    // Mock successful responses
    mockJavaProcess.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('java version "11.0.19"'));
      }
    });

    mockJavaProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    mockAwsProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from(JSON.stringify({ Account: '123456789012' })));
      }
    });

    mockAwsProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    mockCdkProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('2.100.0'));
      }
    });

    mockCdkProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    await expect(initCommand({})).resolves.not.toThrow();

    // Restore original version
    Object.defineProperty(process, 'version', {
      value: originalVersion,
      configurable: true
    });
  });

  it('should handle Node.js version too old', async () => {
    // Mock process.version
    const originalVersion = process.version;
    Object.defineProperty(process, 'version', {
      value: 'v16.20.0',
      configurable: true
    });

    await expect(initCommand({})).rejects.toThrow('process.exit called');

    // Restore original version
    Object.defineProperty(process, 'version', {
      value: originalVersion,
      configurable: true
    });
  });

  it('should handle Java not available', async () => {
    const mockJavaProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    vi.mocked(spawn).mockImplementation((command: string) => {
      if (command === 'java') {
        return mockJavaProcess as any;
      }
      return {} as any;
    });

    mockJavaProcess.on.mockImplementation((event, callback) => {
      if (event === 'error') {
        callback(new Error('Java not found'));
      }
    });

    await expect(initCommand({})).rejects.toThrow('process.exit called');
  });

  it('should handle Java version too old', async () => {
    const mockJavaProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    vi.mocked(spawn).mockImplementation((command: string) => {
      if (command === 'java') {
        return mockJavaProcess as any;
      }
      return {} as any;
    });

    mockJavaProcess.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('java version "1.8.0_291"'));
      }
    });

    mockJavaProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    await expect(initCommand({})).rejects.toThrow('process.exit called');
  });

  it('should handle AWS CLI not available', async () => {
    const mockJavaProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockAwsProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    vi.mocked(spawn).mockImplementation((command: string) => {
      if (command === 'java') {
        return mockJavaProcess as any;
      } else if (command === 'aws') {
        return mockAwsProcess as any;
      }
      return {} as any;
    });

    // Mock successful Java response
    mockJavaProcess.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('java version "11.0.19"'));
      }
    });

    mockJavaProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    // Mock AWS CLI failure
    mockAwsProcess.on.mockImplementation((event, callback) => {
      if (event === 'error') {
        callback(new Error('AWS CLI not found'));
      }
    });

    await expect(initCommand({})).rejects.toThrow('process.exit called');
  });

  it('should handle AWS credentials not configured', async () => {
    const mockJavaProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockAwsProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    vi.mocked(spawn).mockImplementation((command: string) => {
      if (command === 'java') {
        return mockJavaProcess as any;
      } else if (command === 'aws') {
        return mockAwsProcess as any;
      }
      return {} as any;
    });

    // Mock successful Java response
    mockJavaProcess.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('java version "11.0.19"'));
      }
    });

    mockJavaProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    // Mock AWS CLI failure (credentials not configured)
    mockAwsProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(1); // Failure
      }
    });

    await expect(initCommand({})).rejects.toThrow('process.exit called');
  });

  it('should handle CDK CLI not available', async () => {
    const mockJavaProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockAwsProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockCdkProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    vi.mocked(spawn).mockImplementation((command: string) => {
      if (command === 'java') {
        return mockJavaProcess as any;
      } else if (command === 'aws') {
        return mockAwsProcess as any;
      } else if (command === 'cdk') {
        return mockCdkProcess as any;
      }
      return {} as any;
    });

    // Mock successful Java and AWS responses
    mockJavaProcess.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('java version "11.0.19"'));
      }
    });

    mockJavaProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    mockAwsProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from(JSON.stringify({ Account: '123456789012' })));
      }
    });

    mockAwsProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    // Mock CDK CLI failure
    mockCdkProcess.on.mockImplementation((event, callback) => {
      if (event === 'error') {
        callback(new Error('CDK CLI not found'));
      }
    });

    await expect(initCommand({})).rejects.toThrow('process.exit called');
  });

  it('should install dependencies when install option is true', async () => {
    const mockJavaProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockAwsProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockCdkProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockNpmProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    vi.mocked(spawn).mockImplementation((command: string, _args: string[]) => {
      if (command === 'java') {
        return mockJavaProcess as any;
      } else if (command === 'aws') {
        return mockAwsProcess as any;
      } else if (command === 'cdk') {
        return mockCdkProcess as any;
      } else if (command === 'npm') {
        return mockNpmProcess as any;
      }
      return {} as any;
    });

    // Mock successful prerequisite checks
    mockJavaProcess.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('java version "11.0.19"'));
      }
    });

    mockJavaProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    mockAwsProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from(JSON.stringify({ Account: '123456789012' })));
      }
    });

    mockAwsProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    mockCdkProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('2.100.0'));
      }
    });

    mockCdkProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    // Mock successful npm install
    mockNpmProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    await expect(initCommand({ install: true })).resolves.not.toThrow();

    expect(spawn).toHaveBeenCalledWith('npm', ['install', '-g', 'aws-cdk'], expect.any(Object));
    expect(spawn).toHaveBeenCalledWith('npm', ['install'], expect.any(Object));
  });

  it('should skip installation when verifyOnly is true', async () => {
    const mockJavaProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockAwsProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockCdkProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    vi.mocked(spawn).mockImplementation((command: string) => {
      if (command === 'java') {
        return mockJavaProcess as any;
      } else if (command === 'aws') {
        return mockAwsProcess as any;
      } else if (command === 'cdk') {
        return mockCdkProcess as any;
      }
      return {} as any;
    });

    // Mock successful prerequisite checks
    mockJavaProcess.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('java version "11.0.19"'));
      }
    });

    mockJavaProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    mockAwsProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from(JSON.stringify({ Account: '123456789012' })));
      }
    });

    mockAwsProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    mockCdkProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('2.100.0'));
      }
    });

    mockCdkProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    await expect(initCommand({ verifyOnly: true })).resolves.not.toThrow();

    // Should not call npm install
    expect(spawn).not.toHaveBeenCalledWith('npm', expect.any(Array), expect.any(Object));
  });

  it('should bootstrap CDK with custom region', async () => {
    const mockJavaProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockAwsProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    const mockCdkProcess = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn()
    };

    vi.mocked(spawn).mockImplementation((command: string, _args: string[]) => {
      if (command === 'java') {
        return mockJavaProcess as any;
      } else if (command === 'aws') {
        return mockAwsProcess as any;
      } else if (command === 'cdk') {
        return mockCdkProcess as any;
      }
      return {} as any;
    });

    // Mock successful prerequisite checks
    mockJavaProcess.stderr.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('java version "11.0.19"'));
      }
    });

    mockJavaProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    mockAwsProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from(JSON.stringify({ Account: '123456789012' })));
      }
    });

    mockAwsProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    mockCdkProcess.stdout.on.mockImplementation((event, callback) => {
      if (event === 'data') {
        callback(Buffer.from('2.100.0'));
      }
    });

    mockCdkProcess.on.mockImplementation((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    });

    await expect(initCommand({ region: 'us-west-2' })).resolves.not.toThrow();

    expect(spawn).toHaveBeenCalledWith('cdk', ['bootstrap', '--region=us-west-2'], expect.any(Object));
  });
});
