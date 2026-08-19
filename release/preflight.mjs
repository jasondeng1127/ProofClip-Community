// ONE-COMMAND PREFLIGHT: unified engineering entry point.
//   node release/preflight.mjs                 STANDARD (ready to merge main)
//   node release/preflight.mjs --fast          FAST (development loop, change-aware)
//   node release/preflight.mjs --release-ready RELEASE (orchestrates release-audit --release-ready)
//   --json / --verbose for machine or detailed output.
// Every check is delegated to the existing authoritative implementations
// (release-audit, verify-generated-tree, capability-audit, run-suites) — this
// file composes, it does not re-implement.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseAudit, analyzeWorktrees, readmeAssetFindings, defaultGit } from './release-audit.mjs';
import { verifyGeneratedTree } from './verify-generated-tree.mjs';
import { capabilityAudit } from './capability-audit.mjs';
import { runSuites } from './run-suites.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BOUNDARY = join(HERE, 'edition-boundary.json');
const CAPABILITY_MANIFEST = join(HERE, 'capability-manifest.json');
const REQUIRED_MIGRATION = 'worker/migrations/20260813_privacy_nonretention.sql';
const REQUIRED_TOOLING = ['release/export-community.mjs', 'release/release-audit.mjs'];
const REQUIRED_CI = ['.github/workflows/ci.yml', '.github/workflows/release-readiness.yml'];

// WORKSPACE identity must be unambiguous; unknown means FAIL CLOSED.
export function detectWorkspace(repoRoot) {
  const community = existsSync(join(repoRoot, 'release/edition-boundary.json')) &&
    existsSync(join(repoRoot, 'release/capability-manifest.json')) &&
    existsSync(join(repoRoot, 'extension/src/community-config.mjs'));
  const commercial = existsSync(join(repoRoot, 'projects/service/P-proofclip-api')) ||
    existsSync(join(repoRoot, 'projects/chrome/P-notion-evidence-clipper'));
  if (community && !commercial) return 'community';
  if (commercial && !community) return 'commercial';
  return null;
}

export function scopeOfChangedFiles(changedFiles) {
  const scopes = new Set();
  for (const file of changedFiles || []) {
    if (file === 'README.md' || file.startsWith('docs/')) scopes.add('docs');
    else if (file === 'release/capability-manifest.json' || file === 'release/edition-boundary.json') scopes.add('capability');
    else if (file.startsWith('extension/')) scopes.add('extension');
    else if (file.startsWith('worker/')) scopes.add('worker');
    else if (file.startsWith('release/')) scopes.add('release');
    else scopes.add('other');
  }
  return scopes;
}

export function changedFilesFromStatus(statusPorcelain) {
  if (statusPorcelain === null || statusPorcelain === undefined) return null;
  return String(statusPorcelain).split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.slice(2).trim()).filter(Boolean);
}

