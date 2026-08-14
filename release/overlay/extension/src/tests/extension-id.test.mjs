import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Community manifest carries no Chrome Web Store public key', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.key, undefined);
});

test('the unpacked extension ID is derived by Chrome, not pinned by a public key', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.ok(!manifest.key);
  assert.doesNotMatch(JSON.stringify(manifest), /MIIBIjANBgkqhki/);
});
