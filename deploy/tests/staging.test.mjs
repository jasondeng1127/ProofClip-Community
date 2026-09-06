import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { buildNotionRedirectUri } from '../lib/origin.mjs';
import { createStagingTree, renderWranglerConfig } from '../lib/staging.mjs';

const templatePath = fileURLToPath(new URL('../wrangler.template.jsonc', import.meta.url));
const extensionId = 'ecpbgjlelajodnnichnflkcjkhojfekl';
const secretSentinels = [
  'client-secret-sentinel',
  'cloudflare-api-token-sentinel',
  'vault-key-sentinel'
];

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (error.code === 'EISDIR') return true;
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function listFiles(root, current = root) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, path));
    else files.push(relative(root, path).replaceAll('\\', '/'));
  }
  return files.sort();
}

test('renderWranglerConfig preserves the Worker contract and renders only public values', async () => {
  const origin = 'https://Worker.Example/';
  const redirectUri = buildNotionRedirectUri(origin);
  const serialized = renderWranglerConfig({
    workerName: 'proofclip-community',
    d1Name: 'proofclip-community',
    d1Id: 'd1-id-sentinel',
    extensionId,
    notionClientId: 'notion-client-id-sentinel',
    redirectUri,
    marker: 'community-0.8.1'
  });
  const config = JSON.parse(serialized);

  assert.equal(config.name, 'proofclip-community');
  assert.equal(config.main, 'dist/worker.mjs');
  assert.equal(config.compatibility_date, '2026-08-14');
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.observability, { enabled: true, logs: { enabled: true } });
  assert.deepEqual(config.d1_databases, [{
    binding: 'DB',
    database_name: 'proofclip-community',
    database_id: 'd1-id-sentinel'
  }]);
  assert.deepEqual(config.vars, {
    PROOFCLIP_EXTENSION_ID: extensionId,
    NOTION_CLIENT_ID: 'notion-client-id-sentinel',
    NOTION_REDIRECT_URI: 'https://worker.example/v1/auth/notion/callback',
    PROOFCLIP_DEPLOYMENT_MARKER: 'community-0.8.1'
  });
  assert.match(serialized, /PROOFCLIP_DEPLOYMENT_MARKER/);
  for (const sentinel of secretSentinels) assert.doesNotMatch(serialized, new RegExp(sentinel));
});

test('the authoritative template declares the non-secret Community deployment marker', async () => {
  const template = JSON.parse(await readFile(templatePath, 'utf8'));
  assert.equal(template.vars.PROOFCLIP_DEPLOYMENT_MARKER, 'community-0.8.1');
});

