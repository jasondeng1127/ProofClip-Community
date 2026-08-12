import assert from 'node:assert/strict';
import test from 'node:test';
import { decryptToken, encryptToken } from '../token-vault.mjs';
import { createOAuthState, exchangeAuthorizationCode, isUsableOAuthState } from '../oauth.mjs';

const vaultKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

test('token vault round-trips data with unique AES-GCM envelopes', async () => {
  const first = await encryptToken('ntn_test_secret', vaultKey);
  const second = await encryptToken('ntn_test_secret', vaultKey);
  assert.notEqual(first.iv, second.iv);
  assert.equal(await decryptToken(first, vaultKey), 'ntn_test_secret');
});

test('token vault rejects malformed key and altered ciphertext', async () => {
  await assert.rejects(() => encryptToken('value', 'bad'), /base64|32 bytes/);
  const envelope = await encryptToken('value', vaultKey);
  await assert.rejects(() => decryptToken({ ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -2)}AA` }, vaultKey), /cannot be decrypted/);
});

test('OAuth state is high entropy, one-time and expires', () => {
  const state = createOAuthState(() => 1_000);
  assert.match(state.value, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(isUsableOAuthState(state, state.value, () => 2_000), true);
  assert.equal(isUsableOAuthState({ ...state, consumedAt: 1_500 }, state.value, () => 2_000), false);
  assert.equal(isUsableOAuthState(state, state.value, () => state.expiresAt), false);
});

test('OAuth exchange uses Basic auth and redacts provider errors', async () => {
  let request;
  const result = await exchangeAuthorizationCode({
    code: 'temporary-code', redirectUri: 'https://proofclip.example/auth/notion/callback', clientId: 'client', clientSecret: 'secret',
    fetchImpl: async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ access_token: 'ntn_test', refresh_token: 'nrt_test', workspace_id: 'workspace' }), { status: 200 }); }
  });
  assert.equal(request.url, 'https://api.notion.com/v1/oauth/token');
  assert.equal(request.options.headers.Authorization, `Basic ${btoa('client:secret')}`);
  assert.equal(result.accessToken, 'ntn_test');
  await assert.rejects(() => exchangeAuthorizationCode({ code: 'code', redirectUri: 'https://proofclip.example/callback', clientId: 'client', clientSecret: 'secret', fetchImpl: async () => new Response(JSON.stringify({ message: 'secret provider detail' }), { status: 401 }) }), /could not be completed/);
});
