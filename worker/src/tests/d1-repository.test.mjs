import assert from 'node:assert/strict';
import test from 'node:test';
import { createD1Repository } from '../d1-repository.mjs';

function fakeDb() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      calls.push({ sql, binds: null });
      return {
        bind(...binds) { calls[calls.length - 1].binds = binds; return this; },
        async run() { return { meta: { changes: 1 } }; },
        async first() { return { value: 'first', installIdHash: 'install-hash', expiresAt: 123 }; },
        async all() { return { results: [] }; }
      };
    }
  };
}

test('repository requires a D1 binding', () => {
  assert.throws(() => createD1Repository(null), /D1 database binding is required/);
});

test('OAuth state methods keep only value, install hash and expiry and delete on consume', async () => {
  const db = fakeDb();
  const repo = createD1Repository(db);
  await repo.putOAuthState({ value: 'state-1', installIdHash: 'hash-1', expiresAt: 1000 });
  assert.match(db.calls[0].sql, /INSERT INTO oauth_states \(value, install_id_hash, expires_at\)/);
  assert.deepEqual(db.calls[0].binds, ['state-1', 'hash-1', 1000]);
  await repo.deleteExpiredOAuthStates(500);
  assert.match(db.calls[1].sql, /DELETE FROM oauth_states WHERE expires_at <= \?/);
  const consumed = await repo.consumeOAuthState('state-1', 900);
  assert.match(db.calls[2].sql, /DELETE FROM oauth_states WHERE value = \? AND expires_at > \? RETURNING/);
  assert.deepEqual(db.calls[2].binds, ['state-1', 900]);
  assert.equal(consumed.value, 'first');
});

test('connection methods upsert envelopes and never select workspace metadata', async () => {
  const db = fakeDb();
  const repo = createD1Repository(db);
  await repo.saveConnection({ installIdHash: 'hash-1', accessEnvelope: { version: 1, iv: 'iv', ciphertext: 'ct' }, refreshEnvelope: null, now: 1000 });
  assert.match(db.calls[0].sql, /INSERT INTO connections \(install_id_hash, access_envelope, refresh_envelope, updated_at\)/);
  assert.match(db.calls[0].sql, /ON CONFLICT\(install_id_hash\) DO UPDATE/);
  const token = await repo.getTokenConnection('hash-1');
  assert.match(db.calls[1].sql, /SELECT access_envelope AS accessEnvelope FROM connections/);
  const status = await repo.getConnection('hash-1');
  assert.match(db.calls[2].sql, /SELECT updated_at AS updatedAt FROM connections/);
  assert.equal(status.value, 'first');
  await repo.deleteConnection('hash-1');
  assert.match(db.calls[3].sql, /DELETE FROM connections WHERE install_id_hash = \?/);
  const allSql = db.calls.map((c) => c.sql).join('\n');
  assert.doesNotMatch(allSql, /workspace/);
  assert.doesNotMatch(allSql, /licenses|webhook|subscriptions|daily_usage|usage_counters/i);
});
