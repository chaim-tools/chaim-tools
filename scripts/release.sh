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
#   Detect      → diff each package against its last release tag; skip unchanged
#   Cascade     → if a dependency is releasing, mark its dependents for release too
#   Phase 0     → build + test CHANGED packages on CURRENT code (no files touched)
#   Confirm     → prompt user to proceed
#   Phase 1     → bump versions + update cross-package deps in package.json
#   Phase 2     → rebuild with bumped versions
#   Phase 3     → npm publish (dependency order)
#   Phase 4     → git commit + tag + push
#
# Version Bumping:
#   - Uses git tags (e.g. @chaim-tools-chaim@1.2.3) to detect changes.
#   - If no source files changed since the last release tag, the package is
#     SKIPPED entirely — no bump, no build, no publish.
#   - If the current local version was never published to npm, it publishes
#     without bumping (assumes the version was set intentionally).
#
# Prerequisites:
#   - npm login (run once — token persists in ~/.npmrc)
#   - Clean git working tree
#   - If 2FA is enabled on npm, have your authenticator app ready for OTP
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
# Detect changes — diff each package against its last git release tag
# ─────────────────────────────────────────────────────────────────────────────

log "DETECT" "Checking for changes since last release..."

# Convert a scoped npm name to the tag prefix: @chaim-tools/chaim → @chaim-tools-chaim
tag_prefix() { echo "$1" | sed 's|/|-|g'; }

NEEDS_BUMP=()
HAS_CHANGES=()
PKG_NAMES=()
OLD_VERS=()
NEW_VERS=()
SKIP_COUNT=0
RELEASE_COUNT=0

for i in $(seq 0 $((PKG_COUNT - 1))); do
  dir="${PKG_DIRS[$i]}"
  name=$(get_pkg_name "$dir")
  local_ver=$(get_pkg_ver "$dir")
  prefix=$(tag_prefix "$name")

  # Find the most recent release tag for this package
  last_tag=$(git tag --list "${prefix}@*" --sort=-v:refname | head -1 2>/dev/null || echo "")

  if [[ -z "$last_tag" ]]; then
    # Never released — check npm as fallback
    published_ver=$(npm view "$name@$local_ver" version 2>/dev/null || echo "")
    if [[ -z "$published_ver" ]]; then
      new="$local_ver"
      NEEDS_BUMP+=("false")
      HAS_CHANGES+=("true")
      echo -e "  ${CYAN}$name${NC}  $local_ver ${YELLOW}(first release — no tag found, no bump)${NC}"
      ((RELEASE_COUNT++))
    else
      new=$(bump_version "$local_ver" "$BUMP_TYPE")
      NEEDS_BUMP+=("true")
      HAS_CHANGES+=("true")
      echo -e "  ${CYAN}$name${NC}  $local_ver → ${GREEN}$new${NC} ${YELLOW}(no release tag — will create one)${NC}"
      ((RELEASE_COUNT++))
    fi
  else
    # Tag exists — check if any files changed in this package since that tag
    changes=$(git diff --name-only "$last_tag"..HEAD -- "$dir/" 2>/dev/null || echo "")
    if [[ -z "$changes" ]]; then
      new="$local_ver"
      NEEDS_BUMP+=("false")
      HAS_CHANGES+=("false")
      echo -e "  ${CYAN}$name${NC}  $local_ver ${GREEN}(no changes since $last_tag — skipping)${NC}"
      ((SKIP_COUNT++))
    else
      change_count=$(echo "$changes" | wc -l | tr -d ' ')
      published_ver=$(npm view "$name@$local_ver" version 2>/dev/null || echo "")
      if [[ -z "$published_ver" ]]; then
        new="$local_ver"
        NEEDS_BUMP+=("false")
      else
        new=$(bump_version "$local_ver" "$BUMP_TYPE")
        NEEDS_BUMP+=("true")
      fi
      HAS_CHANGES+=("true")
      echo -e "  ${CYAN}$name${NC}  $local_ver → ${GREEN}$new${NC} ($change_count file(s) changed since $last_tag)"
      ((RELEASE_COUNT++))
    fi
  fi

  PKG_NAMES+=("$name")
  OLD_VERS+=("$local_ver")
  NEW_VERS+=("$new")
done

# ─────────────────────────────────────────────────────────────────────────────
# Cascade — if a dependency is releasing, its dependents must also release
# ─────────────────────────────────────────────────────────────────────────────

