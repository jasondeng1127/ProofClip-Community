import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingArchiveCards, sendArchiveBatch } from '../core/archive-bulk-send.mjs';

test('selects only pending records for bulk delivery and leaves failed records to Outbox', () => {
  const pending = pendingArchiveCards([
    { id: 'pending-1', delivery: { status: 'PENDING' } },
    { id: 'legacy-pending' },
    { id: 'sent-1', delivery: { status: 'SENT' } },
    { id: 'failed-1', delivery: { status: 'FAILED' } },
    { id: 'locked-1', delivery: { status: 'LOCKED' } }
  ]);
  assert.deepEqual(pending.map((card) => card.id), ['pending-1', 'legacy-pending']);
});

test('sends every selected archive record sequentially and continues after a failure', async () => {
  const calls = [];
  const result = await sendArchiveBatch(['card-1', 'card-2', 'card-3'], async (id) => {
    calls.push(id);
    return id === 'card-2' ? { ok: false, error: 'Notion target unavailable.' } : { ok: true };
  });

  assert.deepEqual(calls, ['card-1', 'card-2', 'card-3']);
  assert.deepEqual(result, { total: 3, sent: 2, failed: 1 });
});

test('ignores duplicate and empty archive ids before delivery', async () => {
  const calls = [];
  const result = await sendArchiveBatch(['card-1', '', 'card-1', ' card-2 '], async (id) => {
    calls.push(id);
    return { ok: true };
  });

  assert.deepEqual(calls, ['card-1', 'card-2']);
  assert.deepEqual(result, { total: 2, sent: 2, failed: 0 });
});

test('continues the batch when one delivery handler throws unexpectedly', async () => {
  const calls = [];
  const result = await sendArchiveBatch(['card-1', 'card-2'], async (id) => {
    calls.push(id);
    if (id === 'card-1') throw new Error('Service worker restarted.');
    return { ok: true };
  });

  assert.deepEqual(calls, ['card-1', 'card-2']);
  assert.deepEqual(result, { total: 2, sent: 1, failed: 1 });
});
