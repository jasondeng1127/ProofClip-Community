// Community release cut (B3). Produces the distributable artifact and the
// current release record from the CURRENT main tree, so the artifact is bound
// to exactly what would be committed.
//
// Steps: repo scan -> provenance match -> build bundle -> stage package ->
// zip -> sha256 -> release record (with source fingerprint + commit binding).
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { verifyGeneratedTree } from './verify-generated-tree.mjs';
import { capabilityAudit } from './capability-audit.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const BOUNDARY = join(HERE, 'edition-boundary.json');
const OUT_TREE = join(HERE, 'out', 'community-0.8.0');
const CANONICAL_PROVENANCE = join(HERE, 'provenance', 'community-0.8.0.json');
const ARTIFACTS = join(HERE, 'artifacts');
const RECORDS = join(HERE, 'records');

const PACKAGE_ROOTS = ['extension', 'worker', 'deploy', 'docs', 'scripts'];
const PACKAGE_FILES = ['LICENSE', 'README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'TRADEMARKS.md'];


async function walkFiles(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await visit(root);
  return files.sort();
}

const KEY = (p) => String(p).split(/[\\/]/).join('/');

function isPackageExcluded(relativePath, exclusions) {
  const normalized = KEY(relativePath).replace(/^\.\//, '');
  return exclusions.some((rule) => {
    const normalizedRule = KEY(rule).replace(/^\.\//, '');
    if (normalizedRule.endsWith('/')) return normalized.startsWith(normalizedRule);
    return normalized === normalizedRule || normalized.startsWith(normalizedRule + '/');
  });
}

async function copyTreeFiltered(sourceRoot, destinationRoot, repoRoot, exclusions) {
  for (const file of await walkFiles(sourceRoot)) {
    const relativeToRepo = KEY(relative(repoRoot, file));
    if (isPackageExcluded(relativeToRepo, exclusions)) continue;
    const destination = join(destinationRoot, relative(sourceRoot, file));
    await mkdir(dirname(destination), { recursive: true });
    await cp(file, destination);
  }
}

export async function computeWorkspaceFingerprint(repoRoot = ROOT) {
  const entries = [];
  for (const root of ['extension', 'worker']) {
    const base = join(repoRoot, root);
    if (!(await stat(base).then(() => true).catch(() => false))) continue;
    for (const file of await walkFiles(base)) {
      const rel = KEY(relative(repoRoot, file));
      if (rel.startsWith('worker/dist/')) continue; // build artifact
      const { readFile } = await import('node:fs/promises');
      const hash = createHash('sha256').update(await readFile(file)).digest('hex');
      entries.push(rel + ':' + hash);
    }
  }
  entries.sort();
  return createHash('sha256').update(entries.join('\n')).digest('hex');
}

export async function provenanceMatch(repoRoot = ROOT, provenanceFile = join(OUT_TREE, 'PROVENANCE.json')) {
  const provenance = JSON.parse(await readFile(provenanceFile, 'utf8'));
  let checked = 0, mismatches = 0, missing = 0;
  for (const entry of provenance.files) {
    if (!entry.path.startsWith('extension/') && !entry.path.startsWith('worker/')) continue;
    const abs = join(repoRoot, entry.path);
    if (!(await stat(abs).then(() => true).catch(() => false))) { missing += 1; continue; }
    checked += 1;
    const { readFile } = await import('node:fs/promises');
    const hash = createHash('sha256').update(await readFile(abs)).digest('hex');
    if (hash !== entry.sha256) mismatches += 1;
  }
  return { checked, mismatches, missing, ok: mismatches === 0 && missing === 0 };
}

async function buildEditionDiffReport(provenanceFile, findings, repoRoot, boundary) {
  try {
    const provenance = JSON.parse(await readFile(provenanceFile, 'utf8'));
    const bySource = {};
    for (const f of provenance.files || []) bySource[f.source] = (bySource[f.source] || 0) + 1;
    const cap = await capabilityAudit({ repoRoot, boundary });
    let manifest = null;
    try { manifest = JSON.parse(await readFile(join(HERE, 'capability-manifest.json'), 'utf8')); } catch { manifest = null; }
    return {
      targetVersion: provenance.targetVersion,
      commercialBaselineVersion: manifest?.commercialBaseline?.version ?? null,
      commercialBaselineCommit: manifest?.commercialBaseline?.commit ?? null,
      commercialBaselineCapabilities: manifest ? (manifest.capabilities || []).map((c) => c.id) : [],
      communityCapabilities: cap.report ? cap.report.capabilities : {},
      forwardVersionLeak: cap.report ? cap.report.forwardVersionLeak : [],
      backportOmission: cap.report ? cap.report.backportOmission : [],
      fromCommercial: {
        upstreamFiles: bySource.upstream || 0,
        transformedFiles: bySource['upstream+transform'] || 0,
        overlayFiles: bySource.overlay || 0,
        totalFiles: (provenance.files || []).length
      },
      commercialOnlyExcluded: provenance.skippedCount ?? null,
      unexpectedCommercialDiffusion: cap.report && cap.report.forwardVersionLeak.length ? 'LEAK' : 'NONE',
      leakScan: { ok: findings.filter((f) => f.startsWith('forbidden')).length === 0, notes: 'enforced by release/verify-generated-tree.mjs forbidden tokens/paths on every cut' }
    };
  } catch (error) {
    return { error: String(error?.message || error) };
  }
}

function tryGitHead(repoRoot) {
  try {
    return execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

export async function cutRelease({ version, repoRoot = ROOT, outDir = ARTIFACTS, recordsDir = RECORDS, writeOutput = true, provenanceFile = CANONICAL_PROVENANCE } = {}) {
  const boundary = JSON.parse(await readFile(BOUNDARY, 'utf8'));
  const target = version || boundary.targetVersion;
  const packageExclusions = boundary.packageExclusions || [];
  const findings = [];

  const scan = await verifyGeneratedTree({ treeDir: repoRoot, boundaryFile: BOUNDARY, requireProvenance: false });
  if (!scan.ok) findings.push('repo scan failed: ' + scan.findings.length + ' findings');

  const match = await provenanceMatch(repoRoot);
  if (!match.ok) findings.push('provenance mismatch: ' + match.mismatches + ' changed / ' + match.missing + ' missing (of ' + match.checked + ')');

  const fingerprint = await computeWorkspaceFingerprint(repoRoot);

  // Build the deployable bundle from the artifact source at cut time.
  execFileSync(process.execPath, [resolve(join(repoRoot, 'worker/scripts/bundle-worker.mjs'))], { cwd: join(repoRoot, 'worker'), stdio: 'pipe' });
  const bundlePath = join(repoRoot, 'worker/dist/worker.mjs');
  const { readFile: rf } = await import('node:fs/promises');
  const bundleSha256 = createHash('sha256').update(await rf(bundlePath)).digest('hex');

  const provenanceSha256 = createHash('sha256').update(await rf(provenanceFile)).digest('hex');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = 'proofclip-community-' + target + '-' + stamp + '.zip';
  const staging = join(tmpdir(), 'proofclip-package-' + target);
  const zipPath = join(outDir, fileName);

  if (writeOutput) {
    await mkdir(outDir, { recursive: true });
    await mkdir(recordsDir, { recursive: true });
    try {
      await rm(staging, { recursive: true, force: true });
      await mkdir(staging, { recursive: true });
      for (const root of PACKAGE_ROOTS) {
        if (await stat(join(repoRoot, root)).then(() => true).catch(() => false)) {
          await copyTreeFiltered(join(repoRoot, root), join(staging, root), repoRoot, packageExclusions);
        }
      }
      for (const file of PACKAGE_FILES) {
        const src = join(repoRoot, file);
        if (await stat(src).then(() => true).catch(() => false)) await cp(src, join(staging, file));
      }
      await cp(provenanceFile, join(staging, 'PROVENANCE.json'));
      await cp(bundlePath, join(staging, 'worker/dist/worker.mjs'));

      try {
        execFileSync('tar', ['-a', '-c', '-f', zipPath, '-C', staging, '.'], { stdio: 'pipe' });
      } catch (error) {
        findings.push('zip creation failed: ' + (error?.message || String(error)));
      }
    } finally {
      await rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  }

  const statZip = await stat(zipPath).then((s) => s).catch(() => null);
  const artifactSha256 = statZip ? createHash('sha256').update(await rf(zipPath)).digest('hex') : null;
  let entries = [];
  let contentFingerprint = null;
  let fileCount = null;
  if (statZip) {
    try {
      const listing = execFileSync('tar', ['-t', '-f', zipPath], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      entries = listing.split(/\r?\n/).filter(Boolean).map((e) => e.replace(/\/$/, '')).sort();
      fileCount = entries.length;
      const hashes = [];
      for (const entry of entries) {
        try {
          const data = execFileSync('tar', ['-xOf', zipPath, entry], { stdio: ['ignore', 'pipe', 'ignore'] });
          hashes.push(entry + ':' + createHash('sha256').update(data).digest('hex'));
        } catch { hashes.push(entry + ':UNREADABLE'); }
      }
      contentFingerprint = createHash('sha256').update(hashes.join('\n')).digest('hex');
    } catch (error) {
      findings.push('zip listing failed: ' + (error?.message || String(error)));
    }
  }

  const record = {
    schemaVersion: 1,
    version: target,
    state: 'STAGED',
    createdAt: new Date().toISOString(),
    artifact: {
      path: relative(repoRoot, zipPath),
      fileName,
      sha256: artifactSha256,
      sizeBytes: statZip?.size ?? null,
      fileCount,
      entries,
      contentFingerprint,
      bundleSha256,
      bundlePath: 'worker/dist/worker.mjs'
    },
    sourceBinding: {
      commit: tryGitHead(repoRoot),
      workspaceFingerprint: fingerprint,
      provenanceFileSha256: provenanceSha256,
      provenanceMatch: { checked: match.checked, mismatches: match.mismatches, missing: match.missing, ok: match.ok }
    },
    gates: { repoScan: { ok: scan.ok, scannedFiles: scan.fileCount } },
    packaging: { roots: PACKAGE_ROOTS, files: PACKAGE_FILES, exclusions: packageExclusions },
    build: { nodeVersion: process.version },
    editionDiffReport: await buildEditionDiffReport(provenanceFile, findings, repoRoot, boundary),
    rehearsals: { freshDeploy: 'NOT_RUN', upgrade07To08: 'NOT_RUN' },
    note: 'STAGED local cut. Promote to READY_FOR_RELEASE_REVIEW only after rehearsals pass and the final audit is green.'
  };

  if (writeOutput) {
    const recordFile = join(recordsDir, 'release-record.json');
    const recordHistory = join(recordsDir, 'release-record-' + target + '-' + stamp + '.json');
    await writeFile(recordFile, JSON.stringify(record, null, 2) + '\n', 'utf8');
    await writeFile(recordHistory, JSON.stringify(record, null, 2) + '\n', 'utf8');
    if (artifactSha256) await writeFile(zipPath + '.sha256', artifactSha256 + '  ' + fileName + '\n', 'utf8');
  }

  return { ok: findings.length === 0, findings, record };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const versionArg = process.argv.slice(2).find((a) => a.startsWith('--version='))?.split('=')[1];
  const result = await cutRelease({ version: versionArg });
  for (const finding of result.findings) console.log('FINDING: ' + finding);
  const rec = result.record;
  console.log('artifact: ' + rec.artifact.fileName + ' sha256=' + rec.artifact.sha256);
  console.log('sourceBinding: commit=' + rec.sourceBinding.commit + ' fingerprint=' + rec.sourceBinding.workspaceFingerprint.slice(0, 16) + ' provenanceMatch=' + rec.sourceBinding.provenanceMatch.ok);
  console.log('state: ' + rec.state + (result.ok ? ' (cut OK)' : ' (cut FAILED)'));
  process.exit(result.ok ? 0 : 1);
}