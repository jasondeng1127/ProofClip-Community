import { createHash, randomBytes } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { access, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyCommunity081Candidate } from './verify-community-0.8.1.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SOURCE = resolve(HERE, '..');
const DEFAULT_OUT = join(HERE, 'out', 'community-0.8.1');
const KEY = (value) => String(value).split(/[\\/]/).join('/');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function parseGitTree(bytes) {
  const entries = [];
  for (const record of bytes.toString('utf8').split('\0')) {
    if (!record) continue;
    const separator = record.indexOf('\t');
    if (separator <= 0 || separator === record.length - 1) throw new Error('malformed verified HEAD tree entry');
    const metadata = record.slice(0, separator).split(' ');
    const path = record.slice(separator + 1);
    if (metadata.length !== 3 || !/^(?:100644|100755)$/.test(metadata[0]) || metadata[1] !== 'blob' || !/^[0-9a-f]{40}$/i.test(metadata[2]) || !path || path.includes('\0')) {
      throw new Error(`non-regular or malformed verified HEAD tree entry: ${path || '<unknown>'}`);
    }
    entries.push({ mode: metadata[0], type: metadata[1], object: metadata[2], path: KEY(path) });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error('duplicate verified HEAD tree entry');
  return entries;
}

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
  listTree(repoRoot, expectedCommit) {
    try {
      const actualCommit = execFileSync('git', ['-C', repoRoot, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (expectedCommit && actualCommit !== expectedCommit) return null;
      return parseGitTree(execFileSync('git', ['-C', repoRoot, 'ls-tree', '-r', '-z', '--full-tree', expectedCommit], { stdio: ['ignore', 'pipe', 'ignore'] }));
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

function normalizeTreeEntries(treeEntries) {
  if (!Array.isArray(treeEntries)) throw new Error('verified HEAD tree is unavailable; refusing to export');
  const entries = treeEntries.map((entry) => ({
    mode: String(entry?.mode || ''),
    type: String(entry?.type || ''),
    object: String(entry?.object || ''),
    path: KEY(entry?.path || ''),
  })).sort((a, b) => a.path.localeCompare(b.path));
  for (const entry of entries) {
    if (!/^(?:100644|100755)$/.test(entry.mode) || entry.type !== 'blob' || !/^[0-9a-f]{40}$/i.test(entry.object) || !entry.path || entry.path.startsWith('../') || entry.path.startsWith('/') || /^[A-Za-z]:\//.test(entry.path)) {
      throw new Error(`non-regular or malformed verified HEAD tree entry: ${entry.path || '<unknown>'}`);
    }
  }
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) throw new Error('duplicate verified HEAD tree entry');
  return entries;
}

function collectAllowlistedFiles(treeEntries) {
  const entries = [];
  for (const entry of treeEntries) {
    if (isProductionPath(entry.path)) entries.push({ path: entry.path, output: entry.path, mode: entry.mode });
  }
  return entries;
}

async function readTrackedObject(gitImpl, sourceRoot, sourceCommit, path) {
  const bytes = await Promise.resolve(gitImpl.readObject?.(sourceRoot, sourceCommit, path));
  if (!Buffer.isBuffer(bytes)) throw new Error(`required source file missing from verified Git object: ${path}`);
  return bytes;
}

async function assertAbsent(path, label) {
  try {
    await lstat(path);
    throw new Error(`${label} already exists: ${path}`);
  } catch (error) {
    if (error?.message?.startsWith(`${label} already exists:`)) throw error;
    if (error?.code !== 'ENOENT') throw error;
  }
}

function sameFileIdentity(left, right) {
  return Boolean(left && right && left.dev === right.dev && left.ino === right.ino);
}

async function reserveCandidateDirectory(candidateDir) {
  try {
    await mkdir(candidateDir);
  } catch (error) {
    throw new Error(`candidate output reservation failed: ${candidateDir}`, { cause: error });
  }
  const directoryIdentity = await lstat(candidateDir);
  const token = randomBytes(32).toString('hex');
  const markerPath = `${candidateDir}.owner-${randomBytes(16).toString('hex')}`;
  await writeFile(markerPath, `${token}\n`, { encoding: 'utf8', flag: 'wx' });
  const markerIdentity = await lstat(markerPath);
  return { candidateDir, directoryIdentity, markerPath, markerIdentity, token };
}

async function markerTokenIsOwned(reservation) {
  try {
    const markerIdentity = await lstat(reservation.markerPath);
    if (!sameFileIdentity(markerIdentity, reservation.markerIdentity) || !markerIdentity.isFile()) return false;
    return (await readFile(reservation.markerPath, 'utf8')) === `${reservation.token}\n`;
  } catch {
    return false;
  }
}

async function markerIsOwned(reservation) {
  try {
    const directoryIdentity = await lstat(reservation.candidateDir);
    return sameFileIdentity(directoryIdentity, reservation.directoryIdentity) && await markerTokenIsOwned(reservation);
  } catch {
    return false;
  }
}

function quarantineName(path) {
  return `${path}.quarantine-${randomBytes(16).toString('hex')}`;
}

async function quarantineOwnedMarker(reservation) {
  const isolated = quarantineName(reservation.markerPath);
  try {
    await rename(reservation.markerPath, isolated);
    const isolatedIdentity = await lstat(isolated);
    if (!sameFileIdentity(isolatedIdentity, reservation.markerIdentity) || !isolatedIdentity.isFile() || (await readFile(isolated, 'utf8')) !== `${reservation.token}\n`) return false;
    await rm(isolated, { force: true });
    return true;
  } catch {
    return false;
  }
}

async function removeOwnedMarker(reservation) {
  return quarantineOwnedMarker(reservation);
}

async function quarantineOwnedReservation(reservation, beforeCleanup) {
  if (!await markerIsOwned(reservation)) return false;
  if (beforeCleanup) await beforeCleanup({ phase: 'candidate', candidateDir: reservation.candidateDir, reservation });

  const isolated = quarantineName(reservation.candidateDir);
  try {
    await rename(reservation.candidateDir, isolated);
    const isolatedIdentity = await lstat(isolated);
    if (!sameFileIdentity(isolatedIdentity, reservation.directoryIdentity) || !isolatedIdentity.isDirectory() || !await markerTokenIsOwned(reservation)) return false;
    await rm(isolated, { recursive: true, force: true });
    await quarantineOwnedMarker(reservation);
    return true;
  } catch {
    return false;
  }
}

async function quarantineOwnedFile(path, identity, beforeCleanup) {
  if (!identity) return false;
  const isolated = quarantineName(path);
  try {
    const current = await lstat(path);
    if (!sameFileIdentity(current, identity) || !current.isFile()) return false;
    if (beforeCleanup) await beforeCleanup({ phase: 'sidecar', path });
    await rename(path, isolated);
    const isolatedIdentity = await lstat(isolated);
    if (!sameFileIdentity(isolatedIdentity, identity) || !isolatedIdentity.isFile()) return false;
    await rm(isolated, { force: true });
    return true;
  } catch {
    return false;
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

export async function createCommunity081Candidate({ sourceRoot = DEFAULT_SOURCE, outDir = DEFAULT_OUT, gitImpl = defaultGit, now = () => new Date().toISOString(), verifyImpl = verifyCommunity081Candidate, beforeCleanup = null }) {
  const source = resolve(sourceRoot);
  const candidateDir = resolve(outDir);
  if (/\s/.test(basename(candidateDir))) throw new Error('candidate output basename must not contain whitespace');

  const sourceCommit = await Promise.resolve(gitImpl.revParse(source));
  if (!/^[0-9a-f]{40}$/i.test(String(sourceCommit || ''))) throw new Error('clean source commit required: git rev-parse HEAD must return the full 40-character commit');
  const status = await Promise.resolve(gitImpl.statusPorcelain(source));
  if (status === null || String(status).trim()) throw new Error('clean source tree required: source tree is dirty');

  await access(source);
  await mkdir(dirname(candidateDir), { recursive: true });
  const sidecar = `${candidateDir}.sha256`;
  await assertAbsent(candidateDir, 'candidate output');
  await assertAbsent(sidecar, 'candidate sidecar');

  let reservation;
  let sidecarCreated = false;
  let sidecarIdentity;
  try {
    reservation = await reserveCandidateDirectory(candidateDir);
    const treeEntries = normalizeTreeEntries(await Promise.resolve(gitImpl.listTree(source, sourceCommit)));
    const treeEntriesAgain = normalizeTreeEntries(await Promise.resolve(gitImpl.listTree(source, sourceCommit)));
    if (JSON.stringify(treeEntries) !== JSON.stringify(treeEntriesAgain)) throw new Error('verified HEAD tree changed during export; refusing unstable source');
    const entries = collectAllowlistedFiles(treeEntries);

    for (const entry of entries) {
      const destination = join(candidateDir, entry.output);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await readTrackedObject(gitImpl, source, sourceCommit, entry.path));
    }

    await runBundle(candidateDir);
    const distFiles = await walkFiles(join(candidateDir, 'worker/dist'));
    const unexpectedDist = distFiles.filter((file) => KEY(relative(join(candidateDir, 'worker/dist'), file)) !== 'worker.mjs');
    if (unexpectedDist.length) throw new Error('candidate Worker dist contains files other than worker/dist/worker.mjs');

    const bundle = await readFile(join(candidateDir, 'worker/dist/worker.mjs'));
    const payload = await hashCandidateFiles(candidateDir);
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
    await writeFile(join(candidateDir, 'PROVENANCE.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
    await writeFile(sidecar, `${payload.contentFingerprint}  ${candidateDir.split(/[\\/]/).at(-1)}\n`, { encoding: 'utf8', flag: 'wx' });
    sidecarCreated = true;
    sidecarIdentity = await lstat(sidecar);
    let verification;
    try {
      verification = await verifyImpl({ candidateDir, expectedCommit: sourceCommit, expectedFingerprint: payload.contentFingerprint });
    } catch (error) {
      throw new Error('candidate self-verification failed', { cause: error });
    }
    if (!verification?.ok) throw new Error('candidate self-verification failed');
    if (!await removeOwnedMarker(reservation)) throw new Error('candidate ownership marker changed before completion');
    return { sourceCommit, files: payload.files, contentFingerprint: payload.contentFingerprint, candidateDir };
  } catch (error) {
    if (reservation) await quarantineOwnedReservation(reservation, beforeCleanup);
    if (sidecarCreated) await quarantineOwnedFile(sidecar, sidecarIdentity, beforeCleanup);
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
