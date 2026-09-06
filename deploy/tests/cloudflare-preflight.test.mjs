import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { createCloudflareClient } from '../lib/cloudflare-api.mjs';
import { resolveDeploymentResources } from '../lib/ownership.mjs';
import { createWranglerRunner } from '../lib/wrangler.mjs';

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test('invalid Cloudflare credentials fail before account discovery or creation', async () => {
  const calls = [];
  const cloudflare = createCloudflareClient({
    apiToken: 'cf-api-token-sentinel',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return jsonResponse(401, { success: false, errors: [{ message: 'token secret must not escape' }] });
    }
  });

  await assert.rejects(
    cloudflare.listAccounts(),
    (error) => error.code === 'CLOUDFLARE_AUTH_FAILED' && !error.message.includes('token secret')
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/user\/tokens\/verify$/);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer cf-api-token-sentinel');
  assert.equal(calls.filter(({ url }) => url.includes('/accounts')).length, 0);
});

test('Cloudflare account discovery verifies first and maps forbidden access without response leakage', async () => {
  const calls = [];
  const cloudflare = createCloudflareClient({
    apiToken: 'cf-api-token-sentinel',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/user/tokens/verify')) return jsonResponse(200, { success: true, result: { status: 'active' } });
      return jsonResponse(403, { success: false, errors: [{ message: 'client secret response sentinel' }] });
    }
  });

  await assert.rejects(
    cloudflare.listAccounts(),
    (error) => error.code === 'CLOUDFLARE_PERMISSION_FAILED' && !error.message.includes('client secret response sentinel')
  );
  assert.deepEqual(calls.map(({ url }) => new URL(url).pathname), ['/client/v4/user/tokens/verify', '/client/v4/accounts']);
  assert.equal(new URL(calls[1].url).searchParams.get('per_page'), '50');
});

test('token verification maps HTTP 403 to permission failure', async () => {
  const cloudflare = createCloudflareClient({
    apiToken: 'cf-api-token-sentinel',
    fetchImpl: async () => jsonResponse(403, { success: false, errors: [{ message: 'forbidden sentinel' }] })
  });

  await assert.rejects(cloudflare.verifyToken(), (error) => error.code === 'CLOUDFLARE_PERMISSION_FAILED');
});

for (const [label, response] of [
  ['invalid JSON', {
    ok: true,
    status: 200,
    async json() { throw new SyntaxError('invalid JSON with token sentinel'); }
  }],
  ['missing success flag', jsonResponse(200, { result: [{ id: 'account-id' }] })]
]) {
  test(`Cloudflare ${label} fails closed before account discovery`, async () => {
    const calls = [];
    const cloudflare = createCloudflareClient({
      apiToken: 'cf-api-token-sentinel',
      fetchImpl: async (url) => {
        calls.push(url);
        return response;
      }
    });

    await assert.rejects(
      cloudflare.listAccounts(),
      (error) => error.code === 'CLOUDFLARE_RESPONSE_INVALID' && !error.message.includes('token sentinel')
    );
    assert.deepEqual(calls.map((url) => new URL(url).pathname), ['/client/v4/user/tokens/verify']);
  });
}

for (const [label, method] of [
  ['Worker list', (client) => client.getWorkers('account-id')],
  ['D1 list', (client) => client.getD1Databases('account-id')]
]) {
  test(`${label} rejects a non-array result shape`, async () => {
    const client = createCloudflareClient({
      apiToken: 'cf-api-token-sentinel',
      fetchImpl: async () => jsonResponse(200, { success: true, result: { not: 'a list' } })
    });
    await assert.rejects(method(client), (error) => error.code === 'CLOUDFLARE_RESPONSE_INVALID');
  });
}

