import assert from 'node:assert/strict';
import test from 'node:test';
import { failureFeedback, pendingFeedback, runWithTimeout, successFeedback } from '../core/action-feedback.mjs';

test('runWithTimeout reports an honest recoverable timeout', async () => {
  const result = await runWithTimeout(() => new Promise(() => {}), 1);
  assert.deepEqual(result, {
    ok: false,
    timedOut: true,
    error: 'This is taking longer than expected. Check the result and retry if needed.'
  });
});

test('feedback helpers keep success and failure semantics distinct', () => {
  assert.deepEqual(pendingFeedback('Saving'), { text: 'Saving…', isError: false });
  assert.deepEqual(successFeedback('Target mapping saved.'), { text: 'Target mapping saved.', isError: false });
  assert.deepEqual(failureFeedback(new Error('Notion is not connected.')), { text: 'Notion is not connected.', isError: true });
});
