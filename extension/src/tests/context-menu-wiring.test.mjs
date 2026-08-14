import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('background registers the selection context menu on install and startup', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  assert.match(background, /contextMenus\.removeAll/);
  assert.match(background, /contextMenus\.create/);
  assert.match(background, /contexts: \['selection'\]/);
  assert.match(background, /onInstalled\.addListener\(ensureContextMenu\)/);
  assert.match(background, /onStartup\.addListener\(ensureContextMenu\)/);
});

test('right-click selection capture routes through the Community local or direct path without a wall', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  assert.match(background, /async function captureSelectionFromContext/);
  assert.doesNotMatch(background, /checkDailyWorkPermission|dailyWorkAccess|reserveMonthlyWork/);
  assert.match(background, /captureSelectionFromContext[\s\S]*?saveLocalRecord/);
  assert.match(background, /captureSelectionFromContext[\s\S]*?attemptDelivery\(state, record\)/);
});