test('missing Worker discovery result fails before ownership can create D1', async () => {
  const calls = [];
  const cloudflare = createCloudflareClient({
    apiToken: 'cf-api-token-sentinel',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const path = new URL(url).pathname;
      if (path.endsWith('/user/tokens/verify')) return jsonResponse(200, { success: true, result: {} });
      if (path.endsWith('/accounts')) return jsonResponse(200, { success: true, result: [{ id: 'account-id' }] });
      if (path.endsWith('/workers/scripts')) return jsonResponse(200, { success: true });
      throw new Error(`unexpected URL ${url}`);
    }
  });

  await assert.rejects(
    resolveDeploymentResources({
      cloudflare,
      state: null,
      candidate: {
        extensionId: 'extension-id-sentinel',
        workerOrigin: 'https://worker.example',
        candidateCommit: 'candidate-commit-sentinel',
        candidateSha256: 'candidate-sha256-sentinel'
      },
      names: { workerName: 'proofclip-community', d1Name: 'proofclip-community', marker: 'community-0.8.1' }
    }),
    (error) => error.code === 'CLOUDFLARE_RESPONSE_INVALID'
  );
  assert.equal(calls.some(({ options }) => options.method === 'POST'), false);
});

test('missing D1 discovery result fails before ownership can create D1', async () => {
  const calls = [];
  const cloudflare = createCloudflareClient({
    apiToken: 'cf-api-token-sentinel',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      const path = new URL(url).pathname;
      if (path.endsWith('/user/tokens/verify')) return jsonResponse(200, { success: true, result: {} });
      if (path.endsWith('/accounts')) return jsonResponse(200, { success: true, result: [{ id: 'account-id' }] });
      if (path.endsWith('/workers/scripts')) return jsonResponse(200, { success: true, result: [] });
      if (path.endsWith('/d1/database')) return jsonResponse(200, { success: true });
      throw new Error(`unexpected URL ${url}`);
    }
  });

  await assert.rejects(
    resolveDeploymentResources({
      cloudflare,
      state: null,
      candidate: {
        extensionId: 'extension-id-sentinel',
        workerOrigin: 'https://worker.example',
        candidateCommit: 'candidate-commit-sentinel',
        candidateSha256: 'candidate-sha256-sentinel'
      },
      names: { workerName: 'proofclip-community', d1Name: 'proofclip-community', marker: 'community-0.8.1' }
    }),
    (error) => error.code === 'CLOUDFLARE_RESPONSE_INVALID'
  );
  assert.equal(calls.some(({ options }) => options.method === 'POST'), false);
});

test('singular Cloudflare results must be non-array objects', async () => {
  const client = createCloudflareClient({
    apiToken: 'cf-api-token-sentinel',
    fetchImpl: async () => jsonResponse(200, { success: true, result: [] })
  });
  await assert.rejects(client.createD1('account-id', 'proofclip-community'), (error) => error.code === 'CLOUDFLARE_RESPONSE_INVALID');
  await assert.rejects(client.getWorkersDevSubdomain('account-id'), (error) => error.code === 'CLOUDFLARE_RESPONSE_INVALID');
});

test('Cloudflare client uses account-scoped resource endpoints and only creates D1 explicitly', async () => {
  const calls = [];
  const cloudflare = createCloudflareClient({
    apiToken: 'cf-api-token-sentinel',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/user/tokens/verify')) return jsonResponse(200, { success: true, result: {} });
      if (url.endsWith('/accounts')) return jsonResponse(200, { success: true, result: [{ id: 'account-id' }] });
      if (url.endsWith('/workers/scripts')) return jsonResponse(200, { success: true, result: [{ id: 'worker-id', name: 'proofclip-community' }] });
      if (new URL(url).pathname.endsWith('/d1/database') && options.method !== 'POST') return jsonResponse(200, { success: true, result: [{ uuid: 'd1-id', name: 'proofclip-community' }] });
      if (url.endsWith('/workers/subdomain')) return jsonResponse(200, { success: true, result: { subdomain: 'example' } });
      if (options.method === 'POST') return jsonResponse(200, { success: true, result: { uuid: 'created-d1-id', name: 'proofclip-community' } });
      throw new Error(`unexpected URL ${url}`);
    }
  });

  assert.deepEqual(await cloudflare.getWorkers('account-id'), [{ id: 'worker-id', name: 'proofclip-community' }]);
  assert.deepEqual(await cloudflare.getWorker('account-id', 'proofclip-community'), { id: 'worker-id', name: 'proofclip-community' });
  assert.deepEqual(await cloudflare.getD1Databases('account-id'), [{ uuid: 'd1-id', name: 'proofclip-community' }]);
  assert.deepEqual(await cloudflare.getD1('account-id', 'proofclip-community'), { uuid: 'd1-id', name: 'proofclip-community' });
  assert.deepEqual(await cloudflare.createD1('account-id', 'proofclip-community'), { uuid: 'created-d1-id', name: 'proofclip-community' });
  assert.deepEqual(await cloudflare.getWorkersDevSubdomain('account-id'), { subdomain: 'example' });
  const createCall = calls.find(({ options }) => options.method === 'POST');
  assert.equal(JSON.parse(createCall.options.body).name, 'proofclip-community');
  assert.match(createCall.options.headers.Authorization, /^Bearer /);
});

