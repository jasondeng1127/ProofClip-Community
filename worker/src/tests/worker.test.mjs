import assert from 'node:assert/strict';
import test from 'node:test';
import { createRateLimiter } from '../rate-limit.mjs';
import { createWorker } from '../worker.mjs';

const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const headers = { Origin: `chrome-extension://${extensionId}`, 'x-proofclip-install-id': 'proofclip_install_12345' };

function repository() {
  const states = new Map();
  const connections = new Map();
  return {
    states, connections,
    async putOAuthState(record) { states.set(record.value, { ...record, consumedAt: null }); },
    async deleteExpiredOAuthStates() {},
    async consumeOAuthState(value, now) {
      const state = states.get(value);
      if (!state || state.consumedAt || state.expiresAt <= now) return null;
      state.consumedAt = now;
      return { value: state.value, installIdHash: state.installIdHash, expiresAt: state.expiresAt };
    },
    async saveConnection(record) { connections.set(record.installIdHash, record); },
    async getConnection(installIdHash) {
      const connection = connections.get(installIdHash);
      return connection ? { workspaceName: connection.workspaceName, updatedAt: connection.now } : null;
    },
    async getTokenConnection(installIdHash) {
      const connection = connections.get(installIdHash);
      return connection ? { accessEnvelope: JSON.stringify(connection.accessEnvelope) } : null;
    },
    async deleteConnection(installIdHash) { connections.delete(installIdHash); }
  };
}

function app(overrides = {}) {
  return createWorker({
    repository: repository(), now: () => 1_000,
    env: { NOTION_CLIENT_ID: 'client-id', NOTION_CLIENT_SECRET: 'client-secret', NOTION_REDIRECT_URI: 'https://api.example/v1/auth/notion/callback', PROOFCLIP_EXTENSION_ID: extensionId, TOKEN_VAULT_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(9))) },
    fetchImpl: async () => { throw new Error('Notion should not be called'); },
    ...overrides
  });
}

test('privacy page describes deployer-owned explicit delivery without retention', async () => {
  const response = await app().fetch(new Request('https://api.example/privacy'));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /remain in your browser/i);
  assert.match(text, /explicitly choose to send/i);
  assert.match(text, /does not retain capture bodies/i);
  assert.equal((await app().fetch(new Request('https://api.example/support'))).status, 404);
});

test('only the configured extension origin receives CORS and protected API access', async () => {
  const worker = app();
  const accepted = await worker.fetch(new Request('https://api.example/v1/connection', { headers }));
  assert.equal(accepted.headers.get('access-control-allow-origin'), headers.Origin);
  const preflight = await worker.fetch(new Request('https://api.example/v1/connection', { method: 'OPTIONS', headers }));
  assert.equal(preflight.status, 204);
  const rejected = await worker.fetch(new Request('https://api.example/v1/connection', { headers: { ...headers, Origin: 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba' } }));
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get('access-control-allow-origin'), null);
  const noOriginConnection = await worker.fetch(new Request('https://api.example/v1/connection', { headers: { 'x-proofclip-install-id': headers['x-proofclip-install-id'] } }));
  assert.equal(noOriginConnection.status, 403);
  assert.equal(noOriginConnection.headers.get('access-control-allow-origin'), null);
  const noOriginCapture = await worker.fetch(new Request('https://api.example/v1/captures', {
    method: 'POST',
    headers: { 'x-proofclip-install-id': headers['x-proofclip-install-id'], 'Content-Type': 'application/json' },
    body: JSON.stringify({ record: { title: 'Capture', canonicalUrl: 'https://example.com', bodyText: 'Evidence', capturedAt: '2026-08-12T00:00:00Z', mode: 'body' }, target: {} })
  }));
  assert.equal(noOriginCapture.status, 403);
  assert.equal(noOriginCapture.headers.get('access-control-allow-origin'), null);
});

test('OAuth state is one-time and connection deletion uses the hashed install identifier', async () => {
  const store = repository();
  const worker = app({ repository: store, fetchImpl: async () => new Response(JSON.stringify({ access_token: 'ntn_test', workspace_name: 'Community workspace' }), { status: 200 }) });
  const start = await worker.fetch(new Request('https://api.example/v1/auth/notion/start', { method: 'POST', headers }));
  const state = new URL((await start.json()).authorizationUrl).searchParams.get('state');
  assert.equal((await worker.fetch(new Request(`https://api.example/v1/auth/notion/callback?code=test-code&state=${state}`))).status, 200);
  assert.equal((await worker.fetch(new Request('https://api.example/v1/connection', { headers }))).status, 200);
  assert.equal((await worker.fetch(new Request('https://api.example/v1/connection', { method: 'DELETE', headers }))).status, 204);
  assert.equal((await worker.fetch(new Request(`https://api.example/v1/auth/notion/callback?code=test-code&state=${state}`))).status, 400);
});

test('capture rate limit returns a generic 429 before delivery', async () => {
  const worker = app({ rateLimit: { captures: createRateLimiter({ windowMs: 60_000, limit: 1, now: () => 1_000 }) } });
  const request = () => new Request('https://api.example/v1/captures', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ record: { title: 'private', canonicalUrl: 'https://example.com', bodyText: 'private', capturedAt: '2026-08-12T00:00:00Z', mode: 'body' }, target: {} }) });
  assert.equal((await worker.fetch(request())).status, 401);
  const response = await worker.fetch(request());
  assert.equal(response.status, 429);
  assert.equal((await response.json()).error.includes('private'), false);
});
