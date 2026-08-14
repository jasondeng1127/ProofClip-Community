import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { computeWorkspaceFingerprint, provenanceMatch } from '../cut-release.mjs';
import { releaseAudit } from '../release-audit.mjs';

async function fakeRepo() {
  const root = await mkdtemp(join(tmpdir(), 'proofclip-audit-'));
  await mkdir(join(root, 'extension/src'), { recursive: true });
  await mkdir(join(root, 'worker/src'), { recursive: true });
  await mkdir(join(root, 'worker/scripts'), { recursive: true });
  await writeFile(join(root, 'extension/src/manifest.json'), '{"version":"0.8.0"}\n');
  await writeFile(join(root, 'worker/src/worker.mjs'), 'export default {};\n');
  return root;
}

test('workspace fingerprint is stable and changes when source changes', async () => {
  const root = await fakeRepo();
  const first = await computeWorkspaceFingerprint(root);
  const second = await computeWorkspaceFingerprint(root);
  assert.equal(first, second);
  await writeFile(join(root, 'extension/src/manifest.json'), '{"version":"0.8.0","x":1}\n');
  const third = await computeWorkspaceFingerprint(root);
  assert.notEqual(third, first);
  await rm(root, { recursive: true, force: true });
});

test('audit fails when the current release record is missing', async () => {
  const root = await fakeRepo();
  const summary = await releaseAudit({ repoRoot: root, recordsDir: join(root, 'records'), provenanceFile: join(root, 'PROVENANCE.json') });
  assert.equal(summary.ok, false);
  assert.ok(summary.findings.some((f) => f.includes('release record missing')));
  await rm(root, { recursive: true, force: true });
});

test('audit flags an artifact sha256 mismatch', async () => {
  const root = await fakeRepo();
  const records = join(root, 'records');
  await mkdir(records, { recursive: true });
  const artifactPath = 'release/artifacts/fake.zip';
  await mkdir(join(root, 'release/artifacts'), { recursive: true });
  await writeFile(join(root, artifactPath), 'not-the-real-artifact');
  const record = {
    schemaVersion: 1,
    version: '0.8.0',
    state: 'STAGED',
    createdAt: new Date().toISOString(),
    artifact: { path: artifactPath, sha256: 'f'.repeat(64), bundleSha256: 'e'.repeat(64) },
    sourceBinding: { commit: null, workspaceFingerprint: 'x', provenanceFileSha256: 'y', provenanceMatch: { ok: true, checked: 0, mismatches: 0, missing: 0 } },
    gates: {},
    rehearsals: { freshDeploy: 'NOT_RUN', upgrade07To08: 'NOT_RUN' }
  };
  await writeFile(join(records, 'release-record.json'), JSON.stringify(record));
  const summary = await releaseAudit({ repoRoot: root, recordsDir: records, provenanceFile: join(root, 'PROVENANCE.json') });
  assert.equal(summary.ok, false);
  assert.ok(summary.findings.some((f) => f.includes('artifact sha256 mismatch')));
  assert.ok(summary.findings.some((f) => f.includes('STALE')));
  await rm(root, { recursive: true, force: true });
});

test('provenanceMatch detects a drifted product file', async () => {
  const root = await fakeRepo();
  await mkdir(join(root, 'release/out/community-0.8.0'), { recursive: true });
  await writeFile(join(root, 'release/out/community-0.8.0/PROVENANCE.json'), JSON.stringify({
    files: [{ path: 'extension/src/manifest.json', sha256: 'a'.repeat(64), source: 'overlay' }]
  }));
  const match = await provenanceMatch(root, join(root, 'release/out/community-0.8.0/PROVENANCE.json'));
  assert.equal(match.ok, false);
  assert.equal(match.mismatches, 1);
  await rm(root, { recursive: true, force: true });
});
const FAKE_HEAD = 'abcdef0123456789abcdef0123456789abcdef01';
const fakeGit = (overrides = {}) => ({
  revParse: async () => FAKE_HEAD,
  statusPorcelain: async () => '',
  tagsAtHead: async () => 'v0.8.0-community-rc1',
  ...overrides
});

function baseRecord(root, overrides = {}) {
  return {
    schemaVersion: 1,
    version: '0.8.0',
    state: 'STAGED',
    createdAt: new Date().toISOString(),
    artifact: { path: 'release/artifacts/fake.zip', sha256: 'a'.repeat(64), bundleSha256: 'b'.repeat(64) },
    sourceBinding: { commit: FAKE_HEAD, workspaceFingerprint: 'x', provenanceFileSha256: 'y', provenanceMatch: { ok: true, checked: 0, mismatches: 0, missing: 0 } },
    gates: {},
    rehearsals: { freshDeploy: 'PASS', upgrade07To08: 'PASS' },
    ...overrides
  };
}

