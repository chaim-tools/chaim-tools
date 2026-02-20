import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';

const FENCE_START = '<!-- CHAIM_AGENT_CONTEXT_START - managed by chaim-cli, do not edit -->';
const FENCE_END = '<!-- CHAIM_AGENT_CONTEXT_END -->';

const CANONICAL_DIR = '.chaim';
const CANONICAL_FILE = 'CHAIM_AGENT_CONTEXT.md';

export interface AgentTarget {
  name: string;
  key: string;
  detect: (cwd: string) => boolean;
  place: (cwd: string, content: string) => void;
  path: string;
  strategy: 'overwrite' | 'append' | 'reference';
}

/**
 * Registry of supported AI agent targets.
 */
function getAgentTargets(): Record<string, AgentTarget> {
  return {
    cursor: {
      name: 'Cursor',
      key: 'cursor',
      detect: (cwd) => fs.existsSync(path.join(cwd, '.cursor')),
      place: (cwd, content) => {
        const dir = path.join(cwd, '.cursor', 'rules');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'chaim.md'), content, 'utf-8');
      },
      path: '.cursor/rules/chaim.md',
      strategy: 'overwrite',
    },
    copilot: {
      name: 'GitHub Copilot',
      key: 'copilot',
      detect: (cwd) => fs.existsSync(path.join(cwd, '.github', 'copilot-instructions.md')),
      place: (cwd, content) => {
        const filePath = path.join(cwd, '.github', 'copilot-instructions.md');
        fs.mkdirSync(path.join(cwd, '.github'), { recursive: true });
        appendFenced(filePath, content);
      },
      path: '.github/copilot-instructions.md',
      strategy: 'append',
    },
    claude: {
      name: 'Claude Code',
      key: 'claude',
      detect: (cwd) => fs.existsSync(path.join(cwd, 'CLAUDE.md')),
      place: (cwd, content) => {
        appendFenced(path.join(cwd, 'CLAUDE.md'), content);
      },
      path: 'CLAUDE.md',
      strategy: 'append',
    },
    windsurf: {
      name: 'Windsurf',
      key: 'windsurf',
      detect: (cwd) => fs.existsSync(path.join(cwd, '.windsurfrules')),
      place: (cwd, content) => {
        appendFenced(path.join(cwd, '.windsurfrules'), content);
      },
      path: '.windsurfrules',
      strategy: 'append',
    },
    aider: {
      name: 'Aider',
      key: 'aider',
      detect: (cwd) => fs.existsSync(path.join(cwd, '.aider.conf.yml')),
      place: (cwd, _content) => {
        addAiderReadOnly(path.join(cwd, '.aider.conf.yml'), `${CANONICAL_DIR}/${CANONICAL_FILE}`);
      },
      path: '.aider.conf.yml (read-only reference)',
      strategy: 'reference',
    },
    generic: {
      name: 'AGENTS.md (cross-tool)',
      key: 'generic',
      detect: () => true,
      place: (cwd, content) => {
        appendFenced(path.join(cwd, 'AGENTS.md'), content);
      },
      path: 'AGENTS.md',
      strategy: 'append',
    },
  };
}

export interface ContextOptions {
  agent?: string;
  noAuto?: boolean;
  remove?: boolean;
  listAgents?: boolean;
}

/**
 * Get the CLI version from package.json.
 */
function getCliVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Load the bundled agent context template and substitute placeholders.
 */
