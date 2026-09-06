import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { createCloudflareClient } from '../lib/cloudflare-api.mjs';
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

test('Cloudflare client uses account-scoped resource endpoints and only creates D1 explicitly', async () => {
  const calls = [];
  const cloudflare = createCloudflareClient({
    apiToken: 'cf-api-token-sentinel',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/user/tokens/verify')) return jsonResponse(200, { success: true });
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