async function setupRecord(root, record) {
  const records = join(root, 'records');
  await mkdir(records, { recursive: true });
  await mkdir(join(root, 'release/artifacts'), { recursive: true });
  await writeFile(join(root, 'release/artifacts/fake.zip'), 'artifact-bytes');
  await writeFile(join(records, 'release-record.json'), JSON.stringify(record));
}

test('Luna-01: a fake non-empty commit in the record fails the audit', async () => {
  const root = await fakeRepo();
  await setupRecord(root, baseRecord(root, { sourceBinding: { commit: 'deadbeef-not-a-real-head', workspaceFingerprint: 'x', provenanceFileSha256: 'y' } }));
  const summary = await releaseAudit({ repoRoot: root, recordsDir: join(root, 'records'), provenanceFile: join(root, 'PROVENANCE.json'), gitImpl: fakeGit() });
  assert.equal(summary.ok, false);
  assert.ok(summary.findings.some((f) => f.includes('!= HEAD')));
  await rm(root, { recursive: true, force: true });
});

test('Luna-02: manifest version drift fails the audit even when fingerprints are synced', async () => {
  const root = await fakeRepo();
  await setupRecord(root, baseRecord(root));
  await writeFile(join(root, 'extension/src/manifest.json'), '{"version":"9.9.9"}\n');
  const summary = await releaseAudit({ repoRoot: root, recordsDir: join(root, 'records'), provenanceFile: join(root, 'PROVENANCE.json'), gitImpl: fakeGit() });
  assert.equal(summary.ok, false);
  assert.ok(summary.findings.some((f) => f.includes('manifest version')));
  await rm(root, { recursive: true, force: true });
});

test('Luna-03: a forged provenanceFileSha256 in the record fails the audit', async () => {
  const root = await fakeRepo();
  await mkdir(join(root, 'release/out/community-0.8.0'), { recursive: true });
  await writeFile(join(root, 'release/out/community-0.8.0/PROVENANCE.json'), JSON.stringify({ files: [] }));
  await setupRecord(root, baseRecord(root, { sourceBinding: { commit: FAKE_HEAD, workspaceFingerprint: 'x', provenanceFileSha256: 'forged'.padEnd(64, '0') } }));
  const summary = await releaseAudit({ repoRoot: root, recordsDir: join(root, 'records'), provenanceFile: join(root, 'release/out/community-0.8.0/PROVENANCE.json'), gitImpl: fakeGit() });
  assert.equal(summary.ok, false);
  assert.ok(summary.findings.some((f) => f.includes('provenanceFileSha256')));
  await rm(root, { recursive: true, force: true });
});

test('Luna-04: a dirty worktree fails the audit', async () => {
  const root = await fakeRepo();
  await setupRecord(root, baseRecord(root));
  const summary = await releaseAudit({ repoRoot: root, recordsDir: join(root, 'records'), provenanceFile: join(root, 'PROVENANCE.json'), gitImpl: fakeGit({ statusPorcelain: async () => ' M extension/src/manifest.json' }) });
  assert.equal(summary.ok, false);
  assert.ok(summary.findings.some((f) => f.includes('dirty')));
  await rm(root, { recursive: true, force: true });
});

