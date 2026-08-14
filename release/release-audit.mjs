// release-audit (Community B3, fail-closed). Verifies the current release
// record against the workspace, the artifact, git state, and the product
// version. Normal workflow mistakes cannot bypass it; it is not designed to
// defend against an attacker who rewrites every piece of evidence at once.
//
// Modes:
//   default            -> automatic gates (exit 0 when they pass)
//   --include-tests    -> also run both offline suites
//   --release-ready    -> additionally require full rehearsal evidence, a tag
//                         matching the version policy, and verified git
//                         identity (exit 1 when any is missing)
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyGeneratedTree } from './verify-generated-tree.mjs';
import { computeWorkspaceFingerprint, provenanceMatch } from './cut-release.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BOUNDARY = join(HERE, 'edition-boundary.json');
const RECORDS = join(HERE, 'records');
const CANONICAL_PROVENANCE = join(HERE, 'provenance', 'community-0.8.0.json');

export const defaultGit = {
  revParse(repoRoot) { try { return execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } },
  statusPorcelain(repoRoot) { try { return execFileSync('git', ['-C', repoRoot, 'status', '--porcelain'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString(); } catch { return null; } },
  tagsAtHead(repoRoot) { try { return execFileSync('git', ['-C', repoRoot, 'tag', '--points-at', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } }
};

async function sha256OfFile(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

export async function releaseAudit({ repoRoot = ROOT, recordsDir = RECORDS, includeTests = false, provenanceFile = CANONICAL_PROVENANCE, gitImpl = defaultGit, boundaryFile = BOUNDARY, requireReleaseReady = false } = {}) {
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

    // Artifact file sha256 must match the record.
    const artifactAbs = join(repoRoot, record.artifact.path);
    const artifactExists = await stat(artifactAbs).then(() => true).catch(() => false);
    gates.artifactExists = artifactExists;
    if (!artifactExists) findings.push('artifact missing: ' + record.artifact.path);
    if (artifactExists) {
      gates.artifactShaMatches = (await sha256OfFile(artifactAbs)) === record.artifact.sha256;
      if (!gates.artifactShaMatches) findings.push('artifact sha256 mismatch');
    }

    // Source binding: fingerprint, provenance file sha, manifest version.
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

    // Commit binding: record commit must equal the current HEAD (fail-closed).
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

    // Worktree must be clean.
    const dirty = await gitImpl.statusPorcelain(repoRoot);
    if (dirty === null) {
      gates.worktreeClean = false;
      findings.push('git unavailable; worktree cleanliness cannot be verified (fail-closed)');
    } else {
      gates.worktreeClean = !dirty.trim();
      if (!gates.worktreeClean) findings.push('worktree is dirty; commit or stash before release review');
    }

    // Bundle reproducibility + artifact bundle + full ZIP package verification.
    try {
      execFileSync(process.execPath, [join(repoRoot, 'worker/scripts/bundle-worker.mjs')], { cwd: join(repoRoot, 'worker'), stdio: 'pipe' });
      gates.bundleReproducible = (await sha256OfFile(join(repoRoot, 'worker/dist/worker.mjs'))) === record.artifact.bundleSha256;
      if (!gates.bundleReproducible) findings.push('worker bundle is not reproducible from the current source');
    } catch (error) {
      gates.bundleReproducible = false;
      findings.push('worker bundle rebuild failed: ' + (error?.message || String(error)));
    }
    gates.artifactBundleMatches = false;
    gates.zipEntriesMatch = false;
    gates.zipContentFingerprint = false;
    if (artifactExists) {
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
        if (!gates.zipEntriesMatch) findings.push('ZIP entry set differs from the recorded packaging manifest (' + actualEntries.length + ' actual vs ' + (expectedEntries?.length ?? 'none') + ' recorded)');
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

    gates.rehearsals = { ...(record.rehearsals || {}) };
    gates.tagAtHead = await gitImpl.tagsAtHead(repoRoot);
  }

  const scan = await verifyGeneratedTree({ treeDir: repoRoot, boundaryFile, requireProvenance: false });
  gates.repoScan = scan.ok;
  if (!scan.ok) findings.push('repo scan failed: ' + scan.findings.length + ' findings');

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

  // Release-ready strict mode: full rehearsal evidence, a tag matching the
  // version policy, and verified git identity are mandatory. Fingerprint-only
  // identity is never sufficient here.
  if (requireReleaseReady && record) {
    const head = await gitImpl.revParse(repoRoot);
    if (head === null) findings.push('release-ready requires git; fingerprint fallback is not sufficient');
    const rehearsalEvidence = (r) => Boolean(r && r.result === 'PASS' && r.executor && r.environment && r.evidence && r.sourceCommit && r.artifactSha256);
    if (!rehearsalEvidence(rehearsals.freshDeploy)) findings.push('freshDeploy rehearsal lacks full PASS evidence (executor/environment/evidence/sourceCommit/artifactSha256)');
    if (!rehearsalEvidence(rehearsals.upgrade07To08)) findings.push('upgrade07To08 rehearsal lacks full PASS evidence (executor/environment/evidence/sourceCommit/artifactSha256)');
    const tags = String(await gitImpl.tagsAtHead(repoRoot) || '').split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
    const escapedVersion = String(record.version).replace(/\./g, '\\.');
    const policy = new RegExp('^v' + escapedVersion + '(?:-rc\\d+)?$');
    gates.tagMatchesPolicy = tags.some((t) => policy.test(t));
    if (!gates.tagMatchesPolicy) findings.push('no release tag matching policy v' + record.version + ' or v' + record.version + '-rcN at HEAD (got: ' + (tags.join(', ') || 'none') + ')');
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
