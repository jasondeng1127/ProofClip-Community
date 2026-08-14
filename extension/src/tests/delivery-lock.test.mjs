import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// background.js is a service-worker module; the minimal mock below is enough
// for import-time side effects (onMessage registration only).
globalThis.chrome = {
  runtime: { onMessage: { addListener() {} } }
};

const { withDeliveryLock } = await import('../background.js');

test('concurrent deliveries for the same record produce exactly one action and block the second', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let actionCalls = 0;
  const slowAction = async () => {
    actionCalls += 1;
    await gate;
    return { ok: true, delivery: { url: 'https://www.notion.so/page' } };
  };

  const first = withDeliveryLock('card-1', slowAction);
  const second = await withDeliveryLock('card-1', slowAction);
  assert.deepEqual(second, { ok: false, error: 'This evidence is already being sent.' });
  assert.equal(actionCalls, 1);

  release();
  const firstResult = await first;
  assert.equal(firstResult.ok, true);
  assert.equal(actionCalls, 1);
});

test('the lock is released after completion so later sends work normally', async () => {
  const first = await withDeliveryLock('card-2', async () => ({ ok: true }));
  assert.equal(first.ok, true);
  const second = await withDeliveryLock('card-2', async () => ({ ok: true, delivery: { url: 'u' } }));
  assert.equal(second.ok, true);
});

test('the lock is released even when the action throws', async () => {
  await assert.rejects(() => withDeliveryLock('card-3', async () => { throw new Error('boom'); }), /boom/);
  const after = await withDeliveryLock('card-3', async () => 'released');
  assert.equal(after, 'released');
});

test('attemptDelivery is wired through the in-flight lock', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  assert.match(background, /return withDeliveryLock\(record\.id, async \(\) => \{/);
  assert.match(background, /deliveryInFlight\.set\(recordId, true\)/);
  assert.match(background, /deliveryInFlight\.delete\(recordId\)/);
  assert.match(background, /This evidence is already being sent\./);
});
