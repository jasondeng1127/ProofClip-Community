import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sourceRoot = new URL('..', import.meta.url);

async function readSource(name) {
  return readFile(new URL(name, sourceRoot), 'utf8');
}

test('Community capture boundary has no commercial controls and retains explicit capture and delivery commands', async () => {
  const [background, popupHtml, popup, worker, schema] = await Promise.all([
    readSource('background.js'),
    readSource('popup.html'),
    readSource('popup.js'),
    readSource('../../worker/src/worker.mjs'),
    readSource('../../worker/src/schema.sql')
  ]);
  const userFacingSource = popupHtml + '\n' + popup;

  const retiredPaths = [
    ['ACTIVATE_', 'LICENSE'].join(''),
    ['DEACTIVATE_', 'LICENSE'].join(''),
    ['/v1/', 'license'].join(''),
    ['/v1/', 'usage/report'].join(''),
    ['/v1/webhooks/', 'le', 'mon'].join('')
  ];
  for (const forbidden of retiredPaths) {
    assert.ok(!background.includes(forbidden) && !worker.includes(forbidden), forbidden + ' must be retired');
  }
  for (const forbidden of ['subscription', 'bridge key', 'support-issued key', 'mailto:', '50/50', 'quotaBadge', 'Your plan', 'Activate a key']) {
    assert.ok(!userFacingSource.toLowerCase().includes(forbidden.toLowerCase()), forbidden + ' must not appear in the UI');
  }
  for (const table of ['licenses', 'webhook_events', 'subscriptions', 'subscription_devices', 'daily_usage', 'usage_counters']) {
    assert.ok(!schema.includes('CREATE TABLE IF NOT EXISTS ' + table), table + ' must not exist in the Community schema');
  }
  for (const token of ['entitlement', 'dailyLimitFor', 'subscribedUntil']) {
    assert.ok(!background.includes(token), token + ' must not be wired into Community capture flows');
  }
  for (const command of ['START_NOTION_CONNECTION', 'GET_DATA_SOURCES', 'SETUP_DATA_SOURCE', 'CAPTURE_WITH_ROUTE', 'SEND_FROM_TOAST', 'RETRY_OUTBOX', 'OPEN_ARCHIVE']) {
    assert.ok(background.includes(command), command + ' must be wired');
  }
});