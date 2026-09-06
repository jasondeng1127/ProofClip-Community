import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import test from 'node:test';

import { readStableExtensionIdentity } from '../lib/identity.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const manifestPath = join(repoRoot, 'extension', 'src', 'manifest.json');
const templatePath = join(repoRoot, 'deploy', 'wrangler.template.jsonc');
const stableIdentity = await readStableExtensionIdentity(manifestPath);
const stablePublicKey = JSON.parse(await readFile(manifestPath, 'utf8')).key;
const stableExtensionOrigin = `chrome-extension://${stableIdentity.extensionId}`;
const CANDIDATE_SOURCE_COMMIT = 'a'.repeat(40);
const execFileAsync = promisify(execFile);

const SENTINELS = {
  cfApiToken: 'cf-api-token-sentinel',
  notionClientId: 'notion-client-id-sentinel',
  notionClientSecret: 'notion-client-secret-sentinel',
};

async function runCli(args) {
  try {
    const result = await execFileAsync(process.execPath, [join(repoRoot, 'deploy', 'deploy-core.mjs'), ...args], {
      cwd: repoRoot,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      exitCode: typeof error.code === 'number' ? error.code : 1,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    };
  }
}

function assertSafeCliFailure(result, code) {
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, new RegExp(`^FAILURE: ${code}\\nExplanation: [^\\n]+\\nNext action: [^\\n]+\\n?$`));
  assert.doesNotMatch(result.stdout, /Error| at |cf-api-token-sentinel|notion-client-secret-sentinel|TOKEN_VAULT_KEY/i);
}

test('direct CLI rejects malformed or extra arguments with a stable safe failure', async () => {
  for (const args of [
    [],
    ['--unknown'],
    ['--env'],
    ['--env', 'deploy/deploy.env', 'extra'],
    ['--env=deploy/deploy.env'],
  ]) {
    const result = await runCli(args);
    assertSafeCliFailure(result, 'DEPLOYMENT_ARGS_INVALID');
  }
});

test('direct CLI missing-env invocation fails safely before network access', async () => {
  const result = await runCli(['--env', join('deploy', 'missing-task-6.env')]);
  assert.notEqual(result.exitCode, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /^FAILURE: (?:DEPLOY_ENV_MISSING|CANDIDATE_PROVENANCE_FAILED)\nExplanation: [^\n]+\nNext action: [^\n]+\n?$/);
  assert.doesNotMatch(result.stdout, /Error| at |Cloudflare|https:\/\/api\.cloudflare\.com|cf-api-token|notion-client-secret|TOKEN_VAULT_KEY/i);
});

async function listCandidateFiles(root, current = root, files = []) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) await listCandidateFiles(root, path, files);
    else if (entry.isFile()) files.push({ path, relativePath: relative(root, path).replaceAll('\\', '/') });
  }
  return files;
}

