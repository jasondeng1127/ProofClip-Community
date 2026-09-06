import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { decodeManifestKey, deriveExtensionId, readStableExtensionIdentity } from '../lib/identity.mjs';

const manifestPath = fileURLToPath(new URL('../../extension/src/manifest.json', import.meta.url));
const STABLE_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoE6clBamwq6eJy+8TWYYbrDkUwCOB8b0X3sN7y67BY/qfHsNEgSNgLRsdE7EK+kaQRI1hr0cCRizkmDypEpEuL3YqNsgXI2nZMJjO9uRKirPLhi78vWybVc1EDVhl6gGqftg6rbWPHvlhx2SCMoUknpZ7q+d5eM0TPqF6F3SEFURA7SHyKTuSbTURrQbGfqkVwNukH5vWyojDKQW5Sk3r5ixI//5nxQOC+d5+rkutrd0hkZFEEus+Ty54Y/7u1CrVT7zjLH0Qw8xZ7ajnwHaZe2RFpVZMCPn+9y4EZvieXAmN/j048HPCEg0HFcTFTIfrGLRHGASorE8nPWcFb/AkQIDAQAB';
const STABLE_EXTENSION_ID = 'ecpbgjlelajodnnichnflkcjkhojfekl';

function chromeExtensionIdFromDer(der) {
  const digest = createHash('sha256').update(der).digest();
  const alphabet = 'abcdefghijklmnop';
  return [...digest.subarray(0, 16)]
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => alphabet[nibble])
    .join('');
}

test('the committed manifest carries the stable public key and Chrome-derived ID', async () => {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.key, STABLE_PUBLIC_KEY);
  const der = Buffer.from(STABLE_PUBLIC_KEY, 'base64');
  assert.equal(chromeExtensionIdFromDer(der), STABLE_EXTENSION_ID);
  assert.equal(deriveExtensionId(manifest.key), STABLE_EXTENSION_ID);
});

test('readStableExtensionIdentity returns the committed public identity', async () => {
  assert.deepEqual(await readStableExtensionIdentity(manifestPath), {
    publicKey: STABLE_PUBLIC_KEY,
    extensionId: STABLE_EXTENSION_ID
  });
});

test('identity decoding rejects empty, malformed Base64, and malformed DER keys', () => {
  assert.throws(() => decodeManifestKey(''), /public key/i);
  assert.throws(() => decodeManifestKey('not-base64!'), /Base64/i);
  assert.throws(() => decodeManifestKey(Buffer.from('not DER').toString('base64')), /DER|public key/i);
});

test('readStableExtensionIdentity rejects a changed valid public key', async () => {
  const changedKey = STABLE_PUBLIC_KEY.replace('oE6c', 'pE6c');
  assert.notEqual(changedKey, STABLE_PUBLIC_KEY);
  assert.notEqual(deriveExtensionId(changedKey), STABLE_EXTENSION_ID);
  const directory = await mkdtemp(join(tmpdir(), 'proofclip-identity-'));
  const changedManifestPath = join(directory, 'manifest.json');
  try {
    await writeFile(changedManifestPath, JSON.stringify({ manifest_version: 3, version: '0.8.1', key: changedKey }));
    await assert.rejects(
      readStableExtensionIdentity(changedManifestPath),
      /stable public key/i
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('the manifest identity contains no private-key material', async () => {
  const manifestText = await readFile(manifestPath, 'utf8');
  assert.doesNotMatch(manifestText, /PRIVATE KEY|BEGIN RSA|BEGIN EC/i);
});
