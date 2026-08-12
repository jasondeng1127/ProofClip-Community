const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64ToBytes(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Token-vault key must be base64 encoded.');
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function importEncryptionKey(keyBase64) {
  const raw = base64ToBytes(keyBase64);
  if (raw.byteLength !== 32) throw new Error('Token-vault key must decode to 32 bytes.');
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptToken(plaintext, keyBase64) {
  const key = await importEncryptionKey(keyBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(String(plaintext)));
  return { version: 1, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

export async function decryptToken(envelope, keyBase64) {
  if (!envelope || envelope.version !== 1 || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string') {
    throw new Error('Token envelope is invalid.');
  }
  const key = await importEncryptionKey(keyBase64);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.ciphertext));
    return decoder.decode(plaintext);
  } catch {
    throw new Error('Token envelope cannot be decrypted.');
  }
}
