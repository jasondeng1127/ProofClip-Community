import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createWorker } from '../worker.mjs';

const vaultKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(9)));
const extensionId = 'abcdefghijklmnopabcdefghijklmnop';
const installId = 'proofclip_install_12345';
const extensionOrigin = 'chrome-extension://' + extensionId;

function memoryRepository() {
  const states = new Map();
  const connections = new Map();
  return {
    async putOAuthState(record) { states.set(record.value, { ...record }); },
    async consumeOAuthState(value, now) {
      const state = states.get(value);
      if (!state || state.expiresAt <= now) return null;
      states.delete(value);
      return { value: state.value, installIdHash: state.installIdHash, expiresAt: state.expiresAt };
    },
    async deleteExpiredOAuthStates() {},
    async saveConnection(record) { connections.set(record.installIdHash, record); },
    async getConnection(installIdHash) {
      const connection = connections.get(installIdHash);
      return connection ? { updatedAt: connection.now } : null;
    },
    async getTokenConnection(installIdHash) {
      const connection = connections.get(installIdHash);
      return connection ? { accessEnvelope: JSON.stringify(connection.accessEnvelope) } : null;
    },
    async deleteConnection(installIdHash) { connections.delete(installIdHash); }
  };
}

test('a connected configured extension delivers a capture without commercial services', async () => {
  const requests = [];
  const app = createWorker({
    repository: memoryRepository(),
    now: () => 1_000,
    env: {
      NOTION_CLIENT_ID: 'client-id',
      NOTION_CLIENT_SECRET: 'client-secret',
      NOTION_REDIRECT_URI: 'https://api.example/v1/auth/notion/callback',
      PROOFCLIP_EXTENSION_ID: extensionId,
      TOKEN_VAULT_KEY: vaultKey
    },
    fetchImpl: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      if (String(url).endsWith('/oauth/token')) return new Response(JSON.stringify({ access_token: 'ntn_test' }), { status: 200 });
      if (String(url).endsWith('/pages')) return new Response(JSON.stringify({ id: 'page-id', url: 'https://www.notion.so/page-id' }), { status: 200 });
      throw new Error('Unexpected Notion request: ' + url);
    }
  });
  const headers = { Origin: extensionOrigin, 'x-proofclip-install-id': installId, 'Content-Type': 'application/json' };
  const start = await app.fetch(new Request('https://api.example/v1/auth/start', { method: 'POST', headers }));
  assert.equal(start.status, 200);
  const state = new URL((await start.json()).authorizationUrl).searchParams.get('state');
  assert.ok(state);
  assert.equal((await app.fetch(new Request('https://api.example/v1/auth/notion/callback?code=test-code&state=' + state))).status, 200);

  const capture = await app.fetch(new Request('https://api.example/v1/captures', {
    method: 'POST', headers,
    body: JSON.stringify({
      record: { title: 'Community capture', canonicalUrl: 'https://example.com/article', bodyText: 'Evidence', capturedAt: '2026-08-12T00:00:00Z', mode: 'body' },
      target: { dataSourceId: '00000000-0000-4000-8000-000000000001', titleProperty: 'Name', urlProperty: 'URL' }
    })
  }));
  assert.equal(capture.status, 201);
  assert.equal(requests.filter(({ url }) => url.endsWith('/pages')).length, 1);

  const removedPaths = [['/v1/', 'lic', 'ense'], ['/v1/', 'lic', 'ense/activate'], ['/v1/', 'usage', '/report'], ['/v1/webhooks/', 'le', 'mon'], ['/', 'support']].map((parts) => parts.join(''));
  for (const path of removedPaths) {
    const response = await app.fetch(new Request('https://api.example' + path, { method: path.endsWith('activate') || path.endsWith('report') || path.endsWith('mon') ? 'POST' : 'GET', headers }));
    assert.equal(response.status, 404, path + ' must not be exposed');
  }
  const [workerSource, bundleManifest] = await Promise.all([
    readFile(new URL('../worker.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../scripts/bundle-worker.mjs', import.meta.url), 'utf8')
  ]);
  const retiredModules = [['sub', 'scription'], ['le', 'mon-', 'lic', 'ense']].map((parts) => parts.join(''));
  for (const moduleName of retiredModules) {
    assert.ok(!workerSource.includes("from './" + moduleName + ".mjs'"), moduleName + ' import must be removed');
    assert.ok(!bundleManifest.includes('src/' + moduleName + '.mjs'), moduleName + ' must not be bundled');
  }
});