// DEFAULT_CLONE_SMOKE_TEST (spec 7/13): a fresh `git clone <repository>`
// without --branch/tag/ref must yield the current public version on main.
// Pure verification lives in verifyClonedTree (filesystem only, testable
// without git); the CLI performs the real clone and then verifies it.
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export function verifyClonedTree(cloneDir, { expectedVersion = '0.8.0' } = {}) {
  const findings = [];
  const has = (rel) => existsSync(join(cloneDir, rel));

  // Version identity: manifest must match the target version.
  const manifestPath = join(cloneDir, 'extension/src/manifest.json');
  if (!has('extension/src/manifest.json')) findings.push('manifest.json missing in the fresh clone');
  else {
    try {
      const version = JSON.parse(readFileSync(manifestPath, 'utf8')).version;
      if (version !== expectedVersion) findings.push('DEFAULT_CLONE_SOURCE_MISMATCH: cloned manifest version ' + version + ' != expected ' + expectedVersion);
    } catch { findings.push('manifest.json in the fresh clone is not valid JSON'); }
  }

  // Version-specific discriminators: 0.8 files present...
  for (const rel of [
    'extension/src/core/page-structure.mjs',
    'extension/src/core/site-readable-adapters.mjs',
    'worker/migrations/20260813_privacy_nonretention.sql',
    'release/export-community.mjs',
    'release/release-audit.mjs',
    '.github/workflows/ci.yml',
    '.github/workflows/release-readiness.yml'
  ]) {
    if (!has(rel)) findings.push('fresh clone is missing expected file: ' + rel);
  }

  // ...and the old-version discriminator (200k truncation) is absent.
  if (has('extension/src/core/record.mjs')) {
    const recordSource = readFileSync(join(cloneDir, 'extension/src/core/record.mjs'), 'utf8');
    if (recordSource.includes('MAX_CAPTURE_CHARS')) findings.push('fresh clone still contains the 0.7 truncation discriminator');
  } else {
    findings.push('fresh clone is missing extension/src/core/record.mjs');
  }

  return { ok: findings.length === 0, findings };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === import.meta.url ? true : false;
if (process.argv[1] && resolve(process.argv[1]) === new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')) {
  const args = process.argv.slice(2);
  const remote = args.find((a) => a.startsWith('--remote='))?.split('=').slice(1).join('=');
  const dirArg = args.find((a) => a.startsWith('--dir='))?.split('=').slice(1).join('=');
  const version = args.find((a) => a.startsWith('--version='))?.split('=')[1] || '0.8.0';
  const recordMode = args.includes('--record');

  let cloneDir = dirArg;
  let created = false;
  if (!cloneDir) {
    if (!remote) { console.error('usage: node release/verify-cloned-tree.mjs --remote <url> [--dir <path>] [--version <v>] [--record]'); process.exit(2); }
    cloneDir = await mkdtemp(join(tmpdir(), 'proofclip-clone-smoke-'));
    created = true;
    try {
      execFileSync('git', ['clone', remote, cloneDir], { stdio: ['ignore', 'inherit', 'ignore'] });
    } catch (error) {
      console.error('git clone failed: ' + (error?.message || String(error)));
      process.exit(1);
    }
  }

  const result = verifyClonedTree(cloneDir, { expectedVersion: version });
  for (const finding of result.findings) console.log('FINDING: ' + finding);
  console.log('DEFAULT_CLONE_SMOKE_TEST: ' + (result.ok ? 'PASS (fresh clone yields ' + version + ' on main)' : 'FAIL'));

  if (recordMode && result.ok) {
    const { readFile, writeFile } = await import('node:fs/promises');
    const recordFile = join(process.cwd(), 'release/records/release-record.json');
    const record = JSON.parse(await readFile(recordFile, 'utf8'));
    record.cloneSmoke = { version, ok: true, passedAt: new Date().toISOString(), clonedFrom: remote || '(dir verification)', findings: [] };
    await writeFile(recordFile, JSON.stringify(record, null, 2) + '\n', 'utf8');
    console.log('clone smoke recorded into release/records/release-record.json');
  }

  if (created) await rm(cloneDir, { recursive: true, force: true }).catch(() => {});
  process.exit(result.ok ? 0 : 1);
}
