import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../popup.html', import.meta.url), 'utf8');
const source = await readFile(new URL('../popup.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../popup.css', import.meta.url), 'utf8');

test('popup provides an aria-live feedback region for every static action area', () => {
  for (const area of ['capture', 'notion', 'archive', 'template']) {
    assert.match(html, new RegExp(`data-action-feedback="${area}"[^>]*aria-live="polite"`));
  }
});

test('popup discloses that JSON exports include locally saved screenshots', () => {
  assert.match(html, /Export includes locally saved screenshots\./);
});

test('popup routes retained static async buttons through runButtonAction', () => {
  assert.match(source, /function runButtonAction/);
  for (const id of ['connectNotion', 'disconnectNotion', 'saveSettings', 'exportArchive', 'clearAll']) {
    assert.match(source, new RegExp(`const ${id}Button = \\$\\('#${id}'\\);[\\s\\S]*?runButtonAction\\([\\s\\S]*?button: ${id}Button`));
  }
  assert.match(source, /for \(const button of document\.querySelectorAll\('\[data-capture\]'\)\)[\s\S]*?runButtonAction\(/);
});

test('Settings keeps Notion connection visible and the full template editor collapsible', () => {
  assert.match(html, /data-page="settings"[\s\S]*?Notion connection/);
  assert.match(html, /id="connectNotion">Connect/);
  assert.match(html, /<details class="settings-template"><summary><span><strong>Template editor<\/strong>/);
  assert.doesNotMatch(html, /<details class="settings-template" open>/);
  assert.match(css, /\.settings-template\s*>\s*summary\s*\{[^}]*cursor\s*:\s*pointer/);
});


test('each Outbox row owns retry and discard feedback', () => {
  assert.match(source, /const feedback = document\.createElement\('small'\)/);
  assert.match(source, /pendingLabel: 'Retrying'/);
  assert.match(source, /pendingLabel: 'Discarding'/);
});

test('[data-capture] handler captures the settled result from runButtonAction', () => {
  assert.match(source, /const settled = await runButtonAction\(\{[\s\S]*?button,[\s\S]*?feedback: actionFeedback\('capture'\)[\s\S]*?\}\);/);
});

test('[data-capture] handler renders delivery link only for successful direct captures', () => {
  assert.match(source, /if \(settled\?\.ok && settled\?\.value\?\.route === 'direct'\) \{[\s\S]*?renderDeliveryLink\(settled\.value\.delivery\?\.url \|\| ''\);/);
});

test('[data-capture] handler clears delivery link before capture and does not render link for non-direct captures', () => {
  // The renderDeliveryLink('') call clears any previous link before the action runs.
  // The guard settled?.value?.route === 'direct' prevents archive captures from rendering a link.
  const handlerBody = source.match(/for \(const button of document\.querySelectorAll\('\[data-capture\]'\)\)[\s\S]*?\n\}/)?.[0] || '';
  assert.match(handlerBody, /renderDeliveryLink\(''\);/);
  assert.match(handlerBody, /route === 'direct'/);
});

test('popup refreshes the Notion connection when it becomes visible after authorization', () => {
  assert.match(source, /document\.addEventListener\('visibilitychange', \(\) => \{\s*if \(!document\.hidden\) refresh\(\);\s*\}\);/);
});

test('top connection status uses the same connected state as the Settings connection card', () => {
  assert.match(source, /else setStatus\(connected \? 'Notion connected\.' : 'Notion not connected\.'\);/);
  assert.doesNotMatch(source, /setStatus\(state\.configured/);
});
