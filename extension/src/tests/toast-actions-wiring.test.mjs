import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../archive.css', import.meta.url), 'utf8');

test('local save toast offers Edit and Send to Notion actions', () => {
  assert.match(background, /showLocalSaveToast/);
  assert.match(background, /label: 'Edit', message: \{ type: 'OPEN_ARCHIVE_CARD', id: record\.id \}/);
  assert.match(background, /label: 'Send to Notion', message: \{ type: 'SEND_FROM_TOAST', id: record\.id \}/);
  assert.match(background, /actions\.length \? 10000 : 2500/);
});

test('SEND_FROM_TOAST reuses attemptDelivery with duplicate protection', () => {
  assert.match(background, /case 'SEND_FROM_TOAST': \{/);
  assert.match(background, /attemptDelivery\(toastState, record\)/);
  assert.match(background, /already sent to Notion/);
  assert.match(background, /record\.delivery\?\.status === 'SENT'/);
});

test('toast success renders an openable Notion link and failures surface the error', () => {
  assert.match(background, /'Open in Notion'/);
  assert.match(background, /link\.href = response\.delivery\.url/);
  assert.match(background, /response\?\.ok && response\.delivery\?\.url/);
  assert.match(background, /Could not send\./);
});

test('local capture paths show the action toast after a successful save', () => {
  assert.match(background, /showLocalSaveToast\(tab\.id, record\)/);
  assert.match(background, /showLocalSaveToast\(tab\?\.id, result\.record\)/);
});

test('Edit opens the archive and the focused card is highlighted', () => {
  assert.match(background, /archive\.html\?focus=\$\{encodeURIComponent\(message\.id\)\}/);
  assert.match(css, /focus-highlight/);
});

test('local save toast confirms the retained local evidence action', () => {
  assert.match(background, /const message = 'ProofClip: saved locally\.'/);
});
