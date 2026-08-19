// Capability parity audit (one-version-lag edition model, spec 1-6):
//   Community N must carry the complete Commercial N capability baseline
//   (PRESENT / TRANSFORMED_EQUIVALENT) and must not contain Commercial N+1
//   capabilities (FORWARD_COMMERCIAL_VERSION_LEAK). NOT_APPLICABLE is allowed
//   only with a technical reason. The commercial baseline must stay locked to
//   the frozen commit (BASELINE_LOCK).
import { existsSync, readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MANIFEST = join(HERE, 'capability-manifest.json');

const SKIP_DIRS = new Set(['node_modules', '.git', 'out', 'tmp', 'artifacts', 'records', '.audit', 'provenance', 'tests']);
const TEXT_EXTENSIONS = new Set(['.mjs', '.js', '.json', '.jsonc', '.sql', '.html', '.css', '.md', '.svg', '.txt', '.ps1']);

async function walkFiles(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await visit(root);
  return files;
}

async function tokenPresentInTree(repoRoot, token) {
  for (const file of await walkFiles(repoRoot)) {
    if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue;
    try {
      if (readFileSync(file, 'utf8').includes(token)) return true;
    } catch { /* skip unreadable */ }
  }
  return false;
}

export async function capabilityAudit({ repoRoot, manifestPath = DEFAULT_MANIFEST, boundary = null, requireManifest = false } = {}) {
  if (!existsSync(manifestPath)) {
    if (requireManifest) {
      return { ok: false, skipped: false, findings: ['CAPABILITY_MANIFEST_MISSING: release/capability-manifest.json is required for release-ready'], report: null };
    }
    return { ok: true, skipped: true, findings: [], report: null, note: 'capability manifest not present; parity audit skipped' };
  }
  const findings = [];
  const report = { baselineLocked: false, eligible: false, eligibilityBasis: null, capabilities: {}, forwardVersionLeak: [], backportOmission: [], notApplicable: [] };

  let manifest;
  try { manifest = JSON.parse(readFileSync(manifestPath, 'utf8')); }
  catch { return { ok: false, findings: ['capability manifest is not valid JSON'], report: null }; }

  // COMMUNITY_DOWNSTREAM_ELIGIBILITY: a frozen N baseline alone is not enough.
  // Community N may be released only when Commercial N+1 is already leading
  // (next version frozen) or a maintainer records explicit downstream approval.
  const elig = manifest.downstreamEligibility || {};
  const approval = elig.maintainerApproval || {};
  const approved = approval.approved === true && Boolean(approval.approvedBy) && Boolean(approval.approvedAt);
  const nextLeading = elig.commercialNextFrozen === true;
  report.eligible = approved || nextLeading;
  report.eligibilityBasis = approved ? 'maintainerApproval' : nextLeading ? 'nextVersionLeading' : null;
  if (!report.eligible) {
    findings.push('COMMUNITY_VERSION_NOT_YET_ELIGIBLE: Commercial ' + String(elig.commercialNextVersion || 'N+1') + ' is not yet leading and no maintainer downstream approval is recorded (set downstreamEligibility.maintainerApproval or freeze the next Commercial version)');
  }


  // Baseline lock: manifest baseline must equal the edition-boundary upstream pin.
  const pinCommit = boundary?.upstream?.pin?.commit;
  report.baselineLocked = Boolean(pinCommit && pinCommit === manifest.commercialBaseline?.commit);
  if (!report.baselineLocked) {
    findings.push('BASELINE_LOCK_FAIL: capability manifest baseline ' + String(manifest.commercialBaseline?.commit || 'none').slice(0, 12) + ' != edition-boundary upstream pin ' + String(pinCommit || 'none').slice(0, 12));
  }

  for (const cap of manifest.capabilities || []) {
    const classification = cap.classification;
    const scopes = String(cap.sourceScope || '').split(',').map((s) => s.trim()).filter(Boolean);
    const scopeExists = scopes.length === 0 || scopes.every((p) => existsSync(join(repoRoot, p)));
    if (classification === 'PRESENT' || classification === 'TRANSFORMED_EQUIVALENT') {
      report.capabilities[cap.id] = scopeExists ? 'present' : 'missing';
      if (!scopeExists) {
        findings.push('COMMUNITY_CAPABILITY_OMISSION: ' + cap.id + ' (' + cap.name + ') — expected ' + classification + ' but source scope is missing');
        report.backportOmission.push(cap.id);
      }
    } else if (classification === 'NOT_APPLICABLE') {
      report.capabilities[cap.id] = 'notApplicable';
      report.notApplicable.push(cap.id);
      if (!cap.reason || String(cap.reason).trim().length < 10) {
        findings.push('NOT_APPLICABLE capability ' + cap.id + ' lacks a technical reason');
      }
    } else {
      findings.push('capability ' + cap.id + ' has unknown classification ' + classification);
    }
  }

  // Forward leak: N+1 discriminators must not appear in the Community tree.
  for (const disc of manifest.forwardLeakDiscriminators || []) {
    const pathHit = (disc.paths || []).some((p) => existsSync(join(repoRoot, p)));
    const tokenHit = disc.token ? await tokenPresentInTree(repoRoot, disc.token) : false;
    if (pathHit || tokenHit) {
      findings.push('FORWARD_COMMERCIAL_VERSION_LEAK: ' + disc.id + ' (N+1 capability discriminator present in Community tree)');
      report.forwardVersionLeak.push(disc.id);
    }
  }

  return { ok: findings.length === 0, findings, report, skipped: false };
}