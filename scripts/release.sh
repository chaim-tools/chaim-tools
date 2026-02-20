#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Chaim Tools — Monorepo Release Script
#
# Usage:
#   ./scripts/release.sh patch            # 0.2.7 → 0.2.8
#   ./scripts/release.sh minor            # 0.2.7 → 0.3.0
#   ./scripts/release.sh major            # 0.2.7 → 1.0.0
#   ./scripts/release.sh patch --dry-run  # preview without making changes
#
# Pipeline:
#   Pre-flight  → check npm login, clean git tree, packages exist
#   Phase 0     → build + test all packages on CURRENT code (no files touched)
#   Confirm     → prompt user to proceed
#   Phase 1     → bump versions + update cross-package deps in package.json
#   Phase 2     → rebuild with bumped versions
#   Phase 3     → npm publish (dependency order)
#   Phase 4     → git commit + tag + push
#
# Prerequisites:
#   - npm login (run once — token persists in ~/.npmrc)
#   - Clean git working tree
# ─────────────────────────────────────────────────────────────────────────────

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

BUMP_TYPE="${1:-patch}"
DRY_RUN=false
if [[ "${2:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

# Packages in dependency order (leaf first)
PKG_DIRS=("chaim-bprint-spec" "chaim-client-java" "chaim-cdk/packages/cdk-lib" "chaim-cli")
PKG_COUNT=${#PKG_DIRS[@]}

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "\n${CYAN}${BOLD}[$1]${NC} $2"; }
ok()   { echo -e "  ${GREEN}✓${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail() {
  echo -e "  ${RED}✗ $1${NC}"
  if [[ -n "${2:-}" ]]; then
    echo -e "\n  ${BOLD}How to fix:${NC}"
    echo -e "  $2"
  fi
  echo -e "\n  ${YELLOW}After fixing, re-run:${NC}  ./scripts/release.sh $BUMP_TYPE"
  exit 1
}

bump_version() {
  local version="$1" bump="$2"
  local major minor patch
  IFS='.' read -r major minor patch <<< "$version"
  case "$bump" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "$major.$((minor + 1)).0" ;;
    patch) echo "$major.$minor.$((patch + 1))" ;;
    *) fail "Invalid bump type: $bump" ;;
  esac
}

get_pkg_name() { node -p "require('$ROOT_DIR/$1/package.json').name"; }
get_pkg_ver()  { node -p "require('$ROOT_DIR/$1/package.json').version"; }

# ─────────────────────────────────────────────────────────────────────────────
# Pre-flight
# ─────────────────────────────────────────────────────────────────────────────

log "PRE-FLIGHT" "Checking prerequisites..."

command -v npm >/dev/null 2>&1  || fail "npm not found" "Install Node.js: https://nodejs.org"
command -v node >/dev/null 2>&1 || fail "node not found" "Install Node.js: https://nodejs.org"
command -v java >/dev/null 2>&1 || fail "java not found (needed for client-java build)" "Install Java 17+: brew install openjdk@17"

if ! $DRY_RUN; then
  if ! npm whoami >/dev/null 2>&1; then
    fail "Not logged in to npm" "Run:  npm login\n  Then re-run this script. The token persists in ~/.npmrc."
  fi
  ok "Logged in as $(npm whoami)"
fi

cd "$ROOT_DIR"
if [[ -n "$(git status --porcelain)" ]]; then
  if ! $DRY_RUN; then
    fail "Working tree is dirty — uncommitted changes detected" "Commit your changes first:\n    git add -A && git commit -m \"your message\" && git push"
  else
    warn "Working tree is dirty (ignored in dry-run)"
  fi
fi

for dir in "${PKG_DIRS[@]}"; do
  [[ -f "$ROOT_DIR/$dir/package.json" ]] || fail "Package not found: $dir" "Ensure you are running this script from the chaim-tools root directory."
done
ok "All packages found"

# ─────────────────────────────────────────────────────────────────────────────
# Compute versions (skip bump if current version isn't published yet)
# ─────────────────────────────────────────────────────────────────────────────

