import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getState, mutateState, resetArchiveStoreForTests, saveState } from '../core/storage.mjs';

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

function functionBody(source, name) {
  const start = source.indexOf(`async function ${name}`);
  if (start === -1) return '';
  const bodyStart = source.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(bodyStart, index + 1);
    }
  }
  return source.slice(bodyStart);
}

test.beforeEach(() => {
  local.clear();
  resetArchiveStoreForTests();
});

test('concurrent mutateState appends are serialized and both archive records survive', async () => {
  await Promise.all([
    mutateState((state) => { state.archive.unshift({ id: 'a', title: 'A' }); return state; }),
    mutateState((state) => { state.archive.unshift({ id: 'b', title: 'B' }); return state; })
  ]);
  const state = await getState();
  assert.deepEqual(state.archive.map((record) => record.id).sort(), ['a', 'b']);
});

test('a failing mutator does not wedge the queue and later mutations still save', async () => {
  await assert.rejects(() => mutateState(() => { throw new Error('boom'); }), /boom/);
  const result = await mutateState((state) => { state.settings.dataSourceId = 'source-7'; return state; });
  assert.equal(result.settings.dataSourceId, 'source-7');
  const state = await getState();
  assert.equal(state.settings.dataSourceId, 'source-7');
});

test('mutateState preserves Outbox semantics exactly', async () => {
  const outboxRecord = { id: 'card-1', title: 'T', canonicalUrl: 'https://example.test', bodyText: 'b', capturedAt: '2026-08-01T00:00:00Z', mode: 'body', bodySha256: 'h', truncated: false, delivery: { status: 'PENDING' }, projectId: 'unfiled', tags: [], note: '', screenshot: null };
  await saveState({ settings: {}, archive: [], outbox: [{ id: 'out-1', record: outboxRecord }] });
  const updated = await mutateState((state) => {
    state.outbox[0].error = 'Retry later';
    return state;
  });
  assert.equal(updated.outbox[0].error, 'Retry later');
  const state = await getState();
  assert.equal(state.outbox.length, 1);
  assert.equal(state.outbox[0].id, 'out-1');
});

test('background routes the key write paths through mutateState', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  assert.match(background, /import \{[\s\S]*?mutateState[\s\S]*?\} from '\.\/core\/storage\.mjs'/);
  assert.match(background, /async function saveLocalRecord[\s\S]*?mutateState\(\(fresh\) => \{[\s\S]*?fresh\.archive\.unshift\(record\)/);
  assert.match(background, /mutateState\(\(fresh\) => \{[\s\S]*?fresh\.outbox = fresh\.outbox\.filter/);
  assert.match(functionBody(background, 'attemptDelivery'), /syncArchiveDelivery/);
});
