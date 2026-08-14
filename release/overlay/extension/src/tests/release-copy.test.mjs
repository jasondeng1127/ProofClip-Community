import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('extension README is Community copy: self-hosted, no commercial plan', async () => {
  const copy = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(copy, /Save locally/);
  assert.match(copy, /Send to Notion/);
  assert.match(copy, /self-hosted/i);
  assert.match(copy, /deployer-owned/i);
  assert.match(copy, /read-only archive/i);
  assert.doesNotMatch(copy, /automatically sent to Notion/i);
  for (const token of ['50 works', 'unlimited works', 'bridge key', 'subscription', 'Activate', 'works per day', 'gmail.com', 'qq.com']) {
    assert.ok(!copy.includes(token), token + ' must not appear in Community README');
  }
});