log "VERSIONS" "Checking npm registry and computing bumps..."

NEEDS_BUMP=()
PKG_NAMES=()
OLD_VERS=()
NEW_VERS=()

for i in $(seq 0 $((PKG_COUNT - 1))); do
  dir="${PKG_DIRS[$i]}"
  name=$(get_pkg_name "$dir")
  local_ver=$(get_pkg_ver "$dir")

  published_ver=$(npm view "$name@$local_ver" version 2>/dev/null || echo "")

  if [[ -z "$published_ver" ]]; then
    new="$local_ver"
    NEEDS_BUMP+=("false")
    echo -e "  ${CYAN}$name${NC}  $local_ver ${YELLOW}(not yet on npm — skipping bump)${NC}"
  else
    new=$(bump_version "$local_ver" "$BUMP_TYPE")
    NEEDS_BUMP+=("true")
    echo -e "  ${CYAN}$name${NC}  $local_ver → ${GREEN}$new${NC}"
  fi

  PKG_NAMES+=("$name")
  OLD_VERS+=("$local_ver")
  NEW_VERS+=("$new")
done

if $DRY_RUN; then
  echo -e "\n  ${YELLOW}DRY RUN — no changes will be made${NC}\n"
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 0: Validate — build + test on current code BEFORE any mutations
# ─────────────────────────────────────────────────────────────────────────────

log "VALIDATE" "Building and testing all packages on current code (no files modified yet)..."

for i in $(seq 0 $((PKG_COUNT - 1))); do
  dir="${PKG_DIRS[$i]}"
  name="${PKG_NAMES[$i]}"
  cd "$ROOT_DIR/$dir"

  echo -ne "  Building $name..."
  if npm run build > /tmp/chaim-validate-build-$$.log 2>&1; then
    echo -e " ${GREEN}✓${NC}"
  else
    echo -e " ${RED}✗${NC}"
    tail -20 /tmp/chaim-validate-build-$$.log
    fail "$name build failed — no versions were changed" "Fix the build errors, commit your fix, then re-run."
  fi

  has_test=$(node -p "require('./package.json').scripts?.test || ''" 2>/dev/null)
  if [[ -n "$has_test" ]]; then
    echo -ne "  Testing $name..."
    if npm test > /tmp/chaim-validate-test-$$.log 2>&1; then
      echo -e " ${GREEN}✓${NC}"
    else
      echo -e " ${RED}✗${NC}"
      tail -20 /tmp/chaim-validate-test-$$.log
      fail "$name tests failed — no versions were changed" "Fix the failing tests, commit your fix, then re-run."
    fi
  fi
done

ok "All packages build and pass tests"

# ─────────────────────────────────────────────────────────────────────────────
# Confirm
# ─────────────────────────────────────────────────────────────────────────────

