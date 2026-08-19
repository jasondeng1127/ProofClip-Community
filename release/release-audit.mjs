// release-audit (Community B3, fail-closed, mainline-governed).
// Automatic gates cover record/artifact/source/commit/dirty/bundle/zip and the
// DEFAULT_BRANCH_RELEASE_ALIGNMENT family. --release-ready additionally
// requires full rehearsal evidence, a version-policy tag whose commit descends
// from main, a recorded DEFAULT_CLONE_SMOKE_TEST, README asset integrity,
// worktree housekeeping, and (one-version-lag) capability parity with the
// frozen Commercial baseline. Fingerprint-only identity is never sufficient.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyGeneratedTree } from './verify-generated-tree.mjs';
import { computeWorkspaceFingerprint, provenanceMatch } from './cut-release.mjs';
import { capabilityAudit } from './capability-audit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BOUNDARY = join(HERE, 'edition-boundary.json');
const RECORDS = join(HERE, 'records');
const CANONICAL_PROVENANCE = join(HERE, 'provenance', 'community-0.8.0.json');
const DEFAULT_CAPABILITY_MANIFEST = join(HERE, 'capability-manifest.json');

const tailName = (s) => String(s).trim().split('/').pop();

export const defaultGit = {
  revParse(repoRoot, ref = 'HEAD') { try { return execFileSync('git', ['-C', repoRoot, 'rev-parse', ref], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } },
  statusPorcelain(repoRoot) { try { return execFileSync('git', ['-C', repoRoot, 'status', '--porcelain'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return null; } },
  tagsAtHead(repoRoot) { try { return execFileSync('git', ['-C', repoRoot, 'tag', '--points-at', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } },
  currentBranch(repoRoot) { try { return execFileSync('git', ['-C', repoRoot, 'branch', '--show-current'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } },
  remoteDefaultBranch(repoRoot) { try { return tailName(execFileSync('git', ['-C', repoRoot, 'symbolic-ref', 'refs/remotes/origin/HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch { return null; } },
  isAncestor(repoRoot, ancestor, descendant) { try { execFileSync('git', ['-C', repoRoot, 'merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' }); return true; } catch { return false; } },
  hasFile(repoRoot, ref, path) { try { execFileSync('git', ['-C', repoRoot, 'cat-file', '-e', ref + ':' + path], { stdio: 'ignore' }); return true; } catch { return false; } },
  showFile(repoRoot, ref, path) { try { return execFileSync('git', ['-C', repoRoot, 'show', ref + ':' + path], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return null; } },
  listWorktrees(repoRoot) { try { return execFileSync('git', ['-C', repoRoot, 'worktree', 'list', '--porcelain'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return null; } }
};

// Tag policy shared by the audit, preflight and CI (one implementation).
export function versionTagPolicy(version) {
  return new RegExp('^v' + String(version).replace(/\./g, '\\.') + '(?:-rc\\d+)?$');
}

// Classify `git worktree list --porcelain` output (spec 11).
export function analyzeWorktrees(porcelain) {
  if (!porcelain) return [];
  const blocks = porcelain.split(/\r?\n\n+/).filter((b) => b.trim());
  return blocks.map((block) => {
    const path = block.match(/^worktree (.+)$/m)?.[1] || null;
    const branchLine = block.match(/^branch refs\/heads\/(.+)$/m)?.[1] || null;
    const detached = /^detached$/m.test(block);
    let category;
    if (branchLine === 'main') category = 'ACTIVE_REQUIRED';
    else if (branchLine && /^(codex|feature|fix|audit|release)\//.test(branchLine)) category = 'TEMPORARY';
    else if (detached) category = 'TEMPORARY';
    else category = 'UNKNOWN';
    return { path, branch: branchLine, detached, category };
  });
}

// README is presentation, not runtime identity (spec 8/13). Verify that every
// relative reference inside README.md resolves to a file in the repository.
export function readmeAssetFindings(repoRoot) {
  const findings = [];
  const readmePath = join(repoRoot, 'README.md');
  if (!existsSync(readmePath)) return findings;
  let content;
  try { content = readFileSync(readmePath, 'utf8'); } catch { return ['README.md could not be read']; }
  const refs = [...content.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|#)/.test(ref)) continue;
    const clean = ref.split('#')[0].split('?')[0].trim();
    if (!clean) continue;
    if (!existsSync(resolve(repoRoot, clean))) findings.push('README references missing asset: ' + clean);
  }
  return findings;
}

async function sha256OfFile(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function releaseAudit({ repoRoot = ROOT, recordsDir = RECORDS, includeTests = false, provenanceFile = CANONICAL_PROVENANCE, gitImpl = defaultGit, boundaryFile = BOUNDARY, requireReleaseReady = false, capabilityManifest = DEFAULT_CAPABILITY_MANIFEST } = {}) {
  const gates = {};
  const findings = [];

  gates.record = (await stat(join(recordsDir, 'release-record.json')).then(() => true).catch(() => false));
  if (!gates.record) findings.push('current release record missing: ' + join(recordsDir, 'release-record.json'));

  let record = null;
  if (gates.record) {
    try { record = JSON.parse(await readFile(join(recordsDir, 'release-record.json'), 'utf8')); }
    catch { gates.record = false; findings.push('release record is not valid JSON'); }
  }

  if (record) {
    gates.recordSchema = record.schemaVersion === 1;
    if (!gates.recordSchema) findings.push('release record schemaVersion mismatch');

    const artifactAbs = join(repoRoot, record.artifact.path);
    const artifactExists = await stat(artifactAbs).then(() => true).catch(() => false);
    gates.artifactExists = artifactExists;
    if (!artifactExists) findings.push('artifact missing: ' + record.artifact.path);
    if (artifactExists) {
      gates.artifactShaMatches = (await sha256OfFile(artifactAbs)) === record.artifact.sha256;
      if (!gates.artifactShaMatches) findings.push('artifact sha256 mismatch');
      gates.artifactBundleMatches = false;
      gates.zipEntriesMatch = false;
      gates.zipContentFingerprint = false;
      try {
        const extracted = execFileSync('tar', ['-xOf', artifactAbs, 'worker/dist/worker.mjs'], { stdio: ['ignore', 'pipe', 'ignore'] });
        gates.artifactBundleMatches = createHash('sha256').update(extracted).digest('hex') === record.artifact.bundleSha256;
        if (!gates.artifactBundleMatches) findings.push('bundle inside the artifact does not match the record bundleSha256');
      } catch { findings.push('could not verify the bundle inside the artifact (tar unavailable or path missing)'); }
      try {
        const listing = execFileSync('tar', ['-tf', artifactAbs], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
        const actualEntries = listing.split(/\r?\n/).filter(Boolean).map((e) => e.replace(/\/$/, '')).sort();
        const expectedEntries = Array.isArray(record.artifact.entries) ? [...record.artifact.entries].sort() : null;
        gates.zipEntriesMatch = expectedEntries !== null && JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
        if (!gates.zipEntriesMatch) findings.push('ZIP entry set differs from the recorded packaging manifest');
        const hashes = [];
        for (const entry of actualEntries) {
          try {
            const data = execFileSync('tar', ['-xOf', artifactAbs, entry], { stdio: ['ignore', 'pipe', 'ignore'] });
            hashes.push(entry + ':' + createHash('sha256').update(data).digest('hex'));
          } catch { hashes.push(entry + ':UNREADABLE'); }
        }
        const fingerprint = createHash('sha256').update(hashes.join('\n')).digest('hex');
        gates.zipContentFingerprint = Boolean(record.artifact.contentFingerprint) && fingerprint === record.artifact.contentFingerprint;
        if (!gates.zipContentFingerprint) findings.push('ZIP content fingerprint differs from the record');
      } catch { findings.push('ZIP verification failed (tar unavailable or corrupt archive)'); }
    }

    const fingerprint = await computeWorkspaceFingerprint(repoRoot);
    gates.sourceFingerprintMatches = fingerprint === record.sourceBinding.workspaceFingerprint;
    if (!gates.sourceFingerprintMatches) findings.push('STALE: workspace fingerprint differs from the release record');

    const match = await provenanceMatch(repoRoot, provenanceFile).catch(() => ({ checked: 0, mismatches: 0, missing: 0, ok: false }));
    gates.provenanceMatch = match.ok;
    if (!match.ok) findings.push('provenance mismatch: ' + match.mismatches + ' changed / ' + match.missing + ' missing');

    gates.provenanceFileShaMatches = (await sha256OfFile(provenanceFile).catch(() => null)) === record.sourceBinding.provenanceFileSha256;
    if (!gates.provenanceFileShaMatches) findings.push('record provenanceFileSha256 does not match the actual PROVENANCE.json');

    gates.manifestVersionMatches = false;
    try {
      const manifest = JSON.parse(await readFile(join(repoRoot, 'extension/src/manifest.json'), 'utf8'));
      gates.manifestVersionMatches = manifest.version === record.version;
      if (!gates.manifestVersionMatches) findings.push('manifest version ' + manifest.version + ' != release record version ' + record.version);
    } catch { findings.push('manifest could not be read for version gate'); }

    const head = await gitImpl.revParse(repoRoot);
    if (head === null) {
      gates.commitBound = false;
      gates.commitMatchesHead = false;
      findings.push('git unavailable; commit binding cannot be verified (fail-closed)');
    } else {
      gates.commitBound = Boolean(record.sourceBinding?.commit);
      gates.commitMatchesHead = record.sourceBinding?.commit === head;
      if (!gates.commitBound) findings.push('source commit binding missing in record');
      if (gates.commitBound && !gates.commitMatchesHead) findings.push('record commit ' + String(record.sourceBinding.commit).slice(0, 12) + ' != HEAD ' + head.slice(0, 12));
    }

    const dirty = await gitImpl.statusPorcelain(repoRoot);
    if (dirty === null) {
      gates.worktreeClean = false;
      findings.push('git unavailable; worktree cleanliness cannot be verified (fail-closed)');
    } else {
      gates.worktreeClean = !dirty.trim();
      if (!gates.worktreeClean) findings.push('worktree is dirty; commit or stash before release review');
    }

    // DEFAULT_BRANCH_RELEASE_ALIGNMENT family
    const defaultBranch = await gitImpl.remoteDefaultBranch(repoRoot);
    gates.defaultBranchIsMain = defaultBranch === 'main';
    if (defaultBranch === null) findings.push('git unavailable; default-branch alignment cannot be verified (fail-closed)');
    else if (!gates.defaultBranchIsMain) findings.push('DEFAULT_BRANCH_SOURCE_MISMATCH: default branch is ' + defaultBranch + ' (must be main)');

    const currentBranch = await gitImpl.currentBranch(repoRoot);
    gates.currentBranchIsMain = currentBranch === 'main';
    if (currentBranch === null) findings.push('git unavailable; current branch cannot be verified (fail-closed)');
    else if (!gates.currentBranchIsMain) findings.push('DEFAULT_BRANCH_SOURCE_MISMATCH: current branch is ' + currentBranch + ' (must be main)');

    const releaseCommit = record.sourceBinding?.commit;
    if (releaseCommit) {
      gates.releaseCommitOnMain = await gitImpl.isAncestor(repoRoot, releaseCommit, 'origin/main');
      if (!gates.releaseCommitOnMain) findings.push('DEFAULT_BRANCH_SOURCE_MISMATCH: release commit ' + releaseCommit.slice(0, 12) + ' is not an ancestor of origin/main');
    } else {
      gates.releaseCommitOnMain = false;
      findings.push('release commit missing; main alignment cannot be verified');
    }

    const mainManifest = await gitImpl.showFile(repoRoot, 'origin/main', 'extension/src/manifest.json');
    if (mainManifest === null) { gates.mainVersionMatches = false; findings.push('origin/main has no extension/src/manifest.json (fetch origin first?)'); }
    else {
      try { gates.mainVersionMatches = JSON.parse(mainManifest).version === record.version; }
      catch { gates.mainVersionMatches = false; }
      if (!gates.mainVersionMatches) findings.push('DEFAULT_BRANCH_SOURCE_MISMATCH: origin/main manifest version != release record version');
    }
    gates.mainHasMigrations = await gitImpl.hasFile(repoRoot, 'origin/main', 'worker/migrations/20260813_privacy_nonretention.sql');
    if (!gates.mainHasMigrations) findings.push('origin/main is missing required migration worker/migrations/20260813_privacy_nonretention.sql');
    gates.mainHasTooling = await gitImpl.hasFile(repoRoot, 'origin/main', 'release/export-community.mjs') && await gitImpl.hasFile(repoRoot, 'origin/main', 'release/release-audit.mjs');
    if (!gates.mainHasTooling) findings.push('origin/main is missing current release tooling (release/export-community.mjs / release-audit.mjs)');
    gates.mainHasCI = await gitImpl.hasFile(repoRoot, 'origin/main', '.github/workflows/ci.yml') && await gitImpl.hasFile(repoRoot, 'origin/main', '.github/workflows/release-readiness.yml');
    if (!gates.mainHasCI) findings.push('origin/main is missing current CI workflows (.github/workflows/)');

    gates.rehearsals = { ...(record.rehearsals || {}) };
    gates.tagAtHead = await gitImpl.tagsAtHead(repoRoot);
    gates.cloneSmoke = record.cloneSmoke || null;
  }

  const scan = await verifyGeneratedTree({ treeDir: repoRoot, boundaryFile, requireProvenance: false });
  gates.repoScan = scan.ok;
  if (!scan.ok) findings.push('repo scan failed: ' + scan.findings.length + ' findings');

  // Capability parity (one-version-lag edition model). Skipped only when the
  // manifest is absent and this is not a release-ready run.
  let boundaryObj = null;
  try { boundaryObj = JSON.parse(await readFile(boundaryFile, 'utf8')); } catch { /* boundary validity is covered by the repo scan */ }
  const cap = await capabilityAudit({ repoRoot, boundary: boundaryObj, manifestPath: capabilityManifest, requireManifest: requireReleaseReady });
  gates.capabilityParity = cap.ok;
  gates.capabilitySkipped = Boolean(cap.skipped);
  if (cap.report) gates.capabilityReport = { baselineLocked: cap.report.baselineLocked, eligible: cap.report.eligible, capabilities: cap.report.capabilities, forwardVersionLeak: cap.report.forwardVersionLeak, backportOmission: cap.report.backportOmission };
  if (!cap.ok) for (const finding of cap.findings) findings.push(finding);

  gates.suites = { ran: false };
  if (includeTests) {
    const { runSuites } = await import('./run-suites.mjs');
    gates.suites = await runSuites(repoRoot);
    if (!gates.suites.extension.ok) findings.push('extension suite failed');
    if (!gates.suites.worker.ok) findings.push('worker suite failed');
  }

  const rehearsals = gates.rehearsals || {};
  const rehearsalPass = (r) => (typeof r === 'string' ? r === 'PASS' : Boolean(r && r.result === 'PASS'));
  gates.rehearsalsComplete = rehearsalPass(rehearsals.freshDeploy) && rehearsalPass(rehearsals.upgrade07To08);

  // Release-ready strict mode
  if (requireReleaseReady && record) {
    const head = await gitImpl.revParse(repoRoot);
    if (head === null) findings.push('release-ready requires git; fingerprint fallback is not sufficient');
    const rehearsalEvidence = (r) => Boolean(r && r.result === 'PASS' && r.executor && r.environment && r.evidence && r.sourceCommit && r.artifactSha256);
    if (!rehearsalEvidence(rehearsals.freshDeploy)) findings.push('freshDeploy rehearsal lacks full PASS evidence (executor/environment/evidence/sourceCommit/artifactSha256)');
    if (!rehearsalEvidence(rehearsals.upgrade07To08)) findings.push('upgrade07To08 rehearsal lacks full PASS evidence (executor/environment/evidence/sourceCommit/artifactSha256)');

    const tags = String(await gitImpl.tagsAtHead(repoRoot) || '').split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
    const policy = versionTagPolicy(record.version);
    const policyTags = tags.filter((t) => policy.test(t));
    gates.tagMatchesPolicy = policyTags.length > 0;
    if (!gates.tagMatchesPolicy) findings.push('no release tag matching policy v' + record.version + ' or v' + record.version + '-rcN at HEAD (got: ' + (tags.join(', ') || 'none') + ')');
    else {
      const tagCommit = await gitImpl.revParse(repoRoot, policyTags[0] + '^{commit}');
      gates.tagCommitOnMain = tagCommit ? await gitImpl.isAncestor(repoRoot, tagCommit, 'origin/main') : false;
      if (!gates.tagCommitOnMain) findings.push('RELEASE_TAG_MUST_DESCEND_FROM_MAIN: tag ' + policyTags[0] + ' commit is not an ancestor of origin/main');
    }

    const smoke = gates.cloneSmoke;
    gates.cloneSmokePassed = Boolean(smoke && smoke.ok === true && smoke.version === record.version);
    if (!gates.cloneSmokePassed) findings.push('DEFAULT_CLONE_SMOKE_TEST not recorded as passed for version ' + record.version + '; run release/clone-smoke-test.mjs --record');

    const readmeFindings = readmeAssetFindings(repoRoot);
    gates.readmeAssetsOk = readmeFindings.length === 0;
    if (!gates.readmeAssetsOk) findings.push('README_ASSETS_FAIL: ' + readmeFindings.join('; '));

    const wtText = await gitImpl.listWorktrees(repoRoot);
    const worktrees = analyzeWorktrees(wtText);
    gates.worktreeCategories = {};
    for (const category of ['ACTIVE_REQUIRED', 'TEMPORARY', 'UNKNOWN']) {
      gates.worktreeCategories[category] = worktrees.filter((w) => w.category === category).length;
    }
    if (wtText !== null && worktrees.some((w) => w.category === 'UNKNOWN')) findings.push('worktree governance: UNKNOWN worktree exists; classify or remove it before release-ready');
    if (wtText !== null && worktrees.some((w) => w.category === 'TEMPORARY')) findings.push('worktree governance: TEMPORARY worktree remains; housekeep before release-ready');
  }

  gates.releaseReady = gates.rehearsalsComplete && Boolean(gates.tagAtHead) && findings.length === 0;

  const autoOk = findings.length === 0;
  return {
    ok: autoOk,
    readiness: autoOk ? 'AUTO_GATES_PASS' : 'FAIL',
    releaseReady: gates.releaseReady,
    requireReleaseReady,
    version: record?.version || null,
    gates,
    findings,
    next: autoOk
      ? (gates.rehearsalsComplete ? (gates.releaseReady ? 'READY_FOR_RELEASE_REVIEW.' : 'Tag the audited HEAD, then the release is ready for review.') : 'Run the two rehearsals (docs/release-rehearsal-0.8.md, docs/upgrade-rehearsal-0.8.md), record PASS, then re-audit.')
      : null
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const includeTests = process.argv.includes('--include-tests');
  const requireReleaseReady = process.argv.includes('--release-ready');
  const summary = await releaseAudit({ includeTests, requireReleaseReady });
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.ok ? 0 : 1);
}