// Actionable error mapping: CODE + NEXT_ACTION from audit/finding text.
const NEXT_ACTION_MAP = [
  { match: /worktree is dirty/, code: 'WORKING_TREE_DIRTY', next: 'COMMIT_OR_REVERT_CHANGES' },
  { match: /DEFAULT_BRANCH_SOURCE_MISMATCH/, code: 'DEFAULT_BRANCH_SOURCE_MISMATCH', next: 'INTEGRATE_ACCEPTED_RUNTIME_CHANGES_INTO_MAIN_BEFORE_RELEASE' },
  { match: /extension suite failed/, code: 'EXTENSION_TESTS_FAILED', next: 'RUN_EXTENSION_TESTS_AND_FIX_BEFORE_MERGE' },
  { match: /worker suite failed/, code: 'WORKER_TESTS_FAILED', next: 'RUN_WORKER_TESTS_AND_FIX_BEFORE_MERGE' },
  { match: /release tests failed/, code: 'RELEASE_TESTS_FAILED', next: 'RUN_RELEASE_SELF_TESTS_AND_FIX' },
  { match: /COMMUNITY_VERSION_NOT_YET_ELIGIBLE/, code: 'COMMUNITY_VERSION_NOT_YET_ELIGIBLE', next: 'RECORD_MAINTAINER_DOWNSTREAM_APPROVAL_OR_WAIT_FOR_NEXT_COMMERCIAL_VERSION' },
  { match: /CAPABILITY_MANIFEST_MISSING/, code: 'CAPABILITY_MANIFEST_MISSING', next: 'CREATE_RELEASE_CAPABILITY_MANIFEST' },
  { match: /COMMUNITY_CAPABILITY_OMISSION/, code: 'CAPABILITY_OMISSION', next: 'PORT_THE_MISSING_CAPABILITY_OR_RECORD_NOT_APPLICABLE_REASON' },
  { match: /FORWARD_COMMERCIAL_VERSION_LEAK/, code: 'FORWARD_VERSION_LEAK', next: 'REMOVE_N_PLUS_ONE_CAPABILITY_FROM_COMMUNITY_TREE' },
  { match: /rehearsal lacks|freshDeploy rehearsal|upgrade07To08 rehearsal/, code: 'REHEARSAL_EVIDENCE_MISSING', next: 'COMPLETE_REHEARSALS_AND_RECORD_PASS_WITH_EVIDENCE' },
  { match: /DEFAULT_CLONE_SMOKE_TEST/, code: 'CLONE_SMOKE_MISSING', next: 'RUN_RELEASE_VERIFY_CLONED_TREE_RECORD' },
  { match: /release tag matching policy/, code: 'TAG_POLICY_FAIL', next: 'TAG_HEAD_WITH_V_VERSION_RCN' },
  { match: /worktree governance/, code: 'WORKTREE_BLOCKER', next: 'HOUSEKEEP_TEMPORARY_WORKTREES' },
  { match: /git unavailable/, code: 'GIT_UNAVAILABLE', next: 'RUN_IN_ENVIRONMENT_WITH_GIT' },
  { match: /repo scan failed/, code: 'BOUNDARY_SCAN_FAILED', next: 'REMOVE_FORBIDDEN_PATHS_OR_TOKENS_FROM_THE_TREE' },
  { match: /STALE:/, code: 'SOURCE_DRIFT', next: 'RE_CUT_THE_RELEASE_ARTIFACT_ON_THE_CURRENT_SOURCE' },
  { match: /BASELINE_LOCK_FAIL/, code: 'BASELINE_LOCK_FAIL', next: 'SYNC_CAPABILITY_MANIFEST_BASELINE_WITH_THE_EDITION_BOUNDARY_PIN' }
];

export function nextActionFor(findings) {
  const text = (findings || []).join('\n');
  const hit = NEXT_ACTION_MAP.find((entry) => entry.match.test(text));
  return hit || { code: 'UNKNOWN_FAILURE', next: 'INSPECT_PREFLIGHT_DETAILS' };
}

