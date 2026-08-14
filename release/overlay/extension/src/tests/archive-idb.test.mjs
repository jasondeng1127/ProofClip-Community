import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { clearState, getState, saveState } from '../core/storage.mjs';
import { resetArchiveStoreForTests } from '../core/storage.mjs';

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


const FIXTURES = { id: 'legacy-1', title: 'Acme price page', canonicalUrl: 'https://example.test/price', capturedAt: '2026-08-01T00:00:00Z', mode: 'region', bodyText: 'MOQ 500', bodySha256: 'abc', truncated: false, delivery: { status: 'SENT', notionUrl: 'https://www.notion.so/abc' }, screenshot: null };

function card(id) {
  return { id, title: 'Card ' + id, canonicalUrl: 'https://example.test/' + id, capturedAt: '2026-08-01T00:00:00Z', mode: 'body', bodyText: 'body', bodySha256: 'hash', truncated: false, delivery: { status: 'PENDING' }, projectId: 'unfiled', tags: [], note: '', screenshot: null };
}

test('clearState empties the archive store and settings', async () => {
  const records = [card(1), card(2)];
  await saveState({ settings: { dataSourceId: 'source-1' }, archive: records, outbox: [{ id: 'out-1', record: card(9) }] });
  await clearState();
  const state = await getState();
  assert.equal(state.archive.length, 0);
  assert.equal(state.outbox.length, 0);
});

test('saving a shorter archive removes records that were deleted locally', async () => {
  await saveState({ settings: {}, archive: [card(1), card(2), card(3)], outbox: [] });
  await saveState({ settings: {}, archive: [card(1)], outbox: [] });
  const state = await getState();
  assert.equal(state.archive.length, 1);
  assert.equal(String(state.archive[0].id), '1');
});

test('archive roundtrip preserves legacy cards and delivery state', async () => {
  await saveState({ settings: {}, archive: [FIXTURES], outbox: [] });
  const state = await getState();
  assert.equal(state.archive.length, 1);
  assert.equal(state.archive[0].bodyText, 'MOQ 500');
  assert.equal(state.archive[0].delivery.notionUrl, 'https://www.notion.so/abc');
});