import test from 'node:test';
import assert from 'node:assert/strict';
import { getState, resetArchiveStoreForTests, saveState } from '../core/storage.mjs';
import { pendingArchiveCards, sendArchiveBatch } from '../core/archive-bulk-send.mjs';
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

function record(id, status = 'PENDING') {
  return { id, title: id, canonicalUrl: `https://${id}.example`, capturedAt: '2026-08-15T00:00:00.000Z', mode: 'body', bodyText: 'evidence', bodySha256: id, truncated: false, delivery: { status }, projectId: 'unfiled', tags: [], note: '', screenshot: null, quotaCountedAt: '2026-08-15T00:00:00.000Z' };
}

test('Archive bulk resend resolves a stale Outbox entry after persisted reload state', async () => {
  values.clear();
  resetArchiveStoreForTests();
  let captureCalls = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith('/v1/captures')) {
      captureCalls += 1;
      return new Response(JSON.stringify({ delivery: { id: 'notion-page-1', url: 'https://notion.example/page-1' } }), { status: 200 });
    }
    return new Response(JSON.stringify({ connected: true, workspaceName: 'Workspace', entitled: false, dailyLimit: 50 }), { status: 200 });
  };

  const settings = { dataSourceId: 'data-source-1', fieldMappings: { title: 'Name', url: 'URL' }, propertyTypes: { title: 'title', url: 'url' } };
  const archiveRecord = record('card-1');
  const staleOutboxRecord = { ...record('card-1', 'FAILED') };
  delete staleOutboxRecord.id;
  await saveState({ settings, archive: [archiveRecord], outbox: [{ id: 'card-1', record: staleOutboxRecord, error: 'previous failure', createdAt: '2026-08-15T00:00:00.000Z', retryState: 'RETRYABLE' }] });

  const result = await sendArchiveBatch(['card-1'], async (id) => {
    const current = await getState();
    return attemptDelivery(current, current.archive.find((candidate) => candidate.id === id));
  });

  assert.deepEqual(result, { total: 1, sent: 1, failed: 0, queued: 0 });
  let state = await getState();
  assert.equal(state.archive[0].delivery.status, 'SENT');
  assert.equal(state.outbox.length, 0);
  assert.equal(captureCalls, 1);

  state = await getState();
  assert.equal(state.archive[0].delivery.status, 'SENT');
  assert.equal(state.outbox.length, 0);
  assert.deepEqual(pendingArchiveCards(state.archive), []);
});