function loadBundledContent(): string {
  const templatePath = path.join(__dirname, '..', '..', 'shared', 'templates', 'CHAIM_AGENT_CONTEXT.md');

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Bundled template not found at: ${templatePath}`);
  }

  let content = fs.readFileSync(templatePath, 'utf-8');
  content = content.replace('{{CLI_VERSION}}', getCliVersion());
  content = content.replace('{{GENERATED_AT}}', new Date().toISOString().split('T')[0]);
  return content;
}

/**
 * Append content inside a managed fenced block. Idempotent — replaces existing block if present.
 */
function appendFenced(filePath: string, content: string): void {
  const fencedBlock = `\n${FENCE_START}\n${content}\n${FENCE_END}\n`;

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, fencedBlock.trimStart(), 'utf-8');
    return;
  }

  let existing = fs.readFileSync(filePath, 'utf-8');

  const startIdx = existing.indexOf(FENCE_START);
  const endIdx = existing.indexOf(FENCE_END);

  if (startIdx !== -1 && endIdx !== -1) {
    existing = existing.slice(0, startIdx) + existing.slice(endIdx + FENCE_END.length);
  }

  fs.writeFileSync(filePath, existing.trimEnd() + '\n' + fencedBlock, 'utf-8');
}

/**
 * Remove the managed fenced block from a file.
 */
function removeFenced(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const existing = fs.readFileSync(filePath, 'utf-8');
  const startIdx = existing.indexOf(FENCE_START);
  const endIdx = existing.indexOf(FENCE_END);

  if (startIdx === -1 || endIdx === -1) {
    return false;
  }

  const cleaned = existing.slice(0, startIdx) + existing.slice(endIdx + FENCE_END.length);
  const trimmed = cleaned.trimEnd();

  if (trimmed.length === 0) {
    fs.unlinkSync(filePath);
  } else {
    fs.writeFileSync(filePath, trimmed + '\n', 'utf-8');
  }
  return true;
}

/**
 * Add a read-only reference to the Aider config file.
 */
function addAiderReadOnly(confPath: string, contextPath: string): void {
  if (!fs.existsSync(confPath)) {
    fs.writeFileSync(confPath, `# Added by chaim-cli\nread:\n  - ${contextPath}\n`, 'utf-8');
    return;
  }

  const existing = fs.readFileSync(confPath, 'utf-8');

  if (existing.includes(contextPath)) {
    return;
  }

  if (/^read(?:-only)?:\s*$/m.test(existing)) {
    const updated = existing.replace(
      /^(read(?:-only)?:\s*\n)/m,
      `$1  - ${contextPath}\n`
    );
    fs.writeFileSync(confPath, updated, 'utf-8');
  } else {
    fs.writeFileSync(confPath, existing.trimEnd() + `\n\nread:\n  - ${contextPath}\n`, 'utf-8');
  }
}

/**
 * Remove the Aider read-only reference from the config file.
 */
