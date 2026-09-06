import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import { createCommunity081Candidate } from '../export-community-0.8.1.mjs';

const PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApublic-community-key';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

async function put(root, path, content) {
  const file = join(root, path);
  await mkdir(join(file, '..'), { recursive: true });
  await writeFile(file, content);
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'proofclip-community-081-export-'));
  await git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'Fixture');

  await put(root, 'extension/src/manifest.json', JSON.stringify({ manifest_version: 3, version: '0.8.1', key: PUBLIC_KEY }));
  await put(root, 'extension/src/community-config.mjs', 'export const COMMUNITY_API_ORIGIN = "https://replace-me.invalid";\n');
  await put(root, 'extension/src/background.js', 'export const COMMUNITY = true;\n');
  await put(root, 'worker/src/worker.mjs', 'export const workerMarker = "community-081";\n');
  await put(root, 'worker/src/schema.sql', 'CREATE TABLE oauth_state (state TEXT PRIMARY KEY);\n');
  await put(root, 'worker/migrations/20260813_privacy_nonretention.sql', '-- privacy migration\n');
  await put(root, 'worker/scripts/bundle-worker.mjs', [
    "import { readFile, mkdir, writeFile } from 'node:fs/promises';",
    "await mkdir('worker/dist', { recursive: true });",
    "const source = await readFile('worker/src/worker.mjs', 'utf8');",
    "await writeFile('worker/dist/worker.mjs', `// staged bundle\\n${source}`, 'utf8');",
    ''
  ].join('\n'));
  await put(root, 'deploy/deploy.ps1', 'node release/export-community-0.8.1.mjs\n');
  await put(root, 'deploy/deploy.sh', '#!/bin/sh\nnode release/export-community-0.8.1.mjs\n');
  await put(root, 'deploy/README.md', '# deployment template\n');
  await put(root, 'deploy/wrangler.template.jsonc', '{ "compatibility_date": "2026-08-14" }\n');
  await put(root, 'deploy/package.json', '{ "private": true, "type": "module" }\n');
  await put(root, 'docs/community-0.8.1-deployment.md', '# Community 0.8.1 deployment\n');
  await put(root, 'README.md', '# ProofClip Community\n');
  await put(root, 'LICENSE', 'AGPL-3.0\n');
  await put(root, 'SECURITY.md', '# Security\n');
  await put(root, 'CONTRIBUTING.md', '# Contributing\n');
  await put(root, 'TRADEMARKS.md', '# Trademarks\n');
  await put(root, 'MIGRATION.md', '# Migration\n');

  await put(root, 'audit/old-report.md', 'audit evidence must not ship\n');
  await put(root, 'release/records/release-record.json', '{"state":"STAGED"}\n');
  await put(root, 'release/artifacts/community-0.8.0.zip', Buffer.from([0, 1, 2, 3]));
  await put(root, 'docs/acceptance/old.md', 'proofclip-community-rc1-20260814\n');
  await put(root, 'docs/backlog/old.md', 'backlog\n');
  await put(root, 'docs/superpowers/old.md', 'planning\n');
  await put(root, '.wrangler/state.json', '{"local":true}\n');
  await put(root, 'worker/dist/worker.mjs', 'old generated runtime\n');
  await put(root, 'deploy/deploy.env', 'CF_API_TOKEN=secret-value\n');
  await put(root, 'deploy/.generated/state.json', '{"runtime":true}\n');
  await put(root, 'deploy/.state/state.json', '{"runtime":true}\n');
  await put(root, 'deploy/node_modules/ignored.js', 'local dependency\n');
  await put(root, 'runtime-evidence/trace.json', '{"runtime":true}\n');

  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture: clean community source');
  return { root, commit: git(root, 'rev-parse', 'HEAD') };
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

test('exports two byte-identical candidates from the same clean commit', async () => {
  const { root, commit } = await createFixture();
  const outA = join(root, 'candidate-a');
  const outB = join(root, 'candidate-b');
  try {
    const first = await createCommunity081Candidate({ sourceRoot: root, outDir: outA, gitImpl: { revParse: async () => commit, statusPorcelain: async () => '' }, now: () => '2026-09-07T00:00:00.000Z' });
    const second = await createCommunity081Candidate({ sourceRoot: root, outDir: outB, gitImpl: { revParse: async () => commit, statusPorcelain: async () => '' }, now: () => '2027-01-01T00:00:00.000Z' });

    assert.equal(first.sourceCommit, commit);
    assert.equal(second.sourceCommit, commit);
    assert.equal(first.contentFingerprint, second.contentFingerprint);
    assert.deepEqual(first.files, second.files);
    assert.deepEqual(await snapshot(outA), await snapshot(outB));

    const provenance = JSON.parse(await readFile(join(outA, 'PROVENANCE.json'), 'utf8'));
    assert.equal(provenance.sourceCommit, commit);
    assert.equal(provenance.contentFingerprint, first.contentFingerprint);
    assert.equal(provenance.bundle.path, 'worker/dist/worker.mjs');
    assert.equal(provenance.bundle.sha256, createHash('sha256').update(await readFile(join(outA, 'worker/dist/worker.mjs'))).digest('hex'));
    await access(join(root, 'candidate-a.sha256'));
    await access(join(root, 'candidate-b.sha256'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('requires a clean source tree before creating candidate output', async () => {
  const { root, commit } = await createFixture();
  const outDir = join(root, 'dirty-candidate');
  try {
    await writeFile(join(root, 'README.md'), '# changed after commit\n');
    await assert.rejects(
      createCommunity081Candidate({ sourceRoot: root, outDir, gitImpl: { revParse: async () => commit, statusPorcelain: async () => ' M README.md\n' } }),
      /clean|dirty/i,
    );
    await assert.rejects(access(outDir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('exports the public allowlist and generated bundle only', async () => {
  const { root } = await createFixture();
  const outDir = join(root, 'candidate');
  try {
    const result = await createCommunity081Candidate({ sourceRoot: root, outDir, gitImpl: { revParse: async () => git(root, 'rev-parse', 'HEAD'), statusPorcelain: async () => '' } });
    const paths = await listFiles(outDir);
    assert.ok(paths.includes('extension/src/manifest.json'));
    assert.ok(paths.includes('deploy/wrangler.template.jsonc'));
    assert.ok(paths.includes('worker/src/schema.sql'));
    assert.ok(paths.includes('worker/migrations/20260813_privacy_nonretention.sql'));
    assert.ok(paths.includes('worker/scripts/bundle-worker.mjs'));
    assert.ok(paths.includes('worker/dist/worker.mjs'));
    assert.ok(paths.includes('deploy/deploy.ps1'));
    assert.ok(paths.includes('deploy/deploy.sh'));
    assert.ok(paths.includes('docs/community-0.8.1-deployment.md'));
    assert.equal(paths.filter((path) => path.startsWith('worker/dist/')).length, 1);
    assert.ok(!paths.some((path) => /^(audit|release|runtime-evidence|\.wrangler)\//.test(path)));
    assert.ok(!paths.some((path) => /(^|\/)(acceptance|backlog|superpowers)\//.test(path)));
    assert.ok(!paths.some((path) => /deploy\/(deploy\.env|\.generated|\.state|node_modules)\//.test(path)));
    assert.ok(!paths.some((path) => /(^|\/)release-(record|artifacts)|\.zip$/.test(path)));
    assert.ok(!JSON.stringify(await snapshot(outDir)).includes('secret-value'));
    assert.equal(result.candidateDir, outDir);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
