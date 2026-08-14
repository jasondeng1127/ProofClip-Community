import assert from 'node:assert/strict';
import test from 'node:test';
import { canSaveTargetMapping, captureExtractionError, captureFeedback, retryFeedback } from '../core/capture-feedback.mjs';

test('internal Chrome pages receive a clear non-persistence capture error', () => {
  const error = captureExtractionError(new Error('Cannot access contents of url "chrome://extensions/". Extension manifest must request permission to access this host.'));
  assert.match(error, /internal page/i);
  assert.match(captureFeedback({ ok: false, locallySaved: false, error }).text, /^Capture did not start:/);
});

test('only a delivery failure claims that local evidence was saved', () => {
  const feedback = captureFeedback({ ok: false, locallySaved: true, error: 'Notion is temporarily rate limited.' });
  assert.equal(feedback.isError, true);
  assert.match(feedback.text, /^Evidence saved locally\./);
});

test('successful capture feedback states that the evidence remains local', () => {
  assert.deepEqual(captureFeedback({ ok: true, locallySaved: true, record: { truncated: false } }), {
    text: 'Evidence saved locally. Open Archive to review or send it to Notion.',
    isError: false
  });
});

test('legacy truncation feedback never misstates a current fixed local text limit', () => {
  assert.match(captureFeedback({ ok: true, locallySaved: true, record: { truncated: true } }).text, /previously saved record was truncated/i);
  assert.doesNotMatch(captureFeedback({ ok: true, locallySaved: true, record: { truncated: true } }).text, /200,000/);
});

test('target mapping requires both an active Notion connection and a Data Source', () => {
  assert.equal(canSaveTargetMapping(false, 'source-1'), false);
  assert.equal(canSaveTargetMapping(true, ''), false);
  assert.equal(canSaveTargetMapping(true, ' source-1 '), true);
});

test('retry feedback distinguishes an in-progress retry from its result', () => {
  assert.deepEqual(retryFeedback(), { text: 'Retrying Notion delivery…', isError: false });
  assert.deepEqual(retryFeedback({ ok: true }), { text: 'Evidence sent to Notion.', isError: false });
  assert.deepEqual(retryFeedback({ ok: false, error: 'Target Data Source is invalid.' }), {
    text: 'Retry failed: Target Data Source is invalid.',
    isError: true
  });
});