test('createStagingTree copies the allowlist, patches only the staged origin, bundles staged source, and excludes secrets', async () => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'proofclip-staging-fixture-'));
  const candidateRoot = join(fixtureRoot, 'candidate');
  const stagingRoot = join(fixtureRoot, 'generated');
  const origin = 'https://Worker.Example/';
  const redirectUri = buildNotionRedirectUri(origin);
  const template = await readFile(templatePath, 'utf8');
  const fixtureBundleScript = [
    "import { mkdir, readFile, writeFile } from 'node:fs/promises';",
    "import { resolve } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "const root = fileURLToPath(new URL('..', import.meta.url));",
    "const source = await readFile(resolve(root, 'src/index.mjs'), 'utf8');",
    "await mkdir(resolve(root, 'dist'), { recursive: true });",
    "await writeFile(resolve(root, 'dist/worker.mjs'), `// staged bundle\\n${source}`, 'utf8');"
  ].join('\n');

  try {
    await mkdir(join(candidateRoot, 'extension', 'src'), { recursive: true });
    await mkdir(join(candidateRoot, 'worker', 'src'), { recursive: true });
    await mkdir(join(candidateRoot, 'worker', 'migrations'), { recursive: true });
    await mkdir(join(candidateRoot, 'worker', 'scripts'), { recursive: true });
    await mkdir(join(candidateRoot, 'worker', 'dist'), { recursive: true });
    await mkdir(join(candidateRoot, 'deploy'), { recursive: true });
    await mkdir(join(candidateRoot, '.wrangler'), { recursive: true });
    await mkdir(join(candidateRoot, 'release', 'records'), { recursive: true });
    await mkdir(join(candidateRoot, 'audit'), { recursive: true });

    await writeFile(join(candidateRoot, 'extension', 'src', 'manifest.json'), '{"manifest_version":3}\n');
    await writeFile(join(candidateRoot, 'extension', 'src', 'community-config.mjs'), "export const COMMUNITY_API_ORIGIN = 'https://replace-me.invalid';\n");
    await writeFile(join(candidateRoot, 'extension', 'src', 'capture.js'), 'export const fixture = true;\n');
    await writeFile(join(candidateRoot, 'worker', 'src', 'index.mjs'), 'export const fixtureWorker = true;\n');
    await writeFile(join(candidateRoot, 'worker', 'migrations', '001_fixture.sql'), 'CREATE TABLE fixture (id TEXT);\n');
    await writeFile(join(candidateRoot, 'worker', 'scripts', 'bundle-worker.mjs'), fixtureBundleScript);
    await writeFile(join(candidateRoot, 'worker', 'dist', 'prebuilt.mjs'), secretSentinels[2]);
    await writeFile(join(candidateRoot, 'deploy', 'wrangler.template.jsonc'), template);
    await writeFile(join(candidateRoot, 'deploy', 'deploy.env'), secretSentinels.join('\n'));
    await writeFile(join(candidateRoot, 'deploy', '.dev.vars'), secretSentinels.join('\n'));
    await writeFile(join(candidateRoot, '.wrangler', 'state.json'), secretSentinels[0]);
    await writeFile(join(candidateRoot, 'release', 'records', 'release.json'), secretSentinels[1]);
    await writeFile(join(candidateRoot, 'audit', 'evidence.txt'), secretSentinels[2]);

    const result = await createStagingTree({
      candidateRoot,
      stagingRoot,
      workerName: 'proofclip-community',
      d1Name: 'proofclip-community',
      d1Id: 'd1-id-sentinel',
      extensionId,
      notionClientId: 'notion-client-id-sentinel',
      redirectUri
    });

    assert.equal(result.extensionDir, join(stagingRoot, 'extension'));
    assert.equal(result.workerDir, join(stagingRoot, 'worker'));
    assert.equal(result.configPath, join(stagingRoot, 'worker', 'wrangler.jsonc'));
    assert.equal(result.statePath, join(stagingRoot, 'deployment-state.json'));

    assert.deepEqual(await listFiles(stagingRoot), [
      'deployment-state.json',
      'extension/capture.js',
      'extension/community-config.mjs',
      'extension/manifest.json',
      'worker/dist/worker.mjs',
      'worker/migrations/001_fixture.sql',
      'worker/scripts/bundle-worker.mjs',
      'worker/src/index.mjs',
      'worker/wrangler.jsonc'
    ]);
    assert.equal(await readFile(join(result.extensionDir, 'community-config.mjs'), 'utf8'), "export const COMMUNITY_API_ORIGIN = 'https://worker.example';\n");
    assert.equal(await readFile(join(candidateRoot, 'extension', 'src', 'community-config.mjs'), 'utf8'), "export const COMMUNITY_API_ORIGIN = 'https://replace-me.invalid';\n");
    assert.match(await readFile(join(result.workerDir, 'dist', 'worker.mjs'), 'utf8'), /staged bundle/);
    assert.match(await readFile(join(result.workerDir, 'dist', 'worker.mjs'), 'utf8'), /fixtureWorker/);

    const config = JSON.parse(await readFile(result.configPath, 'utf8'));
    assert.equal(config.vars.PROOFCLIP_EXTENSION_ID, extensionId);
    assert.equal(config.vars.NOTION_REDIRECT_URI, redirectUri.toLowerCase());
    assert.equal(config.vars.PROOFCLIP_DEPLOYMENT_MARKER, 'community-0.8.1');
    const state = await readFile(result.statePath, 'utf8');
    assert.doesNotMatch(state, /NOTION_CLIENT_SECRET|CF_API_TOKEN|TOKEN_VAULT_KEY/);

    for (const forbiddenPath of [
      join(stagingRoot, 'deploy.env'),
      join(stagingRoot, '.dev.vars'),
      join(stagingRoot, '.wrangler'),
      join(stagingRoot, 'release'),
      join(stagingRoot, 'audit')
    ]) {
      assert.equal(await pathExists(forbiddenPath), false, forbiddenPath);
    }
    for (const file of await listFiles(stagingRoot)) {
      const text = await readFile(join(stagingRoot, file), 'utf8');
      for (const sentinel of secretSentinels) assert.doesNotMatch(text, new RegExp(sentinel), file);
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
