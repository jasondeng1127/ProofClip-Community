import test from 'node:test';
import assert from 'node:assert/strict';
import { getState, mergeSettings, saveState, resetArchiveStoreForTests } from '../core/storage.mjs';
import { chunkText, safeFilename, truncateText } from '../core/text.mjs';
import { createEvidenceRecord } from '../core/record.mjs';

test('text helpers preserve a bounded and export-safe payload', () => {
  assert.deepEqual(truncateText('abcd', 3), { text: 'abc', truncated: true });
  assert.deepEqual(chunkText('abcdef', 2), ['ab', 'cd', 'ef']);
  assert.equal(safeFilename('ProofClip: supplier / quote'), 'ProofClip-supplier-quote');
});

test('chunkText prefers newline/sentence/space boundaries and never exceeds the limit', () => {
  const long = 'Sentence one here. Sentence two here.\nSentence three here. ' + 'x'.repeat(5000);
  const chunks = chunkText(long, 100);
  assert.equal(chunks.join(''), long);
  for (const chunk of chunks) assert.ok(chunk.length <= 100, `chunk length ${chunk.length} exceeds 100`);
  assert.ok(chunks.some((chunk) => /[.\n ]$/.test(chunk)), 'at least one chunk should end on a natural boundary');
  assert.deepEqual(chunkText(long, 100), chunkText(long, 100), 'chunking must be deterministic');
});

test('mergeSettings preserves only local target mapping', () => {
  const existing = { dataSourceId: 'src-1', titleProperty: 'Name' };
  const incoming = { dataSourceId: 'src-2', titleProperty: '  Title  ' };
  const merged = mergeSettings(existing, incoming);
  assert.equal(merged.dataSourceId, 'src-2');
  assert.equal(merged.titleProperty, 'Title');
});

test('mergeSettings compacts whitespace in all non-token fields', () => {
  const merged = mergeSettings({ dataSourceId: '' }, { dataSourceId: '  abc  ', titleProperty: '   ', urlProperty: '  Link  ' });
  assert.equal(merged.dataSourceId, 'abc');
  assert.equal(merged.titleProperty, '');
  assert.equal(merged.urlProperty, 'Link');
});

test('a saved target Data Source is returned after a later state read', async () => {
  const originalChrome = globalThis.chrome;
  const local = new Map();
  resetArchiveStoreForTests();
  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys) => Object.fromEntries(keys.filter((key) => local.has(key)).map((key) => [key, local.get(key)])),
        set: async (values) => { for (const [key, value] of Object.entries(values)) local.set(key, value); },
        remove: async (keys) => { for (const key of keys) local.delete(key); }
      }
    }
  };
  try {
    await saveState({
      settings: { dataSourceId: '00000000-0000-4000-8000-000000000001', titleProperty: 'Name', urlProperty: 'URL' },
      archive: [],
      outbox: []
    });
    const reread = await getState();
    assert.equal(reread.settings.dataSourceId, '00000000-0000-4000-8000-000000000001');
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test('selection capture rejects empty text instead of falling back to page body', async () => {
  await assert.rejects(
    () => createEvidenceRecord({ title: 'Page', url: 'https://example.test', bodyText: 'Full body', selection: '' }, 'selection'),
    /Select text on the page, then try again\./
  );
});