function removeAiderReadOnly(confPath: string, contextPath: string): boolean {
  if (!fs.existsSync(confPath)) {
    return false;
  }

  const existing = fs.readFileSync(confPath, 'utf-8');
  if (!existing.includes(contextPath)) {
    return false;
  }

  const updated = existing.replace(new RegExp(`\\s*- ${contextPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), '');
  fs.writeFileSync(confPath, updated, 'utf-8');
  return true;
}

/**
 * List supported agents and their detection status.
 */
function listAgents(cwd: string): void {
  const agents = getAgentTargets();

  console.log(chalk.cyan('Supported AI agents:'));
  console.log('');
  console.log(chalk.white('  Agent       Status       Path'));
  console.log(chalk.gray('  ─────       ──────       ────'));

  for (const [key, agent] of Object.entries(agents)) {
    if (key === 'generic') continue;

    const detected = agent.detect(cwd);
    const status = detected
      ? chalk.green('detected   ')
      : chalk.gray('not found  ');
    const name = key.padEnd(12);
    console.log(`  ${chalk.white(name)}${status}${chalk.gray(agent.path)}`);
  }

  const genericAgent = agents['generic'];
  console.log(`  ${chalk.white('generic     ')}${chalk.blue('available  ')}${chalk.gray(genericAgent.path)}`);

  console.log('');
  console.log(chalk.gray('Detected agents will be auto-configured when you run: chaim context'));
  console.log(chalk.gray('Use --agent <name> to target a specific tool, or --agent all for all.'));
}

/**
 * Remove managed Chaim context from all agent locations.
 */
function removeContext(cwd: string): void {
  const agents = getAgentTargets();
  let removedCount = 0;

  // Remove canonical file
  const canonicalPath = path.join(cwd, CANONICAL_DIR, CANONICAL_FILE);
  if (fs.existsSync(canonicalPath)) {
    fs.unlinkSync(canonicalPath);
    console.log(chalk.green(`  Removed ${CANONICAL_DIR}/${CANONICAL_FILE}`));
    removedCount++;
  }

  // Remove from each agent target
  for (const [key, agent] of Object.entries(agents)) {
    if (key === 'aider') {
      const confPath = path.join(cwd, '.aider.conf.yml');
      if (removeAiderReadOnly(confPath, `${CANONICAL_DIR}/${CANONICAL_FILE}`)) {
        console.log(chalk.green(`  Removed reference from ${agent.path}`));
        removedCount++;
      }
    } else if (agent.strategy === 'overwrite') {
      const filePath = path.join(cwd, agent.path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(chalk.green(`  Removed ${agent.path}`));
        removedCount++;
      }
    } else if (agent.strategy === 'append') {
      const filePath = path.join(cwd, agent.path);
      if (removeFenced(filePath)) {
        console.log(chalk.green(`  Removed managed block from ${agent.path}`));
        removedCount++;
      }
    }
  }

  if (removedCount === 0) {
    console.log(chalk.yellow('No Chaim context files found to remove.'));
  } else {
    console.log('');
    console.log(chalk.green(`Removed Chaim context from ${removedCount} location(s).`));
  }
}

/**
 * Main context command handler.
 */
export async function contextCommand(options: ContextOptions): Promise<void> {
  const cwd = process.cwd();

  // --list-agents
  if (options.listAgents) {
    listAgents(cwd);
    return;
  }

  // --remove
  if (options.remove) {
    console.log(chalk.cyan('Removing Chaim agent context...'));
    console.log('');
    removeContext(cwd);
    return;
  }

  const agents = getAgentTargets();

  // Load content
  let content: string;
  try {
    content = loadBundledContent();
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : error);
    process.exit(1);
  }

  console.log(chalk.cyan('Chaim Agent Context'));
  console.log('');

  // 1. Determine targets
  let targets: string[];
  if (options.agent === 'all') {
    targets = Object.keys(agents);
  } else if (options.agent) {
    if (!agents[options.agent]) {
      console.error('');
      console.error(chalk.red(`Unknown agent: ${options.agent}`));
      console.error(chalk.gray(`Supported: ${Object.keys(agents).join(', ')}, all`));
      process.exit(1);
      return;
    }
    targets = [options.agent];
  } else if (options.noAuto) {
    targets = [];
  } else {
    // Auto-detect
    targets = Object.entries(agents)
      .filter(([key, a]) => key !== 'generic' && a.detect(cwd))
      .map(([key]) => key);

    if (targets.length > 0) {
      console.log('');
      console.log(chalk.blue(`  Detected: ${targets.map(t => agents[t].name).join(', ')}`));
    }
  }

  // 2. Write canonical file only when needed:
  //    - No agent targets (fallback — canonical is the only output)
  //    - Any target uses 'reference' strategy (e.g., aider points to the canonical file)
  const needsCanonical = targets.length === 0
    || targets.some(key => agents[key].strategy === 'reference');

  if (needsCanonical) {
    const canonicalDir = path.join(cwd, CANONICAL_DIR);
    fs.mkdirSync(canonicalDir, { recursive: true });
    fs.writeFileSync(path.join(canonicalDir, CANONICAL_FILE), content, 'utf-8');
    console.log(chalk.green(`  ${CANONICAL_DIR}/${CANONICAL_FILE}`));
  }

  // 3. Place for each target
  for (const key of targets) {
    const agent = agents[key];
    try {
      agent.place(cwd, content);
      console.log(chalk.green(`  ${agent.path}`) + chalk.gray(` (${agent.name})`));
    } catch (error) {
      console.error(chalk.yellow(`  Failed: ${agent.path} — ${error instanceof Error ? error.message : error}`));
    }
  }

  // 4. Summary
  const totalLocations = targets.length + (needsCanonical ? 1 : 0);
  console.log('');
  console.log(chalk.white(`Context v${getCliVersion()} written to ${totalLocations} location(s).`));

  if (targets.length === 0) {
    console.log('');
    console.log(chalk.gray('Tip: Use --agent <name> or --agent all to target your AI tool.'));
    console.log(chalk.gray('     Run chaim context --list-agents to see supported agents.'));
  }

  // Note about CLAUDE.md case sensitivity
  if (targets.includes('claude')) {
    console.log('');
    console.log(chalk.gray('Note: Claude expects exactly CLAUDE.md (case-sensitive) in project root.'));
  }
}
