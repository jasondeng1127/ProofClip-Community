import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
const popupJs = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
const popupHtml = await readFile(new URL('../popup.html', import.meta.url), 'utf8');

test('background exports CAPTURE_WITH_ROUTE and CAPTURE_LOCAL as archive-compatible alias', () => {
  assert.match(background, /case 'CAPTURE_WITH_ROUTE'/);
  assert.match(background, /case 'CAPTURE_LOCAL'/);
});

test('background exports RESEND_AFTER_VERIFICATION separate from RETRY_OUTBOX', () => {
  assert.match(background, /case 'RESEND_AFTER_VERIFICATION'/);
  assert.match(background, /case 'RETRY_OUTBOX'/);
});

test('background export function includes outbox array in the payload', () => {
  assert.match(background, /outbox/);
});

test('background stateForUi includes outbox retryState', () => {
  assert.match(background, /retryState/);
});

test('popup sends CAPTURE_WITH_ROUTE for route-aware capture', () => {
  assert.match(popupJs, /CAPTURE_WITH_ROUTE/);
});

test('popup shows captureRoute selector control', () => {
  assert.match(popupHtml, /captureRoute/);
});

test('popup renders ordinary Retry only for RETRYABLE and a separate verification resend for NEEDS_VERIFICATION', () => {
  assert.match(popupJs, /RETRYABLE/);
  assert.match(popupJs, /NEEDS_VERIFICATION/);
  assert.match(popupJs, /RESEND_AFTER_VERIFICATION/);
  assert.match(popupJs, /retry\.textContent = 'Verify'/);
  assert.match(popupJs, /retry\.textContent = 'Retry'/);
});

test('region direct delivery intentionally never writes a local archive card (audit G6)', () => {
  const fnStart = background.indexOf('async function captureRegionPreview');
  assert.ok(fnStart >= 0);
  const recordIdx = background.indexOf("createEvidenceRecord(page, 'region'", fnStart);
  assert.ok(recordIdx >= 0);
  const directStart = background.indexOf("if (route === 'direct')", recordIdx);
  const savedIdx = background.indexOf('const saved = await saveLocalRecord(record)', directStart);
  assert.ok(directStart >= 0 && savedIdx > directStart, 'region direct branch must precede the local-save path');
  const directBranch = background.slice(directStart, savedIdx);
  assert.match(directBranch, /Region direct delivery intentionally does not create a local archive[\s\S]*?card:/);
  assert.doesNotMatch(directBranch, /saveLocalRecord/);
});

test('region capture removes any leftover overlay before starting a new selection (Bug C)', () => {
  assert.match(background, /const leftover = document\.getElementById\('__proofclip-region-overlay'\);/);
  assert.match(background, /if \(leftover\) \{[\s\S]*?document\.dispatchEvent\(new CustomEvent\('__proofclip-cancel-region'\)\);[\s\S]*?leftover\.remove\(\);[\s\S]*?\}/);
  assert.doesNotMatch(background, /if \(document\.getElementById\('__proofclip-region-overlay'\)\) return resolve\(null\);/);
});

test('region overlay right-click cancels the selection like Escape and capture controls are unchanged (REGION-001)', async () => {
  assert.match(background, /const onContextMenu = \(event\) => \{ event\.preventDefault\(\); cleanup\(null\); \};/);
  assert.match(background, /overlay\.addEventListener\('contextmenu', onContextMenu\)/);
  assert.match(background, /if \(event\.key === 'Escape'\) cleanup\(null\);/);
  const popupHtml = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
  for (const mode of ['selection', 'region', 'body']) {
    assert.match(popupHtml, new RegExp(`data-mode="${mode}"`));
  }
  assert.equal((popupHtml.match(/class="capture-action"/g) || []).length, 3);
});

test('direct region capture checks delivery prerequisites before opening region selector', () => {
  // Extract the body of captureRegionPreview and verify that the direct branch
  // calls checkDeliveryPrerequisites before chrome.tabs.query (region selection).
  // This must not be a mere occurrence check — it asserts ordering within the function.
  const fnStart = background.indexOf('async function captureRegionPreview');
  assert.ok(fnStart >= 0, 'captureRegionPreview function not found in background');
  const fnSlice = background.slice(fnStart);
  const closeIdx = fnSlice.indexOf('\n}');
  assert.ok(closeIdx >= 0, 'could not find end of captureRegionPreview function');
  const body = fnSlice.slice(0, closeIdx);
  const checkIdx = body.indexOf('checkDeliveryPrerequisites');
  const queryIdx = body.indexOf('chrome.tabs.query');
  assert.ok(checkIdx >= 0, 'checkDeliveryPrerequisites not found inside captureRegionPreview');
  assert.ok(queryIdx >= 0, 'chrome.tabs.query not found inside captureRegionPreview');
  assert.ok(checkIdx < queryIdx, 'checkDeliveryPrerequisites must precede chrome.tabs.query inside captureRegionPreview (direct preflight before region selection)');
});

test('captureRegionPreview is route-aware and reads captureRoute before chrome.tabs.query', () => {
  assert.match(background, /route\s*===\s*'direct'/);
  assert.match(background, /normalizeCaptureRoute/);
});

test('background imports normalizeCaptureRoute from direct-routing module', () => {
  assert.match(background, /normalizeCaptureRoute/);
  assert.match(background, /from ['"].*direct-routing/);
});

test('popup captureRoute selector exposes both archive and direct options', () => {
  assert.match(popupHtml, /value="archive"/);
  assert.match(popupHtml, /value="direct"/);
});

test('outbox retry and archive send share the attemptDelivery path without re-counting', () => {
  assert.match(background, /case 'RETRY_OUTBOX'[\s\S]*?retryOutbox\(message\.id\)/);
  assert.match(background, /case 'SEND_ARCHIVE_CARD'[\s\S]*?sendArchiveCard\(message\.id\)/);
  assert.match(background, /case 'RESEND_AFTER_VERIFICATION'[\s\S]*?attemptDelivery/);
});

test('delivery prerequisite failures enter the existing Outbox recovery path', () => {
  const fnStart = background.indexOf('async function attemptDelivery');
  const fnEnd = background.indexOf('\nasync function ', fnStart + 1);
  assert.ok(fnStart >= 0 && fnEnd > fnStart);
  const body = background.slice(fnStart, fnEnd);
  assert.doesNotMatch(body, /if \(!ready\.ok\) return ready;/);
  assert.match(body, /if \(!ready\.ok\) throw new Error\(ready\.error\);/);
  assert.match(body, /fresh\.outbox\.unshift/);
  assert.match(body, /retryState: policy\.state/);
  assert.match(body, /queued: true/);
});

test('popup.js no longer keeps the capture-hint marketing helper', () => {
  assert.doesNotMatch(popupJs, /updateCaptureHint/);
  assert.doesNotMatch(popupJs, /Free plan allows 5 works per day/);
});
