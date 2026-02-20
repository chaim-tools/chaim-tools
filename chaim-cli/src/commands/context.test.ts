import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { contextCommand } from './context';

// Use a temp directory for all tests
let tmpDir: string;
let originalCwd: () => string;
let originalExit: (code?: number) => never;
let originalConsoleLog: typeof console.log;
let originalConsoleError: typeof console.error;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'chaim-context-test-'));
  originalCwd = process.cwd;
  originalExit = process.exit;
  originalConsoleLog = console.log;
  originalConsoleError = console.error;

  process.cwd = () => tmpDir;
  process.exit = vi.fn() as any;
  console.log = vi.fn();
  console.error = vi.fn();
});

afterEach(() => {
  process.cwd = originalCwd;
  process.exit = originalExit;
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  vi.restoreAllMocks();

  // Clean up temp dir
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('contextCommand', () => {
  describe('canonical file', () => {
    it('should write the canonical .chaim/CHAIM_AGENT_CONTEXT.md', async () => {
      await contextCommand({ noAuto: true });

      const canonicalPath = path.join(tmpDir, '.chaim', 'CHAIM_AGENT_CONTEXT.md');
      expect(fs.existsSync(canonicalPath)).toBe(true);

      const content = fs.readFileSync(canonicalPath, 'utf-8');
      expect(content).toContain('# Chaim');
      expect(content).toContain('schema-driven');
    });

    it('should substitute CLI_VERSION placeholder', async () => {
      await contextCommand({ noAuto: true });

      const canonicalPath = path.join(tmpDir, '.chaim', 'CHAIM_AGENT_CONTEXT.md');
      const content = fs.readFileSync(canonicalPath, 'utf-8');
      expect(content).not.toContain('{{CLI_VERSION}}');
    });

    it('should substitute GENERATED_AT placeholder', async () => {
      await contextCommand({ noAuto: true });

      const canonicalPath = path.join(tmpDir, '.chaim', 'CHAIM_AGENT_CONTEXT.md');
      const content = fs.readFileSync(canonicalPath, 'utf-8');
      expect(content).not.toContain('{{GENERATED_AT}}');
    });

    it('should be idempotent — running twice overwrites cleanly', async () => {
      await contextCommand({ noAuto: true });
      await contextCommand({ noAuto: true });

      const canonicalPath = path.join(tmpDir, '.chaim', 'CHAIM_AGENT_CONTEXT.md');
      const content = fs.readFileSync(canonicalPath, 'utf-8');
      expect(content).toContain('# Chaim');
    });
  });

  describe('--agent cursor', () => {
    it('should write .cursor/rules/chaim.md as a dedicated file', async () => {
      await contextCommand({ agent: 'cursor' });

      const filePath = path.join(tmpDir, '.cursor', 'rules', 'chaim.md');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('# Chaim');
    });

    it('should create .cursor/rules/ directory if it does not exist', async () => {
      await contextCommand({ agent: 'cursor' });

      expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules'))).toBe(true);
    });

    it('should overwrite existing .cursor/rules/chaim.md', async () => {
      fs.mkdirSync(path.join(tmpDir, '.cursor', 'rules'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, '.cursor', 'rules', 'chaim.md'), 'old content', 'utf-8');

      await contextCommand({ agent: 'cursor' });

      const content = fs.readFileSync(path.join(tmpDir, '.cursor', 'rules', 'chaim.md'), 'utf-8');
      expect(content).not.toBe('old content');
      expect(content).toContain('# Chaim');
    });
  });

  describe('--agent copilot', () => {
    it('should create .github/copilot-instructions.md with fenced block', async () => {
      await contextCommand({ agent: 'copilot' });

      const filePath = path.join(tmpDir, '.github', 'copilot-instructions.md');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('CHAIM_AGENT_CONTEXT_START');
      expect(content).toContain('CHAIM_AGENT_CONTEXT_END');
      expect(content).toContain('# Chaim');
    });

    it('should append to existing copilot-instructions.md without losing content', async () => {
      fs.mkdirSync(path.join(tmpDir, '.github'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, '.github', 'copilot-instructions.md'),
        '# My Existing Rules\n\nDo things my way.\n',
        'utf-8'
      );

      await contextCommand({ agent: 'copilot' });

      const content = fs.readFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), 'utf-8');
      expect(content).toContain('# My Existing Rules');
      expect(content).toContain('Do things my way.');
      expect(content).toContain('CHAIM_AGENT_CONTEXT_START');
    });

    it('should replace existing fenced block on second run (idempotent)', async () => {
      await contextCommand({ agent: 'copilot' });
      await contextCommand({ agent: 'copilot' });

      const content = fs.readFileSync(path.join(tmpDir, '.github', 'copilot-instructions.md'), 'utf-8');
      const startCount = (content.match(/CHAIM_AGENT_CONTEXT_START/g) || []).length;
      const endCount = (content.match(/CHAIM_AGENT_CONTEXT_END/g) || []).length;

      expect(startCount).toBe(1);
      expect(endCount).toBe(1);
    });
  });

  describe('--agent claude', () => {
    it('should create CLAUDE.md with fenced block', async () => {
      await contextCommand({ agent: 'claude' });

      const filePath = path.join(tmpDir, 'CLAUDE.md');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('CHAIM_AGENT_CONTEXT_START');
      expect(content).toContain('# Chaim');
    });

    it('should append to existing CLAUDE.md', async () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Project Rules\n\nBe concise.\n', 'utf-8');

      await contextCommand({ agent: 'claude' });

      const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
      expect(content).toContain('# Project Rules');
      expect(content).toContain('Be concise.');
      expect(content).toContain('CHAIM_AGENT_CONTEXT_START');
    });
  });

  describe('--agent windsurf', () => {
    it('should create .windsurfrules with fenced block', async () => {
      await contextCommand({ agent: 'windsurf' });

      const filePath = path.join(tmpDir, '.windsurfrules');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('CHAIM_AGENT_CONTEXT_START');
    });
  });

  describe('--agent aider', () => {
    it('should create .aider.conf.yml with read-only reference', async () => {
      await contextCommand({ agent: 'aider' });

      const filePath = path.join(tmpDir, '.aider.conf.yml');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('read:');
      expect(content).toContain('.chaim/CHAIM_AGENT_CONTEXT.md');
    });

    it('should append to existing .aider.conf.yml', async () => {
      fs.writeFileSync(
        path.join(tmpDir, '.aider.conf.yml'),
        'model: gpt-4\nread:\n  - docs/conventions.md\n',
        'utf-8'
      );

      await contextCommand({ agent: 'aider' });

      const content = fs.readFileSync(path.join(tmpDir, '.aider.conf.yml'), 'utf-8');
      expect(content).toContain('model: gpt-4');
      expect(content).toContain('docs/conventions.md');
      expect(content).toContain('.chaim/CHAIM_AGENT_CONTEXT.md');
    });

    it('should not duplicate reference on second run', async () => {
      fs.writeFileSync(
        path.join(tmpDir, '.aider.conf.yml'),
        'read:\n  - .chaim/CHAIM_AGENT_CONTEXT.md\n',
        'utf-8'
      );

      await contextCommand({ agent: 'aider' });

      const content = fs.readFileSync(path.join(tmpDir, '.aider.conf.yml'), 'utf-8');
      const count = (content.match(/CHAIM_AGENT_CONTEXT\.md/g) || []).length;
      expect(count).toBe(1);
    });
  });

  describe('--agent generic', () => {
    it('should create AGENTS.md with fenced block', async () => {
      await contextCommand({ agent: 'generic' });

      const filePath = path.join(tmpDir, 'AGENTS.md');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('CHAIM_AGENT_CONTEXT_START');
      expect(content).toContain('# Chaim');
    });
  });

  describe('--agent all', () => {
    it('should write to all agent locations', async () => {
      await contextCommand({ agent: 'all' });

      expect(fs.existsSync(path.join(tmpDir, '.chaim', 'CHAIM_AGENT_CONTEXT.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'chaim.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.github', 'copilot-instructions.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'CLAUDE.md'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.windsurfrules'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, '.aider.conf.yml'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(true);
    });
  });

  describe('auto-detection', () => {
    it('should auto-detect Cursor when .cursor/ exists', async () => {
      fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });

      await contextCommand({});

      expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'chaim.md'))).toBe(true);
    });

    it('should auto-detect Claude when CLAUDE.md exists', async () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Rules\n', 'utf-8');

      await contextCommand({});

      const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
      expect(content).toContain('CHAIM_AGENT_CONTEXT_START');
    });

    it('should not auto-detect generic (AGENTS.md)', async () => {
      await contextCommand({});

      expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
    });

    it('should skip auto-detection with --no-auto', async () => {
      fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# Rules\n', 'utf-8');

      await contextCommand({ noAuto: true });

      expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'chaim.md'))).toBe(false);
      const claudeContent = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
      expect(claudeContent).not.toContain('CHAIM_AGENT_CONTEXT_START');
    });
  });

  describe('--remove', () => {
    it('should remove the canonical file', async () => {
      await contextCommand({ agent: 'all' });
      await contextCommand({ remove: true });

      expect(fs.existsSync(path.join(tmpDir, '.chaim', 'CHAIM_AGENT_CONTEXT.md'))).toBe(false);
    });

    it('should remove .cursor/rules/chaim.md', async () => {
      await contextCommand({ agent: 'all' });
      await contextCommand({ remove: true });

      expect(fs.existsSync(path.join(tmpDir, '.cursor', 'rules', 'chaim.md'))).toBe(false);
    });

    it('should remove fenced blocks from append targets', async () => {
      fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), '# My Rules\n', 'utf-8');
      await contextCommand({ agent: 'claude' });

      let content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
      expect(content).toContain('CHAIM_AGENT_CONTEXT_START');

      await contextCommand({ remove: true });

      content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf-8');
      expect(content).not.toContain('CHAIM_AGENT_CONTEXT_START');
      expect(content).toContain('# My Rules');
    });

    it('should remove aider read-only reference', async () => {
      await contextCommand({ agent: 'aider' });

      let content = fs.readFileSync(path.join(tmpDir, '.aider.conf.yml'), 'utf-8');
      expect(content).toContain('CHAIM_AGENT_CONTEXT.md');

      await contextCommand({ remove: true });

      content = fs.readFileSync(path.join(tmpDir, '.aider.conf.yml'), 'utf-8');
      expect(content).not.toContain('CHAIM_AGENT_CONTEXT.md');
    });

    it('should report nothing to remove when no context exists', async () => {
      await contextCommand({ remove: true });

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('No Chaim context files found')
      );
    });
  });

  describe('--list-agents', () => {
    it('should list all agents without writing files', async () => {
      await contextCommand({ listAgents: true });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Supported AI agents'));
      expect(fs.existsSync(path.join(tmpDir, '.chaim', 'CHAIM_AGENT_CONTEXT.md'))).toBe(false);
    });

    it('should show detected status for present agents', async () => {
      fs.mkdirSync(path.join(tmpDir, '.cursor'), { recursive: true });

      await contextCommand({ listAgents: true });

      expect(console.log).toHaveBeenCalledWith(expect.stringContaining('detected'));
    });
  });

  describe('error handling', () => {
    it('should reject unknown agent names', async () => {
      await contextCommand({ agent: 'vscode' });

      expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Unknown agent'));
      expect(process.exit).toHaveBeenCalledWith(1);
    });
  });
});
