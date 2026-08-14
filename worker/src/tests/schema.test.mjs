import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Community schema has only self-hosted tables and no commercial tables', async () => {
  const schema = await readFile(new URL('../schema.sql', import.meta.url), 'utf8');
  for (const table of ['oauth_states', 'connections']) assert.match(schema, new RegExp('CREATE TABLE IF NOT EXISTS ' + table));
  for (const table of ['licenses', 'webhook_events', 'subscriptions', 'subscription_devices', 'daily_usage', 'usage_counters']) {
    assert.doesNotMatch(schema, new RegExp('CREATE TABLE IF NOT EXISTS ' + table), table + ' must not exist in the Community schema');
  }
});

test('Community schema is compatible with the privacy cleanup migration', async () => {
  const [schema, migration] = await Promise.all([
    readFile(new URL('../schema.sql', import.meta.url), 'utf8'),
    readFile(new URL('../../migrations/20260813_privacy_nonretention.sql', import.meta.url), 'utf8')
  ]);
  assert.match(migration, /DELETE FROM oauth_states;/);
  assert.match(migration, /workspace_id = NULL/);
  // The migration references columns the Community schema declares.
  assert.match(schema, /workspace_id TEXT/);
  assert.match(schema, /workspace_name TEXT/);
  assert.doesNotMatch(migration, /consumed_at/);
});

test('no migration file references removed commercial tables', async () => {
  const { readdir } = await import('node:fs/promises');
  const { resolve } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = resolve(fileURLToPath(new URL('../../migrations', import.meta.url)));
  for (const name of (await readdir(dir)).filter((n) => n.endsWith('.sql'))) {
    const content = await readFile(resolve(dir, name), 'utf8');
    for (const table of ['licenses', 'subscriptions', 'daily_usage', 'usage_counters', 'webhook_events']) {
      assert.doesNotMatch(content, new RegExp('CREATE TABLE IF NOT EXISTS ' + table), name + ' must not create ' + table);
    }
  }
});
