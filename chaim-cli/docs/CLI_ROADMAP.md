# Chaim CLI Command Roadmap

This document describes all planned and implemented CLI commands in priority order.

> **Note**: All Tier 0/1 commands are currently stubbed/commented out in code.
> See `src/planned-commands.ts` for the typed registry.

## Command Status Legend

| Status | Meaning |
|--------|---------|
| Planned | Not yet started |
| Stub | File exists with placeholder, not wired in |
| Implemented | Fully functional |

---

## Tier 0 — Must Have

| Command | Status | Description |
|---------|--------|-------------|
| `chaim auth login` | Stub | Authenticate user via browser/device flow, obtain scoped tokens, store locally |
| `chaim auth whoami` | Stub | Display current authenticated user/org context and active profile |
| `chaim auth logout` | Stub | Clear local credentials; optionally revoke server-side token |

---

## Tier 1 — Core Productivity

| Command | Status | Description |
|---------|--------|-------------|
| `chaim configure` | Stub | Interactive setup; store defaults (appId, env, region, stack, output, javaPackage) |
| `chaim apps link` | Stub | Associate CLI with a Chaim application; validate access; cache app descriptor |

---

## Tier 2 — Existing + Enhanced

| Command | Status | Description |
|---------|--------|-------------|
| `chaim init` | Implemented | Verify and install all prerequisites |
| `chaim generate` | Implemented | Generate SDK from schema or CDK stack (will use config defaults and require auth later) |
| `chaim validate` | Implemented | Validate a .bprint schema file |
| `chaim doctor` | Implemented | Check system environment and dependencies (will validate auth + config later) |

---

## Tier 3 — Nice to Have

| Command | Status | Description |
|---------|--------|-------------|
| `chaim auth refresh` | Stub | Manually refresh token(s) for debugging |
| `chaim apps list` | Stub | List applications the authenticated user can access |
| `chaim config show` | Stub | Print resolved configuration (global + repo) for debugging |

---

## Implementation Notes

### How to Implement a Planned Command

1. Open the stub file in `src/commands/` (e.g., `src/commands/auth/login.ts`)
2. Implement the command logic following the JSDoc intent notes
3. Uncomment the import and registration lines in `src/index.ts`
4. Update the status in this file and in `src/planned-commands.ts`
5. Add tests in a corresponding `.test.ts` file

### Configuration Files

- **Global config**: `~/.chaim/config.json` — user-wide defaults
- **Repo config**: `./chaim.json` — project-specific overrides
- **Resolution**: Repo config overrides global defaults

### Security Requirements

- Never log tokens or secrets to console
- Store tokens securely (platform keychain preferred, fallback to encrypted file)
- Clear sensitive data from memory after use


