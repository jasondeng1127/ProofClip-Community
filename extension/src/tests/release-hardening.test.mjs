import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('Community source and migration record contain no Official deployment identity', async () => {
  const root = new URL('../../../', import.meta.url);
  const [api, manifest, migration] = await Promise.all([
    readFile(new URL('extension/src/core/proofclip-api.mjs', root), 'utf8'),
    readFile(new URL('extension/src/manifest.json', root), 'utf8'),
    readFile(new URL('MIGRATION.md', root), 'utf8')
  ]);
  const officialWorker = `jasondeng1127${'.workers.dev'}`;
  const officialExtensionId = `njofficpnkclkk${'gjehomcndibkibomid'}`;
  const officialKeyPrefix = `MIIBIjANBgkqhki${'G9w0BAQEFAAOCAQ8A'}`;
  for (const text of [api, manifest, migration]) {
    assert.doesNotMatch(text, new RegExp(officialWorker, 'i'));
    assert.doesNotMatch(text, new RegExp(officialExtensionId, 'i'));
    assert.doesNotMatch(text, new RegExp(officialKeyPrefix, 'i'));
  }
  assert.match(api, /getProofClipApiOrigin/);
  assert.match(migration, /public Community repository/i);
});
