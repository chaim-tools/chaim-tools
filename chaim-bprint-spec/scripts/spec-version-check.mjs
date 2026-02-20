/**
 * spec-version-check.mjs
 *
 * Read-only script that verifies the spec definition files have not changed
 * without a corresponding spec version bump. Exits non-zero if a bump is needed.
 *
 * Usage: node scripts/spec-version-check.mjs
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const REGISTRY_PATH = 'spec-versions.json';

async function computeContentHash(trackedFiles) {
  const contents = await Promise.all(
    trackedFiles.map(f => readFile(f, 'utf-8'))
  );
  return `sha256:${createHash('sha256').update(contents.join('\n---FILE-BOUNDARY---\n')).digest('hex')}`;
}

async function main() {
  const registry = JSON.parse(await readFile(REGISTRY_PATH, 'utf-8'));
  const currentHash = await computeContentHash(registry.trackedFiles);

  const currentEntry = registry.versions.find(
    v => v.specVersion === registry.current
  );

  if (!currentEntry) {
    console.error(
      `ERROR: spec-versions.json references current="${registry.current}" but no matching entry exists.`
    );
    process.exit(1);
  }

  // If the stored hash is a seed value, skip the check (first run after setup)
  if (currentEntry.contentHash.startsWith('seed-')) {
    console.log(
      `spec:check — seed hash detected for ${registry.current}. Run "npm run spec:bump" to initialize hashes.`
    );
    return;
  }

  if (currentHash !== currentEntry.contentHash) {
    console.error(
      `ERROR: Spec definition files have changed since version ${registry.current} was recorded.`
    );
    console.error(`  Expected hash: ${currentEntry.contentHash}`);
    console.error(`  Current hash:  ${currentHash}`);
    console.error(`\nRun "npm run spec:bump" to bump the spec version.`);
    process.exit(1);
  }

  console.log(
    `spec:check — spec version ${registry.current} is up to date (hash matches).`
  );
}

main().catch(err => {
  console.error('spec:check failed:', err.message);
  process.exit(1);
});
