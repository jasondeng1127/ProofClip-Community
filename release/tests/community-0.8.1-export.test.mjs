import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, lstat, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative } from 'node:path';
import test from 'node:test';
import { createCommunity081Candidate } from '../export-community-0.8.1.mjs';
import { verifyCommunity081Candidate } from '../verify-community-0.8.1.mjs';

const STABLE_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoE6clBamwq6eJy+8TWYYbrDkUwCOB8b0X3sN7y67BY/qfHsNEgSNgLRsdE7EK+kaQRI1hr0cCRizkmDypEpEuL3YqNsgXI2nZMJjO9uRKirPLhi78vWybVc1EDVhl6gGqftg6rbWPHvlhx2SCMoUknpZ7q+d5eM0TPqF6F3SEFURA7SHyKTuSbTURrQbGfqkVwNukH5vWyojDKQW5Sk3r5ixI//5nxQOC+d5+rkutrd0hkZFEEus+Ty54Y/7u1CrVT7zjLH0Qw8xZ7ajnwHaZe2RFpVZMCPn+9y4EZvieXAmN/j048HPCEg0HFcTFTIfrGLRHGASorE8nPWcFb/AkQIDAQAB';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function treeEntries(repo, commit, paths) {
  const output = execFileSync('git', ['-C', repo, 'ls-tree', '-r', '-z', '--full-tree', commit], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const entries = output.split('\0').filter(Boolean).map((record) => {
    const [metadata, path] = record.split('\t');
    const [mode, type, object] = metadata.split(' ');
    return { mode, type, object, path };
  });
  if (!paths) return entries;
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  return paths.map((path) => byPath.get(path) || { mode: '100644', type: 'blob', object: '0'.repeat(40), path });
}

function gitImpl(commit, trackedFiles, status = '', options = {}) {
  let listCalls = 0;
  return {
    revParse: async () => commit,
    statusPorcelain: async () => status,
    listTree: async (repo, objectCommit) => options.listTree ? options.listTree(++listCalls, repo, objectCommit) : treeEntries(repo, objectCommit, trackedFiles),
    readObject: async (repo, objectCommit, path) => options.readObject
      ? options.readObject(repo, objectCommit, path)
      : (() => {
        try {
          return execFileSync('git', ['-C', repo, 'show', `${objectCommit}:${path}`], { stdio: ['ignore', 'pipe', 'ignore'] });
        } catch {
          return null;
        }
      })(),
  };
}

