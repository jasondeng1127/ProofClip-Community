import { createHash, createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';

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
  return {
    publicKey: manifest.key,
    extensionId: deriveExtensionId(manifest.key)
  };
}
