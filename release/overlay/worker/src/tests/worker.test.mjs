import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWorker } from '../worker.mjs';
import { createRateLimiter } from '../rate-limit.mjs';

const key = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));

function freshRateLimit(limit = 1000) {
  return {
    captures: createRateLimiter({ windowMs: 60_000, limit, now: () => 1_000 }),
    oauthStart: createRateLimiter({ windowMs: 60_000, limit, now: () => 1_000 }),
    reads: createRateLimiter({ windowMs: 60_000, limit, now: () => 1_000 }),
    setup: createRateLimiter({ windowMs: 60_000, limit, now: () => 1_000 })
  };
}

function memoryRepository() {
  const states = new Map();
  const connections = new Map();
  return {
    states,
    connections,
    async putOAuthState(record) { states.set(record.value, { ...record }); },
    async consumeOAuthState(value, now) {
      const record = states.get(value);
      if (!record || record.expiresAt <= now) return null;
      states.delete(value);
      return { value: record.value, installIdHash: record.installIdHash, expiresAt: record.expiresAt };
    },
    async deleteExpiredOAuthStates(now) {
      for (const [value, record] of states) if (record.expiresAt <= now) states.delete(value);
    },
    async saveConnection(record) { connections.set(record.installIdHash, record); },
    async getConnection(installIdHash) {
      const record = connections.get(installIdHash);
      return record ? { updatedAt: record.now } : null;
    },
    async getTokenConnection(installIdHash) {
      const record = connections.get(installIdHash);
      return record ? { accessEnvelope: JSON.stringify(record.accessEnvelope) } : null;
    },
    async deleteConnection(installIdHash) { connections.delete(installIdHash); }
  };
}

function fixture(repository, fetchImpl) {
  const app = createWorker({
    repository,
    fetchImpl,
    now: () => 1_000,
    rateLimit: freshRateLimit(),
    env: {
      NOTION_CLIENT_ID: 'client-id',
      NOTION_CLIENT_SECRET: 'client-secret',
      NOTION_REDIRECT_URI: 'https://api.example/v1/auth/notion/callback',
      TOKEN_VAULT_KEY: key,
      PROOFCLIP_EXTENSION_ID: 'abcdefghijklmnopabcdefghijklmnop'
    }
  });
  return { fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/v1/') && url.pathname !== '/v1/auth/notion/callback' && !request.headers.get('origin')) {
      const headers = new Headers(request.headers);
      headers.set('Origin', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop');
      return app.fetch(new Request(request, { headers }));
    }
    return app.fetch(request);
  } };
}

async function connectNotion(app, headers) {
  const start = await app.fetch(new Request('https://api.example/v1/auth/start', { method: 'POST', headers }));
  const state = new URL((await start.json()).authorizationUrl).searchParams.get('state');
  await app.fetch(new Request(`https://api.example/v1/auth/notion/callback?code=temp-code&state=${state}`));
}

test('privacy page discloses the self-hosted browser-to-Worker-to-Notion flow without a support identity', async () => {
  const app = fixture(memoryRepository(), async () => { throw new Error('not called'); });
  const response = await app.fetch(new Request('https://api.example/privacy'));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(text, /self-hosted/i);
  assert.match(text, /operated by the person who deployed/i);
  assert.match(text, /only after you click a capture button/i);
  assert.match(text, /does not store capture bodies, selections, screenshots, image URLs or page URLs/i);
  assert.match(text, /encrypted Notion connection token/i);
  assert.doesNotMatch(text, /mailto:/);
  assert.doesNotMatch(text, /@/);
});

test('start route stores one-time state and returns a Notion authorization URL', async () => {
  const repository = memoryRepository();
  const app = fixture(repository, async () => { throw new Error('not called'); });
  const response = await app.fetch(new Request('https://api.example/v1/auth/start', { method: 'POST', headers: { 'x-proofclip-install-id': 'proofclip_install_12345' } }));
  const body = await response.json();
  assert.equal(response.status, 200);
  const url = new URL(body.authorizationUrl);
  assert.equal(url.origin, 'https://api.notion.com');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(repository.states.size, 1);
});