async function refreshCandidateProvenance(root, sourceCommit = CANDIDATE_SOURCE_COMMIT, statePath = null) {
  const stateRelativePath = statePath
    ? relative(root, statePath).replaceAll('\\', '/')
    : 'deploy/.state/deployment-state.json';
  const files = [];
  for (const file of await listCandidateFiles(root)) {
    if (file.relativePath === 'PROVENANCE.json' || file.relativePath === stateRelativePath) continue;
    const bytes = await readFile(file.path);
    files.push({ path: file.relativePath, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const contentFingerprint = createHash('sha256')
    .update(Buffer.from(files.map((file) => `${file.path}:${file.sha256}`).join('\n'), 'utf8'))
    .digest('hex');
  const bundle = files.find((file) => file.path === 'worker/dist/worker.mjs');
  const provenance = {
    schemaVersion: 1,
    edition: 'community',
    targetVersion: '0.8.1',
    candidateVersion: '0.8.1',
    sourceCommit,
    files,
    bundle: {
      path: 'worker/dist/worker.mjs',
      sourcePath: 'worker/scripts/bundle-worker.mjs',
      sha256: bundle.sha256,
    },
    contentFingerprint,
  };
  await writeFile(join(root, 'PROVENANCE.json'), JSON.stringify(provenance, null, 2) + '\n');
  const sidecarPath = `${root}.sha256`;
  await writeFile(sidecarPath, `${contentFingerprint}  ${basename(root)}\n`);
  return { files, contentFingerprint, sidecarPath };
}

async function cleanupCandidate(fixture) {
  await rm(fixture.root, { recursive: true, force: true });
  await rm(fixture.envPath, { force: true });
  await rm(fixture.sidecarPath, { force: true });
}

async function createCandidate() {
  const root = await mkdtemp(join(tmpdir(), 'proofclip-community-0.8.1-'));
  await mkdir(join(root, 'extension', 'src'), { recursive: true });
  await mkdir(join(root, 'worker', 'src'), { recursive: true });
  await mkdir(join(root, 'worker', 'migrations'), { recursive: true });
  await mkdir(join(root, 'worker', 'scripts'), { recursive: true });
  await mkdir(join(root, 'deploy'), { recursive: true });
  await writeFile(join(root, 'extension', 'src', 'manifest.json'), await readFile(manifestPath));
  await writeFile(join(root, 'extension', 'src', 'community-config.mjs'), "export const COMMUNITY_API_ORIGIN = 'https://replace-me.invalid';\n");
  await writeFile(join(root, 'worker', 'src', 'worker.mjs'), 'export const workerFixture = true;\n');
  await writeFile(join(root, 'worker', 'src', 'index.mjs'), 'export const indexFixture = true;\n');
  await writeFile(join(root, 'worker', 'src', 'schema.sql'), 'CREATE TABLE oauth_state (id TEXT PRIMARY KEY);\n');
  await writeFile(join(root, 'worker', 'migrations', '20260813_privacy_nonretention.sql'), 'CREATE TABLE privacy_marker (id INTEGER);\n');
  await writeFile(join(root, 'worker', 'scripts', 'bundle-worker.mjs'), [
    "import { mkdir, readFile, writeFile } from 'node:fs/promises';",
    "import { resolve } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "const root = resolve(fileURLToPath(new URL('..', import.meta.url)));",
    "const source = await readFile(resolve(root, 'src', 'worker.mjs'), 'utf8');",
    "await mkdir(resolve(root, 'dist'), { recursive: true });",
    "await writeFile(resolve(root, 'dist', 'worker.mjs'), `// fixture bundle\\n${source}`, 'utf8');",
  ].join('\n'));
  await mkdir(join(root, 'worker', 'dist'), { recursive: true });
  await writeFile(join(root, 'worker', 'dist', 'worker.mjs'), '// fixture bundle\nexport const workerFixture = true;\n');
  await cp(templatePath, join(root, 'deploy', 'wrangler.template.jsonc'));
  const envPath = join(dirname(root), `${basename(root)}-deploy.env`);
  await writeFile(envPath, [
    `CF_API_TOKEN=${SENTINELS.cfApiToken}`,
    `NOTION_CLIENT_ID=${SENTINELS.notionClientId}`,
    `NOTION_CLIENT_SECRET=${SENTINELS.notionClientSecret}`,
    '',
  ].join('\n'));
  const { sidecarPath } = await refreshCandidateProvenance(root);
  return { root, envPath, sidecarPath };
}

function createFsSpy(events) {
  const fs = {
    async readFile(...args) { return readFile(...args); },
    async writeFile(path, ...args) {
      events.push(`write:${path}`);
      return writeFile(path, ...args);
    },
    async mkdir(...args) { return mkdir(...args); },
    async rm(...args) { return rm(...args); },
    async cp(...args) { return cp(...args); },
    async readdir(...args) { return (await import('node:fs/promises')).readdir(...args); },
    async access(...args) { return (await import('node:fs/promises')).access(...args); },
    async stat(...args) { return (await import('node:fs/promises')).stat(...args); },
    async gitFiles() { return []; },
  };
  return fs;
}

function createWranglerSpawn({ events, remote, secretInputs }) {
  return (binaryPath, args, options) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    let input = '';
    child.stdin.on('data', (chunk) => { input += chunk.toString('utf8'); });
    child.stdin.on('finish', () => {
      const label = args[0] === 'secret'
        ? `secret:${args[2]}`
        : args[0] === 'd1'
          ? `d1:${args[args.indexOf('--file') + 1]}`
          : args[0] === 'deploy' ? 'deploy' : 'version';
      events.push(label);
      if (args[0] === 'secret') secretInputs.push({ args: [...args], input, options });
      if (args[0] === 'deploy') {
        const config = JSON.parse(readFileSync(join(options.cwd, 'wrangler.jsonc'), 'utf8'));
        remote.settings = {
          vars: config.vars,
          d1_databases: config.d1_databases,
        };
        remote.deployed = true;
      }
      child.stdout.end(args[0] === 'deploy'
        ? 'Uploaded proofclip-community\nhttps://proofclip-community.example.workers.dev\nVersion ID: worker-version-sentinel\n'
        : args[0] === '--version' ? 'wrangler 4.129.0\n' : 'Success\n');
      child.stderr.end('');
      child.emit('close', 0);
    });
    return child;
  };
}

function createFetchMock({ events, remote, health = {} }) {
  return async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.origin === remote.workerOrigin) {
      events.push(`health:${parsed.pathname}`);
      const corsOrigin = health.corsOrigin === undefined ? stableExtensionOrigin : health.corsOrigin;
      const headers = {
        get(name) { return name.toLowerCase() === 'access-control-allow-origin' ? corsOrigin : null; }
      };
      if (parsed.pathname === '/v1/auth/start') {
        return { status: health.authStatus ?? 200, headers, async json() { return health.authJson ?? { authorizationUrl: 'https://api.notion.com/v1/oauth/authorize?state=mock' }; } };
      }
      if (parsed.pathname === '/v1/connection') {
        return { status: health.connectionStatus ?? 200, headers, async json() { return health.connectionJson ?? { connected: false, updatedAt: null }; } };
      }
      return { status: health.privacyStatus ?? 200, headers, async json() { return { ok: true }; } };
    }
    const path = parsed.pathname;
    if (path.endsWith('/user/tokens/verify')) {
      events.push('token');
      return { status: 200, async json() { return { success: true, result: { status: 'active' } }; } };
    }
    if (path.endsWith('/accounts') && !path.includes('/workers/') && !path.includes('/d1/')) {
      events.push('accounts');
      return { status: 200, async json() { return { success: true, result: [{ id: remote.accountId }] }; } };
    }
    if (path.endsWith('/workers/subdomain')) {
      events.push('subdomain');
      return { status: 200, async json() { return { success: true, result: { subdomain: 'example' } }; } };
    }
    if (path.includes('/workers/scripts/') && path.endsWith('/settings')) {
      events.push('worker-settings');
      return { status: 200, async json() { return { success: true, result: remote.settings }; } };
    }
    if (path.endsWith('/workers/scripts')) {
      events.push('worker-list');
      return { status: 200, async json() { return { success: true, result: remote.deployed ? [remote.worker] : [] }; } };
    }
    if (path.endsWith('/d1/database') && options.method === 'POST') {
      events.push('d1-create');
      remote.d1Exists = true;
      return { status: 200, async json() { return { success: true, result: remote.d1 }; } };
    }
    if (path.endsWith('/d1/database')) {
      events.push('d1-list');
      return { status: 200, async json() { return { success: true, result: remote.d1Exists ? [remote.d1] : [] }; } };
    }
    throw new Error(`unexpected mocked URL ${url}`);
  };
}

