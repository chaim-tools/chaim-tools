# chaim-cli

The command-line tool that generates type-safe Java SDKs from your DynamoDB schema snapshots. It reads the local snapshots produced by `chaim-cdk`, groups entities by table, validates key consistency, and invokes the Java code generator to produce ready-to-use entity classes, repositories, validators, and configuration.

**npm**: [`@chaim-tools/chaim`](https://www.npmjs.com/package/@chaim-tools/chaim)

## Where This Fits

```
 .bprint file  ──>  chaim-cdk  ──>  chaim-cli  ──>  chaim-client-java
                                        ^                    │
                                        │                    v
                                   YOU RUN THIS      Generated Java SDK
```

The CLI sits between the CDK construct and the code generator. It discovers cached snapshots from your file system, resolves table metadata (including GSIs and LSIs), and delegates to `chaim-client-java` for Java source file generation. The generated code supports all `.bprint` field types including recursive nesting (maps within maps, lists of maps within maps) with no depth limit.

## Installation

```bash
npm install -g @chaim-tools/chaim
```

**Requirements**: Node.js 18+, Java 11+ (runtime for code generation)

## Quick Start

```bash
# 1. Synthesize your CDK project to create a local snapshot
cd my-cdk-project
cdk synth

# 2. Generate the Java SDK
# If you have chaim.json in the project root (recommended):
chaim generate

# Or one-off without chaim.json:
chaim generate --package com.mycompany.myapp.model --output ./src/main/java

# Your Java SDK is now written under the configured source root
```

The CLI reads snapshots from the OS cache (`~/.chaim/cache/snapshots/`). You can run it from any directory.

## CDK Prerequisites

Before running `chaim generate`, your CDK project must produce valid snapshots via `cdk synth`. The CDK construct enforces two important safeguards:

- **Field reference validation** — All DynamoDB key attributes (table PK/SK, GSI/LSI keys, TTL attribute) must exist as fields in the `.bprint` schema. Mismatches fail the CDK synth immediately with a descriptive error.
- **Strict failure mode** — Deployment defaults to `STRICT`, meaning ingestion failures cause CloudFormation rollback. Use `FailureMode.BEST_EFFORT` explicitly if you want deployment to continue on ingestion errors.

## Commands

### `chaim generate`

Generates Java SDK code from local snapshots.

**With `chaim.json` (recommended for multi-stack projects):**
```bash
chaim generate
```

**Single-stack / one-off:**
```bash
chaim generate --package com.mycompany.myapp.model --output ./src/main/java
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `--package <name>` | No* | — | Java package name (e.g., `com.mycompany.myapp.model`). Required when no `chaim.json` is present. |
| `-l, --language <lang>` | No | `java` | Target language |
| `--output <javaRoot>` | No | `./src/main/java` | Java source root. **Do not include the package path** — it is appended automatically (e.g., `--output ./src/main/java` with `--package com.example.sdk` writes to `./src/main/java/com/example/sdk/`). |
| `--stack <name>` | No | — | Filter to a single CDK stack (or narrow config-driven runs) |
| `--snapshot-dir <path>` | No | OS cache | Override snapshot directory |
| `--skip-checks` | No | `false` | Skip environment validation |

*`--package` is optional when a `chaim.json` with `generate.stacks` is present in the project.

**What it does**:

1. Loads `chaim.json` from the project root (if present) for multi-stack configuration
2. For each stack in `generate.stacks` (or the single CLI-specified run), scans the OS cache for matching snapshot files
3. Filters by stack name and discards DELETE-action snapshots; deduplicates by `bindingId` (newest snapshot wins)
4. Groups entities by physical DynamoDB table (using table ARN or composite key)
5. Validates that all entities sharing a table have matching partition/sort key field names
6. Detects field name collisions from `nameOverride` or auto-conversion
7. Passes schemas and table metadata (including GSI/LSI definitions) to the Java generator
8. Writes generated `.java` files under `javaRoot/<package-as-path>/` (e.g., `src/main/java/com/example/sdk/`)

#### Project Config: `chaim.json`

For projects with multiple CDK stacks, place a `chaim.json` in the project root:

```json
{
  "generate": {
    "javaRoot": "./application/src/main/java",
    "stacks": {
      "OrdersInfrastructureStack": {
        "package": "com.example.orders.sdk"
      },
      "ProductsInfrastructureStack": {
        "package": "com.example.products.sdk"
      }
    }
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `generate.javaRoot` | No | Shared Java source root. Default: `./src/main/java`. Never include the package path. |
| `generate.stacks` | Yes | Map of CDK stack name → `{ package, javaRoot? }` |
| `generate.stacks.<name>.package` | Yes | Java package name for this stack's SDK |
| `generate.stacks.<name>.javaRoot` | No | Per-stack source root override |
| `generate.language` | No | Target language (default: `java`) |

A single `chaim generate` call processes all stacks. Use `--stack <name>` to narrow to one.

### `chaim validate`

Validates a `.bprint` schema file and displays the field mapping table.

```bash
chaim validate ./schemas/user.bprint
```

### `chaim doctor`

Checks your system environment for required dependencies.

```bash
chaim doctor
```

Verifies: Node.js version, Java installation, AWS CLI availability.

### `chaim init`

Verifies and optionally installs prerequisites.

```bash
chaim init              # Verify only
chaim init --install    # Install missing dependencies
```

### `chaim bump`

Increments the `schemaVersion` in a `.bprint` file.

```bash
chaim bump ./schemas/user.bprint            # minor bump: 1.3 -> 1.4
chaim bump ./schemas/user.bprint --major    # major bump: 1.3 -> 2.0
```

| Option | Required | Default | Description |
|--------|----------|---------|-------------|
| `<schemaFile>` | Yes | — | Path to the `.bprint` file |
| `--major` | No | `false` | Major version bump instead of minor |

The `schemaVersion` is a customer-controlled field. The Chaim system validates during `cdk deploy` that the version was bumped when schema content changes. Use this command to increment the version before deploying.

### `chaim clean`

Prunes old or stack-specific snapshots from the local cache.

```bash
chaim clean --all                   # Remove all snapshots
chaim clean --stack MyStack         # Remove snapshots for a specific stack
chaim clean --older-than 30         # Remove snapshots older than 30 days
chaim clean --dry-run               # Show what would be deleted
```

### `chaim context`

Downloads an AI agent context file that teaches coding agents how to use the Chaim toolchain in your project.

```bash
chaim context                         # Write .chaim/CHAIM_AGENT_CONTEXT.md; auto-detect agents
chaim context --agent cursor          # Also write .cursor/rules/chaim.md
chaim context --agent all             # Write to all supported agent locations
chaim context --no-auto               # Only write canonical file, skip auto-detection
chaim context --remove                # Remove Chaim context from all locations
chaim context --list-agents           # Show supported agents and detection status
```

| Option | Description |
|--------|-------------|
| `--agent <name>` | Target a specific AI tool: `cursor`, `copilot`, `claude`, `windsurf`, `aider`, `generic`, `all` |
| `--no-auto` | Skip auto-detection; only write the canonical `.chaim/CHAIM_AGENT_CONTEXT.md` |
| `--remove` | Remove managed Chaim context blocks from all agent locations |
| `--list-agents` | Show supported agents, their detection status, and file paths |

**What it does**:

1. Writes a comprehensive guide to `.chaim/CHAIM_AGENT_CONTEXT.md` (always)
2. Auto-detects which AI tools are present (`.cursor/`, `CLAUDE.md`, `.windsurfrules`, etc.)
3. Places the context into each detected tool's config location

**Supported agents and placement strategy**:

| Agent | File | Strategy |
|-------|------|----------|
| `cursor` | `.cursor/rules/chaim.md` | Dedicated file (overwrite) |
| `copilot` | `.github/copilot-instructions.md` | Append managed block |
| `claude` | `CLAUDE.md` | Append managed block |
| `windsurf` | `.windsurfrules` | Append managed block |
| `aider` | `.aider.conf.yml` | Add read-only reference |
| `generic` | `AGENTS.md` | Append managed block |

For append targets, the content is wrapped in HTML comment fences (`<!-- CHAIM_AGENT_CONTEXT_START -->` / `<!-- CHAIM_AGENT_CONTEXT_END -->`). Running the command again replaces the existing block in-place (idempotent). Existing content in those files is preserved.

## Snapshot Locations

The CLI reads from the global OS cache, so it works regardless of your current directory.

| OS | Default Path |
|----|--------------|
| macOS / Linux | `~/.chaim/cache/snapshots/` |
| Windows | `%LOCALAPPDATA%/chaim/cache/snapshots/` |

Override with `CHAIM_SNAPSHOT_DIR` or `--snapshot-dir`.

Directory structure:
```
~/.chaim/cache/snapshots/
└── aws/
    └── {accountId}/
        └── {region}/
            └── {stackName}/
                └── dynamodb/
                    └── {resourceId}.json
```

## Generated Output

For a package `com.example.model` with `User` and `Order` entities on the same table:

```
src/main/java/com/example/model/
├── User.java                          # Entity DTO (@DynamoDbBean + Lombok)
├── Order.java                         # Entity DTO
├── keys/
│   ├── UserKeys.java                  # Key constants, INDEX_ constants, key() helper
│   └── OrderKeys.java
├── repository/
│   ├── UserRepository.java            # save(), findByKey(), deleteByKey(), queryBy{Index}()
│   └── OrderRepository.java
├── validation/
│   ├── UserValidator.java             # Required, constraint, and enum checks
│   ├── OrderValidator.java
│   └── ChaimValidationException.java  # Structured validation errors
├── client/
│   └── ChaimDynamoDbClient.java       # DI-friendly DynamoDB client wrapper
└── config/
    └── ChaimConfig.java               # Table constants, lazy client, repository factories
```

## Field Type Mappings

| .bprint Type | Java Type | Notes |
|--------------|-----------|-------|
| `string` | `String` | |
| `number` | `Double` | |
| `boolean` | `Boolean` | |
| `timestamp` | `Instant` | `java.time.Instant` |
| `list` (scalar) | `List<String>`, `List<Double>`, etc. | Parameterized by `items.type` |
| `list` (map) | `List<{FieldName}Item>` | Inner `@DynamoDbBean` class |
| `map` | `{FieldName}` (inner class) | Inner `@DynamoDbBean` class; supports recursive nesting |
| `stringSet` | `Set<String>` | |
| `numberSet` | `Set<Double>` | |

Recursive nesting is fully supported. A `map` field can contain nested `map` or `list` fields, which generate further inner static classes. There is no hardcoded depth limit — the database itself is the guardrail.

## Using the Generated Code

### Add Dependencies to Your Java Project

The generated code requires these dependencies (Gradle example):

```kotlin
dependencies {
    implementation("software.amazon.awssdk:dynamodb-enhanced:2.21.+")
    compileOnly("org.projectlombok:lombok:1.18.+")
    annotationProcessor("org.projectlombok:lombok:1.18.+")
}
```

### Basic Usage

```java
// Use the generated config for a singleton client
UserRepository users = ChaimConfig.userRepository();

// Save an entity (validates constraints automatically)
User user = User.builder()
    .userId("user-123")
    .email("alice@example.com")
    .isActive(true)
    .build();
users.save(user);

// Find by key
Optional<User> found = users.findByKey("user-123");

// Delete
users.deleteByKey("user-123");
```

### GSI/LSI Queries

The generator produces typed query methods for every GSI and LSI on the table. Each index generates a PK-only method and a PK+SK overloaded method (when the index has a sort key).

```java
OrderRepository orders = ChaimConfig.orderRepository();

// GSI query — uses the GSI's own partition key
List<Order> customerOrders = orders.queryByCustomerIndex("customer-123");

// GSI query with sort key — PK + SK overload
List<Order> filtered = orders.queryByCustomerDateIndex("customer-123", "2024-01-15");

// LSI query — uses the table's partition key (LSIs always share it)
List<Order> sorted = orders.queryByAmountIndex("order-456");
List<Order> ranged = orders.queryByAmountIndex("order-456", "100.00");
```

### Custom Client (Local DynamoDB, Testing)

```java
ChaimDynamoDbClient client = ChaimConfig.clientBuilder()
    .endpoint("http://localhost:8000")
    .build();
UserRepository users = ChaimConfig.userRepository(client);
```

## Troubleshooting

### "No snapshot found"

You need to create a snapshot first by running `cdk synth` or `cdk deploy` in your CDK project:

```bash
cd my-cdk-project
cdk synth
```

Then run `chaim generate` from any directory.

### Stack filter does not match

The CLI shows existing snapshots that did not match your `--stack` filter, helping you adjust the value.

## Using in Your Application Codebase

A typical multi-stack project layout:

```
my-project/
├── chaim.json                          # ← commit this
├── infrastructure/                     # CDK infrastructure
│   ├── schemas/
│   │   ├── user.bprint
│   │   └── order.bprint
│   ├── lib/my-stack.ts
│   └── package.json
└── application/                        # Java application
    └── src/main/java/
        ├── com/example/orders/sdk/     # ← generated (gitignore this)
        │   ├── Order.java
        │   ├── OrderRepository.java
        │   └── ...
        └── com/example/               # Your application code
            └── service/OrderService.java
```

**`chaim.json`:**
```json
{
  "generate": {
    "javaRoot": "./application/src/main/java",
    "stacks": {
      "OrdersInfrastructureStack": { "package": "com.example.orders.sdk" },
      "ProductsInfrastructureStack": { "package": "com.example.products.sdk" }
    }
  }
}
```

Run `cdk synth && chaim generate` to regenerate all stacks at once. Re-run whenever you change a `.bprint` file or add a new entity.

## Development

### Prerequisites

- **Node.js 18+** — required for building and running the CLI
- **npm** — comes with Node.js

### Setup

Clone the repository and install dependencies:

```bash
npm install
```

Or use the included setup script, which validates your Node.js version, installs dependencies, and builds in one step:

```bash
npm run setup
```

### Building

The CLI is written in TypeScript and compiles to `dist/` via the TypeScript compiler.

```bash
npm run build          # Compile TypeScript → dist/
```

To start from a clean state:

```bash
npm run clean          # Delete dist/
npm run build          # Rebuild
```

The build emits CommonJS modules targeting ES2020 with declarations, declaration maps, and source maps (configured in `tsconfig.json`).

### Running Locally (Development)

You can run the CLI directly from source without compiling first:

```bash
npm run dev -- generate --package com.example.model
```

Or after building, run the compiled output:

```bash
npm start -- generate --package com.example.model
# equivalent to: node dist/index.js generate --package com.example.model
```

### Testing

Tests use [Vitest](https://vitest.dev/) and live alongside the source files (`*.test.ts`).

```bash
npm test               # Run all tests in watch mode
```

To run tests once (CI-friendly):

```bash
npx vitest run
```

To run a specific test file:

```bash
npx vitest run src/commands/generate.test.ts
```

Test files:

| File | Covers |
|------|--------|
| `src/index.test.ts` | CLI entry point and command registration |
| `src/commands/generate.test.ts` | `chaim generate` command |
| `src/commands/validate.test.ts` | `chaim validate` command |
| `src/commands/init.test.ts` | `chaim init` command |
| `src/commands/doctor.test.ts` | `chaim doctor` command |
| `src/commands/context.test.ts` | `chaim context` command |
| `src/services/snapshot-discovery.test.ts` | Snapshot file discovery logic |
| `src/services/name-resolver.test.ts` | Field name resolution and collision detection |

### Linting

The project uses ESLint with TypeScript support.

```bash
npm run lint           # Check for lint errors
npm run lint:fix       # Auto-fix lint errors
```

### Project Structure

```
chaim-cli/
├── src/                      # TypeScript source
│   ├── index.ts              # CLI entry point (Commander.js)
│   ├── commands/             # Command implementations
│   │   ├── generate.ts
│   │   ├── validate.ts
│   │   ├── init.ts
│   │   ├── doctor.ts
│   │   ├── bump.ts
│   │   ├── clean.ts
│   │   └── context.ts
│   └── services/             # Shared logic
│       ├── snapshot-discovery.ts
│       └── name-resolver.ts
├── dist/                     # Compiled output (git-ignored)
├── shared/
│   ├── scripts/setup.sh      # One-time setup helper
│   └── templates/
│       └── CHAIM_AGENT_CONTEXT.md  # Bundled AI agent context template
├── tsconfig.json             # TypeScript configuration
├── .eslintrc.js              # ESLint configuration
└── package.json
```

## Publishing to npm

Publishing is automated via GitHub Actions. The workflow triggers when you create a GitHub release.

### Steps

1. **Update the version** in `package.json`:

```bash
npm version patch   # 0.1.5 → 0.1.6
npm version minor   # 0.1.5 → 0.2.0
npm version major   # 0.1.5 → 1.0.0
```

2. **Push the commit and tag**:

```bash
git push && git push --tags
```

3. **Create a GitHub release** from the tag. Go to the repository's **Releases** page, click **Draft a new release**, select the tag, and publish.

4. The `publish.yml` workflow runs automatically: checks out the code, runs `npm ci`, builds, and publishes to npm with `--access public`.

### Prerequisites

- The repository must have an `NPM_TOKEN` secret configured in **Settings > Secrets and variables > Actions**. This token must have publish permissions for the `@chaim-tools` scope.

### Manual Publishing (Emergency)

If the workflow fails or you need to publish from your local machine:

```bash
npm run build
npm publish --access public
```

You must be logged in to npm (`npm login`) with publish access to the `@chaim-tools` scope.

## License

Apache-2.0
