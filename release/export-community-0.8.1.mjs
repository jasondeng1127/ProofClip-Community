import { createHash } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { access, copyFile, mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile, rename } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  'worker/src/schema.sql',
  'worker/migrations/20260813_privacy_nonretention.sql',
  'worker/scripts/bundle-worker.mjs',
  'worker/dist/worker.mjs',
  'deploy/deploy.ps1',
  'deploy/deploy.sh',
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

function includeDeployPath(path) {
  const segments = path.split('/');
  return !segments.includes('node_modules')
    && !segments.includes('.generated')
    && !segments.includes('.state')
    && !segments.includes('.wrangler')
    && !['deploy.env', '.dev.vars', '.dev.vars.example'].includes(segments.at(-1));
}

function sourceAllowlist(sourceRoot) {
  return [
    ...ROOT_FILES,
    'docs/community-0.8.1-deployment.md',
  ].map((path) => ({ source: join(sourceRoot, path), output: path }));
}

async function collectAllowlistedFiles(sourceRoot) {
  const entries = sourceAllowlist(sourceRoot);
  for (const root of ['extension/src', 'worker/src', 'worker/migrations', 'worker/scripts', 'deploy']) {
    const source = join(sourceRoot, root);
    for (const file of await walkFiles(source)) {
      const output = KEY(relative(sourceRoot, file));
      if (root === 'deploy' && !includeDeployPath(output.slice('deploy/'.length))) continue;
      if (root === 'worker/src' && output.startsWith('worker/src/dist/')) continue;
      entries.push({ source: file, output });
    }
  }
  return entries.sort((a, b) => a.output.localeCompare(b.output));
}

async function assertSourceFile(entry) {
  try {
    const info = await stat(entry.source);
    if (!info.isFile()) throw new Error(`required source path is not a file: ${entry.output}`);
  } catch (error) {
    throw new Error(`required source file missing: ${entry.output}`, { cause: error });
  }
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

export async function createCommunity081Candidate({ sourceRoot = DEFAULT_SOURCE, outDir = DEFAULT_OUT, gitImpl = defaultGit, now = () => new Date().toISOString() }) {
  const source = resolve(sourceRoot);
  const candidateDir = resolve(outDir);

  const sourceCommit = await Promise.resolve(gitImpl.revParse(source));
  if (!sourceCommit) throw new Error('clean source commit required: git rev-parse HEAD failed');
  const status = await Promise.resolve(gitImpl.statusPorcelain(source));
  if (status === null || String(status).trim()) throw new Error('clean source tree required: source tree is dirty');

  await access(source);
  await mkdir(dirname(candidateDir), { recursive: true });
  try {
    await access(candidateDir);
    throw new Error(`candidate output already exists: ${candidateDir}`);
  } catch (error) {
    if (error?.message?.startsWith('candidate output already exists:')) throw error;
  }

  const entries = await collectAllowlistedFiles(source);
  for (const entry of entries) await assertSourceFile(entry);
  const tempDir = await mkdtemp(join(dirname(candidateDir), `.community-081-${now().replace(/[^0-9A-Za-z-]/g, '')}-`));
  try {
    for (const entry of entries) {
      const destination = join(tempDir, entry.output);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(entry.source, destination);
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
    const sidecar = `${candidateDir}.sha256`;
    await writeFile(sidecar, `${payload.contentFingerprint}  ${candidateDir.split(/[\\/]/).at(-1)}\n`, 'utf8');
    return { sourceCommit, files: payload.files, contentFingerprint: payload.contentFingerprint, candidateDir };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
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
