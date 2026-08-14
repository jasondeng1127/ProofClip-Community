import assert from 'node:assert/strict';
import test from 'node:test';
import { getProofClipApiOrigin, ProofClipApiError, proofclipApi, getInstallId } from '../core/proofclip-api.mjs';

test('Community API origin accepts only a normalized HTTPS deployer endpoint', () => {
  assert.equal(getProofClipApiOrigin('https://demo.example.workers.dev/'), 'https://demo.example.workers.dev');
  assert.equal(getProofClipApiOrigin('https://proofclip.example.com'), 'https://proofclip.example.com');
  assert.throws(() => getProofClipApiOrigin('http://localhost:8787'), { name: 'ProofClipApiError' });
  assert.throws(() => getProofClipApiOrigin('https://replace-me.invalid'), { name: 'ProofClipApiError' });
  assert.throws(() => getProofClipApiOrigin('ftp://example.com'), { name: 'ProofClipApiError' });
});

test('proofclipApi sends the install id header to the configured origin only', async () => {
  let captured = null;
  const result = await proofclipApi('/v1/connection', {
    storage: { get: async () => ({ proofclipInstallId: 'proofclip_1234567890abcdefghijklmnopqrstuv' }), set: async () => {} },
    fetchImpl: async (url, init) => { captured = { url, init }; return new Response(JSON.stringify({ connected: false }), { status: 200 }); },
    apiOrigin: 'https://community.example.workers.dev'
  });
  assert.equal(result.connected, false);
  assert.equal(captured.url, 'https://community.example.workers.dev/v1/connection');
  assert.equal(captured.init.headers['X-ProofClip-Install-Id'], 'proofclip_1234567890abcdefghijklmnopqrstuv');
  assert.equal('Authorization' in captured.init.headers, false);
});

test('proofclipApi cannot be pointed at the placeholder or a non-HTTPS origin', async () => {
  await assert.rejects(() => proofclipApi('/v1/connection', {
    storage: { get: async () => ({}), set: async () => {} },
    fetchImpl: async () => new Response('{}', { status: 200 }),
    apiOrigin: 'https://replace-me.invalid'
  }), { name: 'ProofClipApiError' });
});

test('getInstallId creates and persists a random installation identifier', async () => {
  const store = {};
  const id = await getInstallId({ get: async (k) => ({ [k]: store[k] }), set: async (v) => Object.assign(store, v) });
  assert.match(id, /^proofclip_[a-f0-9]{32}$/);
  const again = await getInstallId({ get: async (k) => ({ [k]: store[k] }), set: async () => {} });
  assert.equal(again, id);
});

test('ProofClipApiError is an Error with kind and optional status', () => {
  const error = new ProofClipApiError('boom', { kind: 'response', status: 502 });
  assert.equal(error.name, 'ProofClipApiError');
  assert.equal(error.kind, 'response');
  assert.equal(error.status, 502);
  assert.ok(error instanceof Error);
});