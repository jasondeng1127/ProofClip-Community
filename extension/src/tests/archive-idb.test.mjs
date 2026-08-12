import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { queryArchive } from '../core/archive-query.mjs';
import { getState, saveState, clearState, resetArchiveStoreForTests } from '../core/storage.mjs';
import { createMemoryArchiveStore } from '../core/archive-store.mjs';

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

function pngDataUrl(sizeBytes) {
  return `data:image/png;base64,${'A'.repeat(sizeBytes)}`;
}

function card(index, { withScreenshot = false } = {}) {
  return {
    id: `card-${index}`,
    title: `Evidence card ${index}`,
    canonicalUrl: `https://example.test/${index}`,
    capturedAt: `2026-08-0${(index % 9) + 1}T00:00:00Z`,
    mode: withScreenshot ? 'region' : 'body',
    bodyText: `Body text for card ${index} with searchable terms`,
    bodySha256: `sha-${index}`,
    truncated: false,
    delivery: { status: 'PENDING' },
    screenshot: withScreenshot ? { mimeType: 'image/png', dataUrl: pngDataUrl(3 * 1024 * 1024), width: 640, height: 480 } : null
  };
}

test.beforeEach(() => {
  local.clear();
  resetArchiveStoreForTests();
});

test('a 100-card archive with multiple 3 MB screenshots saves, reads, searches and exports without storage.local archive writes', async () => {
  const records = Array.from({ length: 100 }, (_, index) => card(index, { withScreenshot: index % 10 === 0 }));
  await saveState({ settings: {}, archive: records, outbox: [] });
  const state = await getState();
  assert.equal(state.archive.length, 100);
  assert.equal(state.archive[0].id, 'card-0');
  assert.equal(local.has('archive'), false, 'records must never be written to chrome.storage.local');
  const screenshotCards = state.archive.filter((record) => record.screenshot);
  assert.equal(screenshotCards.length, 10);
  assert.equal(screenshotCards[0].screenshot.dataUrl.length, 'data:image/png;base64,'.length + 3 * 1024 * 1024);
  assert.deepEqual(queryArchive(state.archive, { text: 'card 42' }).map((record) => record.id), ['card-42']);
  const exportPayload = { records: state.archive, outbox: [] };
  assert.equal(exportPayload.records.length, 100);
  assert.ok(exportPayload.records.some((record) => record.screenshot?.dataUrl.startsWith('data:image/png;base64,')));
});

test('v0.6.7 legacy archive in storage.local migrates to the archive store with complete fields and screenshots', async () => {
  const legacy = [
    { id: 'legacy-1', title: 'Acme price page', canonicalUrl: 'https://example.test/price', capturedAt: '2026-08-01T00:00:00Z', mode: 'region', bodyText: 'MOQ 500', bodySha256: 'abc', truncated: false, delivery: { status: 'SENT', notionUrl: 'https://www.notion.so/abc' }, screenshot: { mimeType: 'image/png', dataUrl: pngDataUrl(1024), width: 20, height: 10 } },
    { id: 'legacy-2', title: 'Regulation update', canonicalUrl: 'https://example.test/eu', capturedAt: '2026-08-02T00:00:00Z', mode: 'body', bodyText: 'compliance', bodySha256: 'def', truncated: false, delivery: { status: 'PENDING' } }
  ];
  local.set('archive', legacy);
  const state = await getState();
  assert.equal(state.archive.length, 2);
  assert.equal(state.archive[0].id, 'legacy-1');
  assert.equal(state.archive[0].title, 'Acme price page');
  assert.equal(state.archive[0].projectId, 'unfiled');
  assert.deepEqual(state.archive[0].tags, []);
  assert.equal(state.archive[0].delivery.notionUrl, 'https://www.notion.so/abc');
  assert.equal(state.archive[0].screenshot.dataUrl, pngDataUrl(1024));
  assert.equal(state.archive[1].bodyText, 'compliance');
  assert.equal(local.has('archive'), false, 'legacy archive key must be removed after migration');
  assert.equal(local.get('archiveIdbMigrated'), true);
  const again = await getState();
  assert.equal(again.archive.length, 2, 'migration must be one-time');
});

test('clearState empties the archive store, settings, and Outbox', async () => {
  const records = [card(1), card(2)];
  await saveState({ settings: { dataSourceId: 'source-1' }, archive: records, outbox: [{ id: 'out-1', record: card(9) }], quota: { date: '2026-08', count: 3 } });
  await clearState();
  const state = await getState();
  assert.equal(state.archive.length, 0);
  assert.equal(state.outbox.length, 0);
  assert.equal(state.settings.dataSourceId, '');
});

test('saving a shorter archive removes records that were deleted locally', async () => {
  await saveState({ settings: {}, archive: [card(1), card(2), card(3)], outbox: [] });
  await saveState({ settings: {}, archive: [card(2)], outbox: [] });
  const state = await getState();
  assert.deepEqual(state.archive.map((record) => record.id), ['card-2']);
});

test('replaceAll is all-or-nothing in the memory driver (audit MODERATE-4)', async () => {
  const store = createMemoryArchiveStore();
  await store.replaceAll([card(1), card(2)]);
  await assert.rejects(() => store.replaceAll([card(3), { ...card(4), id: undefined }]), /missing an id/);
  assert.deepEqual((await store.list()).map((record) => record.id), ['card-1', 'card-2']);
});

test('IndexedDB replaceAll runs in a single transaction with an abort handler', async () => {
  const source = await readFile(new URL('../core/archive-store.mjs', import.meta.url), 'utf8');
  const replaceAll = source.match(/async replaceAll\(records\) \{[\s\S]*?\n    \},/)?.[0] || '';
  assert.match(replaceAll, /db\.transaction\(STORE_NAME, 'readwrite'\)/);
  assert.match(replaceAll, /tx\.onabort =/);
  assert.match(replaceAll, /missing an id/);
});
