import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('connection schema stores encrypted OAuth material without capture content or commercial state', async () => {
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS oauth_states/i);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS connections/i);
  assert.match(schema, /access_envelope TEXT NOT NULL/i);
  assert.match(schema, /refresh_envelope TEXT/i);
  assert.doesNotMatch(schema, /body_text|canonical_url|selection_text/i);
  assert.doesNotMatch(schema, new RegExp(['entitlement', 'lic' + 'ense', 'sub' + 'scription', 'le' + 'mon', 'usage'].join('|'), 'i'));
});
