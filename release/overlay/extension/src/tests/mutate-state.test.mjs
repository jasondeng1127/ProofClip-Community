import assert from 'node:assert/strict';
import test from 'node:test';
import { getState, mutateState, saveState } from '../core/storage.mjs';

const local = new Map();
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        const selected = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(selected.filter((key) => local.has(key)).map((key) => [key, local.get(key)]));
      },
      async set(values) { for (const [key, value] of Object.entries(values)) local.set(key, value); },
      async remove(keys) { for (const key of keys) local.delete(key); }
    }
  }
};


function card(id) {
  return { id, title: 'Card ' + id, canonicalUrl: 'https://example.test/' + id, capturedAt: '2026-08-01T00:00:00Z', mode: 'body', bodyText: 'body', bodySha256: 'hash', truncated: false, delivery: { status: 'PENDING' }, projectId: 'unfiled', tags: [], note: '', screenshot: null };
}

test('mutateState serializes read-modify-write cycles', async () => {
  await saveState({ settings: {}, archive: [], outbox: [] });
  const results = await Promise.all([1, 2, 3, 4, 5].map((id) => mutateState((state) => {
    state.archive.push(card(String(id)));
    return state;
  })));
  assert.equal(results.length, 5);
  const state = await getState();
  assert.equal(state.archive.length, 5);
});

test('a failing mutator does not wedge the queue and later mutations still save', async () => {
  await assert.rejects(() => mutateState(() => { throw new Error('boom'); }), /boom/);
  const result = await mutateState((state) => { state.outbox = [{ id: 'out-1', record: card('1'), error: 'x', createdAt: '2026-08-01T00:00:00Z', retryState: 'RETRYABLE' }]; return state; });
  assert.equal(result.outbox.length, 1);
  const state = await getState();
  assert.equal(state.outbox.length, 1);
});

test('mutateState preserves archive and outbox semantics exactly', async () => {
  const outboxRecord = card('card-1');
  await saveState({ settings: {}, archive: [], outbox: [{ id: 'out-1', record: outboxRecord, error: 'e', createdAt: '2026-08-01T00:00:00Z', retryState: 'RETRYABLE' }] });
  const updated = await mutateState((state) => { state.archive.unshift(outboxRecord); return state; });
  assert.equal(updated.archive.length, 1);
  const state = await getState();
  assert.equal(state.archive.length, 1);
  assert.equal(state.outbox.length, 1);
});