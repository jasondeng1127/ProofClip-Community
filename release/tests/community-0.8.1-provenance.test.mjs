import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { createCommunity081Candidate } from '../export-community-0.8.1.mjs';
import { verifyCommunity081Candidate } from '../verify-community-0.8.1.mjs';

const STABLE_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoE6clBamwq6eJy+8TWYYbrDkUwCOB8b0X3sN7y67BY/qfHsNEgSNgLRsdE7EK+kaQRI1hr0cCRizkmDypEpEuL3YqNsgXI2nZMJjO9uRKirPLhi78vWybVc1EDVhl6gGqftg6rbWPHvlhx2SCMoUknpZ7q+d5eM0TPqF6F3SEFURA7SHyKTuSbTURrQbGfqkVwNukH5vWyojDKQW5Sk3r5ixI//5nxQOC+d5+rkutrd0hkZFEEus+Ty54Y/7u1CrVT7zjLH0Qw8xZ7ajnwHaZe2RFpVZMCPn+9y4EZvieXAmN/j048HPCEg0HFcTFTIfrGLRHGASorE8nPWcFb/AkQIDAQAB';
const STABLE_EXTENSION_ID = 'ecpbgjlelajodnnichnflkcjkhojfekl';

function git(repo, ...args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function treeEntries(repo, commit) {
  const output = execFileSync('git', ['-C', repo, 'ls-tree', '-r', '-z', '--full-tree', commit], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return output.split('\0').filter(Boolean).map((record) => {
    const [metadata, path] = record.split('\t');
    const [mode, type, object] = metadata.split(' ');
    return { mode, type, object, path };
  });
}

async function fixture(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), 'proofclip-community-081-provenance-'));
  git(root, 'init', '-q');
  git(root, 'config', 'user.email', 'fixture@example.invalid');
  git(root, 'config', 'user.name', 'Fixture');
  const put = async (path, content) => {
    const file = join(root, path);
    await mkdir(join(file, '..'), { recursive: true });
    await writeFile(file, content);
  };
  await put('.gitignore', 'candidate*\n*.sha256\nworker/dist/\n');
  await put('extension/src/manifest.json', JSON.stringify({ manifest_version: 3, version: '0.8.1', key: STABLE_PUBLIC_KEY }) + '\n');
  await put('extension/src/community-config.mjs', 'export const COMMUNITY_API_ORIGIN = "https://replace-me.invalid";\n');
  await put('extension/src/background.js', 'export const community = true;\n');
  await put('worker/src/worker.mjs', overrides.workerSource || 'export const worker = true;\n');
  await put('worker/src/index.mjs', 'export const index = true;\n');
  await put('worker/src/schema.sql', 'CREATE TABLE oauth_state (state TEXT PRIMARY KEY);\n');
  await put('worker/migrations/20260813_privacy_nonretention.sql', '-- privacy migration\n');
  await put('worker/scripts/bundle-worker.mjs', [
    "import { mkdir, readFile, writeFile } from 'node:fs/promises';",
    "await mkdir('worker/dist', { recursive: true });",
    "await writeFile('worker/dist/worker.mjs', await readFile('worker/src/worker.mjs', 'utf8'), 'utf8');",
    ''
  ].join('\n'));
  await put('deploy/deploy-core.mjs', overrides.deployCore || 'export const productionDeployCore = true;\n');
  await put('deploy/lib/wrangler.mjs', overrides.wranglerLibrary || 'export const productionWrangler = true;\n');
  await put('deploy/deploy.env.example', 'CF_API_TOKEN=\nNOTION_CLIENT_ID=\nNOTION_CLIENT_SECRET=\n');
  await put('deploy/deploy.ps1', 'node deploy/deploy-core.mjs --env deploy/deploy.env\n');
  await put('deploy/deploy.sh', '#!/bin/sh\nnode deploy/deploy-core.mjs --env deploy/deploy.env\n');
  await put('deploy/README.md', '# deployment\n');
  await put('deploy/wrangler.template.jsonc', '{ "compatibility_date": "2026-08-14" }\n');
  await put('deploy/package.json', '{ "private": true, "type": "module" }\n');
  await put('docs/community-0.8.1-deployment.md', '# guide\n');
  await put('README.md', '# community\n');
  await put('LICENSE', 'license\n');
  await put('SECURITY.md', 'security\n');
  await put('CONTRIBUTING.md', 'contributing\n');
  await put('TRADEMARKS.md', 'trademarks\n');
  await put('MIGRATION.md', overrides.migration || 'migration\n');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'fixture: provenance source');
  return { root, commit: git(root, 'rev-parse', 'HEAD'), trackedFiles: git(root, 'ls-files').split(/\r?\n/).filter(Boolean) };
}

