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
fail() { echo -e "  ${RED}✗ $1${NC}"; exit 1; }

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

command -v npm >/dev/null 2>&1  || fail "npm not found"
command -v node >/dev/null 2>&1 || fail "node not found"
command -v java >/dev/null 2>&1 || fail "java not found (needed for client-java build)"

if ! $DRY_RUN; then
  if ! npm whoami >/dev/null 2>&1; then
    fail "Not logged in to npm. Run: npm login"
  fi
  ok "Logged in as $(npm whoami)"
fi

cd "$ROOT_DIR"
if [[ -n "$(git status --porcelain)" ]]; then
  if ! $DRY_RUN; then
    fail "Working tree is dirty. Commit or stash changes first."
  else
    warn "Working tree is dirty (ignored in dry-run)"
  fi
fi

for dir in "${PKG_DIRS[@]}"; do
  [[ -f "$ROOT_DIR/$dir/package.json" ]] || fail "Package not found: $dir"
done
ok "All packages found"

# ─────────────────────────────────────────────────────────────────────────────
# Compute versions
# ─────────────────────────────────────────────────────────────────────────────

log "VERSIONS" "Computing $BUMP_TYPE bumps..."

PKG_NAMES=()
OLD_VERS=()
NEW_VERS=()

for i in $(seq 0 $((PKG_COUNT - 1))); do
  dir="${PKG_DIRS[$i]}"
  name=$(get_pkg_name "$dir")
  old=$(get_pkg_ver "$dir")
  new=$(bump_version "$old" "$BUMP_TYPE")
  PKG_NAMES+=("$name")
  OLD_VERS+=("$old")
  NEW_VERS+=("$new")
  echo -e "  ${CYAN}$name${NC}  $old → ${GREEN}$new${NC}"
done

if $DRY_RUN; then
  echo -e "\n  ${YELLOW}DRY RUN — no changes will be made${NC}\n"
  exit 0
fi

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
  npm version "${NEW_VERS[$i]}" --no-git-tag-version --allow-same-version >/dev/null 2>&1
  ok "${PKG_NAMES[$i]} → ${NEW_VERS[$i]}"
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
# Phase 2: Build + test
# ─────────────────────────────────────────────────────────────────────────────

log "BUILD" "Building and testing each package..."

for i in $(seq 0 $((PKG_COUNT - 1))); do
  dir="${PKG_DIRS[$i]}"
  name="${PKG_NAMES[$i]}"
  cd "$ROOT_DIR/$dir"

  echo -ne "  Building $name..."
  if npm run build > /tmp/chaim-build-$$.log 2>&1; then
    echo -e " ${GREEN}✓${NC}"
  else
    echo -e " ${RED}✗${NC}"
    tail -20 /tmp/chaim-build-$$.log
    fail "$name build failed"
  fi

  has_test=$(node -p "require('./package.json').scripts?.test || ''" 2>/dev/null)
  if [[ -n "$has_test" ]]; then
    echo -ne "  Testing $name..."
    if npm test > /tmp/chaim-test-$$.log 2>&1; then
      echo -e " ${GREEN}✓${NC}"
    else
      echo -e " ${RED}✗${NC}"
      tail -20 /tmp/chaim-test-$$.log
      fail "$name tests failed"
    fi
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
    fail "$name publish failed"
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