function configureRemote() {
  return {
    accountId: 'account-id-sentinel',
    workerOrigin: 'https://proofclip-community.example.workers.dev',
    d1Exists: false,
    deployed: false,
    settings: null,
    d1: { uuid: 'd1-id-sentinel', id: 'd1-id-sentinel', name: 'proofclip-community' },
    worker: {
      id: 'worker-id-sentinel',
      name: 'proofclip-community',
      type: 'worker',
    },
  };
}

test('runDeployment performs the offline deployment contract in order and writes only non-secret state', async () => {
  const fixture = await createCandidate();
  const events = [];
  const remote = configureRemote();
  const secretInputs = [];
  const statePath = join(fixture.root, 'deploy', '.state', 'deployment-state.json');
  const fsImpl = createFsSpy(events);

  try {
    const { runDeployment } = await import('../deploy-core.mjs');
    const result = await runDeployment({
      repoRoot: fixture.root,
      envPath: fixture.envPath,
      statePath,
      fetchImpl: createFetchMock({ events, remote }),
      spawnImpl: createWranglerSpawn({ events, remote, secretInputs }),
      fsImpl,
      now: () => 1725600000000,
    });

    assert.deepEqual(result, {
      ok: true,
      code: 'PASS',
      accountId: remote.accountId,
      workerName: 'proofclip-community',
      d1Name: 'proofclip-community',
      workerOrigin: remote.workerOrigin,
      callbackUrl: `${remote.workerOrigin}/v1/auth/notion/callback`,
      extensionDir: join(dirname(fixture.root), `.${basename(fixture.root)}-generated`, 'extension'),
      statePath,
      workerVersion: 'worker-version-sentinel',
    });

    assert.ok(events.indexOf('token') < events.indexOf('d1-create'));
    assert.ok(events.indexOf('version') < events.indexOf('worker-list'));
    assert.ok(events.indexOf('worker-list') < events.indexOf('d1-create'));
    assert.ok(events.indexOf('worker-list') < events.indexOf('d1:src/schema.sql'));
    assert.ok(events.indexOf('d1:src/schema.sql') < events.indexOf('deploy'));
    assert.ok(events.indexOf('deploy') < events.indexOf('health:/privacy'));
    assert.ok(events.indexOf('health:/v1/auth/start') < events.indexOf(`write:${statePath}`));
    assert.equal(events.includes('worker-settings'), false);

    assert.equal(secretInputs.length, 2);
    assert.deepEqual(secretInputs.map(({ args }) => args), [
      ['secret', 'put', 'NOTION_CLIENT_SECRET'],
      ['secret', 'put', 'TOKEN_VAULT_KEY'],
    ]);
    assert.equal(secretInputs[0].input, `${SENTINELS.notionClientSecret}\n`);
    assert.match(secretInputs[1].input, /^[A-Za-z0-9+/]+=*\n$/);
    assert.equal(Buffer.from(secretInputs[1].input.trim(), 'base64').length, 32);
    assert.doesNotMatch(JSON.stringify(secretInputs.map(({ options }) => options.env)), /notion-client-secret-sentinel|token-vault-secret|TOKEN_VAULT_KEY/);

    const stateText = await readFile(statePath, 'utf8');
    assert.doesNotMatch(stateText, /cf-api-token-sentinel|notion-client-secret-sentinel|TOKEN_VAULT_KEY/);
    const persistedState = JSON.parse(stateText);
    assert.equal(persistedState.candidateCommit, CANDIDATE_SOURCE_COMMIT);
    assert.deepEqual(persistedState, {
      schemaVersion: 1,
      accountId: remote.accountId,
      workerId: remote.worker.id,
      workerName: 'proofclip-community',
      d1Id: remote.d1.id,
      d1Name: 'proofclip-community',
      extensionId: stableIdentity.extensionId,
      candidateCommit: CANDIDATE_SOURCE_COMMIT,
      candidateSha256: persistedState.candidateSha256,
    });

    const firstCreateCount = events.filter((event) => event === 'd1-create').length;
    const persisted = JSON.parse(stateText);
    const second = await runDeployment({
      repoRoot: fixture.root,
      envPath: fixture.envPath,
      statePath,
      fetchImpl: createFetchMock({ events, remote }),
      spawnImpl: createWranglerSpawn({ events, remote, secretInputs }),
      fsImpl,
      now: () => 1725600001000,
    });
    assert.equal(second.accountId, result.accountId);
    assert.equal(second.workerOrigin, result.workerOrigin);
    assert.equal(events.filter((event) => event === 'd1-create').length, firstCreateCount);
    assert.ok(events.includes('worker-settings'));
    assert.equal(secretInputs.filter(({ args }) => args[2] === 'TOKEN_VAULT_KEY').length, 1);
  } finally {
    await cleanupCandidate(fixture);
  }
});