function gitImpl(commit, trackedFiles) {
  return {
    revParse: async () => commit,
    statusPorcelain: async () => '',
    listTree: async (repo, objectCommit) => treeEntries(repo, objectCommit),
    readObject: async (repo, objectCommit, path) => execFileSync('git', ['-C', repo, 'show', `${objectCommit}:${path}`], { stdio: ['ignore', 'pipe', 'ignore'] }),
  };
}

async function exportFixture(overrides = {}) {
  const state = await fixture(overrides);
  const candidateDir = join(state.root, 'candidate');
  const exported = await createCommunity081Candidate({ sourceRoot: state.root, outDir: candidateDir, gitImpl: gitImpl(state.commit, state.trackedFiles) });
  return { ...state, candidateDir, exported };
}

async function verifyMutation(mutator) {
  const state = await exportFixture();
  try {
    await mutator(state);
    return await verifyCommunity081Candidate({ candidateDir: state.candidateDir, expectedCommit: state.commit, expectedFingerprint: state.exported.contentFingerprint });
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
}

test('accepts a clean candidate and requires exact Community provenance fields', async () => {
  const { root, candidateDir, commit, exported } = await exportFixture();
  try {
    const result = await verifyCommunity081Candidate({ candidateDir, expectedCommit: commit, expectedFingerprint: exported.contentFingerprint });
    const provenance = JSON.parse(await readFile(join(candidateDir, 'PROVENANCE.json'), 'utf8'));
    assert.equal(result.ok, true, JSON.stringify(result.findings));
    assert.deepEqual({ edition: provenance.edition, targetVersion: provenance.targetVersion }, { edition: 'community', targetVersion: '0.8.1' });
    assert.equal(provenance.candidateVersion, '0.8.1');
    assert.equal(result.contentFingerprint, exported.contentFingerprint);
    assert.equal(JSON.parse(await readFile(join(candidateDir, 'extension/src/manifest.json'), 'utf8')).key, STABLE_PUBLIC_KEY);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('rejects an RC identity without exposing matched text and keeps findings category/path only', async () => {
  const state = await exportFixture();
  try {
    await writeFile(join(state.candidateDir, 'README.md'), 'proofclip-community-rc1-20260814\nNOTION_CLIENT_SECRET=never-print-this\n');
    const result = await verifyCommunity081Candidate({ candidateDir: state.candidateDir, expectedCommit: state.commit, expectedFingerprint: state.exported.contentFingerprint });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding === 'CANDIDATE_PROVENANCE_FAILED category=RC_IDENTITY path=README.md'));
    assert.doesNotMatch(JSON.stringify(result.findings), /never-print-this/);
    for (const finding of result.findings) assert.match(String(finding), /^CANDIDATE_PROVENANCE_FAILED category=[A-Z_]+ path=[^ ]+$/);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test('rejects a candidate symlink without following its target or throwing', async () => {
  const state = await exportFixture();
  try {
    await rm(join(state.candidateDir, 'README.md'));
    await symlink('MIGRATION.md', join(state.candidateDir, 'README.md'), 'file');
    const result = await verifyCommunity081Candidate({ candidateDir: state.candidateDir, expectedCommit: state.commit, expectedFingerprint: state.exported.contentFingerprint });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding === 'CANDIDATE_PROVENANCE_FAILED category=NON_REGULAR_ENTRY path=README.md'));
    for (const finding of result.findings) assert.match(String(finding), /^CANDIDATE_PROVENANCE_FAILED category=[A-Z_]+ path=[^ ]+$/);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test('rejects a candidate basename containing whitespace', async () => {
  const state = await exportFixture();
  const invalidDir = join(state.root, 'candidate with space');
  try {
    await rename(state.candidateDir, invalidDir);
    await rename(`${state.candidateDir}.sha256`, `${invalidDir}.sha256`);
    const result = await verifyCommunity081Candidate({ candidateDir: invalidDir, expectedCommit: state.commit, expectedFingerprint: state.exported.contentFingerprint });
    assert.equal(result.ok, false);
    assert.ok(result.findings.some((finding) => finding === 'CANDIDATE_PROVENANCE_FAILED category=CANDIDATE_BASENAME_INVALID path=candidate'));
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test('rejects every forbidden identity and secret category without printing matched values', async () => {
  const cases = [
    ['RC_IDENTITY', 'proofclip-community-rc1-20260814'],
    ['FRESH_REHEARSAL_IDENTITY', 'proofclip-community-08-fresh-rehearsal-20260816'],
    ['COMMERCIAL_IDENTITY', 'lemonsqueezy'],
    ['DIAGNOSTIC_IDENTITY', 'fresh-oauth-transport-1'],
    ['DIAGNOSTIC_UUID', 'cb077973-df64-49d4-90df-c0720b462f4f'],
    ['AUDIT_RELEASE_EVIDENCE', 'CANDIDATE_HANDOFF_BLOCKED'],
    ['PRIVATE_KEY_MATERIAL', ['-----BEGIN ', 'PRIVATE KEY-----\nprivate-secret-value\n-----END PRIVATE KEY-----'].join('')],
    ['OAUTH_CODE', 'authorization_code=authorization-code-super-secret'],
    ['OAUTH_STATE', 'oauth_state=oauth-state-super-secret'],
    ['OAUTH_TOKEN', 'access_token=access-token-super-secret'],
    ['CLOUDFLARE_SECRET', 'CF_API_TOKEN=cf-live-secret-value'],
    ['NOTION_SECRET', 'NOTION_CLIENT_SECRET=notion-live-secret-value'],
    ['VAULT_SECRET', 'TOKEN_VAULT_KEY=vault-live-secret-value'],
    ['SERVICE_SECRET', 'secret_actualservicevalue'],
  ];
  for (const [category, value] of cases) {
    const result = await verifyMutation(async ({ candidateDir }) => {
      await writeFile(join(candidateDir, 'README.md'), value);
    });
    assert.equal(result.ok, false, category);
    assert.ok(result.findings.some((finding) => finding === `CANDIDATE_PROVENANCE_FAILED category=${category} path=README.md`), `${category}: ${JSON.stringify(result.findings)}`);
    assert.doesNotMatch(JSON.stringify(result.findings), /super-secret|live-secret|private-secret/);
    for (const finding of result.findings) assert.match(String(finding), /^CANDIDATE_PROVENANCE_FAILED category=[A-Z_]+ path=[^ ]+$/);
  }
  const runtime = await verifyMutation(async ({ candidateDir }) => {
    await mkdir(join(candidateDir, '.wrangler'), { recursive: true });
    await writeFile(join(candidateDir, '.wrangler', 'state.json'), '{"runtime":true}\n');
  });
  assert.ok(runtime.findings.some((finding) => finding === 'CANDIDATE_PROVENANCE_FAILED category=WRANGLER_STATE path=.wrangler/state.json'));
});

test('accepts source identifiers and documented legacy paths without treating them as leaked credentials or release evidence', async () => {
  const state = await exportFixture({
    deployCore: [
      "const blockedSegments = new Set(['release-records']);",
      'const runner = { env: { CLOUDFLARE_API_TOKEN: env.cfApiToken } };',
      'export { blockedSegments, runner };',
      ''
    ].join('\n'),
    wranglerLibrary: [
      'const SECRET_ENV_PATTERN = /(token|secret|vault|key|auth|password)/i;',
      'export const matchesSecretName = (name) => SECRET_ENV_PATTERN.test(name);',
      ''
    ].join('\n'),
    migration: '- `projects/service/P-proofclip-api/src/`\n',
    workerSource: [
      'const response = { access_token: null, refresh_token: null };',
      'export const tokens = { access_token: response.access_token, refresh_token: response.refresh_token || null };',
      ''
    ].join('\n')
  });
  try {
    const result = await verifyCommunity081Candidate({ candidateDir: state.candidateDir, expectedCommit: state.commit, expectedFingerprint: state.exported.contentFingerprint });
    assert.equal(result.ok, true, JSON.stringify(result.findings));
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test('fails closed independently for file, content, bundle, provenance, sidecar, and path mismatches', async (t) => {
  await t.test('file hash and content fingerprint mismatch', async () => {
    const result = await verifyMutation(async ({ candidateDir }) => {
      await writeFile(join(candidateDir, 'README.md'), 'changed bytes\n');
    });
    assert.ok(result.findings.some((finding) => finding.includes('category=FILE_HASHES_MISMATCH')));
    assert.ok(result.findings.some((finding) => finding.includes('category=CONTENT_FINGERPRINT_MISMATCH')));
  });
  await t.test('bundle hash mismatch', async () => {
    const result = await verifyMutation(async ({ candidateDir }) => {
      await writeFile(join(candidateDir, 'worker/dist/worker.mjs'), 'changed bundle\n');
    });
    assert.ok(result.findings.some((finding) => finding === 'CANDIDATE_PROVENANCE_FAILED category=BUNDLE_HASH_MISMATCH path=worker/dist/worker.mjs'));
  });
  await t.test('PROVENANCE source commit mismatch', async () => {
    const result = await verifyMutation(async ({ candidateDir }) => {
      const path = join(candidateDir, 'PROVENANCE.json');
      const provenance = JSON.parse(await readFile(path, 'utf8'));
      provenance.sourceCommit = 'f'.repeat(40);
      await writeFile(path, JSON.stringify(provenance, null, 2) + '\n');
    });
    assert.ok(result.findings.some((finding) => finding === 'CANDIDATE_PROVENANCE_FAILED category=SOURCE_COMMIT_MISMATCH path=PROVENANCE.json'));
  });
  await t.test('sidecar mismatch', async () => {
    const result = await verifyMutation(async ({ candidateDir }) => {
      await writeFile(`${candidateDir}.sha256`, `${'0'.repeat(64)}  candidate\n`);
    });
    assert.ok(result.findings.some((finding) => finding === 'CANDIDATE_PROVENANCE_FAILED category=SIDECAR_HASH_MISMATCH path=candidate.sha256'));
  });
  await t.test('correct sidecar hash with wrong candidate name', async () => {
    const result = await verifyMutation(async ({ candidateDir, exported }) => {
      await writeFile(`${candidateDir}.sha256`, `${exported.contentFingerprint}  wrong-candidate-name\n`);
    });
    assert.ok(result.findings.some((finding) => finding === 'CANDIDATE_PROVENANCE_FAILED category=SIDECAR_NAME_MISMATCH path=candidate.sha256'));
  });
  await t.test('rejects every non-canonical sidecar byte form', async () => {
    const state = await exportFixture();
    try {
      const name = basename(state.candidateDir);
      const hash = state.exported.contentFingerprint;
      const invalidForms = [
        ['no final LF', `${hash}  ${name}`],
        ['CRLF', `${hash}  ${name}\r\n`],
        ['extra LF', `${hash}  ${name}\n\n`],
        ['three spaces', `${hash}   ${name}\n`],
        ['tab separator', `${hash}\t\t${name}\n`],
        ['mixed separators', `${hash}  ${name}\\suffix\n`],
        ['leading whitespace', ` ${hash}  ${name}\n`],
        ['trailing whitespace', `${hash}  ${name} \n`],
        ['uppercase hash', `${hash.toUpperCase()}  ${name}\n`],
      ];
      for (const [label, bytes] of invalidForms) {
        await writeFile(`${state.candidateDir}.sha256`, bytes);
        const result = await verifyCommunity081Candidate({ candidateDir: state.candidateDir, expectedCommit: state.commit, expectedFingerprint: hash });
        assert.equal(result.ok, false, label);
        assert.ok(result.findings.some((finding) => /SIDECAR_(HASH|NAME)_MISMATCH/.test(finding)), `${label}: ${JSON.stringify(result.findings)}`);
      }
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  });
  await t.test('unallowlisted file', async () => {
    const result = await verifyMutation(async ({ candidateDir }) => {
      await writeFile(join(candidateDir, 'unexpected.txt'), 'unexpected\n');
    });
    assert.ok(result.findings.some((finding) => finding === 'CANDIDATE_PROVENANCE_FAILED category=UNALLOWLISTED_PATH path=unexpected.txt'));
  });
});

test('requires the fixed Community stable Extension ID and rejects a changed non-empty key', async () => {
  const result = await verifyMutation(async ({ candidateDir }) => {
    const path = join(candidateDir, 'extension/src/manifest.json');
    const manifest = JSON.parse(await readFile(path, 'utf8'));
    manifest.key = STABLE_PUBLIC_KEY.replace('oE6c', 'pE6c');
    await writeFile(path, JSON.stringify(manifest) + '\n');
  });
  assert.equal(STABLE_EXTENSION_ID, 'ecpbgjlelajodnnichnflkcjkhojfekl');
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((finding) => finding === 'CANDIDATE_PROVENANCE_FAILED category=STABLE_PUBLIC_KEY_MISMATCH path=extension/src/manifest.json'));
});
