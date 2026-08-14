// Community commercial-boundary scanner (A5).
// Scans a generated Community tree for forbidden paths, forbidden content
// tokens, required files, and PROVENANCE hash integrity.
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BOUNDARY = join(HERE, 'edition-boundary.json');
const DEFAULT_TREE = join(HERE, 'out', 'community-0.8.0');
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico']);
const TEXT_EXTENSIONS = new Set(['.mjs', '.js', '.json', '.jsonc', '.sql', '.html', '.css', '.md', '.svg', '.txt', '.ps1']);

export const KEY = (p) => String(p).split(/[\\/]/).join('/');

export async function walkFiles(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await visit(root);
  return files;
}

export async function verifyGeneratedTree({ treeDir = DEFAULT_TREE, boundaryFile = DEFAULT_BOUNDARY, requireProvenance = true } = {}) {
  const boundary = JSON.parse(await readFile(boundaryFile, 'utf8'));
  const findings = [];
  let fileCount = 0;

  if (!(await stat(treeDir).then(() => true).catch(() => false))) {
    return { ok: false, findings: ['tree directory does not exist: ' + treeDir], fileCount: 0 };
  }

  const provenancePath = join(treeDir, 'PROVENANCE.json');
  const hasProvenance = requireProvenance && (await stat(provenancePath).then(() => true).catch(() => false));
  const provenance = hasProvenance ? JSON.parse(await readFile(provenancePath, 'utf8')) : null;
  const provenanceByPath = new Map((provenance?.files || []).map((f) => [KEY(f.path), f]));

  const requiredFiles = Array.isArray(boundary.requiredFiles) ? boundary.requiredFiles : [];

  // Repo mode (no PROVENANCE) scans only the product roots; release/, docs/,
  // LICENSE and scripts/ legitimately discuss commercial terms and identities.
  const scanRoots = requireProvenance ? [treeDir] : ['extension', 'worker'].map((name) => join(treeDir, name)).filter((p) => stat(p).then(() => true).catch(() => false));
  const scanned = [];
  for (const root of scanRoots) scanned.push(...await walkFiles(root));
  for (const file of scanned) {
    const rel = KEY(resolve(file).slice(resolve(treeDir).length + 1));
    if (rel === 'PROVENANCE.json') continue;
    if (rel.startsWith('worker/dist/')) continue; // build artifact produced by the bundle test
    fileCount += 1;

    for (const pattern of boundary.forbiddenPathPatterns) {
      if (new RegExp(pattern).test(rel)) findings.push('forbidden path: ' + rel);
    }

    const ext = extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext) && !BINARY_EXTENSIONS.has(ext)) {
      findings.push('unexpected file type: ' + rel);
      continue;
    }
    if (BINARY_EXTENSIONS.has(ext)) continue;
    // Test files are designed to name retired facilities when asserting their
    // absence; the token scan therefore applies to product source only.
    if (rel.includes('/tests/') || rel.startsWith('tests/')) continue;
    const content = await readFile(file, 'utf8');
    for (const token of boundary.forbiddenTokens) {
      if (content.includes(token)) findings.push('forbidden token "' + token + '" in ' + rel);
    }
  }

  for (const rel of requiredFiles) {
    const full = join(treeDir, rel);
    if (!(await stat(full).then(() => true).catch(() => false))) findings.push('required file missing: ' + rel);
  }

  if (provenance) {
    for (const entry of provenance.files) {
      const full = join(treeDir, entry.path);
      if (!(await stat(full).then(() => true).catch(() => false))) { findings.push('provenance file missing: ' + entry.path); continue; }
      const content = await readFile(full, 'utf8');
      const hash = createHash('sha256').update(content, 'utf8').digest('hex');
      if (hash !== entry.sha256) findings.push('provenance hash mismatch: ' + entry.path);
    }
    if (provenanceByPath.size !== fileCount) findings.push('provenance lists ' + provenanceByPath.size + ' files but tree has ' + fileCount);
  } else if (requireProvenance) {
    findings.push('PROVENANCE.json is missing');
  }

  return { ok: findings.length === 0, findings, fileCount };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const treeArg = args.find((a) => a.startsWith('--tree='))?.split('=')[1] || (args[args.indexOf('--tree') + 1] && !args[args.indexOf('--tree') + 1].startsWith('--') ? args[args.indexOf('--tree') + 1] : undefined);
  const repoMode = process.argv.includes('--repo');
  const result = await verifyGeneratedTree({ treeDir: treeArg || (repoMode ? '.' : DEFAULT_TREE), requireProvenance: !repoMode });
  for (const finding of result.findings) console.log('FINDING: ' + finding);
  console.log('Scanned ' + result.fileCount + ' files; ' + (result.ok ? 'CLEAN.' : result.findings.length + ' findings.'));
  process.exit(result.ok ? 0 : 1);
}