export async function runPreflight({ mode = 'standard', repoRoot = ROOT, gitImpl = defaultGit, suitesImpl = null, scanImpl = null, capImpl = null, auditImpl = null, changedFiles = null, releaseTestsImpl = null } = {}) {
  const checks = {};
  const findings = [];
  const report = { mode, workspace: null, version: null, branch: null, checks, findings, ok: false, nextAction: null };

  // 1. Workspace identity (fail closed).
  report.workspace = detectWorkspace(repoRoot);
  if (!report.workspace) {
    report.ok = false;
    report.nextAction = { code: 'WORKSPACE_IDENTITY_UNKNOWN', next: 'RUN_THE_COMMAND_INSIDE_A_COMMUNITY_OR_COMMERCIAL_REPOSITORY_ROOT' };
    report.findings = ['WORKSPACE_IDENTITY_UNKNOWN: could not determine the edition of this workspace'];
    return report;
  }
  checks.workspaceIdentity = 'PASS';

  // 2. Git state (informational in FAST, gating in STANDARD/RELEASE).
  report.branch = await gitImpl.currentBranch(repoRoot);
  const dirty = await gitImpl.statusPorcelain(repoRoot);
  checks.gitAvailable = dirty !== null;
  checks.branch = report.branch || 'unknown';
  checks.worktreeClean = dirty !== null && !String(dirty || '').trim();
  if (mode !== 'fast') {
    if (dirty === null) findings.push('git unavailable; branch/cleanliness cannot be verified');
    else if (String(dirty).trim()) findings.push('worktree is dirty; commit or stash before merge/release');
  }

  // 3. Version identity.
  try {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'extension/src/manifest.json'), 'utf8'));
    report.version = manifest.version;
    checks.version = manifest.version;
  } catch { findings.push('extension/src/manifest.json could not be read'); }

  // 4. Per-mode checks (all delegated).
  if (mode === 'fast') {
    const scopes = changedFiles ? scopeOfChangedFiles(changedFiles) : null;
    const suites = suitesImpl || runSuites;
    let ranSuites = false;
    if (scopes && !scopes.has('extension') && !scopes.has('worker') && !scopes.has('other')) {
      checks.notes = 'change-aware: product test suites skipped (no product scope changed)';
    } else {
      const result = suites(repoRoot);
      ranSuites = true;
      checks.extension = result.extension.ok;
      checks.worker = result.worker.ok;
      if (!result.extension.ok) findings.push('extension suite failed');
      if (!result.worker.ok) findings.push('worker suite failed');
    }
    checks.suitesRan = ranSuites;
    if (scopes && scopes.has('docs')) {
      const readmeFindings = readmeAssetFindings(repoRoot);
      checks.readmeAssets = readmeFindings.length === 0;
      if (!checks.readmeAssets) findings.push('README_ASSETS_FAIL: ' + readmeFindings.join('; '));
    }
    if (scopes && scopes.has('capability')) {
      const cap = await (capImpl || capabilityAudit)({ repoRoot, boundary: readBoundary(repoRoot) });
      checks.capability = cap.ok;
      if (!cap.ok) for (const f of cap.findings) findings.push(f);
    }
  } else if (mode === 'standard') {
    const suites = suitesImpl || runSuites;
    const result = suites(repoRoot);
    checks.extension = result.extension.ok;
    checks.worker = result.worker.ok;
    if (!result.extension.ok) findings.push('extension suite failed');
    if (!result.worker.ok) findings.push('worker suite failed');
    const scan = await (scanImpl || (({ repoRoot: r, boundaryFile: b }) => verifyGeneratedTree({ treeDir: r, boundaryFile: b, requireProvenance: false })))({ repoRoot, boundaryFile: BOUNDARY });
    checks.repoScan = scan.ok;
    if (!scan.ok) findings.push('repo scan failed: ' + scan.findings.length + ' findings');
    const cap = await (capImpl || capabilityAudit)({ repoRoot, boundary: readBoundary(repoRoot) });
    checks.capability = cap.ok;
    if (!cap.ok) for (const f of cap.findings) findings.push(f);
    const readmeFindings = readmeAssetFindings(repoRoot);
    checks.readmeAssets = readmeFindings.length === 0;
    if (!checks.readmeAssets) findings.push('README_ASSETS_FAIL: ' + readmeFindings.join('; '));
    checks.migration = existsSync(join(repoRoot, REQUIRED_MIGRATION));
    if (!checks.migration) findings.push('required migration missing: ' + REQUIRED_MIGRATION);
    checks.tooling = REQUIRED_TOOLING.every((p) => existsSync(join(repoRoot, p)));
    if (!checks.tooling) findings.push('release tooling missing: ' + REQUIRED_TOOLING.join(', '));
    checks.ci = REQUIRED_CI.every((p) => existsSync(join(repoRoot, p)));
    if (!checks.ci) findings.push('CI workflows missing: ' + REQUIRED_CI.join(', '));
    checks.releaseTests = releaseTestsImpl ? await releaseTestsImpl() : true;
  } else if (mode === 'release-ready') {
    const audit = await (auditImpl || ((o) => releaseAudit(o)))({ repoRoot, requireReleaseReady: true });
    checks.releaseAudit = audit.ok;
    for (const f of audit.findings || []) findings.push(f);
    if (audit.releaseReady) checks.releaseReady = true;
  }

  report.ok = findings.length === 0;
  report.findings = findings;
  report.nextAction = report.ok
    ? { code: mode === 'release-ready' ? 'RELEASE_READY' : 'PREFLIGHT_PASS', next: mode === 'release-ready' ? 'MAINTAINER_FINAL_RELEASE_APPROVAL' : 'SAFE_TO_MERGE_TO_MAIN' }
    : nextActionFor(findings);
  return report;
}

function readBoundary(repoRoot) {
  try { return JSON.parse(readFileSync(join(repoRoot, 'release/edition-boundary.json'), 'utf8')); } catch { return null; }
}

export function formatSummary(report) {
  const lines = [];
  lines.push('PROOFCLIP ENGINEERING STATUS');
  lines.push('Workspace: ' + report.workspace);
  lines.push('Version: ' + (report.version || 'unknown'));
  lines.push('Mode: ' + report.mode.toUpperCase());
  lines.push('Branch: ' + (report.branch || 'unknown'));
  lines.push('PREFLIGHT: ' + (report.ok ? 'PASS' : 'FAIL'));
  lines.push('NEXT_ACTION: ' + report.nextAction.next);
  if (!report.ok) lines.push('BLOCKER: ' + report.nextAction.code);
  return lines.join('\n');
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const mode = args.includes('--release-ready') ? 'release-ready' : args.includes('--fast') ? 'fast' : 'standard';
  const changedArg = args.find((a) => a.startsWith('--changed='))?.split('=').slice(1).join('=');
  const changedFiles = changedArg ? changedArg.split(',') : null;
  const report = await runPreflight({ mode, changedFiles, gitImpl: defaultGit });
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatSummary(report));
    if (args.includes('--verbose') || !report.ok) {
      for (const f of report.findings) console.log('  - ' + f);
    }
  }
  process.exit(report.ok ? 0 : 1);
}