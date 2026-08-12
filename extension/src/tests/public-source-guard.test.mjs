import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const script = resolve(root, 'scripts', 'verify-public-source.ps1');

function canonicalManifestBytes(contents) {
  return contents.includes(0) ? contents : Buffer.from(contents.toString('utf8').replace(/\r\n/g, '\n'));
}

test('public-source verification script exists for the repository-level release gate', () => {
  assert.equal(existsSync(script), true, 'scripts/verify-public-source.ps1 must exist');
});

test('public manifest hashes use repository-stable LF text checkouts', async () => {
  const attributes = await readFile(resolve(root, '.gitattributes'), 'utf8');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
});

async function scannerFixture(fileName, contents) {
  const fixture = await mkdtemp(join(tmpdir(), 'proofclip-public-source-'));
  try {
    await mkdir(join(fixture, 'scripts'));
    await cp(script, join(fixture, 'scripts', 'verify-public-source.ps1'));
    const fixtureEmail = ['test', '@', 'example.invalid'].join('');
    for (const args of [
      ['init', '--quiet'],
      ['config', 'user.email', fixtureEmail],
      ['config', 'user.name', 'ProofClip test'],
      ['add', 'scripts'],
      ['commit', '--quiet', '-m', 'scanner fixture']
    ]) {
      const result = spawnSync('git', args, { cwd: fixture, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    await writeFile(join(fixture, fileName), contents, 'utf8');
    const result = spawnSync('pwsh', ['-NoProfile', '-File', 'scripts/verify-public-source.ps1', '-IncludeUntracked'], { cwd: fixture, encoding: 'utf8' });
    return `${result.stdout}${result.stderr}`;
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}

test('public-source scanner rejects fixed identities, secrets, and executable commercial artifacts', async () => {
  const fixtures = [
    ['worker.mjs', ['export const origin = "https://private', '-worker.workers.dev";'].join('')],
    ['contact.md', ['private', '@mail.invalid'].join('')],
    ['routes.mjs', ['fetch("/v1/', 'license/activate")'].join('')],
    ['webhook.mjs', ['app.post("/v1/webhooks/', 'lemon")'].join('')],
    ['credentials.txt', ['TOKEN_VAULT_KEY=', 'not-a-placeholder-secret'].join('')]
  ];
  for (const [fileName, contents] of fixtures) {
    const output = await scannerFixture(fileName, contents);
    assert.match(output, /forbidden|secret|private|fixed|commercial/i, `${fileName} must be rejected`);
  }
});

test('public-source scanner rejects forbidden content in every commit reachable from HEAD', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'proofclip-public-history-'));
  try {
    await mkdir(join(fixture, 'scripts'));
    await cp(script, join(fixture, 'scripts', 'verify-public-source.ps1'));
    const privateOrigin = ['https://jasondeng1127', '.workers.dev'].join('');
    await writeFile(join(fixture, 'history.mjs'), `export const origin = '${privateOrigin}';\n`, 'utf8');
    const fixtureEmail = ['test', '@', 'example.invalid'].join('');
    for (const args of [
      ['init', '--quiet'],
      ['config', 'user.email', fixtureEmail],
      ['config', 'user.name', 'ProofClip test'],
      ['add', '.'],
      ['commit', '--quiet', '-m', 'private bootstrap']
    ]) {
      const result = spawnSync('git', args, { cwd: fixture, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    await writeFile(join(fixture, 'history.mjs'), "export const origin = '<YOUR_WORKER_SUBDOMAIN>';\n", 'utf8');
    for (const args of [['add', 'history.mjs'], ['commit', '--quiet', '-m', 'sanitize working tree']]) {
      const result = spawnSync('git', args, { cwd: fixture, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
    const result = spawnSync('pwsh', ['-NoProfile', '-File', 'scripts/verify-public-source.ps1', '-IncludeUntracked'], { cwd: fixture, encoding: 'utf8' });
    const output = `${result.stdout}${result.stderr}`;
    assert.notEqual(result.status, 0, output);
    assert.match(output, /forbidden deployment identity|fixed Worker origin/i);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('public source contains no real rehearsal Data Source UUID', async () => {
  const realRehearsalDataSourceId = ['01be583b-00d5-83d8-', '845f-0784db446a24'].join('');
  const listed = spawnSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  for (const relativePath of listed.stdout.split(/\r?\n/).filter(Boolean)) {
    const contents = await readFile(resolve(root, relativePath), 'utf8');
    assert.equal(contents.includes(realRehearsalDataSourceId), false, `${relativePath} must not contain a rehearsal Data Source UUID`);
  }
});

test('copying manifest contains only relative public paths with matching SHA-256 values', async () => {
  const manifestPath = resolve(root, 'COPYING_MANIFEST.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.algorithm, 'SHA-256');
  assert.ok(Array.isArray(manifest.files) && manifest.files.length > 0);
  for (const entry of manifest.files) {
    assert.match(entry.path, /^(?![A-Za-z]:|\/|\.git\/|\.worktrees\/|\.superpowers\/).+/);
    assert.doesNotMatch(entry.path, /^(?:COPYING_MANIFEST\.json|\.env|\.dev\.vars|wrangler\.jsonc|dist\/|runtime-evidence\/)/i);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    const contents = await readFile(resolve(root, entry.path));
    assert.equal(createHash('sha256').update(canonicalManifestBytes(contents)).digest('hex'), entry.sha256, `${entry.path} hash must match`);
  }
});