test('candidate provenance failure happens before credentials or resource creation', async () => {
  const fixture = await createCandidate();
  const events = [];
  const remote = configureRemote();
  try {
    await mkdir(join(fixture.root, 'audit'), { recursive: true });
    await writeFile(join(fixture.root, 'audit', 'evidence.txt'), 'historical audit identity');
    const { runDeployment } = await import('../deploy-core.mjs');
    await assert.rejects(
      runDeployment({
        repoRoot: fixture.root,
        envPath: fixture.envPath,
        statePath: join(fixture.root, 'deploy', '.state', 'state.json'),
        fetchImpl: createFetchMock({ events, remote }),
        spawnImpl: createWranglerSpawn({ events, remote, secretInputs: [] }),
        fsImpl: createFsSpy(events),
      }),
      (error) => error.code === 'CANDIDATE_PROVENANCE_FAILED'
    );
    assert.deepEqual(events, []);
  } finally {
      await cleanupCandidate(fixture);
  }
});

for (const [label, relativePath] of [
  ['RC candidate directory', 'proofclip-community-rc1-package/marker.txt'],
  ['release record file', 'release-record.json'],
  ['audit report file', 'audit-report.md'],
  ['local runtime directory', 'runtime/state.json'],
  ['legacy directory', 'legacy/marker.txt'],
  ['legacy artifacts directory', 'legacy-artifacts/marker.txt'],
  ['artifact directory', 'artifact/marker.txt'],
  ['artifacts directory', 'artifacts/marker.txt'],
  ['old ZIP candidate artifact', 'old-release.zip'],
  ['legacy ZIP candidate artifact', 'release/legacy-artifacts/community-0.8.0.zip'],
]) {
  test(`candidate ${label} fails before any network or create call`, async () => {
    const fixture = await createCandidate();
    const events = [];
    const remote = configureRemote();
    try {
      const contaminatedPath = join(fixture.root, relativePath);
      await mkdir(dirname(contaminatedPath), { recursive: true });
      await writeFile(contaminatedPath, 'forbidden candidate identity');
      const { runDeployment } = await import('../deploy-core.mjs');
      await assert.rejects(
        runDeployment({
          repoRoot: fixture.root,
          envPath: fixture.envPath,
          statePath: join(fixture.root, 'deploy', '.state', 'state.json'),
          fetchImpl: createFetchMock({ events, remote }),
          spawnImpl: createWranglerSpawn({ events, remote, secretInputs: [] }),
          fsImpl: createFsSpy(events),
        }),
        (error) => error.code === 'CANDIDATE_PROVENANCE_FAILED'
      );
      assert.deepEqual(events, []);
    } finally {
      await cleanupCandidate(fixture);
    }
  });
}

