import test from 'node:test';
import assert from 'node:assert/strict';
import { getState, resetArchiveStoreForTests } from '../core/storage.mjs';
import { loadBackgroundForTests } from './background-test-loader.mjs';

const values = new Map();
const storage = {
  async get(keys) {
    const names = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys || {});
    return Object.fromEntries(names.filter((key) => values.has(key)).map((key) => [key, values.get(key)]));
  },
  async set(entries) { for (const [key, value] of Object.entries(entries)) values.set(key, value); },
  async remove(keys) { for (const key of keys) values.delete(key); }
};

globalThis.chrome = { runtime: { onMessage: { addListener() {} } }, storage: { local: storage } };

const { attemptDelivery } = await loadBackgroundForTests();

function record(id) {
  return { id, title: id, canonicalUrl: `https://${id}.example`, capturedAt: '2026-08-15T00:00:00.000Z', mode: 'body', bodyText: 'evidence', bodySha256: id, truncated: false, delivery: { status: 'PENDING' }, projectId: 'unfiled', tags: [], note: '', screenshot: null, quotaCountedAt: '2026-08-15T00:00:00.000Z' };
}

test('prerequisite failure persists a verification outbox item and resend clears it after recovery', async () => {
  values.clear();
  resetArchiveStoreForTests();
  let serviceAvailable = false;
  let captureCalls = 0;
  globalThis.fetch = async (url) => {
    if (!serviceAvailable) return new Response(JSON.stringify({ error: 'offline' }), { status: 503 });
    if (url.endsWith('/v1/captures')) {
      captureCalls += 1;
      return new Response(JSON.stringify({ delivery: { id: 'notion-page-1', url: 'https://notion.example/page-1' } }), { status: 200 });
    }
    return new Response(JSON.stringify({ connected: true, workspaceName: 'Workspace', entitled: false, dailyLimit: 50 }), { status: 200 });
  };

  const failedRecord = record('card-1');
  const settings = { dataSourceId: 'data-source-1', fieldMappings: { title: 'Name', url: 'URL' }, propertyTypes: { title: 'title', url: 'url' } };
  const first = await attemptDelivery({ settings, projects: [] }, failedRecord);
  assert.equal(first.ok, false);
  assert.equal(first.retryState, 'NEEDS_VERIFICATION');
  assert.equal(first.queued, true);
  let state = await getState();
  assert.equal(state.outbox.length, 1);
  assert.equal(state.outbox[0].retryState, 'NEEDS_VERIFICATION');
  assert.equal(state.outbox[0].record.delivery.status, 'FAILED');

  serviceAvailable = true;
  const retry = await attemptDelivery({ settings, projects: [] }, state.outbox[0].record);
  assert.equal(retry.ok, true);
  state = await getState();
  assert.equal(state.outbox.length, 0);
  assert.equal(captureCalls, 1);
});
