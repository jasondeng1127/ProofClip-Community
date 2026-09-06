import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { readStableExtensionIdentity } from '../lib/identity.mjs';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const manifestPath = join(repoRoot, 'extension', 'src', 'manifest.json');
const templatePath = join(repoRoot, 'deploy', 'wrangler.template.jsonc');
const stableIdentity = await readStableExtensionIdentity(manifestPath);

const SENTINELS = {
  cfApiToken: 'cf-api-token-sentinel',
  notionClientId: 'notion-client-id-sentinel',
  notionClientSecret: 'notion-client-secret-sentinel',
};

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
  await cp(templatePath, join(root, 'deploy', 'wrangler.template.jsonc'));
  const envPath = join(root, 'deploy', 'deploy.env');
  await writeFile(envPath, [
    `CF_API_TOKEN=${SENTINELS.cfApiToken}`,
    `NOTION_CLIENT_ID=${SENTINELS.notionClientId}`,
    `NOTION_CLIENT_SECRET=${SENTINELS.notionClientSecret}`,
    '',
  ].join('\n'));
  return { root, envPath };
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
      if (args[0] === 'deploy') remote.deployed = true;
      child.stdout.end(args[0] === 'deploy'
        ? 'Uploaded proofclip-community\nhttps://proofclip-community.example.workers.dev\nVersion ID: worker-version-sentinel\n'
        : args[0] === '--version' ? 'wrangler 4.129.0\n' : 'Success\n');
      child.stderr.end('');
      child.emit('close', 0);
    });
    return child;
  };
}

function createFetchMock({ events, remote }) {
  return async (url, options = {}) => {
    const parsed = new URL(url);
    if (parsed.origin === remote.workerOrigin) {
      events.push(`health:${parsed.pathname}`);
      return { status: 200, async json() { return { ok: true }; } };
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
    d1: { uuid: 'd1-id-sentinel', id: 'd1-id-sentinel', name: 'proofclip-community' },
    worker: {
      id: 'worker-id-sentinel',
      name: 'proofclip-community',
      type: 'worker',
      vars: {
        PROOFCLIP_DEPLOYMENT_MARKER: 'community-0.8.1',
        PROOFCLIP_EXTENSION_ID: stableIdentity.extensionId,
        NOTION_REDIRECT_URI: `${'https://proofclip-community.example.workers.dev'}/v1/auth/notion/callback`,
      },
      bindings: [{ name: 'DB', type: 'd1', database_id: 'd1-id-sentinel' }],
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
    assert.deepEqual(JSON.parse(stateText), {
      schemaVersion: 1,
      accountId: remote.accountId,
      workerId: remote.worker.id,
      workerName: 'proofclip-community',
      d1Id: remote.d1.id,
      d1Name: 'proofclip-community',
      extensionId: stableIdentity.extensionId,
      candidateCommit: JSON.parse(stateText).candidateCommit,
      candidateSha256: JSON.parse(stateText).candidateSha256,
    });

    const firstCreateCount = events.filter((event) => event === 'd1-create').length;
    const persisted = JSON.parse(stateText);
    remote.worker.candidateCommit = persisted.candidateCommit;
    remote.worker.candidateSha256 = persisted.candidateSha256;
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
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
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
    await rm(fixture.root, { recursive: true, force: true });
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
    await rm(fixture.root, { recursive: true, force: true });
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
    await rm(fixture.root, { recursive: true, force: true });
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
    await rm(fixture.root, { recursive: true, force: true });
  }
});
