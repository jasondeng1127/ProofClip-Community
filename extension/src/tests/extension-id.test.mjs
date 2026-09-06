import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const STABLE_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoE6clBamwq6eJy+8TWYYbrDkUwCOB8b0X3sN7y67BY/qfHsNEgSNgLRsdE7EK+kaQRI1hr0cCRizkmDypEpEuL3YqNsgXI2nZMJjO9uRKirPLhi78vWybVc1EDVhl6gGqftg6rbWPHvlhx2SCMoUknpZ7q+d5eM0TPqF6F3SEFURA7SHyKTuSbTURrQbGfqkVwNukH5vWyojDKQW5Sk3r5ixI//5nxQOC+d5+rkutrd0hkZFEEus+Ty54Y/7u1CrVT7zjLH0Qw8xZ7ajnwHaZe2RFpVZMCPn+9y4EZvieXAmN/j048HPCEg0HFcTFTIfrGLRHGASorE8nPWcFb/AkQIDAQAB';
const STABLE_EXTENSION_ID = 'ecpbgjlelajodnnichnflkcjkhojfekl';

function chromeExtensionId(key) {
  const digest = createHash('sha256').update(Buffer.from(key, 'base64')).digest();
  const alphabet = 'abcdefghijklmnop';
  return [...digest.subarray(0, 16)]
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => alphabet[nibble])
    .join('');
}

test('Community manifest carries the committed stable public key', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.key, STABLE_PUBLIC_KEY);
  assert.equal(chromeExtensionId(manifest.key), STABLE_EXTENSION_ID);
});

test('the stable manifest identity is public-only', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(JSON.stringify(manifest), /PRIVATE KEY|BEGIN RSA|BEGIN EC/i);
});
