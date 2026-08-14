import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('popup privacy link is deployer-bound and never an Official endpoint', async () => {
  const popup = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
  assert.doesNotMatch(popup, /https?:\/\//);
  assert.match(popup, /class="privacy-link" id="privacyLink"/);
});

test('popup.js fills the privacy link from the configured Community origin', async () => {
  const source = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
  assert.match(source, /getProofClipApiOrigin\(\)\}\/privacy/);
  assert.match(source, /privacyLink\.href/);
  assert.doesNotMatch(source, /workers\.dev/);
});

test('worker privacy page is served by the deployer-owned Worker without a support identity', async () => {
  const worker = await readFile(new URL('../../../worker/src/worker.mjs', import.meta.url), 'utf8');
  assert.match(worker, /pathname === '\/privacy'/);
  assert.doesNotMatch(worker, /mailto:/);
});