test('only the configured Chrome extension origin receives CORS headers', async () => {
  const app = fixture(memoryRepository(), async () => { throw new Error('not called'); });
  const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
  const response = await app.fetch(new Request('https://api.example/v1/connection', { headers: { Origin: origin, 'x-proofclip-install-id': 'proofclip_install_12345' } }));
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  const preflight = await app.fetch(new Request('https://api.example/v1/connection', { method: 'OPTIONS', headers: { Origin: origin } }));
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, POST, DELETE, OPTIONS');
  assert.equal(preflight.headers.get('cache-control'), 'no-store');
  const other = await app.fetch(new Request('https://api.example/v1/connection', { headers: { Origin: 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba', 'x-proofclip-install-id': 'proofclip_install_12345' } }));
  assert.equal(other.headers.get('access-control-allow-origin'), null);
});

test('protected extension routes allow extension requests without Origin but reject an explicit wrong Origin', async () => {
  const repository = memoryRepository();
  let reads = 0;
  repository.getConnection = async () => { reads += 1; return null; };
  const app = createWorker({ repository, fetchImpl: async () => { throw new Error('not called'); }, env: { PROOFCLIP_EXTENSION_ID: 'abcdefghijklmnopabcdefghijklmnop' } });
  const missing = await app.fetch(new Request('https://api.example/v1/connection', { headers: { 'x-proofclip-install-id': 'proofclip_install_12345' } }));
  const wrong = await app.fetch(new Request('https://api.example/v1/connection', { headers: { Origin: 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba', 'x-proofclip-install-id': 'proofclip_install_12345' } }));
  assert.equal(missing.status, 200);
  assert.equal(wrong.status, 403);
  assert.equal(reads, 1);
});

test('OAuth start is rate limited by the Cloudflare client address and cleans stale states', async () => {
  const repository = memoryRepository();
  let cleanupCalls = 0;
  repository.deleteExpiredOAuthStates = async () => { cleanupCalls += 1; };
  const app = createWorker({
    repository,
    fetchImpl: async () => { throw new Error('not called'); },
    now: () => 1_000,
    rateLimit: {
      captures: createRateLimiter({ limit: 10, now: () => 1_000 }),
      oauthStart: createRateLimiter({ limit: 1, now: () => 1_000 }),
      reads: createRateLimiter({ limit: 10, now: () => 1_000 }),
      setup: createRateLimiter({ limit: 10, now: () => 1_000 })
    },
    env: { NOTION_CLIENT_ID: 'client-id', NOTION_REDIRECT_URI: 'https://api.example/v1/auth/notion/callback', PROOFCLIP_EXTENSION_ID: 'abcdefghijklmnopabcdefghijklmnop' }
  });
  const headers = { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'CF-Connecting-IP': '203.0.113.7', 'x-proofclip-install-id': 'proofclip_install_12345' };
  assert.equal((await app.fetch(new Request('https://api.example/v1/auth/start', { method: 'POST', headers }))).status, 200);
  assert.equal((await app.fetch(new Request('https://api.example/v1/auth/start', { method: 'POST', headers }))).status, 429);
  assert.equal(cleanupCalls, 1);
});

test('callback consumes state, saves encrypted tokens, and never returns token text', async () => {
  const repository = memoryRepository();
  const app = fixture(repository, async () => new Response(JSON.stringify({ access_token: 'ntn_realistic_test_token', refresh_token: 'nrt_test_token', workspace_id: 'workspace', workspace_name: 'Test Workspace' }), { status: 200 }));
  const start = await app.fetch(new Request('https://api.example/v1/auth/start', { method: 'POST', headers: { 'x-proofclip-install-id': 'proofclip_install_12345' } }));
  const state = new URL((await start.json()).authorizationUrl).searchParams.get('state');
  const response = await app.fetch(new Request(`https://api.example/v1/auth/notion/callback?code=temp-code&state=${state}`));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.equal(text.includes('ntn_realistic_test_token'), false);
  assert.equal(repository.connections.size, 1);
  assert.equal(JSON.stringify([...repository.connections.values()][0]).includes('ntn_realistic_test_token'), false);
  assert.equal(JSON.stringify([...repository.connections.values()][0]).includes('Test Workspace'), false);
});

test('callback rejects reused state without calling Notion', async () => {
  const repository = memoryRepository();
  let calls = 0;
  const app = fixture(repository, async () => { calls += 1; return new Response(JSON.stringify({ access_token: 'ntn_test' }), { status: 200 }); });
  const start = await app.fetch(new Request('https://api.example/v1/auth/start', { method: 'POST', headers: { 'x-proofclip-install-id': 'proofclip_install_12345' } }));
  const state = new URL((await start.json()).authorizationUrl).searchParams.get('state');
  await app.fetch(new Request(`https://api.example/v1/auth/notion/callback?code=temp-code&state=${state}`));
  const second = await app.fetch(new Request(`https://api.example/v1/auth/notion/callback?code=temp-code&state=${state}`));
  assert.equal(second.status, 400);
  assert.equal(calls, 1);
});

test('callback distinguishes a token-exchange failure without leaking provider details', async () => {
  const repository = memoryRepository();
  const app = fixture(repository, async () => new Response(JSON.stringify({ error: 'invalid_client', error_description: 'invalid client' }), { status: 401 }));
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
  const start = await app.fetch(new Request('https://api.example/v1/auth/start', { method: 'POST', headers: { 'x-proofclip-install-id': 'proofclip_install_12345' } }));
  const state = new URL((await start.json()).authorizationUrl).searchParams.get('state');
  const response = await app.fetch(new Request(`https://api.example/v1/auth/notion/callback?code=temp-code&state=${state}`));
  const text = await response.text();
  assert.equal(response.status, 502);
  assert.match(text, /could not exchange/);
  assert.equal(text.includes('secret provider detail'), false);
  assert.deepEqual(warnings, [[
    'ProofClip OAuth diagnostic',
    {
      failureStage: 'notion_token_exchange',
      providerStatus: 401,
      providerErrorCode: 'invalid_client',
      providerMessage: 'invalid client'
    }
  ]]);
  } finally {
    console.warn = originalWarn;
  }
});

test('connection status and deletion use the hashed install identifier without retaining workspace metadata', async () => {
  const repository = memoryRepository();
  const app = fixture(repository, async () => new Response(JSON.stringify({ access_token: 'ntn_test', workspace_name: 'Test Workspace', workspace_id: 'workspace-id' }), { status: 200 }));
  const headers = { 'x-proofclip-install-id': 'proofclip_install_12345' };
  const start = await app.fetch(new Request('https://api.example/v1/auth/start', { method: 'POST', headers }));
  const state = new URL((await start.json()).authorizationUrl).searchParams.get('state');
  await app.fetch(new Request(`https://api.example/v1/auth/notion/callback?code=temp-code&state=${state}`));
  const status = await app.fetch(new Request('https://api.example/v1/connection', { headers }));
  assert.deepEqual(await status.json(), { connected: true, updatedAt: 1_000 });
  assert.equal(JSON.stringify([...repository.connections.values()]).includes('Test Workspace'), false);
  assert.equal(JSON.stringify([...repository.connections.values()]).includes('workspace-id'), false);
  const removed = await app.fetch(new Request('https://api.example/v1/connection', { method: 'DELETE', headers }));
  assert.equal(removed.status, 204);
  const after = await app.fetch(new Request('https://api.example/v1/connection', { headers }));
  assert.equal((await after.json()).connected, false);
});

test('Notion routes require a connection for listing and delivery', async () => {
  const repository = memoryRepository();
  let calls = 0;
  const app = fixture(repository, async () => { calls += 1; throw new Error('providers must not be called without a connection'); });
  const headers = { 'x-proofclip-install-id': 'proofclip_install_12345', 'Content-Type': 'application/json' };
  const sources = await app.fetch(new Request('https://api.example/v1/data-sources', { headers }));
  assert.equal(sources.status, 401);
  assert.match((await sources.json()).error, /Notion is not connected/);
  const capture = await app.fetch(new Request('https://api.example/v1/captures', { method: 'POST', headers, body: JSON.stringify({ record: {}, target: {} }) }));
  assert.equal(capture.status, 401);
  assert.match((await capture.json()).error, /Notion is not connected/);
  assert.equal(calls, 0);
  const connectedRepo = memoryRepository();
  const connectedApp = fixture(connectedRepo, async (url) => {
    if (url.endsWith('/oauth/token')) return new Response(JSON.stringify({ access_token: 'ntn_test' }), { status: 200 });
    if (url.endsWith('/search')) return new Response(JSON.stringify({ results: [{ id: '01be583b-00d5-83d8-845f-0784db446a24', title: [{ plain_text: 'Archive' }], properties: { Name: { type: 'title' } } }] }), { status: 200 });
    if (url.endsWith('/pages')) return new Response(JSON.stringify({ id: 'page', url: 'https://www.notion.so/page' }), { status: 200 });
    throw new Error('unexpected request');
  });
  await connectNotion(connectedApp, headers);
  const listing = await connectedApp.fetch(new Request('https://api.example/v1/data-sources', { headers }));
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).dataSources[0].title, 'Archive');
  const deliver = await connectedApp.fetch(new Request('https://api.example/v1/captures', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ record: { title: 'Test', canonicalUrl: 'https://example.com', bodyText: 'body', capturedAt: '2026-08-13T00:00:00Z', mode: 'body' }, target: { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name' } }) }));
  assert.equal(deliver.status, 201);
  assert.equal((await deliver.json()).delivery.url, 'https://www.notion.so/page');
});

test('capture failures do not echo provider or capture details', async () => {
  const repository = memoryRepository();
  const app = fixture(repository, async (url) => {
    if (url.endsWith('/oauth/token')) return new Response(JSON.stringify({ access_token: 'ntn_test' }), { status: 200 });
    if (url.endsWith('/pages')) throw new Error('provider saw: user secret page title and body');
    throw new Error('unexpected request');
  });
  const headers = { 'x-proofclip-install-id': 'proofclip_install_12345', 'Content-Type': 'application/json' };
  await connectNotion(app, headers);
  const response = await app.fetch(new Request('https://api.example/v1/captures', { method: 'POST', headers, body: JSON.stringify({ record: { title: 'user secret page title', canonicalUrl: 'https://example.com/secret', bodyText: 'user secret body', capturedAt: '2026-08-13T00:00:00Z', mode: 'body' }, target: { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24', titleProperty: 'Name' } }) }));
  const payload = await response.json();
  assert.equal(response.status, 502);
  assert.equal(payload.error, 'Capture could not be delivered. Please try again.');
  assert.equal(JSON.stringify(payload).includes('secret'), false);
});

test('POST setup provisions the connected Data Source and returns its capture mapping', async () => {
  const dataSourceId = '01be583b-00d5-83d8-845f-0784db446a24';
  const repository = memoryRepository();
  const requests = [];
  const app = fixture(repository, async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (url.endsWith('/oauth/token')) return new Response(JSON.stringify({ access_token: 'ntn_test' }), { status: 200 });
    if (url.endsWith(`/data_sources/${dataSourceId}`) && options.method === 'GET') {
      return new Response(JSON.stringify({ id: dataSourceId, properties: { Name: { type: 'title' } } }), { status: 200 });
    }
    if (url.endsWith(`/data_sources/${dataSourceId}`) && options.method === 'PATCH') {
      return new Response(JSON.stringify({
        id: dataSourceId,
        properties: {
          Name: { type: 'title' }, URL: { type: 'url' }, 'Captured time': { type: 'date' }, Project: { type: 'select' },
          Tags: { type: 'multi_select' }, Note: { type: 'rich_text' }, 'Evidence type': { type: 'select' }, 'Delivery status': { type: 'select' }
        }
      }), { status: 200 });
    }
    throw new Error(`unexpected Notion request: ${url}`);
  });
  const headers = { 'x-proofclip-install-id': 'proofclip_install_12345', 'Content-Type': 'application/json' };
  await connectNotion(app, headers);
  const response = await app.fetch(new Request('https://api.example/v1/data-sources/setup', { method: 'POST', headers, body: JSON.stringify({ dataSourceId }) }));
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).settings, {
    dataSourceId,
    templateId: 'buyer-account',
    templateFields: [
      { id: 'title', label: 'Title', required: true, valueSource: 'title', types: ['title'] },
      { id: 'url', label: 'URL', required: true, valueSource: 'url', types: ['url'] },
      { id: 'capturedAt', label: 'Captured time', required: false, valueSource: 'capturedAt', types: ['date'] },
      { id: 'project', label: 'Project', required: false, valueSource: 'project', types: ['select', 'rich_text'] },
      { id: 'tags', label: 'Tags', required: false, valueSource: 'tags', types: ['multi_select', 'rich_text'] },
      { id: 'note', label: 'Note', required: false, valueSource: 'note', types: ['rich_text'] },
      { id: 'evidenceType', label: 'Evidence type', required: false, valueSource: 'evidenceType', types: ['select', 'rich_text'] },
      { id: 'deliveryStatus', label: 'Delivery status', required: false, valueSource: 'deliveryStatus', types: ['status', 'select', 'rich_text'] },
      { id: 'screenshot', label: 'Screenshot', required: false, valueSource: 'screenshot', types: ['files'] }
    ],
    fieldMappings: { title: 'Name', url: 'URL', capturedAt: 'Captured time', project: 'Project', tags: 'Tags', note: 'Note', evidenceType: 'Evidence type', deliveryStatus: 'Delivery status' },
    propertyTypes: { title: 'title', url: 'url', capturedAt: 'date', project: 'select', tags: 'multi_select', note: 'rich_text', evidenceType: 'select', deliveryStatus: 'select' }
  });
  assert.equal(requests.filter((request) => request.url.endsWith(`/data_sources/${dataSourceId}`) && request.options.method === 'GET').length, 1);
  assert.equal(requests.filter((request) => request.url.endsWith(`/data_sources/${dataSourceId}`) && request.options.method === 'PATCH').length, 1);
});

test('POST setup rejects an unconnected install before it contacts Notion', async () => {
  let providerCalls = 0;
  const app = fixture(memoryRepository(), async () => { providerCalls += 1; throw new Error('Notion must not be called'); });
  const response = await app.fetch(new Request('https://api.example/v1/data-sources/setup', {
    method: 'POST', headers: { 'x-proofclip-install-id': 'proofclip_install_12345', 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24' })
  }));
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Notion is not connected/);
  assert.equal(providerCalls, 0);
});

test('Data Source setup accepts POST only', async () => {
  const app = fixture(memoryRepository(), async () => { throw new Error('Notion must not be called'); });
  const response = await app.fetch(new Request('https://api.example/v1/data-sources/setup', { headers: { 'x-proofclip-install-id': 'proofclip_install_12345' } }));
  assert.equal(response.status, 404);
});

test('Data Source setup uses its dedicated rate-limit bucket', async () => {
  let providerCalls = 0;
  const app = createWorker({
    repository: memoryRepository(),
    fetchImpl: async () => { providerCalls += 1; throw new Error('Notion must not be called'); },
    now: () => 1_000,
    rateLimit: { setup: createRateLimiter({ windowMs: 60_000, limit: 1, now: () => 1_000 }) },
    env: { TOKEN_VAULT_KEY: key, PROOFCLIP_EXTENSION_ID: 'abcdefghijklmnopabcdefghijklmnop' }
  });
  const request = () => new Request('https://api.example/v1/data-sources/setup', {
    method: 'POST',
    headers: { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'CF-Connecting-IP': '203.0.113.7', 'x-proofclip-install-id': 'proofclip_install_12345', 'Content-Type': 'application/json' },
    body: JSON.stringify({ dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24' })
  });
  assert.equal((await app.fetch(request())).status, 401);
  const limited = await app.fetch(request());
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.match((await limited.json()).error, /Too many requests/);
  assert.equal(providerCalls, 0);
});

test('missing PROOFCLIP_EXTENSION_ID logs a warning and returns no CORS headers (audit MINOR-7)', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (message) => warnings.push(String(message));
  try {
    const app = createWorker({ repository: memoryRepository(), fetchImpl: async () => { throw new Error('not called'); }, env: { PROOFCLIP_EXTENSION_ID: '' } });
    const response = await app.fetch(new Request('https://api.example/v1/connection', { headers: { Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' } }));
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  } finally {
    console.warn = originalWarn;
  }
  assert.ok(warnings.some((message) => /PROOFCLIP_EXTENSION_ID/.test(message)), 'a warning must mention PROOFCLIP_EXTENSION_ID');
});

test('captures beyond the rate limit return 429 without exposing content', async () => {
  const repository = memoryRepository();
  const app = createWorker({ repository, fetchImpl: async () => { throw new Error('not called'); }, now: () => 1_000, rateLimit: freshRateLimit(1), env: { NOTION_CLIENT_ID: 'client-id', NOTION_CLIENT_SECRET: 'client-secret', NOTION_REDIRECT_URI: 'https://api.example/v1/auth/notion/callback', TOKEN_VAULT_KEY: key, PROOFCLIP_EXTENSION_ID: 'abcdefghijklmnopabcdefghijklmnop' } });
  const request = (installId) => new Request('https://api.example/v1/captures', { method: 'POST', headers: { 'x-proofclip-install-id': installId, 'Content-Type': 'application/json', Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'CF-Connecting-IP': installId.endsWith('99999') ? '203.0.113.8' : '203.0.113.7' }, body: JSON.stringify({ record: { title: 'secret page title', canonicalUrl: 'https://example.test/secret', bodyText: 'secret body', capturedAt: '2026-08-09T00:00:00Z', mode: 'body' }, target: { dataSourceId: '01be583b-00d5-83d8-845f-0784db446a24' } }) });
  const first = await app.fetch(request('proofclip_install_12345'));
  assert.equal(first.status, 401, 'first capture is not rate limited; it fails on the missing Notion connection');
  const second = await app.fetch(request('proofclip_install_12345'));
  assert.equal(second.status, 429);
  const body = await second.json();
  assert.match(body.error, /Too many requests/);
  assert.equal(body.error.includes('secret'), false);
  assert.equal((await app.fetch(request('proofclip_install_99999'))).status, 401);
});

test('normal popup-frequency traffic (a few requests per open) is never rate limited', async () => {
  const repository = memoryRepository();
  const app = createWorker({ repository, fetchImpl: async () => { throw new Error('not called'); }, now: () => 1_000, rateLimit: freshRateLimit(10), env: { NOTION_CLIENT_ID: 'client-id', NOTION_CLIENT_SECRET: 'client-secret', NOTION_REDIRECT_URI: 'https://api.example/v1/auth/notion/callback', TOKEN_VAULT_KEY: key, PROOFCLIP_EXTENSION_ID: 'abcdefghijklmnopabcdefghijklmnop' } });
  const headers = { 'x-proofclip-install-id': 'proofclip_install_12345', 'Content-Type': 'application/json' };
  for (let index = 0; index < 5; index += 1) {
    const response = await app.fetch(new Request('https://api.example/v1/captures', { method: 'POST', headers, body: JSON.stringify({ record: { title: 't', canonicalUrl: 'https://example.test', bodyText: 'b', capturedAt: '2026-08-09T00:00:00Z', mode: 'body' }, target: {} }) }));
    assert.notEqual(response.status, 429, `request ${index + 1} must not be rate limited`);
  }
});

test('commercial routes are not exposed and commercial modules are not bundled', async () => {
  const repository = memoryRepository();
  const app = fixture(repository, async () => { throw new Error('not called'); });
  const headers = { 'x-proofclip-install-id': 'proofclip_install_12345', 'Content-Type': 'application/json' };
  for (const [path, method] of [['/v1/license', 'GET'], ['/v1/license/activate', 'POST'], ['/v1/usage/report', 'POST'], ['/v1/webhooks/lemon', 'POST'], ['/support', 'GET']]) {
    const response = await app.fetch(new Request(`https://api.example${path}`, { method, headers }));
    assert.equal(response.status, 404, `${path} must not be exposed`);
  }
  const [workerSource, bundleManifest] = await Promise.all([
    readFile(new URL('../worker.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/bundle-worker.mjs', import.meta.url), 'utf8')
  ]);
  for (const moduleName of ['subscription', 'lemon-license']) {
    assert.doesNotMatch(workerSource, new RegExp(`from './\\./${moduleName}\\.mjs'`));
    assert.doesNotMatch(bundleManifest, new RegExp(`src/${moduleName}\\.mjs`));
  }
});