echo ""
read -p "  Proceed with release? (y/N) " -n 1 -r
echo ""
[[ $REPLY =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ─────────────────────────────────────────────────────────────────────────────
# Phase 1: Bump versions + update cross-deps
# ─────────────────────────────────────────────────────────────────────────────

log "BUMP" "Updating package.json files..."

for i in $(seq 0 $((PKG_COUNT - 1))); do
  dir="${PKG_DIRS[$i]}"
  cd "$ROOT_DIR/$dir"
  if [[ "${NEEDS_BUMP[$i]}" == "true" ]]; then
    npm version "${NEW_VERS[$i]}" --no-git-tag-version --allow-same-version >/dev/null 2>&1
    ok "${PKG_NAMES[$i]} → ${NEW_VERS[$i]}"
  else
    ok "${PKG_NAMES[$i]} @ ${NEW_VERS[$i]} (already at target version)"
  fi
done

log "DEPS" "Updating cross-package references..."

for i in $(seq 0 $((PKG_COUNT - 1))); do
  pkg_json="$ROOT_DIR/${PKG_DIRS[$i]}/package.json"
  for j in $(seq 0 $((PKG_COUNT - 1))); do
    dep_name="${PKG_NAMES[$j]}"
    dep_ver="${NEW_VERS[$j]}"
    node -e "
      const fs = require('fs');
      const p = JSON.parse(fs.readFileSync('$pkg_json','utf8'));
      let c = false;
      for (const s of ['dependencies','devDependencies','peerDependencies']) {
        if (p[s]?.['$dep_name']) { p[s]['$dep_name'] = '^$dep_ver'; c = true; }
      }
      if (c) fs.writeFileSync('$pkg_json', JSON.stringify(p,null,2)+'\n');
    " 2>/dev/null || true
  done
done
ok "Cross-dependencies updated"

# ─────────────────────────────────────────────────────────────────────────────
# Phase 2: Rebuild with bumped versions
# ─────────────────────────────────────────────────────────────────────────────

log "REBUILD" "Rebuilding packages with updated versions..."

for i in $(seq 0 $((PKG_COUNT - 1))); do
  dir="${PKG_DIRS[$i]}"
  name="${PKG_NAMES[$i]}"
  cd "$ROOT_DIR/$dir"

  echo -ne "  Building $name@${NEW_VERS[$i]}..."
  if npm run build > /tmp/chaim-build-$$.log 2>&1; then
    echo -e " ${GREEN}✓${NC}"
  else
    echo -e " ${RED}✗${NC}"
    tail -20 /tmp/chaim-build-$$.log
    fail "$name rebuild failed after version bump" "Versions were already bumped. Fix the build, then re-run.\n    If needed, reset versions: git checkout -- '*/package.json'"
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# Phase 3: Publish to npm (dependency order)
# ─────────────────────────────────────────────────────────────────────────────

log "PUBLISH" "Publishing to npm..."

for i in $(seq 0 $((PKG_COUNT - 1))); do
  dir="${PKG_DIRS[$i]}"
  name="${PKG_NAMES[$i]}"
  ver="${NEW_VERS[$i]}"
  cd "$ROOT_DIR/$dir"

  echo -ne "  Publishing $name@$ver..."
  if npm publish --access public > /tmp/chaim-pub-$$.log 2>&1; then
    echo -e " ${GREEN}✓${NC}"
  else
    echo -e " ${RED}✗${NC}"
    cat /tmp/chaim-pub-$$.log
    fail "$name@$ver publish failed — see errors above" "Common fixes:\n    - 'npm ERR! 403': version already exists on npm. Bump again or use a different version.\n    - 'npm ERR! 401': auth token expired. Run: npm login\n    - 'npm ERR! 402': scoped package requires paid plan or --access public."
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# Phase 4: Git commit + tag + push
# ─────────────────────────────────────────────────────────────────────────────

log "GIT" "Committing release..."

cd "$ROOT_DIR"

RELEASE_MSG="release:"
for i in $(seq 0 $((PKG_COUNT - 1))); do
  RELEASE_MSG+=" ${PKG_NAMES[$i]}@${NEW_VERS[$i]}"
done

git add -A
git commit -m "$RELEASE_MSG"

for i in $(seq 0 $((PKG_COUNT - 1))); do
  tag="${PKG_NAMES[$i]}@${NEW_VERS[$i]}"
  tag="${tag//\//-}"
  git tag -a "$tag" -m "${PKG_NAMES[$i]}@${NEW_VERS[$i]}" 2>/dev/null || warn "Tag $tag exists"
done

git push && git push --tags
ok "Pushed to origin with tags"

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────

log "DONE" "Release complete!"
echo ""
for i in $(seq 0 $((PKG_COUNT - 1))); do
  echo -e "  ${GREEN}✓${NC} ${PKG_NAMES[$i]}@${NEW_VERS[$i]}"
done
echo ""
echo -e "  Consumers can update with:"
echo -e "  ${CYAN}npm update @chaim-tools/chaim @chaim-tools/chaim-bprint-spec @chaim-tools/cdk-lib${NC}"
echo ""
