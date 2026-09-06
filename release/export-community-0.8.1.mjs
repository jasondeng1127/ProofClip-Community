import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { access, mkdtemp, mkdir, readdir, readFile, rm, writeFile, rename } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCommunity081Candidate } from './verify-community-0.8.1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = resolve(HERE, '..');
const DEFAULT_OUT = join(HERE, 'out', 'community-0.8.1');
const KEY = (value) => String(value).split(/[\\/]/).join('/');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

const ROOT_FILES = new Set([
  'README.md',
  'LICENSE',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'TRADEMARKS.md',
  'MIGRATION.md',
]);

const REQUIRED_FILES = [
  'extension/src/manifest.json',
  'extension/src/community-config.mjs',
  'worker/src/worker.mjs',
  'worker/src/index.mjs',
  'worker/src/schema.sql',
  'worker/migrations/20260813_privacy_nonretention.sql',
  'worker/scripts/bundle-worker.mjs',
  'worker/dist/worker.mjs',
  'deploy/deploy.ps1',
  'deploy/deploy.sh',
  'deploy/deploy.env.example',
  'deploy/wrangler.template.jsonc',
  'docs/community-0.8.1-deployment.md',
  'README.md',
  'LICENSE',
  'SECURITY.md',
  'CONTRIBUTING.md',
  'TRADEMARKS.md',
  'MIGRATION.md',
];

