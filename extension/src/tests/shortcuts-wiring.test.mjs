import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('commands map to the three capture modes and reuse the current capture route', () => {
  assert.match(background, /chrome\.commands\.onCommand\.addListener/);
  assert.match(background, /command === 'proofclip-capture-body'/);
  assert.match(background, /command === 'proofclip-capture-selection'/);
  assert.match(background, /command === 'proofclip-capture-region'/);
  assert.match(background, /normalizeCaptureRoute\(commandState\.settings\.captureRoute\)/);
  assert.match(background, /captureDirect\('body', \{ tab, state: commandState \}\)/);
  assert.match(background, /captureLocal\('body', \{ tab, state: commandState \}\)/);
  assert.match(background, /captureSelectionFromContext\(tab\.id, selectionText\)/);
  assert.match(background, /captureRegionPreview\(\{ tab, state: commandState \}\)/);
});

test('shortcut body capture keeps the page and state captured at keypress time', () => {
  assert.match(background, /async function captureLocal\(mode, \{ fromPopup = false, tab: targetTab, state: providedState \} = \{\}\)/);
  assert.match(background, /const captureState = providedState \|\| await getState\(\)/);
  assert.match(background, /const tab = targetTab \|\| \(await chrome\.tabs\.query\(\{ active: true, lastFocusedWindow: true \}\)\)\[0\];/);
  assert.match(background, /async function captureDirect\(mode, \{ fromPopup = false, tab: targetTab, state: providedState \} = \{\}\)/);
  assert.match(background, /const state = providedState \|\| await getState\(\)/);
  assert.match(background, /async function captureRegionPreview\(\{ fromPopup = false, tab: targetTab, state: providedState \} = \{\}\)/);
  assert.match(background, /captureDirect\(mode, \{ fromPopup: true, tab, state: routeState \}\)/);
  assert.match(background, /captureLocal\(mode, \{ fromPopup: true, tab, state: routeState \}\)/);
});

test('shortcut selection requires a non-empty page selection', () => {
  assert.match(background, /window\.getSelection\(\)\?\.toString/);
  assert.match(background, /select text on the page first\./);
});

test('shortcut startup failures are caught before querying the active tab or reading state', () => {
  const commandStart = background.indexOf('chrome.commands.onCommand.addListener');
  assert.ok(commandStart >= 0, 'command listener must exist');
  const commandHandler = background.slice(commandStart);
  const tryIndex = commandHandler.indexOf('try {');
  const tabQueryIndex = commandHandler.indexOf('await chrome.tabs.query');
  const stateIndex = commandHandler.indexOf('await getState()');
  assert.ok(tryIndex >= 0 && tryIndex < tabQueryIndex, 'active-tab lookup must be inside the command error boundary');
  assert.ok(tryIndex < stateIndex, 'state lookup must be inside the command error boundary');
  assert.match(commandHandler, /catch \(error\) \{[\s\S]*?if \(tab\?\.id\)/, 'startup failures should show a page error when an active tab is available');
});

test('README documents the shortcut table, Linux rebinding and chrome://extensions/shortcuts', () => {
  assert.match(readme, /`Alt\+3` \| Capture page body/);
  assert.match(readme, /`Alt\+2` \| Capture region/);
  assert.match(readme, /`Alt\+1` \| Capture selection/);
  assert.match(readme, /Ctrl\+Shift\+3\/2\/1/);
  assert.match(readme, /chrome:\/\/extensions\/shortcuts/);
  assert.match(readme, /Linux/i);
});
