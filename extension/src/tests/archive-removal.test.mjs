import test from 'node:test';
import assert from 'node:assert/strict';
import { removeArchiveCard, sendArchiveRequest } from '../core/archive-actions.mjs';

const state = {
  archive: [{ id: 'card-1', title: 'Acme' }, { id: 'card-2', title: 'Beta' }],
  outbox: [{ id: 'outbox-1', record: { id: 'card-1' } }, { id: 'outbox-2', record: { id: 'card-2' } }]
};

test('refuses to remove a local card while that card is being delivered', () => {
  const result = removeArchiveCard(state, 'card-1', { isDeliveryInFlight: (id) => id === 'card-1' });
  assert.deepEqual(result, { ok: false, error: 'This evidence is being sent to Notion. Wait for the result before removing its local copy.' });
  assert.equal(state.archive.length, 2);
  assert.equal(state.outbox.length, 2);
});

test('removes an idle local card and its matching outbox entry only', () => {
  const result = removeArchiveCard(state, 'card-1', { isDeliveryInFlight: () => false });
  assert.equal(result.ok, true);
  assert.equal(result.removedOutboxCount, 1);
  assert.deepEqual(result.state.archive.map((card) => card.id), ['card-2']);
  assert.deepEqual(result.state.outbox.map((item) => item.id), ['outbox-2']);
  assert.equal(state.archive.length, 2);
});

test('turns an archive project request transport failure into visible feedback data', async () => {
  const result = await sendArchiveRequest(
    async () => { throw new Error('Extension service worker restarted.'); },
    { type: 'CREATE_PROJECT', name: 'Buyers' },
    'Could not create project.'
  );
  assert.deepEqual(result, { ok: false, error: 'Extension service worker restarted.' });
});
