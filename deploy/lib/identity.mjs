import { createHash, createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const STABLE_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoE6clBamwq6eJy+8TWYYbrDkUwCOB8b0X3sN7y67BY/qfHsNEgSNgLRsdE7EK+kaQRI1hr0cCRizkmDypEpEuL3YqNsgXI2nZMJjO9uRKirPLhi78vWybVc1EDVhl6gGqftg6rbWPHvlhx2SCMoUknpZ7q+d5eM0TPqF6F3SEFURA7SHyKTuSbTURrQbGfqkVwNukH5vWyojDKQW5Sk3r5ixI//5nxQOC+d5+rkutrd0hkZFEEus+Ty54Y/7u1CrVT7zjLH0Qw8xZ7ajnwHaZe2RFpVZMCPn+9y4EZvieXAmN/j048HPCEg0HFcTFTIfrGLRHGASorE8nPWcFb/AkQIDAQAB';

function invalidKey(message) {
  return new TypeError(`Invalid manifest public key: ${message}`);
}

export function decodeManifestKey(key) {
  if (typeof key !== 'string' || key.length === 0) throw invalidKey('a non-empty Base64 value is required');
  if (key.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(key)) {
    throw invalidKey('malformed Base64');
  }

  const der = Buffer.from(key, 'base64');
  if (der.length === 0 || der.toString('base64') !== key) throw invalidKey('malformed Base64');
  try {
    createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    throw invalidKey('malformed DER SubjectPublicKeyInfo');
  }
  return der;
}

export function deriveExtensionId(key) {
  const digest = createHash('sha256').update(decodeManifestKey(key)).digest();
  const alphabet = 'abcdefghijklmnop';
  return [...digest.subarray(0, 16)]
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => alphabet[nibble])
    .join('');
}

export async function readStableExtensionIdentity(manifestPath) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (typeof manifest.key !== 'string') throw invalidKey('manifest.key is required');
  if (manifest.key !== STABLE_PUBLIC_KEY) throw invalidKey('manifest.key does not match the committed stable public key');
  return {
    publicKey: manifest.key,
    extensionId: deriveExtensionId(manifest.key)
  };
}