export const defaultGit = {
  revParse(repoRoot) {
    try {
      return execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      return null;
    }
  },
  statusPorcelain(repoRoot) {
    try {
      return execFileSync('git', ['-C', repoRoot, 'status', '--porcelain'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch {
      return null;
    }
  },
  listFiles(repoRoot, expectedCommit) {
    try {
      const actualCommit = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (expectedCommit && actualCommit !== expectedCommit) return null;
      return execFileSync('git', ['-C', repoRoot, 'ls-files', '-z', '--'], { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString('utf8')
        .split('\0')
        .filter(Boolean)
        .map(KEY)
        .sort();
    } catch {
      return null;
    }
  },
  readObject(repoRoot, commit, path) {
    try {
      return execFileSync('git', ['-C', repoRoot, 'show', `${commit}:${path}`], { stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      return null;
    }
  },
};

async function walkFiles(root) {
  const files = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push(full);
      else throw new Error(`unsupported source entry: ${KEY(relative(root, full))}`);
    }
  }
  await visit(root);
  return files;
}

function isProductionPath(path) {
  const normalized = KEY(path);
  if (normalized === 'PROVENANCE.json') return false;
  if (ROOT_FILES.has(normalized) || normalized === 'docs/community-0.8.1-deployment.md') return true;
  const segments = normalized.split('/');
  if (segments.some((segment) => ['tests', 'test', 'fixtures', 'fixture', 'test-data', 'testdata', 'test-fixtures', 'test_fixtures', 'node_modules', '.wrangler', '.generated', '.state'].includes(segment))) return false;
  if (/\.(test|spec)\.[^/]+$/i.test(normalized)) return false;
  if (/\.(?:key|pem)$/i.test(normalized)) return false;
  if (normalized.startsWith('extension/src/')) return true;
  if (normalized.startsWith('worker/src/')) return !normalized.startsWith('worker/src/dist/');
  if (normalized.startsWith('worker/migrations/')) return true;
  if (normalized.startsWith('worker/scripts/')) return true;
  if (normalized.startsWith('deploy/')) {
    const fileName = segments.at(-1);
    return fileName !== 'deploy.env' && !/^\.dev\.vars(?:\.example)?$/i.test(fileName) && !normalized.endsWith('/worker/dist/worker.mjs');
  }
  return false;
}

function normalizeTrackedFiles(trackedFiles) {
  if (!Array.isArray(trackedFiles)) throw new Error('tracked Git file list is unavailable; refusing to export from the working tree');
  const normalized = trackedFiles.map(KEY).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error('tracked Git file list is unstable: duplicate path');
  return normalized;
}

function collectAllowlistedFiles(trackedFiles) {
  const entries = [];
  for (const trackedPath of normalizeTrackedFiles(trackedFiles)) {
    if (!isProductionPath(trackedPath)) continue;
    if (trackedPath.startsWith('../') || trackedPath.startsWith('/') || /^[A-Za-z]:\//.test(trackedPath)) {
      throw new Error(`invalid tracked path: ${trackedPath}`);
    }
    entries.push({ path: trackedPath, output: trackedPath });
  }
  return entries;
}

async function readTrackedObject(gitImpl, sourceRoot, sourceCommit, path) {
  const bytes = await Promise.resolve(gitImpl.readObject?.(sourceRoot, sourceCommit, path));
  if (!Buffer.isBuffer(bytes)) throw new Error(`required source file missing from verified Git object: ${path}`);
  return bytes;
}

async function runBundle(candidateDir) {
  const script = join(candidateDir, 'worker/scripts/bundle-worker.mjs');
  await new Promise((resolvePromise, reject) => {
    execFile(process.execPath, [script], { cwd: candidateDir, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`offline Worker bundle failed: ${error.message}`));
      } else resolvePromise();
    });
  });
}

async function hashCandidateFiles(candidateDir) {
  const files = [];
  for (const file of await walkFiles(candidateDir)) {
    const path = KEY(relative(candidateDir, file));
    if (path === 'PROVENANCE.json') continue;
    files.push({ path, sha256: sha256(await readFile(file)) });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const contentFingerprint = sha256(Buffer.from(files.map((file) => `${file.path}:${file.sha256}`).join('\n'), 'utf8'));
  return { files, contentFingerprint };
}

function ensureRequiredFiles(files) {
  const available = new Set(files.map((file) => file.path));
  const missing = REQUIRED_FILES.filter((path) => !available.has(path));
  if (missing.length) throw new Error(`candidate required files missing: ${missing.join(', ')}`);
}

export async function createCommunity081Candidate({ sourceRoot = DEFAULT_SOURCE, outDir = DEFAULT_OUT, gitImpl = defaultGit, now = () => new Date().toISOString(), verifyImpl = verifyCommunity081Candidate }) {
  const source = resolve(sourceRoot);
  const candidateDir = resolve(outDir);

  const sourceCommit = await Promise.resolve(gitImpl.revParse(source));
  if (!/^[0-9a-f]{40}$/i.test(String(sourceCommit || ''))) throw new Error('clean source commit required: git rev-parse HEAD must return the full 40-character commit');
  const status = await Promise.resolve(gitImpl.statusPorcelain(source));
  if (status === null || String(status).trim()) throw new Error('clean source tree required: source tree is dirty');
  const trackedFiles = normalizeTrackedFiles(await Promise.resolve(gitImpl.listFiles(source, sourceCommit)));
  const trackedFilesAgain = normalizeTrackedFiles(await Promise.resolve(gitImpl.listFiles(source, sourceCommit)));
  if (JSON.stringify(trackedFiles) !== JSON.stringify(trackedFilesAgain)) throw new Error('tracked Git file list changed during export; refusing unstable source');

  await access(source);
  await mkdir(dirname(candidateDir), { recursive: true });
  try {
    await access(candidateDir);
    throw new Error(`candidate output already exists: ${candidateDir}`);
  } catch (error) {
    if (error?.message?.startsWith('candidate output already exists:')) throw error;
  }

  const entries = collectAllowlistedFiles(trackedFiles);
  const tempDir = await mkdtemp(join(dirname(candidateDir), `.community-081-${now().replace(/[^0-9A-Za-z-]/g, '')}-`));
  const sidecar = `${candidateDir}.sha256`;
  let published = false;
  try {
    for (const entry of entries) {
      const destination = join(tempDir, entry.output);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await readTrackedObject(gitImpl, source, sourceCommit, entry.path));
    }

    await runBundle(tempDir);
    const distFiles = await walkFiles(join(tempDir, 'worker/dist'));
    const unexpectedDist = distFiles.filter((file) => KEY(relative(join(tempDir, 'worker/dist'), file)) !== 'worker.mjs');
    if (unexpectedDist.length) throw new Error('candidate Worker dist contains files other than worker/dist/worker.mjs');

    const bundle = await readFile(join(tempDir, 'worker/dist/worker.mjs'));
    const payload = await hashCandidateFiles(tempDir);
    ensureRequiredFiles(payload.files);
    const provenance = {
      schemaVersion: 1,
      edition: 'community',
      targetVersion: '0.8.1',
      candidateVersion: '0.8.1',
      sourceCommit,
      files: payload.files,
      bundle: {
        path: 'worker/dist/worker.mjs',
        sourcePath: 'worker/scripts/bundle-worker.mjs',
        sha256: sha256(bundle),
      },
      contentFingerprint: payload.contentFingerprint,
    };
    await writeFile(join(tempDir, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
    await rename(tempDir, candidateDir);
    published = true;
    await writeFile(sidecar, `${payload.contentFingerprint}  ${candidateDir.split(/[\\/]/).at(-1)}\n`, 'utf8');
    let verification;
    try {
      verification = await verifyImpl({ candidateDir, expectedCommit: sourceCommit, expectedFingerprint: payload.contentFingerprint });
    } catch (error) {
      throw new Error('candidate self-verification failed', { cause: error });
    }
    if (!verification?.ok) throw new Error('candidate self-verification failed');
    return { sourceCommit, files: payload.files, contentFingerprint: payload.contentFingerprint, candidateDir };
  } catch (error) {
    if (published) {
      await rm(candidateDir, { recursive: true, force: true });
      await rm(sidecar, { force: true });
    } else {
      await rm(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const sourceArg = process.argv.find((arg) => arg.startsWith('--source='))?.slice('--source='.length) || DEFAULT_SOURCE;
  const outArg = process.argv.find((arg) => arg.startsWith('--out='))?.slice('--out='.length) || DEFAULT_OUT;
  const result = await createCommunity081Candidate({ sourceRoot: sourceArg, outDir: outArg });
  console.log(`Community 0.8.1 candidate written: ${result.candidateDir}`);
  console.log(`source commit: ${result.sourceCommit}`);
  console.log(`content fingerprint: ${result.contentFingerprint}`);
}
