import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('local save toast reports the real state without any plan phrasing', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  assert.match(background, /'ProofClip: saved locally\.'/);
  assert.doesNotMatch(background, /works left this month/);
  assert.doesNotMatch(background, /Unlimited works/);
  assert.doesNotMatch(background, /getCachedEntitlement/);
  assert.doesNotMatch(background, /entitlement\?\.entitled/);
});

test('toast actions open the card and send it from the toast', async () => {
  const background = await readFile(new URL('../background.js', import.meta.url), 'utf8');
  assert.match(background, /'Edit', message: \{ type: 'OPEN_ARCHIVE_CARD', id: record\.id \}/);
  assert.match(background, /'Send to Notion', message: \{ type: 'SEND_FROM_TOAST', id: record\.id \}/);
  assert.match(background, /archive\.html\?focus=\$\{encodeURIComponent\(message\.id\)\}/);
  assert.match(background, /case 'SEND_FROM_TOAST'/);
});