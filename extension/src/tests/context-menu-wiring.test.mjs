import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));

test('context menu permission is declared and the selection menu is registered', () => {
  assert.ok(manifest.permissions.includes('contextMenus'));
  assert.match(background, /chrome\.contextMenus\.create\(\{[\s\S]*?id: CONTEXT_MENU_ID[\s\S]*?contexts: \['selection'\]/);
  assert.match(background, /chrome\.contextMenus\.onClicked\.addListener/);
  assert.match(background, /onInstalled\.addListener\(ensureContextMenu\)/);
  assert.match(background, /onStartup\.addListener\(ensureContextMenu\)/);
});

test('right-click selection capture saves locally or explicitly sends through the retained delivery path', () => {
  assert.match(background, /captureSelectionFromContext[\s\S]*?saveLocalRecord/);
  assert.match(background, /captureSelectionFromContext[\s\S]*?attemptDelivery\(state, record\)/);
  assert.match(background, /async function attemptDelivery[\s\S]*?await deliver\(record, state\.settings, state\.projects\)/);
});

test('right-click capture shows an in-page toast instead of opening a new tab', () => {
  assert.match(background, /async function showPageToast/);
  assert.match(background, /__proofclip-toast/);
  assert.doesNotMatch(background, /getURL\('capture-review\.html'\)/);
});
