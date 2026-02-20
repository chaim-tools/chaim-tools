/**
 * Configuration Type Definitions
 *
 * This module defines the configuration file structures for the Chaim CLI.
 * Configuration is loaded from two sources:
 *
 * 1. Global config: ~/.chaim/config.json
 *    - User-wide defaults that apply to all projects
 *
 * 2. Repo config: ./chaim.json (in project root)
 *    - Project-specific overrides
 *
 * Resolution order: Repo config values override global config values.
 *
 * NOTE: File I/O is not implemented yet. This module only defines types.
 */

/**
 * Supported languages for code generation.
 * Extend this union type when adding new language support.
 */
export type SupportedLanguage = 'java'; // extend later: | 'typescript' | 'python'

/**
 * List of currently supported languages for code generation.
 */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['java'];

/**
 * Default language for code generation when not specified.
 */
export const DEFAULT_LANGUAGE: SupportedLanguage = 'java';

/**
 * Authentication profile stored in global config
 */
export interface AuthProfile {
  /** Profile name (e.g., "default", "work", "personal") */
  name: string;
  /** User identifier (email or ID) */
  userId?: string;
  /** Organization context */
  orgId?: string;
  /** Token expiry timestamp (ISO 8601) */
  tokenExpiry?: string;
  // Note: Actual tokens should be stored in secure storage (keychain),
  // not in the config file. This interface only tracks metadata.
}

/**
 * Global configuration stored at ~/.chaim/config.json
 *
 * Contains user-wide defaults and authentication profiles.
 */
export interface GlobalChaimConfig {
  /** Schema version for config file format */
  configVersion?: string;

  /** Active authentication profile name */
  activeProfile?: string;

  /** List of authentication profiles (metadata only, tokens stored securely) */
  profiles?: AuthProfile[];

  /** Default AWS region */
  defaultRegion?: string;

  /** Default Java package name for code generation */
  defaultJavaPackage?: string;

  /** Default output directory for generated code */
  defaultOutput?: string;

  /** Default language for code generation (java, typescript, python) */
  defaultLanguage?: SupportedLanguage;

  /** Telemetry opt-out flag */
  telemetryOptOut?: boolean;
}

/**
 * Per-stack generation settings inside chaim.json → generate.stacks
 */
export interface ChaimStackGenerateConfig {
  /**
   * Java package name for entities in this stack.
   * e.g., "com.example.orders.sdk"
   */
  package: string;

  /**
   * Optional per-stack Java source root override.
   * Falls back to generate.javaRoot when omitted.
   * e.g., "./orders-service/src/main/java"
   */
  javaRoot?: string;
}

/**
 * Top-level generate block inside chaim.json.
 * Controls how `chaim generate` (with no CLI flags) discovers stacks
 * and decides where to write each SDK.
 */
export interface ChaimGenerateConfig {
  /**
   * Java source root shared by all stacks.
   * Must be the raw Maven/Gradle source root — do NOT include the
   * package path here (JavaPoet appends that automatically).
   * e.g., "./application/src/main/java"
   * Default: "./src/main/java"
   */
  javaRoot?: string;

  /**
   * Target language (defaults to "java").
   */
  language?: SupportedLanguage;

  /**
   * Map from CDK stack name → per-stack config.
   * Every stack that has a ChaimDynamoDBBinder should have an entry here.
   */
  stacks: Record<string, ChaimStackGenerateConfig>;

  /**
   * VS Code workspace integration.
   *
   * When true (the default), `chaim generate` automatically writes
   * `files.associations` and `json.schemas` entries into
   * `.vscode/settings.json` so that VS Code validates `.bprint` files
   * against the bundled JSON Schema without any manual configuration.
   *
   * Set to `false` to opt out (e.g. if you manage VS Code settings
   * through a committed `.vscode/settings.json` that you don't want
   * the CLI to touch).
   */
  vscode?: boolean;
}

/**
 * Repository/project configuration stored at ./chaim.json
 *
 * Contains project-specific settings that override global defaults.
 */
export interface RepoChaimConfig {
  /** Schema version for config file format */
  configVersion?: string;

  /** Linked Chaim application ID */
  appId?: string;

  /** Environment name (e.g., "dev", "staging", "prod") */
  environment?: string;

  /** AWS region for this project */
  region?: string;

  /**
   * Code-generation settings for `chaim generate`.
   * When this block is present, running `chaim generate` (with no flags)
   * will automatically process every stack listed under `generate.stacks`.
   */
  generate?: ChaimGenerateConfig;

  /** @deprecated use generate.stacks[stackName].package instead */
  javaPackage?: string;

  /** @deprecated use generate.javaRoot instead */
  output?: string;

  /** @deprecated use generate.language instead */
  language?: SupportedLanguage;

  /** Specific tables to include (if not all) */
  tables?: string[];
}

/**
 * Resolved configuration after merging global and repo configs
 *
 * This represents the effective configuration used by CLI commands.
 * Values are resolved with repo config taking precedence over global.
 */
export interface ResolvedChaimConfig {
  // === Source tracking ===
  /** Path to global config file (if loaded) */
  globalConfigPath?: string;
  /** Path to repo config file (if loaded) */
  repoConfigPath?: string;

  // === Authentication ===
  /** Active profile name */
  activeProfile?: string;
  /** Whether user is currently authenticated */
  isAuthenticated: boolean;

  // === Project context ===
  /** Linked Chaim application ID */
  appId?: string;
  /** Environment name */
  environment?: string;

  // === AWS/Infrastructure ===
  /** AWS region */
  region: string;
  /** CloudFormation stack name */
  stackName?: string;

  // === Code generation ===
  /** Language for code generation */
  language: SupportedLanguage;
  /** Java package name */
  javaPackage?: string;
  /** Output directory */
  output: string;
  /** Specific tables to include */
  tables?: string[];
}

/**
 * Default values for resolved configuration
 */
export const CONFIG_DEFAULTS: Partial<ResolvedChaimConfig> = {
  region: 'us-east-1',
  output: './src/main/java',
  language: DEFAULT_LANGUAGE,
  isAuthenticated: false,
};

/**
 * Well-known file paths for configuration
 */
export const CONFIG_PATHS = {
  /** Global config directory */
  globalDir: '~/.chaim',
  /** Global config file */
  globalFile: '~/.chaim/config.json',
  /** Repo config file (relative to project root) */
  repoFile: './chaim.json',
} as const;