for (const [label, mutate] of [
  ['missing source provenance', async (path) => { await rm(path, { force: true }); }],
  ['invalid source provenance', async (path) => {
    await writeFile(path, JSON.stringify({ edition: 'community', targetVersion: '0.8.0', sourceCommit: 'not-a-commit' }) + '\n');
  }],
]) {
  test(`candidate ${label} fails before any network or create call`, async () => {
    const fixture = await createCandidate();
    const events = [];
    const remote = configureRemote();
    try {
      await mutate(join(fixture.root, 'PROVENANCE.json'));
      const { runDeployment } = await import('../deploy-core.mjs');
      await assert.rejects(
        runDeployment({
          repoRoot: fixture.root,
          envPath: fixture.envPath,
          statePath: join(fixture.root, 'deploy', '.state', 'state.json'),
          fetchImpl: createFetchMock({ events, remote }),
          spawnImpl: createWranglerSpawn({ events, remote, secretInputs: [] }),
          fsImpl: createFsSpy(events),
        }),
        (error) => error.code === 'CANDIDATE_PROVENANCE_FAILED'
      );
      assert.deepEqual(events, []);
    } finally {
      await cleanupCandidate(fixture);
    }
  });
}

async function assertCandidateIntegrityFailure(label, mutate) {
  test(`candidate ${label} fails before any network or create call`, async () => {
    const fixture = await createCandidate();
    const events = [];
    const remote = configureRemote();
    try {
      await mutate(fixture);
      const { runDeployment } = await import('../deploy-core.mjs');
      await assert.rejects(
        runDeployment({
          repoRoot: fixture.root,
          envPath: fixture.envPath,
          statePath: join(fixture.root, 'deploy', '.state', 'state.json'),
          fetchImpl: createFetchMock({ events, remote }),
          spawnImpl: createWranglerSpawn({ events, remote, secretInputs: [] }),
          fsImpl: createFsSpy(events),
        }),
        (error) => error.code === 'CANDIDATE_PROVENANCE_FAILED'
      );
      assert.deepEqual(events, []);
    } finally {
      await cleanupCandidate(fixture);
    }
  });
}

async function mutateCandidateProvenance(root, mutate) {
  const path = join(root, 'PROVENANCE.json');
  const provenance = JSON.parse(await readFile(path, 'utf8'));
  await mutate(provenance);
  await writeFile(path, JSON.stringify(provenance, null, 2) + '\n');
}

await assertCandidateIntegrityFailure('provenance file list mismatch', async ({ root }) => {
  await mutateCandidateProvenance(root, (provenance) => { provenance.files = provenance.files.slice(1); });
});

await assertCandidateIntegrityFailure('provenance file hash mismatch', async ({ root }) => {
  await mutateCandidateProvenance(root, (provenance) => { provenance.files[0].sha256 = '0'.repeat(64); });
});

await assertCandidateIntegrityFailure('provenance content fingerprint mismatch', async ({ root }) => {
  await mutateCandidateProvenance(root, (provenance) => { provenance.contentFingerprint = '0'.repeat(64); });
});

await assertCandidateIntegrityFailure('bundle path mismatch', async ({ root }) => {
  await mutateCandidateProvenance(root, (provenance) => { provenance.bundle.path = 'worker/dist/other.mjs'; });
});

await assertCandidateIntegrityFailure('bundle source path mismatch', async ({ root }) => {
  await mutateCandidateProvenance(root, (provenance) => { provenance.bundle.sourcePath = 'worker/scripts/other-bundle.mjs'; });
});

