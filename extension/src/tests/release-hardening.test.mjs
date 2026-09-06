import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const STABLE_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoE6clBamwq6eJy+8TWYYbrDkUwCOB8b0X3sN7y67BY/qfHsNEgSNgLRsdE7EK+kaQRI1hr0cCRizkmDypEpEuL3YqNsgXI2nZMJjO9uRKirPLhi78vWybVc1EDVhl6gGqftg6rbWPHvlhx2SCMoUknpZ7q+d5eM0TPqF6F3SEFURA7SHyKTuSbTURrQbGfqkVwNukH5vWyojDKQW5Sk3r5ixI//5nxQOC+d5+rkutrd0hkZFEEus+Ty54Y/7u1CrVT7zjLH0Qw8xZ7ajnwHaZe2RFpVZMCPn+9y4EZvieXAmN/j048HPCEg0HFcTFTIfrGLRHGASorE8nPWcFb/AkQIDAQAB';
const OFFICIAL_PUBLIC_KEY = [
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE',
  'Ap38/ucQBpWAS7SrcsZgu1auCseL2judE5wOuc+ezPZ61B0FsMP6G25jJuFfa6thfRkIW+dSEIwkxlq8zbu4ugz1trZQgqiyXMnGiJQV9Ohhz+m3okICFoKzL3xEnIsCAUWl7bZdoAK0jL6yl26MNCk57SCGOLlz+E48Sz3qy2otD03VxwYCZfo1b+/+YAFLJNEFJ7as4sdKkGPptOsqHpDu6+PcCe7fgB5IN5Wp1ponofnwAf6fFwjvuRlFdLSaprBqXo5WmJCe+76IkECO7f1CJVVlur8GXspgk2ZZZfk4cbqn9mtpZEiDJUp9PZFJ3Bt+U1VYyGbcfujdeavLbkwIDAQAB'
].join('');

test('Community source and migration record contain no Official deployment identity', async () => {
  const root = new URL('../../../', import.meta.url);
  const migration = await readFile(new URL('MIGRATION.md', root), 'utf8').catch(() => '');
  const [api, manifest, config] = await Promise.all([
    readFile(new URL('extension/src/core/proofclip-api.mjs', root), 'utf8'),
    readFile(new URL('extension/src/manifest.json', root), 'utf8'),
    readFile(new URL('extension/src/community-config.mjs', root), 'utf8')
  ]);
  const officialWorker = 'jasondeng1127' + '.workers.dev';
  const officialExtensionId = 'njofficpnkclkk' + 'gjehomcndibkibomid';
  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.version, '0.8.1');
  assert.equal(parsedManifest.key, STABLE_PUBLIC_KEY);
  for (const text of [api, manifest, config, migration]) {
    assert.doesNotMatch(text, new RegExp(officialWorker, 'i'));
    assert.doesNotMatch(text, new RegExp(officialExtensionId, 'i'));
    assert.ok(!text.includes(OFFICIAL_PUBLIC_KEY));
    assert.doesNotMatch(text, /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/i);
  }
  assert.match(api, /getProofClipApiOrigin/);
});
