import test from 'node:test';
import assert from 'node:assert/strict';

const local = {};
globalThis.chrome = {
  storage: {
    local: {
      async get(keys) {
        const selected = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(selected.filter((key) => Object.hasOwn(local, key)).map((key) => [key, local[key]]));
      },
      async set(values) { Object.assign(local, values); },
      async remove(keys) { for (const key of keys) delete local[key]; }
    }
  }
};

const { clearState, getState, resetArchiveStoreForTests } = await import('../core/storage.mjs');

test('clearing user-visible local data removes archive, settings, and Outbox', async () => {
  resetArchiveStoreForTests();
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  Object.assign(local, {
    archiveSchemaVersion: 3,
    archive: [{ id: 'capture-1' }],
    outbox: [{ id: 'outbox-1' }],
    settings: { dataSourceId: 'source-1' },
    projects: [{ id: 'project-1', name: 'Project 1' }]
  });

  await clearState();
  const state = await getState();

  assert.equal(state.archive.length, 0);
  assert.equal(state.outbox.length, 0);
  assert.equal(state.settings.dataSourceId, '');
});
