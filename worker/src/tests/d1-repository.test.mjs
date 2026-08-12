import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1Repository } from '../d1-repository.mjs';

test('D1 state consumption aliases database columns to the Worker state model', async () => {
  const calls = [];
  const db = { prepare(sql) { const entry = { sql, values: [] }; calls.push(entry); return { bind(...values) { entry.values = values; return this; }, async first() { return { value: 'state', installIdHash: 'proofclip_install_hash', expiresAt: 20_000 }; } }; } };
  const record = await createD1Repository(db).consumeOAuthState('state', 1_000);
  assert.deepEqual(record, { value: 'state', installIdHash: 'proofclip_install_hash', expiresAt: 20_000 });
  assert.match(calls[0].sql, /install_id_hash AS installIdHash/);
});

test('D1 connection writes only encrypted OAuth fields and metadata', async () => {
  const calls = [];
  const db = { prepare(sql) { const entry = { sql, values: [] }; calls.push(entry); return { bind(...values) { entry.values = values; return this; }, async run() {} }; } };
  await createD1Repository(db).saveConnection({ installIdHash: 'hash', accessEnvelope: { cipher: 'x' }, refreshEnvelope: null, workspaceId: 'workspace', workspaceName: 'Name', now: 1_000 });
  assert.match(calls[0].sql, /INSERT INTO connections/i);
  assert.doesNotMatch(calls[0].sql, /entitlement/i);
  assert.deepEqual(calls[0].values, ['hash', '{"cipher":"x"}', null, 'workspace', 'Name', 1_000]);
});
