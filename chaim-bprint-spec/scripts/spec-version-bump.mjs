/**
 * spec-version-bump.mjs
 *
 * Bumps the bprint spec version. Detects rollbacks automatically by comparing
 * content hashes against previously recorded versions.
 *
 * Usage:
 *   node scripts/spec-version-bump.mjs          # defaults to minor
 *   node scripts/spec-version-bump.mjs minor    # 1.1 -> 1.2
 *   node scripts/spec-version-bump.mjs major    # 1.x -> 2.0
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const REGISTRY_PATH = 'spec-versions.json';
const SPEC_VERSION_TS_PATH = 'src/spec-version.ts';

async function computeContentHash(trackedFiles) {
  const contents = await Promise.all(
    trackedFiles.map(f => readFile(f, 'utf-8'))
  );
  return `sha256:${createHash('sha256').update(contents.join('\n---FILE-BOUNDARY---\n')).digest('hex')}`;
}

function bumpVersion(current, type) {
  const [major, minor] = current.split('.').map(Number);
  if (type === 'major') {
    return `${major + 1}.0`;
  }
  return `${major}.${minor + 1}`;
}

async function updateSpecVersionTs(registry) {
  let content = await readFile(SPEC_VERSION_TS_PATH, 'utf-8');

  // Update CURRENT_SPEC_VERSION
  content = content.replace(
    /export const CURRENT_SPEC_VERSION = '[^']+';/,
    `export const CURRENT_SPEC_VERSION = '${registry.current}';`
  );

  // Update SUPPORTED_SPEC_VERSIONS
  const versionsList = registry.versions
    .map(v => `'${v.specVersion}'`)
    .join(', ');
  content = content.replace(
    /export const SUPPORTED_SPEC_VERSIONS = \[.*\] as const;/,
    `export const SUPPORTED_SPEC_VERSIONS = [${versionsList}] as const;`
  );

  // Update MIN_SPEC_VERSION (first version in the list)
  const minVersion = registry.versions[0].specVersion;
  content = content.replace(
    /export const MIN_SPEC_VERSION = '[^']+';/,
    `export const MIN_SPEC_VERSION = '${minVersion}';`
  );

  await writeFile(SPEC_VERSION_TS_PATH, content, 'utf-8');
}

async function main() {
  const bumpType = process.argv[2] || 'minor';
  if (!['minor', 'major'].includes(bumpType)) {
    console.error(`Invalid bump type "${bumpType}". Use "minor" or "major".`);
    process.exit(1);
  }

  const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf-8'));
  const currentHash = await computeContentHash(registry.trackedFiles);

  // Check if content hash matches any previously recorded version (rollback detection)
  const matchingVersion = registry.versions.find(
    v => v.contentHash === currentHash
  );

  if (matchingVersion) {
    if (matchingVersion.specVersion === registry.current) {
      console.log(
        `No changes detected. Spec version ${registry.current} is already current.`
      );
      return;
    }

    // Rollback detected
    console.log(
      `Rollback detected: content hash matches previously recorded version ${matchingVersion.specVersion}.`
    );
    console.log(
      `Setting current spec version from ${registry.current} back to ${matchingVersion.specVersion}.`
    );
    registry.current = matchingVersion.specVersion;
  } else {
    // New content — bump version
    const newVersion = bumpVersion(registry.current, bumpType);
    const today = new Date().toISOString().split('T')[0];

    console.log(
      `Spec definition files changed. Bumping ${bumpType}: ${registry.current} -> ${newVersion}`
    );

    registry.versions.push({
      specVersion: newVersion,
      contentHash: currentHash,
      date: today,
      description: '',
    });
    registry.current = newVersion;
  }

  // Write updated registry
  await writeFile(
    REGISTRY_PATH,
    `${JSON.stringify(registry, null, 2)}\n`,
    'utf-8'
  );

  // Update src/spec-version.ts constants
  await updateSpecVersionTs(registry);

  console.log(`Updated spec-versions.json (current: ${registry.current})`);
  console.log(`Updated src/spec-version.ts`);
  console.log(`\nDone. Run "npm run build && npm test" to verify.`);
}

main().catch(err => {
  console.error('spec:bump failed:', err.message);
  process.exit(1);
});