async function put(root, path, content) {
  const file = join(root, path);
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, content);
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'proofclip-community-081-export-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'Fixture');

  await put(root, '.gitignore', [
    'candidate*',
    '*.sha256',
    'deploy/private.key',
    'deploy/.generated/',
    'deploy/.state/',
    'worker/dist/',
    '.wrangler/',
  ].join('\n') + '\n');
  await put(root, 'extension/src/manifest.json', JSON.stringify({ manifest_version: 3, version: '0.8.1', key: STABLE_PUBLIC_KEY }));
  await put(root, 'extension/src/community-config.mjs', 'export const COMMUNITY_API_ORIGIN = "https://replace-me.invalid";\n');
  await put(root, 'extension/src/background.js', 'export const COMMUNITY = true;\n');
  await put(root, 'worker/src/worker.mjs', 'export const workerMarker = "community-081";\n');
  await put(root, 'worker/src/index.mjs', 'export const indexMarker = "community-081";\n');
  await put(root, 'worker/src/schema.sql', 'CREATE TABLE oauth_state (state TEXT PRIMARY KEY);\n');
  await put(root, 'worker/migrations/20260813_privacy_nonretention.sql', '-- privacy migration\n');
  await put(root, 'worker/scripts/bundle-worker.mjs', [
    "import { readFile, mkdir, writeFile } from 'node:fs/promises';",
    "await mkdir('worker/dist', { recursive: true });",
    "const source = await readFile('worker/src/worker.mjs', 'utf8');",
    "await writeFile('worker/dist/worker.mjs', `// staged bundle\\n${source}`, 'utf8');",
    ''
  ].join('\n'));
  await put(root, 'deploy/deploy-core.mjs', 'export const productionDeployCore = true;\n');
  await put(root, 'deploy/deploy.env.example', 'CF_API_TOKEN=\nNOTION_CLIENT_ID=\nNOTION_CLIENT_SECRET=\n');
  await put(root, 'deploy/deploy.ps1', 'node deploy/deploy-core.mjs --env deploy/deploy.env\n');
  await put(root, 'deploy/deploy.sh', '#!/bin/sh\nnode deploy/deploy-core.mjs --env deploy/deploy.env\n');
  await put(root, 'deploy/README.md', '# deployment template\n');
  await put(root, 'deploy/wrangler.template.jsonc', '{ "compatibility_date": "2026-08-14" }\n');
  await put(root, 'deploy/package.json', '{ "private": true, "type": "module" }\n');
  await put(root, 'deploy/package-lock.json', '{ "lockfileVersion": 3 }\n');
  await put(root, 'deploy/lib/identity.mjs', 'export const productionIdentity = true;\n');
  await put(root, 'docs/community-0.8.1-deployment.md', '# Community 0.8.1 deployment\n');
  await put(root, 'README.md', '# ProofClip Community\n');
  await put(root, 'LICENSE', 'AGPL-3.0\n');
  await put(root, 'SECURITY.md', '# Security\n');
  await put(root, 'CONTRIBUTING.md', '# Contributing\n');
  await put(root, 'TRADEMARKS.md', '# Trademarks\n');
  await put(root, 'MIGRATION.md', '# Migration\n');

  await put(root, 'extension/src/tests/capture.test.mjs', 'const fixture = "fixture-only";\n');
  await put(root, 'worker/src/test-data/sample.json', '{"fixture":true}\n');
  await put(root, 'worker/src/tests/worker.test.mjs', 'const fixture = "oauth_state=fixture-only";\n');
  await put(root, 'deploy/tests/env.test.mjs', 'const secretFixture = "NOTION_CLIENT_SECRET=fixture-only";\n');
  await put(root, 'audit/old-report.md', 'audit evidence must not ship\n');
  await put(root, 'release/records/release-record.json', '{"state":"STAGED"}\n');
  await put(root, 'release/artifacts/community-0.8.0.zip', Buffer.from([0, 1, 2, 3]));
  await put(root, 'docs/acceptance/old.md', 'proofclip-community-rc1-20260814\n');
  await put(root, 'docs/backlog/old.md', 'backlog\n');
  await put(root, 'docs/superpowers/old.md', 'planning\n');

  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture: clean community source');
  const commit = git(root, 'rev-parse', 'HEAD');
  const trackedFiles = git(root, 'ls-files').split(/\r?\n/).filter(Boolean);

  await put(root, 'deploy/private.key', '-----BEGIN PRIVATE KEY-----\nignored-secret\n-----END PRIVATE KEY-----\n');
  await put(root, '.wrangler/state.json', '{"local":true}\n');
  await put(root, 'worker/dist/worker.mjs', 'old generated runtime\n');
  await put(root, 'deploy/.generated/state.json', '{"runtime":true}\n');
  await put(root, 'deploy/.state/state.json', '{"runtime":true}\n');
  return { root, commit, trackedFiles };
}

async function listFiles(root) {
  const result = [];
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else result.push(relative(root, full).replaceAll('\\', '/'));
    }
  }
  await visit(root);
  return result.sort();
}

async function snapshot(root) {
  const files = {};
  for (const path of await listFiles(root)) files[path] = (await readFile(join(root, path))).toString('base64');
  return files;
}

