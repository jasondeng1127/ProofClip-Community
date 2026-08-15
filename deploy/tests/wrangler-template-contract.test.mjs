import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Community deployment template uses the authoritative compatibility date', async () => {
  const template = JSON.parse(await readFile(new URL('../wrangler.template.jsonc', import.meta.url), 'utf8'));
  assert.equal(template.compatibility_date, '2026-08-14');
});
