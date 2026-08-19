import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { detectWorkspace, scopeOfChangedFiles, nextActionFor, runPreflight, changedFilesFromStatus, formatSummary } from '../preflight.mjs';

async function communityFixture() {
  const root = await mkdtemp(join(tmpdir(), 'proofclip-preflight-'));
  await mkdir(join(root, 'release'), { recursive: true });
  await mkdir(join(root, 'extension/src'), { recursive: true });
  await mkdir(join(root, 'worker/migrations'), { recursive: true });
  await mkdir(join(root, '.github/workflows'), { recursive: true });
  await writeFile(join(root, 'release/edition-boundary.json'), '{"edition":"community"}\n');
  await writeFile(join(root, 'release/capability-manifest.json'), '{"schemaVersion":1}\n');
  await writeFile(join(root, 'extension/src/community-config.mjs'), 'export const ORIGIN = "https://replace-me.invalid";\n');
  await writeFile(join(root, 'extension/src/manifest.json'), '{"version":"0.8.0"}\n');
  await writeFile(join(root, 'worker/migrations/20260813_privacy_nonretention.sql'), '-- cleanup\n');
  await writeFile(join(root, 'release/export-community.mjs'), 'export const x = 1;\n');
  await writeFile(join(root, 'release/release-audit.mjs'), 'export const y = 1;\n');
  await writeFile(join(root, '.github/workflows/ci.yml'), 'name: ci\n');
  await writeFile(join(root, '.github/workflows/release-readiness.yml'), 'name: release-readiness\n');
  return root;
}

const goodGit = {
  currentBranch: async () => 'main',
  statusPorcelain: async () => ''
};

const goodSuites = () => ({ extension: { ok: true, pass: 1, fail: 0 }, worker: { ok: true, pass: 1, fail: 0 } });
const failingWorker = () => ({ extension: { ok: true, pass: 1, fail: 0 }, worker: { ok: false, pass: 0, fail: 3 } });

test('FLOW-01: a normal extension change passes FAST preflight', async () => {
  const root = await communityFixture();
  const report = await runPreflight({ mode: 'fast', repoRoot: root, gitImpl: goodGit, suitesImpl: goodSuites, changedFiles: ['extension/src/popup.js'] });
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.equal(report.nextAction.next, 'SAFE_TO_MERGE_TO_MAIN');
  assert.equal(report.workspace, 'community');
  await rm(root, { recursive: true, force: true });
});

test('FLOW-02: a failing Worker suite fails preflight with an actionable next action', async () => {
  const root = await communityFixture();
  const report = await runPreflight({ mode: 'standard', repoRoot: root, gitImpl: goodGit, suitesImpl: failingWorker });
  assert.equal(report.ok, false);
  assert.equal(report.nextAction.code, 'WORKER_TESTS_FAILED');
  assert.equal(report.nextAction.next, 'RUN_WORKER_TESTS_AND_FIX_BEFORE_MERGE');
  await rm(root, { recursive: true, force: true });
});

test('FLOW-03: an unknown workspace fails closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proofclip-nows-'));
  const report = await runPreflight({ mode: 'standard', repoRoot: root, gitImpl: goodGit, suitesImpl: goodSuites });
  assert.equal(report.ok, false);
  assert.equal(report.nextAction.code, 'WORKSPACE_IDENTITY_UNKNOWN');
  assert.ok(report.findings.some((f) => f.includes('WORKSPACE_IDENTITY_UNKNOWN')));
  await rm(root, { recursive: true, force: true });
});

test('FLOW-04: a leftover temporary worktree blocks release-ready with an actionable next action', async () => {
  const root = await communityFixture();
  const report = await runPreflight({
    mode: 'release-ready', repoRoot: root, gitImpl: goodGit,
    auditImpl: async () => ({ ok: false, findings: ['worktree governance: TEMPORARY worktree remains; housekeep before release-ready'] })
  });
  assert.equal(report.ok, false);
  assert.equal(report.nextAction.code, 'WORKTREE_BLOCKER');
  assert.equal(report.nextAction.next, 'HOUSEKEEP_TEMPORARY_WORKTREES');
  await rm(root, { recursive: true, force: true });
});

test('FLOW-05: correct main with green tests passes STANDARD preflight', async () => {
  const root = await communityFixture();
  const report = await runPreflight({
    mode: 'standard', repoRoot: root, gitImpl: goodGit, suitesImpl: goodSuites,
    capImpl: async () => ({ ok: true, findings: [], skipped: false, report: null }),
    scanImpl: async () => ({ ok: true, findings: [], fileCount: 0 })
  });
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.equal(report.nextAction.next, 'SAFE_TO_MERGE_TO_MAIN');
  await rm(root, { recursive: true, force: true });
});