test('Wrangler keeps secrets in the child environment and redacts output and failures', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  const observed = {};
  const runner = createWranglerRunner({
    binaryPath: 'wrangler-sentinel',
    cwd: 'C:\\proofclip',
    env: { CLOUDFLARE_API_TOKEN: 'cf-api-token-sentinel' },
    spawnImpl: (binaryPath, args, options) => {
      observed.binaryPath = binaryPath;
      observed.args = args;
      observed.options = options;
      queueMicrotask(() => {
        child.stdout.end('stdout cf-api-token-sentinel access-token-sentinel');
        child.stderr.end('stderr vault-key-sentinel');
        child.emit('close', 0);
      });
      return child;
    }
  });

  const result = await runner.run(['deploy'], {
    input: 'authorization-code-sentinel',
    redact: ['cf-api-token-sentinel', 'access-token-sentinel', 'vault-key-sentinel', 'authorization-code-sentinel']
  });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, 'stdout [REDACTED] [REDACTED]');
  assert.equal(result.stderr, 'stderr [REDACTED]');
  assert.equal(observed.binaryPath, 'wrangler-sentinel');
  assert.deepEqual(observed.args, ['deploy']);
  assert.equal(observed.options.env.CLOUDFLARE_API_TOKEN, 'cf-api-token-sentinel');
  assert.doesNotMatch(JSON.stringify(observed.args), /cf-api-token-sentinel|authorization-code-sentinel/);
});

test('Wrangler automatically redacts the API token from env and the input channel', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  const runner = createWranglerRunner({
    binaryPath: 'wrangler-sentinel',
    cwd: 'C:\\proofclip',
    env: {
      CF_API_TOKEN: 'env-api-token-sentinel',
      NOTION_CLIENT_SECRET: 'notion-client-secret-sentinel',
      TOKEN_VAULT_KEY: 'token-vault-key-sentinel',
      NOTION_CLIENT_ID: 'notion-client-id-sentinel',
      CUSTOM_AUTH_PASSWORD: 'custom-auth-password-sentinel'
    },
    spawnImpl: () => {
      queueMicrotask(() => {
        child.stdout.end('env-api-token-sentinel notion-client-secret-sentinel token-vault-key-sentinel notion-client-id-sentinel custom-auth-password-sentinel input-channel-secret-sentinel');
        child.stderr.end('env-api-token-sentinel notion-client-secret-sentinel token-vault-key-sentinel notion-client-id-sentinel custom-auth-password-sentinel');
        child.emit('close', 0);
      });
      return child;
    }
  });

  const result = await runner.run(['deploy'], { input: 'input-channel-secret-sentinel' });
  assert.doesNotMatch(result.stdout, /env-api-token-sentinel|notion-client-secret-sentinel|token-vault-key-sentinel|notion-client-id-sentinel|custom-auth-password-sentinel|input-channel-secret-sentinel/);
  assert.doesNotMatch(result.stderr, /env-api-token-sentinel|notion-client-secret-sentinel|token-vault-key-sentinel|notion-client-id-sentinel|custom-auth-password-sentinel/);
});

test('Wrangler redacts API token and input values from spawn errors without explicit redact values', async () => {
  const runner = createWranglerRunner({
    binaryPath: 'wrangler-sentinel',
    cwd: 'C:\\proofclip',
    env: { CF_API_TOKEN: 'env-api-token-error-sentinel' },
    spawnImpl: () => {
      throw new Error('env-api-token-error-sentinel input-error-secret-sentinel');
    }
  });

  await assert.rejects(
    runner.run(['deploy'], { input: 'input-error-secret-sentinel' }),
    (error) => error.code === 'WRANGLER_FAILED'
      && !error.message.includes('env-api-token-error-sentinel')
      && !error.message.includes('input-error-secret-sentinel')
  );
});