test('Luna-05: NOT_RUN rehearsals keep release-ready false even when auto gates pass', async () => {
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const root = await fakeRepo();
  // Minimal boundary with no required files for the repo scan.
  const boundaryFile = join(root, 'boundary.json');
  await writeFile(boundaryFile, JSON.stringify({ schemaVersion: 1, edition: 'community', targetVersion: '0.8.0', upstream: { pin: { commit: 'x', fingerprint: 'y' } }, roots: [], exclusions: {}, communityOwnedTopLevel: [], requiredFiles: [], transforms: {}, forbiddenTokens: ['subscription', 'quota'], forbiddenPathPatterns: [] }));
  // Bundle script that writes a deterministic bundle.
  await mkdir(join(root, 'worker/scripts'), { recursive: true });
  await writeFile(join(root, 'worker/scripts/bundle-worker.mjs'), "import { mkdir, writeFile } from 'node:fs/promises'; await mkdir(new URL('../dist', import.meta.url), { recursive: true }); await writeFile(new URL('../dist/worker.mjs', import.meta.url), 'bundle-content');\n");
  execFileSync(process.execPath, [join(root, 'worker/scripts/bundle-worker.mjs')], { cwd: join(root, 'worker'), stdio: 'pipe' });
  const bundleSha = createHash('sha256').update('bundle-content').digest('hex');
  // Real zip artifact containing the bundle.
  const artifactDir = join(root, 'release/artifacts');
  await mkdir(artifactDir, { recursive: true });
  const zipPath = join(artifactDir, 'fake.zip');
  execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', root, 'worker/dist/worker.mjs'], { stdio: 'pipe' });
  const artifactSha = createHash('sha256').update(await import('node:fs/promises').then((fs) => fs.readFile(zipPath))).digest('hex');
  // Provenance file with actual sha.
  const provDir = join(root, 'release/out/community-0.8.0');
  await mkdir(provDir, { recursive: true });
  const provFile = join(provDir, 'PROVENANCE.json');
  await writeFile(provFile, JSON.stringify({ files: [] }));
  const provSha = createHash('sha256').update(await import('node:fs/promises').then((fs) => fs.readFile(provFile))).digest('hex');
  const fingerprint = await computeWorkspaceFingerprint(root);
  const records = join(root, 'records');
  await mkdir(records, { recursive: true });
  await writeFile(join(records, 'release-record.json'), JSON.stringify({
    schemaVersion: 1, version: '0.8.0', state: 'STAGED', createdAt: new Date().toISOString(),
    artifact: { path: 'release/artifacts/fake.zip', sha256: artifactSha, bundleSha256: bundleSha, entries: ['worker/dist/worker.mjs'], contentFingerprint: createHash('sha256').update('worker/dist/worker.mjs:' + createHash('sha256').update('bundle-content').digest('hex')).digest('hex') },
    sourceBinding: { commit: FAKE_HEAD, workspaceFingerprint: fingerprint, provenanceFileSha256: provSha, provenanceMatch: { ok: true, checked: 0, mismatches: 0, missing: 0 } },
    gates: {}, rehearsals: { freshDeploy: 'NOT_RUN', upgrade07To08: 'NOT_RUN' }
  }));
  const summary = await releaseAudit({ repoRoot: root, recordsDir: records, provenanceFile: provFile, gitImpl: fakeGit(), boundaryFile });
  assert.equal(summary.ok, true, JSON.stringify(summary.findings));
  assert.equal(summary.releaseReady, false);
  assert.equal(summary.gates.rehearsalsComplete, false);
  await rm(root, { recursive: true, force: true });
});

test('Luna-06: git unavailable is fail-closed (commit gate fails, never passes)', async () => {
  const root = await fakeRepo();
  await setupRecord(root, baseRecord(root));
  const summary = await releaseAudit({ repoRoot: root, recordsDir: join(root, 'records'), provenanceFile: join(root, 'PROVENANCE.json'), gitImpl: { revParse: async () => null, statusPorcelain: async () => null, tagsAtHead: async () => null } });
  assert.equal(summary.ok, false);
  assert.ok(summary.findings.some((f) => f.includes('git unavailable')));
  await rm(root, { recursive: true, force: true });
});
test('Luna-07: an extra entry inside the ZIP fails the audit even with a recomputed sha256', async () => {
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const root = await fakeRepo();
  const boundaryFile = join(root, 'boundary.json');
  await writeFile(boundaryFile, JSON.stringify({ schemaVersion: 1, edition: 'community', targetVersion: '0.8.0', upstream: { pin: { commit: 'x', fingerprint: 'y' } }, roots: [], exclusions: {}, communityOwnedTopLevel: [], requiredFiles: [], transforms: {}, forbiddenTokens: ['subscription', 'quota'], forbiddenPathPatterns: [] }));
  await mkdir(join(root, 'worker/scripts'), { recursive: true });
  await writeFile(join(root, 'worker/scripts/bundle-worker.mjs'), "import { mkdir, writeFile } from 'node:fs/promises'; await mkdir(new URL('../dist', import.meta.url), { recursive: true }); await writeFile(new URL('../dist/worker.mjs', import.meta.url), 'bundle-content');\n");
  execFileSync(process.execPath, [join(root, 'worker/scripts/bundle-worker.mjs')], { cwd: join(root, 'worker'), stdio: 'pipe' });
  const bundleSha = createHash('sha256').update('bundle-content').digest('hex');
  const artifactDir = join(root, 'release/artifacts');
  await mkdir(artifactDir, { recursive: true });
  const zipPath = join(artifactDir, 'fake.zip');
  execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', root, 'worker/dist/worker.mjs'], { stdio: 'pipe' });
  const provDir = join(root, 'release/out/community-0.8.0');
  await mkdir(provDir, { recursive: true });
  const provFile = join(provDir, 'PROVENANCE.json');
  await writeFile(provFile, JSON.stringify({ files: [] }));
  const provSha = createHash('sha256').update(await import('node:fs/promises').then((fs) => fs.readFile(provFile))).digest('hex');
  const fingerprint = await computeWorkspaceFingerprint(root);
  const records = join(root, 'records');
  await mkdir(records, { recursive: true });
  // Record with a packaging manifest that lists ONE entry.
  const artifactSha = createHash('sha256').update(await import('node:fs/promises').then((fs) => fs.readFile(zipPath))).digest('hex');
  await writeFile(join(records, 'release-record.json'), JSON.stringify({
    schemaVersion: 1, version: '0.8.0', state: 'STAGED', createdAt: new Date().toISOString(),
    artifact: { path: 'release/artifacts/fake.zip', sha256: artifactSha, bundleSha256: bundleSha, entries: ['worker/dist/worker.mjs'], contentFingerprint: 'old-fp' },
    sourceBinding: { commit: FAKE_HEAD, workspaceFingerprint: fingerprint, provenanceFileSha256: provSha, provenanceMatch: { ok: true, checked: 0, mismatches: 0, missing: 0 } },
    gates: {}, rehearsals: { freshDeploy: 'PASS', upgrade07To08: 'PASS' }
  }));
  // Pack script accidentally adds an extra entry; the sha256 is recomputed and
  // the record updated accordingly (this is the realistic "pack bug" scenario).
  await writeFile(join(root, 'worker/EXTRA.txt'), 'accidental extra file');
  execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', root, 'worker/dist/worker.mjs', 'worker/EXTRA.txt'], { stdio: 'pipe' });
  const newSha = createHash('sha256').update(await import('node:fs/promises').then((fs) => fs.readFile(zipPath))).digest('hex');
  const record2 = JSON.parse(await import('node:fs/promises').then((fs) => fs.readFile(join(records, 'release-record.json'))));
  record2.artifact.sha256 = newSha;
  await import('node:fs/promises').then((fs) => fs.writeFile(join(records, 'release-record.json'), JSON.stringify(record2)));
  const summary = await releaseAudit({ repoRoot: root, recordsDir: records, provenanceFile: provFile, gitImpl: fakeGit(), boundaryFile });
  assert.equal(summary.ok, false, 'audit must fail on the entry-set drift');
  assert.ok(summary.findings.some((f) => f.includes('ZIP entry set differs')));
  await rm(root, { recursive: true, force: true });
});

