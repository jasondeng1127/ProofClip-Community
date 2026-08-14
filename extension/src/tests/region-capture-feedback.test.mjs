import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { regionCaptureFailureMessage } from '../core/region-capture-feedback.mjs';

test('identifies the browser screenshot boundary without promising an Outbox retry', () => {
  const message = regionCaptureFailureMessage('screenshot', 'The tab is not active.');
  assert.match(message, /^Region screenshot was not captured\./);
  assert.match(message, /The tab is not active\./);
  assert.doesNotMatch(message, /Outbox/);
});

test('identifies local crop failures separately from browser capture failures', () => {
  const message = regionCaptureFailureMessage('crop', 'Region screenshot exceeds the 3 MB local limit.');
  assert.match(message, /^Region screenshot could not be prepared\./);
  assert.match(message, /3 MB local limit/);
});

test('explains that only an already-queued Notion delivery can be retried from Outbox', () => {
  const queued = regionCaptureFailureMessage('delivery', 'Notion returned 502.', { queued: true });
  const notQueued = regionCaptureFailureMessage('delivery', 'Connect Notion first.', { queued: false });
  assert.match(queued, /captured, but Notion could not receive it/);
  assert.match(queued, /Outbox; retry it there\./);
  assert.doesNotMatch(notQueued, /Outbox/);
});

test('region capture keeps browser screenshot, local crop, record creation, and delivery failures distinct', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  const regionStart = background.indexOf('async function captureRegionPreview');
  const commandStart = background.indexOf("chrome.commands.onCommand.addListener", regionStart);
  const region = background.slice(regionStart, commandStart);
  assert.match(region, /regionCaptureFailureMessage\('screenshot'/);
  assert.match(region, /regionCaptureFailureMessage\('crop'/);
  assert.match(region, /regionCaptureFailureMessage\('record'/);
  assert.match(region, /regionCaptureFailureMessage\('delivery'/);
  assert.match(region, /queued: Boolean\(result\.retryState\)/);
  assert.match(background, /!result\?\.feedbackShown/);
});