cascade_changed=true
while $cascade_changed; do
  cascade_changed=false
  for i in $(seq 0 $((PKG_COUNT - 1))); do
    if [[ "${HAS_CHANGES[$i]}" == "true" ]]; then continue; fi
    pkg_json="$ROOT_DIR/${PKG_DIRS[$i]}/package.json"
    for j in $(seq 0 $((PKG_COUNT - 1))); do
      if [[ "${HAS_CHANGES[$j]}" == "false" ]]; then continue; fi
      dep_name="${PKG_NAMES[$j]}"
      is_dep=$(node -p "
        const p = require('$pkg_json');
        !!(p.dependencies?.['$dep_name'] || p.devDependencies?.['$dep_name'] || p.peerDependencies?.['$dep_name'])
      " 2>/dev/null || echo "false")
      if [[ "$is_dep" == "true" ]]; then
        HAS_CHANGES[$i]="true"
        NEEDS_BUMP[$i]="true"
        NEW_VERS[$i]=$(bump_version "${OLD_VERS[$i]}" "$BUMP_TYPE")
        echo -e "  ${CYAN}${PKG_NAMES[$i]}${NC}  ${OLD_VERS[$i]} → ${GREEN}${NEW_VERS[$i]}${NC} ${YELLOW}(cascade: depends on $dep_name)${NC}"
        ((RELEASE_COUNT++))
        ((SKIP_COUNT--))
        cascade_changed=true
        break
      fi
    done
  done
done

if [[ $RELEASE_COUNT -eq 0 ]]; then
  echo -e "\n  ${GREEN}No packages have changes since their last release. Nothing to do.${NC}\n"
  exit 0
fi

echo -e "\n  ${BOLD}$RELEASE_COUNT package(s) to release, $SKIP_COUNT unchanged.${NC}"

if $DRY_RUN; then
  echo -e "\n  ${YELLOW}DRY RUN — no changes will be made${NC}\n"
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# Phase 0: Validate — build + test CHANGED packages BEFORE any mutations
# ─────────────────────────────────────────────────────────────────────────────

log "VALIDATE" "Building and testing changed packages (no files modified yet)..."

for i in $(seq 0 $((PKG_COUNT - 1))); do
  if [[ "${HAS_CHANGES[$i]}" == "false" ]]; then continue; fi

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

ok "All changed packages build and pass tests"

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
  if [[ "${HAS_CHANGES[$i]}" == "false" ]]; then continue; fi

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

log "REBUILD" "Rebuilding changed packages with updated versions..."

for i in $(seq 0 $((PKG_COUNT - 1))); do
  if [[ "${HAS_CHANGES[$i]}" == "false" ]]; then continue; fi

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

NPM_OTP_ARG=""
echo ""
read -p "  Does your npm account use 2FA? Enter OTP code (or press Enter to skip): " OTP_CODE
if [[ -n "$OTP_CODE" ]]; then
  NPM_OTP_ARG="--otp=$OTP_CODE"
fi

for i in $(seq 0 $((PKG_COUNT - 1))); do
  if [[ "${HAS_CHANGES[$i]}" == "false" ]]; then continue; fi

  dir="${PKG_DIRS[$i]}"
  name="${PKG_NAMES[$i]}"
  ver="${NEW_VERS[$i]}"
  cd "$ROOT_DIR/$dir"

  echo -ne "  Publishing $name@$ver..."
  if npm publish --access public $NPM_OTP_ARG > /tmp/chaim-pub-$$.log 2>&1; then
    echo -e " ${GREEN}✓${NC}"
  else
    echo -e " ${RED}✗${NC}"
    cat /tmp/chaim-pub-$$.log
    fail "$name@$ver publish failed — see errors above" "Common fixes:\n    - 'EOTP': 2FA is enabled. Re-run the script and enter a fresh OTP code.\n    - 'npm ERR! 403': version already exists on npm. Bump again or use a different version.\n    - 'npm ERR! 401': auth token expired. Run: npm login\n    - 'npm ERR! 402': scoped package requires paid plan or --access public."
  fi
done

# ─────────────────────────────────────────────────────────────────────────────
# Phase 4: Git commit + tag + push
# ─────────────────────────────────────────────────────────────────────────────

log "GIT" "Committing release..."

cd "$ROOT_DIR"

RELEASE_MSG="release:"
for i in $(seq 0 $((PKG_COUNT - 1))); do
  if [[ "${HAS_CHANGES[$i]}" == "true" ]]; then
    RELEASE_MSG+=" ${PKG_NAMES[$i]}@${NEW_VERS[$i]}"
  fi
done

git add -A

if [[ -n "$(git status --porcelain)" ]]; then
  git commit -m "$RELEASE_MSG"
else
  warn "No file changes to commit (versions may already match)"
fi

for i in $(seq 0 $((PKG_COUNT - 1))); do
  if [[ "${HAS_CHANGES[$i]}" == "false" ]]; then continue; fi
  tag="${PKG_NAMES[$i]}@${NEW_VERS[$i]}"
  tag="${tag//\//-}"
  git tag -a "$tag" -m "${PKG_NAMES[$i]}@${NEW_VERS[$i]}" 2>/dev/null || warn "Tag $tag already exists"
done

git push && git push --tags
ok "Pushed to origin with tags"

# ─────────────────────────────────────────────────────────────────────────────
# Done
# ─────────────────────────────────────────────────────────────────────────────

log "DONE" "Release complete!"
echo ""
for i in $(seq 0 $((PKG_COUNT - 1))); do
  if [[ "${HAS_CHANGES[$i]}" == "true" ]]; then
    echo -e "  ${GREEN}✓${NC} ${PKG_NAMES[$i]}@${NEW_VERS[$i]} ${GREEN}(published)${NC}"
  else
    echo -e "  ${CYAN}–${NC} ${PKG_NAMES[$i]}@${OLD_VERS[$i]} ${CYAN}(unchanged, skipped)${NC}"
  fi
done
echo ""
if [[ $RELEASE_COUNT -gt 0 ]]; then
  echo -e "  Consumers can update with:"
  echo -e "  ${CYAN}npm update @chaim-tools/chaim @chaim-tools/chaim-bprint-spec @chaim-tools/cdk-lib${NC}"
  echo ""
fi
