import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceRoot = new URL('..', import.meta.url);

async function readSource(name) {
  return readFile(new URL(name, sourceRoot), 'utf8');
}

test('Community capture boundary has no commercial controls and retains explicit capture and delivery commands', async () => {
  const [background, popupHtml, popup] = await Promise.all([
    readSource('background.js'),
    readSource('popup.html'),
    readSource('popup.js')
  ]);
  const userFacingSource = `${popupHtml}\n${popup}`;

  const retiredPaths = [
    ['ACTIVATE_', 'LICENSE'].join(''),
    ['DEACTIVATE_', 'LICENSE'].join(''),
    ['/v1/', 'license'].join(''),
    ['/v1/', 'usage/report'].join('')
  ];
  for (const forbidden of retiredPaths) {
    assert.doesNotMatch(background, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const forbidden of ['subscription', 'bridge key', 'support-issued key', 'mailto:', '50/50']) {
    assert.doesNotMatch(userFacingSource, new RegExp(forbidden, 'i'));
  }
  for (const command of ['GET_CONNECTION', 'START_AUTH', 'GET_DATA_SOURCES', 'CAPTURE_WITH_ROUTE', 'CAPTURE_LOCAL', 'SEND_FROM_TOAST', 'RETRY_OUTBOX']) {
    assert.match(`${background}\n${popup}`, new RegExp(command));
  }
});
