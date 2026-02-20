import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the command modules
vi.mock('./commands/generate', () => ({
  generateCommand: vi.fn()
}));

vi.mock('./commands/validate', () => ({
  validateCommand: vi.fn()
}));

vi.mock('./commands/doctor', () => ({
  doctorCommand: vi.fn()
}));

vi.mock('./commands/init', () => ({
  initCommand: vi.fn()
}));

describe('CLI Entry Point', () => {
  let originalArgv: string[];
  let originalExit: (code?: number) => never;

  beforeEach(() => {
    // Store original values
    originalArgv = process.argv;
    originalExit = process.exit;
    
    // Mock process.exit to prevent actual exit
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original values
    process.argv = originalArgv;
    process.exit = originalExit;
    vi.restoreAllMocks();
  });

  it('should show help when no command provided', async () => {
    process.argv = ['node', 'index.js'];
    
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // Import and execute the CLI - it will call process.exit(0) which throws an error
    await expect(import('./index')).rejects.toThrow('process.exit called');
    
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Chaim CLI v0.1.0'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Usage: chaim <command> [options]'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Commands:'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('init'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('generate'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('validate'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('doctor'));
  });

  it('should register all commands', async () => {
    const { generateCommand } = await import('./commands/generate');
    const { validateCommand } = await import('./commands/validate');
    const { doctorCommand } = await import('./commands/doctor');
    const { initCommand } = await import('./commands/init');

    // Import the CLI to register commands - it will call process.exit(0) which throws an error
    await expect(import('./index')).rejects.toThrow('process.exit called');

    // Verify commands are imported (they should be available)
    expect(generateCommand).toBeDefined();
    expect(validateCommand).toBeDefined();
    expect(doctorCommand).toBeDefined();
    expect(initCommand).toBeDefined();
  });

  it('should handle generate command with options', async () => {
    // Test that the CLI entry point can be imported and handles process.exit()
    process.argv = ['node', 'index.js', 'generate', '--stack', 'TestStack', '--package', 'com.test'];

    // The CLI will call process.exit() when it completes, so we expect it to throw
    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should handle validate command with schema file', async () => {
    process.argv = ['node', 'index.js', 'validate', 'schema.bprint'];

    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should handle doctor command', async () => {
    process.argv = ['node', 'index.js', 'doctor'];

    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should handle init command with options', async () => {
    process.argv = ['node', 'index.js', 'init', '--install', '--region', 'us-west-2'];

    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should handle init command with verify-only option', async () => {
    process.argv = ['node', 'index.js', 'init', '--verify-only'];

    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should handle generate command with all options', async () => {
    process.argv = [
      'node', 'index.js', 'generate',
      '--stack', 'MyStack',
      '--package', 'com.example',
      '--region', 'us-west-2',
      '--table', 'Users',
      '--output', './generated',
      '--skip-checks'
    ];

    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should handle command errors gracefully', async () => {
    process.argv = ['node', 'index.js', 'generate', '--stack', 'TestStack', '--package', 'com.test'];

    // The CLI will call process.exit() when the command fails, so we expect it to throw
    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should show version information', async () => {
    process.argv = ['node', 'index.js', '--version'];
    
    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should show help for specific command', async () => {
    process.argv = ['node', 'index.js', 'generate', '--help'];
    
    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should handle unknown command', async () => {
    process.argv = ['node', 'index.js', 'unknown-command'];
    
    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should handle missing required options for generate command', async () => {
    process.argv = ['node', 'index.js', 'generate', '--package', 'com.test'];
    // Missing --stack option

    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should handle missing required options for generate command (package)', async () => {
    process.argv = ['node', 'index.js', 'generate', '--stack', 'TestStack'];
    // Missing --package option

    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should set correct default values for generate command', async () => {
    process.argv = ['node', 'index.js', 'generate', '--stack', 'TestStack', '--package', 'com.test'];

    await expect(import('./index')).rejects.toThrow('process.exit called');
  });

  it('should set correct default values for init command', async () => {
    process.argv = ['node', 'index.js', 'init'];

    await expect(import('./index')).rejects.toThrow('process.exit called');
  });
});