test('Luna-08: an arbitrary tag never satisfies the release-ready tag policy', async () => {
  const root = await fakeRepo();
  await setupRecord(root, baseRecord(root, { rehearsals: { freshDeploy: { result: 'PASS', executedAt: 't', executor: 'j', environment: 'e', evidence: 'x', sourceCommit: FAKE_HEAD, artifactSha256: 'a'.repeat(64) }, upgrade07To08: { result: 'PASS', executedAt: 't', executor: 'j', environment: 'e', evidence: 'x', sourceCommit: FAKE_HEAD, artifactSha256: 'a'.repeat(64) } } }));
  const summary = await releaseAudit({ repoRoot: root, recordsDir: join(root, 'records'), provenanceFile: join(root, 'PROVENANCE.json'), gitImpl: fakeGit({ tagsAtHead: async () => 'arbitrary-tag' }), requireReleaseReady: true });
  assert.equal(summary.ok, false);
  assert.ok(summary.findings.some((f) => f.includes('release tag matching policy')));
  await rm(root, { recursive: true, force: true });
});

test('Luna-09: release-ready requires rehearsal evidence and a policy tag; both present passes', async () => {
  const root = await fakeRepo();
  await setupRecord(root, baseRecord(root, { rehearsals: { freshDeploy: { result: 'PASS', executedAt: 't', executor: 'j', environment: 'e', evidence: 'x', sourceCommit: FAKE_HEAD, artifactSha256: 'a'.repeat(64) }, upgrade07To08: { result: 'PASS', executedAt: 't', executor: 'j', environment: 'e', evidence: 'x', sourceCommit: FAKE_HEAD, artifactSha256: 'a'.repeat(64) } } }));
  const summary = await releaseAudit({ repoRoot: root, recordsDir: join(root, 'records'), provenanceFile: join(root, 'PROVENANCE.json'), gitImpl: fakeGit({ tagsAtHead: async () => 'v0.8.0-rc1' }), requireReleaseReady: true });
  assert.equal(summary.ok, false, 'auto gates still fail on the minimal fixture (artifact/sha/fingerprint) - only release-ready additions are asserted here');
  assert.ok(!summary.findings.some((f) => f.includes('release tag matching policy')), 'tag policy must accept v0.8.0-rc1');
  assert.ok(!summary.findings.some((f) => f.includes('rehearsal lacks')), 'full rehearsal evidence must be accepted');
  await rm(root, { recursive: true, force: true });
});