test('Wrangler sanitizes asynchronous child.error messages for all secret-bearing values', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  const runner = createWranglerRunner({
    binaryPath: 'wrangler-sentinel',
    cwd: 'C:\\proofclip',
    env: {
      CF_API_TOKEN: 'async-api-token-sentinel',
      NOTION_CLIENT_SECRET: 'async-client-secret-sentinel',
      TOKEN_VAULT_KEY: 'async-vault-key-sentinel',
      NOTION_CLIENT_ID: 'async-client-id-sentinel',
      CUSTOM_AUTH_PASSWORD: 'async-password-sentinel'
    },
    spawnImpl: () => {
      queueMicrotask(() => child.emit('error', new Error([
        'async-api-token-sentinel',
        'async-client-secret-sentinel',
        'async-vault-key-sentinel',
        'async-client-id-sentinel',
        'async-password-sentinel',
        'async-input-secret-sentinel'
      ].join(' '))));
      return child;
    }
  });

  await assert.rejects(
    runner.run(['deploy'], { input: 'async-input-secret-sentinel' }),
    (error) => error.code === 'WRANGLER_FAILED'
      && !error.message.includes('async-api-token-sentinel')
      && !error.message.includes('async-client-secret-sentinel')
      && !error.message.includes('async-vault-key-sentinel')
      && !error.message.includes('async-client-id-sentinel')
      && !error.message.includes('async-password-sentinel')
      && !error.message.includes('async-input-secret-sentinel')
  );
});

test('the API client response shape can feed ownership reuse without synthetic transformations', async () => {
  const candidate = {
    extensionId: 'extension-id-sentinel',
    workerOrigin: 'https://worker.example',
    candidateCommit: 'candidate-commit-sentinel',
    candidateSha256: 'candidate-sha256-sentinel'
  };
  const state = {
    schemaVersion: 1,
    accountId: 'account-id',
    workerId: 'worker-id',
    workerName: 'proofclip-community',
    d1Id: 'd1-id',
    d1Name: 'proofclip-community',
    extensionId: candidate.extensionId,
    candidateCommit: candidate.candidateCommit,
    candidateSha256: candidate.candidateSha256
  };
  const cloudflare = createCloudflareClient({
    apiToken: 'cf-api-token-sentinel',
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      if (parsed.pathname.endsWith('/user/tokens/verify')) return jsonResponse(200, { success: true, result: { status: 'active' } });
      if (parsed.pathname.endsWith('/accounts')) return jsonResponse(200, { success: true, result: [{ id: 'account-id' }] });
      if (parsed.pathname.endsWith('/workers/scripts/proofclip-community/settings')) {
        return jsonResponse(200, {
          success: true,
          result: {
            vars: {
              PROOFCLIP_DEPLOYMENT_MARKER: 'community-0.8.1',
              PROOFCLIP_EXTENSION_ID: candidate.extensionId,
              NOTION_REDIRECT_URI: 'https://worker.example/v1/auth/notion/callback',
              PROOFCLIP_CANDIDATE_COMMIT: candidate.candidateCommit,
              PROOFCLIP_CANDIDATE_SHA256: candidate.candidateSha256
            },
            bindings: [{ name: 'DB', type: 'd1', database_id: 'd1-id' }]
          }
        });
      }
      if (parsed.pathname.endsWith('/workers/scripts')) {
        return jsonResponse(200, {
          success: true,
          result: [{
            id: 'worker-id',
            name: 'proofclip-community',
            type: 'worker',
          }]
        });
      }
      if (parsed.pathname.endsWith('/d1/database')) {
        return jsonResponse(200, { success: true, result: [{ uuid: 'd1-id', name: 'proofclip-community' }] });
      }
      throw new Error(`unexpected URL ${url}`);
    }
  });

  const result = await resolveDeploymentResources({
    cloudflare,
    state,
    candidate,
    names: { workerName: 'proofclip-community', d1Name: 'proofclip-community', marker: 'community-0.8.1' }
  });
  assert.deepEqual({ workerAction: result.workerAction, d1Action: result.d1Action }, { workerAction: 'reuse', d1Action: 'reuse' });
});
