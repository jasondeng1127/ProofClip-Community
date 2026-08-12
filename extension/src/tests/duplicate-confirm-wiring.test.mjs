import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
const popup = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
const popupHtml = await readFile(new URL('../popup.html', import.meta.url), 'utf8');

test('background imports the duplicate-detection helpers (FIX-013)', () => {
  assert.match(background, /findRecentDuplicate/);
  assert.match(background, /duplicateConfirmMessage/);
  assert.match(background, /from ['"]\.\/core\/archive-dedup\.mjs/);
});

test('every capture entry point checks the local archive for a duplicate before counting (FIX-013)', () => {
  assert.match(background, /async function captureLocal[\s\S]*?findArchiveDuplicate\(captureUrl\)[\s\S]*?createEvidenceRecord/);
  assert.match(background, /async function captureDirect[\s\S]*?findArchiveDuplicate\(captureUrl\)[\s\S]*?attemptDelivery\(state, record\)/);
  assert.match(background, /async function captureSelectionFromContext[\s\S]*?findArchiveDuplicate\(captureUrl\)[\s\S]*?createEvidenceRecord/);
  assert.match(background, /async function captureRegionPreview[\s\S]*?findArchiveDuplicate\(captureUrl\)[\s\S]*?selectVisibleRegion/);
  assert.match(background, /if \(!proceed\) return \{ ok: false, cancelled: true \};/);
  assert.match(background, /if \(!proceed\) return \{ ok: false, locallySaved: false, cancelled: true \};/);
});

test('the duplicate confirmation is non-blocking and defaults to Continue after 3 seconds', () => {
  assert.match(background, /DUPLICATE_CONFIRM_TIMEOUT_MS = 3000/);
  assert.match(background, /setTimeout\(\(\) => resolve\(true\), DUPLICATE_CONFIRM_TIMEOUT_MS\)/);
  assert.match(background, /case 'DUPLICATE_CONFIRM_RESPONSE'/);
  assert.match(background, /duplicateConfirmRequests\.get\(message\.requestId\)/);
});

test('the page-toast path shows Continue and Cancel with a countdown for a duplicate (FIX-013)', () => {
  assert.match(background, /async function showDuplicateConfirmToast/);
  assert.match(background, /label: 'Continue', message: \{ type: 'DUPLICATE_CONFIRM_RESPONSE', requestId, proceed: true \}/);
  assert.match(background, /label: 'Cancel', message: \{ type: 'DUPLICATE_CONFIRM_RESPONSE', requestId, proceed: false \}/);
  assert.match(background, /confirmSeconds: 3/);
  assert.match(background, /Continuing in \$\{confirmSeconds\}…/);
  assert.match(background, /'Continuing…'/);
});

test('the popup path shows the confirmation inside the popup and answers through the same channel', () => {
  assert.match(background, /type: 'DUPLICATE_CONFIRM_REQUEST'/);
  assert.match(popupHtml, /id="duplicateConfirm"/);
  assert.match(popupHtml, /id="duplicateConfirmText"/);
  assert.match(popupHtml, /id="duplicateConfirmContinue"/);
  assert.match(popupHtml, /id="duplicateConfirmCancel"/);
  assert.match(popup, /DUPLICATE_CONFIRM_REQUEST/);
  assert.match(popup, /DUPLICATE_CONFIRM_RESPONSE/);
  assert.match(popup, /proceed: true/);
  assert.match(popup, /answerDuplicate\(false\)/);
  assert.match(popup, /send\(\{ type: 'DUPLICATE_CONFIRM_RESPONSE', requestId, proceed \}\)/);
  assert.match(popup, /duplicateConfirmMessage/);
  assert.match(popup, /Continuing in \$\{secondsLeft\}…/);
});

test('a cancelled duplicate confirmation aborts before feedback toasts and never counts', () => {
  assert.match(background, /if \(result\?\.cancelled\) return result;/);
  assert.match(background, /!result\?\.ok && !result\?\.cancelled/);
  assert.match(popup, /if \(result\?\.cancelled\) return \{ text: '', isError: false \};/);
  assert.match(background, /async function captureLocal[\s\S]*?findArchiveDuplicate\(captureUrl\)[\s\S]*?saveLocalRecord/);
  assert.match(background, /async function captureSelectionFromContext[\s\S]*?findArchiveDuplicate\(captureUrl\)[\s\S]*?attemptDelivery\(state, record\)/);
});