test('exports two byte-identical candidates from the same tracked clean HEAD', async () => {
  const { root, commit } = await createFixture();
  const outA = join(root, 'candidate-a');
  const outB = join(root, 'candidate-b');
  try {
    const first = await createCommunity081Candidate({ sourceRoot: root, outDir: outA, now: () => '2026-09-07T00:00:00.000Z' });
    const second = await createCommunity081Candidate({ sourceRoot: root, outDir: outB, now: () => '2027-01-01T00:00:00.000Z' });

    assert.equal(first.sourceCommit, commit);
    assert.equal(second.sourceCommit, commit);
    assert.equal(first.contentFingerprint, second.contentFingerprint);
    assert.deepEqual(first.files, second.files);
    assert.deepEqual(await snapshot(outA), await snapshot(outB));

    const provenance = JSON.parse(await readFile(join(outA, 'PROVENANCE.json'), 'utf8'));
    assert.deepEqual({ edition: provenance.edition, targetVersion: provenance.targetVersion }, { edition: 'community', targetVersion: '0.8.1' });
    assert.equal(provenance.sourceCommit, commit);
    assert.equal(provenance.contentFingerprint, first.contentFingerprint);
    assert.equal(provenance.bundle.path, 'worker/dist/worker.mjs');
    assert.equal(provenance.bundle.sha256, createHash('sha256').update(await readFile(join(outA, 'worker/dist/worker.mjs'))).digest('hex'));
    const verified = await verifyCommunity081Candidate({ candidateDir: outA, expectedCommit: commit, expectedFingerprint: first.contentFingerprint });
    assert.equal(verified.ok, true, JSON.stringify(verified.findings));
    await access(join(root, 'candidate-a.sha256'));
    await access(join(root, 'candidate-b.sha256'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('uses verified Git object bytes instead of a working-tree mutation', async () => {
  const { root, commit, trackedFiles } = await createFixture();
  const outDir = join(root, 'candidate');
  try {
    await writeFile(join(root, 'README.md'), '# working-tree mutation must not ship\n');
    await createCommunity081Candidate({ sourceRoot: root, outDir, gitImpl: gitImpl(commit, trackedFiles) });
    assert.equal(await readFile(join(outDir, 'README.md'), 'utf8'), '# ProofClip Community\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a non-regular allowlisted entry in the verified HEAD tree', async () => {
  const { root } = await createFixture();
  const outDir = join(root, 'candidate');
  try {
    const symlinkObject = execFileSync('git', ['-C', root, 'hash-object', '-w', '--stdin'], {
      input: 'worker/src/index.mjs',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    git(root, 'update-index', '--add', '--cacheinfo', `120000,${symlinkObject},worker/src/worker.mjs`);
    git(root, 'commit', '-qm', 'fixture: non-regular production entry');
    const commit = git(root, 'rev-parse', 'HEAD');
    const trackedFiles = git(root, 'ls-files').split(/\r?\n/).filter(Boolean);
    await assert.rejects(
      createCommunity081Candidate({ sourceRoot: root, outDir, gitImpl: gitImpl(commit, trackedFiles) }),
      /non-regular|symlink|regular blob/i,
    );
    await assert.rejects(access(outDir));
    await assert.rejects(access(`${outDir}.sha256`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('removes candidate and sidecar when immediate self-verification fails', async () => {
  const { root, commit, trackedFiles } = await createFixture();
  const outDir = join(root, 'candidate');
  try {
    await assert.rejects(
      createCommunity081Candidate({
        sourceRoot: root,
        outDir,
        gitImpl: gitImpl(commit, trackedFiles),
        verifyImpl: async () => ({ ok: false, findings: ['CANDIDATE_PROVENANCE_FAILED category=TEST path=README.md'] }),
      }),
      /self-verification/i,
    );
    await assert.rejects(access(outDir));
    await assert.rejects(access(`${outDir}.sha256`));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reserves the candidate directory before reading Git objects', async () => {
  const { root, commit, trackedFiles } = await createFixture();
  const outDir = join(root, 'candidate');
  let reservationObserved = false;
  let ownerMarkerObserved = false;
  try {
    await createCommunity081Candidate({
      sourceRoot: root,
      outDir,
      gitImpl: gitImpl(commit, trackedFiles, '', {
        listTree: async (call, repo, objectCommit) => {
          try {
            await lstat(outDir);
            reservationObserved = true;
            ownerMarkerObserved = (await readdir(join(outDir, '..'))).some((entry) => entry.startsWith(`${basename(outDir)}.owner-`));
          } catch {
            reservationObserved = false;
            ownerMarkerObserved = false;
          }
          return treeEntries(repo, objectCommit, trackedFiles);
        },
        readObject: async (repo, objectCommit, path) => {
          try {
            await lstat(outDir);
            reservationObserved = true;
          } catch {
            reservationObserved = false;
          }
          return execFileSync('git', ['-C', repo, 'show', `${objectCommit}:${path}`], { stdio: ['ignore', 'pipe', 'ignore'] });
        },
      }),
    });
    assert.equal(reservationObserved, true);
    assert.equal(ownerMarkerObserved, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('does not remove a replacement candidate directory during failed cleanup', async () => {
  const { root, commit, trackedFiles } = await createFixture();
  const outDir = join(root, 'candidate');
  const replacement = join(outDir, 'owned-by-other-process.txt');
  try {
    await assert.rejects(
      createCommunity081Candidate({
        sourceRoot: root,
        outDir,
        gitImpl: gitImpl(commit, trackedFiles),
        verifyImpl: async ({ candidateDir }) => {
          await rm(candidateDir, { recursive: true, force: true });
          await mkdir(candidateDir, { recursive: false });
          await writeFile(replacement, 'preserve this directory\n');
          return { ok: false, findings: ['CANDIDATE_PROVENANCE_FAILED category=TEST path=README.md'] };
        },
      }),
      /self-verification/i,
    );
    assert.equal(await readFile(replacement, 'utf8'), 'preserve this directory\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a pre-existing sidecar without changing or removing it', async () => {
  const { root, commit, trackedFiles } = await createFixture();
  const outDir = join(root, 'candidate');
  const sidecar = `${outDir}.sha256`;
  try {
    await writeFile(sidecar, 'pre-existing-sidecar\n');
    await assert.rejects(
      createCommunity081Candidate({ sourceRoot: root, outDir, gitImpl: gitImpl(commit, trackedFiles) }),
      /sidecar|exists/i,
    );
    assert.equal(await readFile(sidecar, 'utf8'), 'pre-existing-sidecar\n');
    await assert.rejects(access(outDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('requires a clean source tree before creating candidate output', async () => {
  const { root, commit, trackedFiles } = await createFixture();
  const outDir = join(root, 'dirty-candidate');
  try {
    await writeFile(join(root, 'README.md'), '# changed after commit\n');
    await assert.rejects(
      createCommunity081Candidate({ sourceRoot: root, outDir, gitImpl: gitImpl(commit, trackedFiles, ' M README.md\n') }),
      /clean|dirty/i,
    );
    await assert.rejects(access(outDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('copies only tracked production files and excludes tests, fixtures, ignored keys, and runtime state', async () => {
  const { root, commit, trackedFiles } = await createFixture();
  const outDir = join(root, 'candidate');
  try {
    const result = await createCommunity081Candidate({ sourceRoot: root, outDir, gitImpl: gitImpl(commit, trackedFiles) });
    const paths = await listFiles(outDir);
    assert.ok(paths.includes('extension/src/manifest.json'));
    assert.ok(paths.includes('worker/src/index.mjs'));
    assert.ok(paths.includes('deploy/deploy-core.mjs'));
    assert.ok(paths.includes('deploy/deploy.env.example'));
    assert.ok(paths.includes('deploy/wrangler.template.jsonc'));
    assert.ok(paths.includes('worker/migrations/20260813_privacy_nonretention.sql'));
    assert.ok(paths.includes('worker/scripts/bundle-worker.mjs'));
    assert.ok(paths.includes('worker/dist/worker.mjs'));
    assert.ok(paths.includes('docs/community-0.8.1-deployment.md'));
    assert.equal(paths.filter((path) => path.startsWith('worker/dist/')).length, 1);
    assert.ok(!paths.some((path) => /(^|\/)(tests?|fixtures?|test[-_]?(?:data|fixtures))(\/|$)|\.(test|spec)\./i.test(path)));
    assert.ok(!paths.some((path) => /^(audit|release|runtime-evidence|\.wrangler)\//.test(path)));
    assert.ok(!paths.some((path) => /deploy\/(private\.key|\.generated|\.state|node_modules)/.test(path)));
    assert.ok(!paths.some((path) => /\.zip$|private\.key$/.test(path)));
    assert.ok(!JSON.stringify(await snapshot(outDir)).includes('ignored-secret'));
    assert.equal(result.candidateDir, outDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a tracked allowlisted path that is missing from the source tree', async () => {
  const { root, commit, trackedFiles } = await createFixture();
  const outDir = join(root, 'candidate');
  try {
    await assert.rejects(
      createCommunity081Candidate({ sourceRoot: root, outDir, gitImpl: gitImpl(commit, [...trackedFiles, 'worker/src/missing-production.mjs']) }),
      /required source file missing/i,
    );
    await assert.rejects(access(outDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects an unstable tracked file list during export', async () => {
  const { root, commit, trackedFiles } = await createFixture();
  const outDir = join(root, 'candidate');
  try {
    await assert.rejects(
      createCommunity081Candidate({
        sourceRoot: root,
        outDir,
        gitImpl: gitImpl(commit, trackedFiles, '', {
          listTree: (call, repo, objectCommit) => call === 1
            ? treeEntries(repo, objectCommit, trackedFiles)
            : treeEntries(repo, objectCommit, [...trackedFiles, 'worker/src/unstable-production.mjs']),
        }),
      }),
      /verified HEAD tree|unstable|duplicate/i,
    );
    await assert.rejects(access(outDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects a hash-prefix source commit', async () => {
  const { root, trackedFiles } = await createFixture();
  const outDir = join(root, 'candidate');
  try {
    await assert.rejects(
      createCommunity081Candidate({ sourceRoot: root, outDir, gitImpl: gitImpl('abc123', trackedFiles) }),
      /full|commit|40/i,
    );
    await assert.rejects(access(outDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an exported candidate without .git carries the exact deployment core provenance contract', async () => {
  const { root, commit, trackedFiles } = await createFixture();
  const candidateDir = join(root, 'candidate');
  try {
    await createCommunity081Candidate({ sourceRoot: root, outDir: candidateDir, gitImpl: gitImpl(commit, trackedFiles) });
    await assert.rejects(access(join(candidateDir, '.git')));
    const provenance = JSON.parse(await readFile(join(candidateDir, 'PROVENANCE.json'), 'utf8'));
    assert.deepEqual({ edition: provenance.edition, targetVersion: provenance.targetVersion }, { edition: 'community', targetVersion: '0.8.1' });
    assert.match(provenance.sourceCommit, /^[0-9a-f]{40}$/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