await assertCandidateIntegrityFailure('bundle hash mismatch', async ({ root }) => {
  await mutateCandidateProvenance(root, (provenance) => { provenance.bundle.sha256 = '0'.repeat(64); });
});

await assertCandidateIntegrityFailure('sidecar fingerprint mismatch', async ({ root }) => {
  await writeFile(`${root}.sha256`, `${'0'.repeat(64)}  ${basename(root)}\n`);
});

await assertCandidateIntegrityFailure('extra candidate file', async ({ root }) => {
  await writeFile(join(root, 'unexpected.txt'), 'unexpected candidate file\n');
});

test('candidate fixed Community public key is required before network or create calls', async () => {
  const fixture = await createCandidate();
  const events = [];
  const remote = configureRemote();
  try {
    const manifestFile = join(fixture.root, 'extension', 'src', 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
    manifest.key = stablePublicKey.replace('oE6c', 'pE6c');
    await writeFile(manifestFile, JSON.stringify(manifest) + '\n');
    await refreshCandidateProvenance(fixture.root);
    const { runDeployment } = await import('../deploy-core.mjs');
    await assert.rejects(
      runDeployment({
        repoRoot: fixture.root,
        envPath: fixture.envPath,
        statePath: join(fixture.root, 'deploy', '.state', 'state.json'),
        fetchImpl: createFetchMock({ events, remote }),
        spawnImpl: createWranglerSpawn({ events, remote, secretInputs: [] }),
        fsImpl: createFsSpy(events),
      }),
      (error) => error.code === 'CANDIDATE_PROVENANCE_FAILED'
    );
    assert.deepEqual(events, []);
  } finally {
    await cleanupCandidate(fixture);
  }
});

test('malformed Worker settings fail closed before reuse or resource creation', async () => {
  const fixture = await createCandidate();
  const events = [];
  const remote = configureRemote();
  const secretInputs = [];
  const statePath = join(fixture.root, 'deploy', '.state', 'state.json');
  try {
    const { runDeployment } = await import('../deploy-core.mjs');
    await runDeployment({
      repoRoot: fixture.root,
      envPath: fixture.envPath,
      statePath,
      fetchImpl: createFetchMock({ events, remote }),
      spawnImpl: createWranglerSpawn({ events, remote, secretInputs }),
      fsImpl: createFsSpy(events),
    });
    remote.worker.vars = {
      PROOFCLIP_DEPLOYMENT_MARKER: 'community-0.8.1',
      PROOFCLIP_EXTENSION_ID: stableIdentity.extensionId,
      NOTION_REDIRECT_URI: `${remote.workerOrigin}/v1/auth/notion/callback`,
      PROOFCLIP_CANDIDATE_COMMIT: CANDIDATE_SOURCE_COMMIT,
      PROOFCLIP_CANDIDATE_SHA256: JSON.parse(await readFile(statePath, 'utf8')).candidateSha256,
    };
    remote.worker.bindings = [{ name: 'DB', type: 'd1', database_id: remote.d1.id }];
    remote.settings = [];
    await assert.rejects(
      runDeployment({
        repoRoot: fixture.root,
        envPath: fixture.envPath,
        statePath,
        fetchImpl: createFetchMock({ events, remote }),
        spawnImpl: createWranglerSpawn({ events, remote, secretInputs }),
        fsImpl: createFsSpy(events),
      }),
      (error) => error.code === 'CLOUDFLARE_RESPONSE_INVALID'
    );
    assert.equal(events.filter((event) => event === 'd1-create').length, 1);
    assert.equal(events.filter((event) => event === 'deploy').length, 1);
    assert.equal(events.filter((event) => event.startsWith('secret:')).length, 2);
  } finally {
      await cleanupCandidate(fixture);
  }
});

test('worktree-style Git HEAD is authoritative over mismatched candidate provenance', async () => {
  const fixture = await createCandidate();
  const commonGit = await mkdtemp(join(tmpdir(), 'proofclip-common-git-'));
  const worktreeGit = join(commonGit, 'worktrees', 'task-5');
  const expectedCommit = 'b'.repeat(40);
  const events = [];
  const remote = configureRemote();
  try {
    await mkdir(worktreeGit, { recursive: true });
    await mkdir(join(commonGit, 'refs', 'heads'), { recursive: true });
    await writeFile(join(fixture.root, '.git'), `gitdir: ${relative(fixture.root, worktreeGit)}\n`);
    await writeFile(join(worktreeGit, 'HEAD'), 'ref: refs/heads/task-5\n');
    await writeFile(join(worktreeGit, 'commondir'), '../..\n');
    await writeFile(join(commonGit, 'refs', 'heads', 'task-5'), `${expectedCommit}\n`);
    await refreshCandidateProvenance(fixture.root, 'c'.repeat(40));

    const { runDeployment } = await import('../deploy-core.mjs');
    await assert.rejects(
      runDeployment({
        repoRoot: fixture.root,
        envPath: fixture.envPath,
        statePath: join(fixture.root, 'deploy', '.state', 'state.json'),
        fetchImpl: createFetchMock({ events, remote }),
        spawnImpl: createWranglerSpawn({ events, remote, secretInputs: [] }),
        fsImpl: createFsSpy(events),
      }),
      (error) => error.code === 'CANDIDATE_PROVENANCE_FAILED'
    );
    assert.deepEqual(events, []);
  } finally {
      await cleanupCandidate(fixture);
    await rm(commonGit, { recursive: true, force: true });
  }
});

test('candidate fingerprint preserves non-UTF-8 staged bytes', async () => {
  const fixture = await createCandidate();
  const bytePath = join(fixture.root, 'extension', 'src', 'binary-fixture.bin');
  const events = [];
  const remote = configureRemote();
  const secretInputs = [];
  const statePath = join(fixture.root, 'deploy', '.state', 'state.json');
  try {
    await writeFile(bytePath, Buffer.from([0xff, 0x00]));
    await refreshCandidateProvenance(fixture.root, CANDIDATE_SOURCE_COMMIT, statePath);
    const { runDeployment } = await import('../deploy-core.mjs');
    await runDeployment({
      repoRoot: fixture.root,
      envPath: fixture.envPath,
      statePath,
      fetchImpl: createFetchMock({ events, remote }),
      spawnImpl: createWranglerSpawn({ events, remote, secretInputs }),
      fsImpl: createFsSpy(events),
    });
    await writeFile(bytePath, Buffer.from([0xfe, 0x00]));
    await refreshCandidateProvenance(fixture.root, CANDIDATE_SOURCE_COMMIT, statePath);
    await assert.rejects(
      runDeployment({
        repoRoot: fixture.root,
        envPath: fixture.envPath,
        statePath,
        fetchImpl: createFetchMock({ events, remote }),
        spawnImpl: createWranglerSpawn({ events, remote, secretInputs }),
        fsImpl: createFsSpy(events),
      }),
      (error) => error.code === 'RESOURCE_CONFLICT'
    );
  } finally {
      await cleanupCandidate(fixture);
  }
});

test('candidate fingerprint covers the complete extension and Worker trees', async () => {
  const fixture = await createCandidate();
  const events = [];
  const remote = configureRemote();
  const secretInputs = [];
  const statePath = join(fixture.root, 'deploy', '.state', 'state.json');
  try {
    const { runDeployment } = await import('../deploy-core.mjs');
    await runDeployment({
      repoRoot: fixture.root,
      envPath: fixture.envPath,
      statePath,
      fetchImpl: createFetchMock({ events, remote }),
      spawnImpl: createWranglerSpawn({ events, remote, secretInputs }),
      fsImpl: createFsSpy(events),
    });
    await writeFile(join(fixture.root, 'extension', 'src', 'new-runtime-file.mjs'), 'export const changed = true;\n');
    await refreshCandidateProvenance(fixture.root, CANDIDATE_SOURCE_COMMIT, statePath);
    await assert.rejects(
      runDeployment({
        repoRoot: fixture.root,
        envPath: fixture.envPath,
        statePath,
        fetchImpl: createFetchMock({ events, remote }),
        spawnImpl: createWranglerSpawn({ events, remote, secretInputs }),
        fsImpl: createFsSpy(events),
      }),
      (error) => error.code === 'RESOURCE_CONFLICT'
    );
  } finally {
      await cleanupCandidate(fixture);
  }
});

test('invalid Cloudflare credentials stop before D1 creation and deployment', async () => {
  const fixture = await createCandidate();
  const events = [];
  const remote = configureRemote();
  try {
    await writeFile(fixture.envPath, [
      `CF_API_TOKEN=${SENTINELS.cfApiToken}`,
      `NOTION_CLIENT_ID=${SENTINELS.notionClientId}`,
      `NOTION_CLIENT_SECRET=${SENTINELS.notionClientSecret}`,
      '',
    ].join('\n'));
    const { runDeployment } = await import('../deploy-core.mjs');
    await assert.rejects(
      runDeployment({
        repoRoot: fixture.root,
        envPath: fixture.envPath,
        statePath: join(fixture.root, 'deploy', '.state', 'state.json'),
        fetchImpl: async (url) => {
          events.push(url);
          return { status: 401, async json() { return { success: false, errors: [{ message: SENTINELS.notionClientSecret }] }; } };
        },
        spawnImpl: createWranglerSpawn({ events, remote, secretInputs: [] }),
        fsImpl: createFsSpy(events),
      }),
      (error) => error.code === 'CLOUDFLARE_AUTH_FAILED' && !error.message.includes(SENTINELS.notionClientSecret)
    );
    assert.equal(events.some((event) => event === 'd1-create'), false);
  } finally {
      await cleanupCandidate(fixture);
  }
});

test('subprocess failures never carry secret output into thrown errors or final summaries', async () => {
  const fixture = await createCandidate();
  const events = [];
  const remote = configureRemote();
  const forbidden = [
    SENTINELS.cfApiToken,
    SENTINELS.notionClientSecret,
    'token-vault-secret-sentinel',
    'oauth-code-secret-sentinel',
  ];
  try {
    const { formatFinalSummary, runDeployment } = await import('../deploy-core.mjs');
    const spawnImpl = (binaryPath, args) => {
      const child = new EventEmitter();
      child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
      child.stdin.on('finish', () => {
        child.stdout.end('stdout ' + forbidden.join(' '));
        child.stderr.end('stderr ' + forbidden.join(' '));
        child.emit('close', 1);
      });
      return child;
    };
    let caught;
    try {
      await runDeployment({
        repoRoot: fixture.root,
        envPath: fixture.envPath,
        statePath: join(fixture.root, 'deploy', '.state', 'state.json'),
        fetchImpl: createFetchMock({ events, remote }),
        spawnImpl,
        fsImpl: createFsSpy(events),
      });
    } catch (error) {
      caught = error;
    }
    assert.equal(caught?.code, 'DEPENDENCY_MISSING');
    for (const value of forbidden) assert.doesNotMatch(caught.message, new RegExp(value));
    const summary = formatFinalSummary({ ok: false, code: caught.code, message: caught.message, stderr: forbidden.join(' ') });
    for (const value of forbidden) assert.doesNotMatch(summary, new RegExp(value));
  } finally {
      await cleanupCandidate(fixture);
  }
});

test('reported Worker origin mismatch fails closed before state write', async () => {
  const fixture = await createCandidate();
  const events = [];
  const remote = configureRemote();
  const secretInputs = [];
  try {
    const { runDeployment } = await import('../deploy-core.mjs');
    const statePath = join(fixture.root, 'deploy', '.state', 'state.json');
    await assert.rejects(
      runDeployment({
        repoRoot: fixture.root,
        envPath: fixture.envPath,
        statePath,
        fetchImpl: createFetchMock({ events, remote }),
        spawnImpl: (binaryPath, args, options) => {
          const child = new EventEmitter();
          child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
          child.stdin.on('finish', () => {
            if (args[0] === 'secret') secretInputs.push({ args, input: 'redacted' });
            child.stdout.end(args[0] === 'deploy' ? 'https://other.example.workers.dev\nVersion ID: version\n' : 'ok');
            child.stderr.end(''); child.emit('close', 0);
          });
          return child;
        },
        fsImpl: createFsSpy(events),
      }),
      (error) => error.code === 'HEALTH_CHECK_FAILED'
    );
    assert.equal(events.some((event) => event === `write:${statePath}`), false);
  } finally {
      await cleanupCandidate(fixture);
  }
});

for (const [label, health] of [
  ['malformed OAuth health JSON', { authJson: { ok: true } }],
  ['malformed connection health JSON', { connectionJson: { ok: true } }],
  ['incorrect health CORS origin', { corsOrigin: 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }],
]) {
  test(`${label} fails closed as HEALTH_CHECK_FAILED`, async () => {
    const fixture = await createCandidate();
    const events = [];
    const remote = configureRemote();
    const secretInputs = [];
    try {
      const { runDeployment } = await import('../deploy-core.mjs');
      await assert.rejects(
        runDeployment({
          repoRoot: fixture.root,
          envPath: fixture.envPath,
          statePath: join(fixture.root, 'deploy', '.state', 'state.json'),
          fetchImpl: createFetchMock({ events, remote, health }),
          spawnImpl: createWranglerSpawn({ events, remote, secretInputs }),
          fsImpl: createFsSpy(events),
        }),
        (error) => error.code === 'HEALTH_CHECK_FAILED'
      );
    } finally {
      await cleanupCandidate(fixture);
    }
  });
}