test('FLOW-06: correct Community baseline/parity passes release-ready orchestration', async () => {
  const root = await communityFixture();
  const report = await runPreflight({
    mode: 'release-ready', repoRoot: root, gitImpl: goodGit,
    auditImpl: async () => ({ ok: true, releaseReady: true, findings: [] })
  });
  assert.equal(report.ok, true);
  assert.equal(report.nextAction.next, 'MAINTAINER_FINAL_RELEASE_APPROVAL');
  assert.equal(report.checks.releaseReady, true);
  await rm(root, { recursive: true, force: true });
});

test('FLOW-07: preflight and CI compose the same authoritative implementations (no re-implementation)', async () => {
  const { readFile } = await import('node:fs/promises');
  const preflight = await readFile(new URL('../preflight.mjs', import.meta.url), 'utf8');
  const ciGates = await readFile(new URL('../ci-release-gates.mjs', import.meta.url), 'utf8');
  const audit = await readFile(new URL('../release-audit.mjs', import.meta.url), 'utf8');
  for (const moduleName of ['capability-audit.mjs', 'verify-generated-tree.mjs']) {
    assert.ok(preflight.includes(moduleName), 'preflight must import ' + moduleName);
    assert.ok(audit.includes(moduleName), 'release-audit must import ' + moduleName);
  }
  assert.ok(preflight.includes("from './release-audit.mjs'"), 'preflight composes release-audit exports');
  assert.ok(ciGates.includes("versionTagPolicy } from './release-audit.mjs'"), 'CI reuses the audit tag policy');
  assert.ok(ciGates.includes("verifyClonedTree } from './verify-cloned-tree.mjs'"), 'CI reuses the clone smoke verifier');
});

test('FLOW-08: a README-only change runs FAST without heavy product suites', async () => {
  const root = await communityFixture();
  let suitesCalled = 0;
  const spySuites = () => { suitesCalled += 1; return goodSuites(); };
  const report = await runPreflight({ mode: 'fast', repoRoot: root, gitImpl: goodGit, suitesImpl: spySuites, changedFiles: ['README.md'] });
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.equal(suitesCalled, 0, 'product suites must not run for a README-only change');
  assert.equal(report.checks.suitesRan, false);
  await rm(root, { recursive: true, force: true });
});

test('detectWorkspace distinguishes community, commercial and unknown', async () => {
  const community = await communityFixture();
  assert.equal(detectWorkspace(community), 'community');
  const commercial = await mkdtemp(join(tmpdir(), 'proofclip-commercial-'));
  await mkdir(join(commercial, 'projects/service/P-proofclip-api/src'), { recursive: true });
  assert.equal(detectWorkspace(commercial), 'commercial');
  assert.equal(detectWorkspace(join(tmpdir(), 'definitely-missing-' + Date.now())), null);
  await rm(community, { recursive: true, force: true });
  await rm(commercial, { recursive: true, force: true });
});

test('scopeOfChangedFiles and changedFilesFromStatus work', () => {
  assert.deepEqual([...scopeOfChangedFiles(['extension/src/popup.js', 'README.md', 'worker/src/worker.mjs'])].sort(), ['docs', 'extension', 'worker']);
  assert.deepEqual(changedFilesFromStatus(' M extension/src/popup.js\n?? release/new.mjs\n'), ['extension/src/popup.js', 'release/new.mjs']);
  assert.equal(changedFilesFromStatus(null), null);
});

test('nextActionFor maps known blockers to actionable codes', () => {
  assert.equal(nextActionFor(['worktree is dirty; commit or stash before release review']).code, 'WORKING_TREE_DIRTY');
  assert.equal(nextActionFor(['DEFAULT_BRANCH_SOURCE_MISMATCH: default branch is dev']).next, 'INTEGRATE_ACCEPTED_RUNTIME_CHANGES_INTO_MAIN_BEFORE_RELEASE');
  assert.equal(nextActionFor(['some unknown error']).code, 'UNKNOWN_FAILURE');
});

test('formatSummary is a readable one-screen status', () => {
  const text = formatSummary({ ok: true, workspace: 'community', version: '0.8.0', mode: 'standard', branch: 'main', nextAction: { code: 'PREFLIGHT_PASS', next: 'SAFE_TO_MERGE_TO_MAIN' } });
  assert.ok(text.includes('PROOFCLIP ENGINEERING STATUS'));
  assert.ok(text.includes('PREFLIGHT: PASS'));
  assert.ok(text.includes('NEXT_ACTION: SAFE_TO_MERGE_TO_MAIN'));
});