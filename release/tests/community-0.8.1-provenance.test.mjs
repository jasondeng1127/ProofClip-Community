import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCommunity081Candidate } from '../export-community-0.8.1.mjs';
import { verifyCommunity081Candidate } from '../verify-community-0.8.1.mjs';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'proofclip-community-081-provenance-'));
  await git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'Fixture');
  const put = async (path, content) => {
    const file = join(root, path);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, content);
  };
  await put('extension/src/manifest.json', '{"manifest_version":3,"version":"0.8.1","key":"MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A"}\n');
  await put('extension/src/community-config.mjs', 'export const COMMUNITY_API_ORIGIN = "https://replace-me.invalid";\n');
  await put('worker/src/worker.mjs', 'export const worker = true;\n');
  await put('worker/src/schema.sql', 'CREATE TABLE oauth_state (state TEXT PRIMARY KEY);\n');
  await put('worker/migrations/20260813_privacy_nonretention.sql', '-- privacy migration\n');
  await put('worker/scripts/bundle-worker.mjs', [
    "import { mkdir, readFile, writeFile } from 'node:fs/promises';",
    "await mkdir('worker/dist', { recursive: true });",
    "await writeFile('worker/dist/worker.mjs', await readFile('worker/src/worker.mjs', 'utf8'), 'utf8');",
    ''
  ].join('\n'));
  await put('deploy/deploy.ps1', 'node release/export-community-0.8.1.mjs\n');
  await put('deploy/deploy.sh', '#!/bin/sh\nnode release/export-community-0.8.1.mjs\n');
  await put('deploy/wrangler.template.jsonc', '{ "compatibility_date": "2026-08-14" }\n');
  await put('deploy/package.json', '{ "private": true, "type": "module" }\n');
  await put('deploy/README.md', '# deployment\n');
  await put('docs/community-0.8.1-deployment.md', '# guide\n');
  await put('README.md', '# community\n');
  await put('LICENSE', 'license\n');
  await put('SECURITY.md', 'security\n');
  await put('CONTRIBUTING.md', 'contributing\n');
  await put('TRADEMARKS.md', 'trademarks\n');
  await put('MIGRATION.md', 'migration\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture: provenance source');
  return { root, commit: git(root, 'rev-parse', 'HEAD') };
}

test('rejects an RC identity in candidate content without exposing matched secret text', async () => {
  const { root, commit } = await fixture();
  const candidateDir = join(root, 'candidate');
  try {
    const exported = await createCommunity081Candidate({ sourceRoot: root, outDir: candidateDir, gitImpl: { revParse: async () => commit, statusPorcelain: async () => '' } });
    await writeFile(join(candidateDir, 'README.md'), 'proofclip-community-rc1-20260814\nNOTION_CLIENT_SECRET=never-print-this\n');
    const result = await verifyCommunity081Candidate({ candidateDir, expectedCommit: commit, expectedFingerprint: exported.contentFingerprint });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => String(finding).includes('CANDIDATE_PROVENANCE_FAILED')));
    assert.doesNotMatch(JSON.stringify(result.findings), /never-print-this/);
    assert.ok(result.findings.some((finding) => /RC|historical|identity/i.test(String(finding))));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('accepts a clean candidate when commit and fingerprint match', async () => {
  const { root, commit } = await fixture();
  const candidateDir = join(root, 'candidate');
  try {
    const exported = await createCommunity081Candidate({ sourceRoot: root, outDir: candidateDir, gitImpl: { revParse: async () => commit, statusPorcelain: async () => '' } });
    const result = await verifyCommunity081Candidate({ candidateDir, expectedCommit: commit, expectedFingerprint: exported.contentFingerprint });
    assert.equal(result.ok, true, JSON.stringify(result.findings));
    assert.equal(result.contentFingerprint, exported.contentFingerprint);
    assert.ok(result.files.length > 0);
    assert.equal(JSON.parse(await readFile(join(candidateDir, 'PROVENANCE.json'), 'utf8')).sourceCommit, commit);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
