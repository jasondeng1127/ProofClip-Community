import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Side Panel navigation is fixed; region capture keeps the popup open and uses runButtonAction (Bug G fix)', async () => {
  const [css, popup] = await Promise.all([
    readFile(new URL('../popup.css', import.meta.url), 'utf8'),
    readFile(new URL('../popup.js', import.meta.url), 'utf8')
  ]);

  assert.match(css, /main\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/s);
  assert.doesNotMatch(css, /height:\s*720px/);
  assert.doesNotMatch(popup, /closeForCapture|sendCaptureAndClose/);
  assert.match(popup, /action: \(\) => send\(\{ type: 'CAPTURE_WITH_ROUTE'/);
  // Region capture sends the message and keeps the popup open (uses runButtonAction, no window.close).
  const regionStart = popup.indexOf("$('#captureRegion').onclick");
  const regionEnd = popup.indexOf('\n$(\'#dataSourceId\')', regionStart);
  const regionHandler = popup.slice(regionStart, regionEnd >= 0 ? regionEnd : undefined);
  assert.ok(regionHandler.length > 0);
  assert.match(regionHandler, /send\(\{ type: 'CAPTURE_REGION_PREVIEW' \}\)/);
  assert.match(regionHandler, /runButtonAction/);
  assert.doesNotMatch(regionHandler, /window\.close\(\)/);
  // Reconfirm that regular [data-capture] buttons still await and do NOT close.
  const dataCaptureStart = popup.indexOf("for (const button of document.querySelectorAll('[data-capture]'))");
  const regionStart2 = popup.indexOf("$('#captureRegion').onclick", dataCaptureStart);
  const dataCaptureHandler = popup.slice(dataCaptureStart, regionStart2 >= 0 ? regionStart2 : undefined);
  assert.match(dataCaptureHandler, /const settled = await runButtonAction/);
  assert.doesNotMatch(dataCaptureHandler, /window\.close\(\)/);
});

test('capture buttons work with the installed website permission after activeTab expires', async () => {
  const [manifest, popup] = await Promise.all([
    readFile(new URL('../manifest.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../popup.js', import.meta.url), 'utf8')
  ]);

  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  assert.doesNotMatch(popup, /CAPTURE_SITE_ORIGINS|ensureCaptureSiteAccess|chrome\.permissions\.request/);
});

test('all asynchronous buttons preserve their own DOM while feedback is pending', async () => {
  const popup = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
  const start = popup.indexOf('async function runButtonAction');
  const end = popup.indexOf('\nfunction renderDeliveryLink', start);
  const buttonAction = popup.slice(start, end);

  assert.match(buttonAction, /button\.setAttribute\('aria-busy', 'true'\);/);
  assert.match(buttonAction, /button\.removeAttribute\('aria-busy'\);/);
  assert.doesNotMatch(buttonAction, /button\.textContent\s*=/);
});

test('page toast is centered at the browser twelve oclock position', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  const start = background.indexOf('async function showPageToast');
  const end = background.indexOf('\nasync function showLocalSaveToast', start);
  const toast = background.slice(start, end);

  assert.match(toast, /top:\s*'16px'/);
  assert.match(toast, /left:\s*'50%'/);
  assert.match(toast, /transform:\s*'translateX\(-50%\)'/);
  assert.doesNotMatch(toast, /right:\s*'16px'/);
});

test('a closed Popup still receives direct-delivery success and failure feedback on the page', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');

  assert.match(background, /async function captureWithPopupFeedback\(mode\)/);
  assert.match(background, /captureWithPopupFeedback[\s\S]*?ProofClip: sent to Notion\./);
  assert.match(background, /captureWithPopupFeedback[\s\S]*?Capture failed\./);
  assert.match(background, /case 'CAPTURE_WITH_ROUTE': return captureWithPopupFeedback\(message\.mode\)/);
});

test('body and selection capture buttons do not close the popup (Bug G: only region capture closes)', async () => {
  const popup = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
  // Extract the [data-capture] loop handler — it must NOT contain window.close().
  const dataCaptureStart = popup.indexOf("for (const button of document.querySelectorAll('[data-capture]'))");
  const nextFunction = popup.indexOf("\n$('#captureRegion').onclick", dataCaptureStart);
  const dataCaptureHandler = popup.slice(dataCaptureStart, nextFunction >= 0 ? nextFunction : undefined);
  assert.ok(dataCaptureHandler.length > 0);
  assert.match(dataCaptureHandler, /runButtonAction/);
  assert.doesNotMatch(dataCaptureHandler, /window\.close\(\)/);
});

test('region overlay Esc and right-click cancel paths are unchanged (Bug G: overlay semantics stay)', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  assert.match(background, /overlay\.addEventListener\('contextmenu', onContextMenu\)/);
  assert.match(background, /if \(event\.key === 'Escape'\) cleanup\(null\);/);
  assert.match(background, /document\.addEventListener\('__proofclip-cancel-region', onCancelMessage\)/);
  assert.match(background, /document\.removeEventListener\('__proofclip-cancel-region', onCancelMessage\)/);
});

test('popup has a document-level keydown listener that sends CANCEL_REGION_SELECTION on Escape', async () => {
  const popup = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
  assert.match(popup, /document\.addEventListener\('keydown'/);
  assert.match(popup, /event\.key === 'Escape'/);
  assert.match(popup, /type: 'CANCEL_REGION_SELECTION'/);
});

test('background dispatches CANCEL_REGION_SELECTION to the active region tab via a CustomEvent', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  assert.match(background, /case 'CANCEL_REGION_SELECTION'/);
  assert.match(background, /activeRegionTabId/);
  assert.match(background, /CustomEvent\('__proofclip-cancel-region'\)/);
  assert.match(background, /let activeRegionTabId = null/);
});

test('captureRegionPreview sets and clears activeRegionTabId around the region selection', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  assert.match(background, /activeRegionTabId = tab\.id/);
  assert.match(background, /activeRegionTabId = null/);
});

test('region button does NOT close the popup (Bug G fix: popup stays open for Esc forwarding)', async () => {
  const popup = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
  const regionStart = popup.indexOf("$('#captureRegion').onclick");
  const regionEnd = popup.indexOf('\n$(\'#dataSourceId\')', regionStart);
  const regionHandler = popup.slice(regionStart, regionEnd >= 0 ? regionEnd : undefined);
  assert.ok(regionHandler.length > 0);
  assert.doesNotMatch(regionHandler, /window\.close\(\)/);
  assert.match(regionHandler, /runButtonAction/);
});
