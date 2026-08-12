import assert from 'node:assert/strict';
import test from 'node:test';
import { getInstallId, proofclipApi, ProofClipApiError } from '../core/proofclip-api.mjs';

const COMMUNITY_API_ORIGIN = 'https://community.example.test';
const communityApi = (path, options) => proofclipApi(path, { apiOrigin: COMMUNITY_API_ORIGIN, ...options });

test('getInstallId creates and then reuses a valid high-entropy local identifier', async () => {
  const values = {};
  const storage = { async get(key) { return { [key]: values[key] }; }, async set(next) { Object.assign(values, next); } };
  const first = await getInstallId(storage);
  const second = await getInstallId(storage);
  assert.match(first, /^proofclip_[A-Za-z0-9_-]{32}$/);
  assert.equal(second, first);
});

test('proofclipApi sends only the installation identifier to the ProofClip service', async () => {
  const storage = { async get() { return { proofclipInstallId: 'proofclip_1234567890abcdefghijklmnopqrstuv' }; }, async set() {} };
  let captured;
  const result = await communityApi('/v1/connection', {
    storage,
    fetchImpl: async (url, init) => {
      captured = { url, init };
      return new Response(JSON.stringify({ connected: false }), { status: 200 });
    }
  });
  assert.equal(result.connected, false);
  assert.equal(captured.url, 'https://community.example.test/v1/connection');
  assert.equal(captured.init.headers['X-ProofClip-Install-Id'], 'proofclip_1234567890abcdefghijklmnopqrstuv');
  assert.equal('Authorization' in captured.init.headers, false);
});

test('ProofClipApiError is an Error with kind and optional status', () => {
  const error = new ProofClipApiError('Bad request', { kind: 'response', status: 400 });
  assert.ok(error instanceof Error);
  assert.ok(error instanceof ProofClipApiError);
  assert.equal(error.kind, 'response');
  assert.equal(error.status, 400);
  assert.equal(error.message, 'Bad request');
});

test('ProofClipApiError without status omits the property', () => {
  const error = new ProofClipApiError('Network error', { kind: 'network' });
  assert.equal(error.kind, 'network');
  assert.equal(error.status, undefined);
});

test('proofclipApi throws ProofClipApiError with kind response on a 400', async () => {
  const storage = { async get() { return { proofclipInstallId: 'proofclip_1234567890abcdefghijklmnopqrstuv' }; }, async set() {} };
  const response = new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
  await assert.rejects(
    () => communityApi('/v1/captures', { storage, method: 'POST', body: {}, fetchImpl: async () => response }),
    (error) => {
      assert.ok(error instanceof ProofClipApiError);
      assert.equal(error.kind, 'response');
      assert.equal(error.status, 400);
      return true;
    }
  );
});

test('proofclipApi throws ProofClipApiError with kind response on a 429', async () => {
  const storage = { async get() { return { proofclipInstallId: 'proofclip_1234567890abcdefghijklmnopqrstuv' }; }, async set() {} };
  const response = new Response(JSON.stringify({ error: 'Rate limited' }), { status: 429 });
  await assert.rejects(
    () => communityApi('/v1/captures', { storage, method: 'POST', body: {}, fetchImpl: async () => response }),
    (error) => {
      assert.ok(error instanceof ProofClipApiError);
      assert.equal(error.kind, 'response');
      assert.equal(error.status, 429);
      return true;
    }
  );
});

test('proofclipApi throws ProofClipApiError with kind response on a 500', async () => {
  const storage = { async get() { return { proofclipInstallId: 'proofclip_1234567890abcdefghijklmnopqrstuv' }; }, async set() {} };
  const response = new Response('Internal Server Error', { status: 500 });
  await assert.rejects(
    () => communityApi('/v1/captures', { storage, method: 'POST', body: {}, fetchImpl: async () => response }),
    (error) => {
      assert.ok(error instanceof ProofClipApiError);
      assert.equal(error.kind, 'response');
      assert.equal(error.status, 500);
      return true;
    }
  );
});

test('proofclipApi throws ProofClipApiError with kind network on fetch rejection', async () => {
  const storage = { async get() { return { proofclipInstallId: 'proofclip_1234567890abcdefghijklmnopqrstuv' }; }, async set() {} };
  await assert.rejects(
    () => communityApi('/v1/connection', { storage, fetchImpl: async () => { throw new Error('Connection refused'); } }),
    (error) => {
      assert.ok(error instanceof ProofClipApiError);
      assert.equal(error.kind, 'network');
      assert.equal(error.status, undefined);
      return true;
    }
  );
});

test('proofclipApi throws ProofClipApiError with kind response when JSON parsing fails on a non-ok response', async () => {
  const storage = { async get() { return { proofclipInstallId: 'proofclip_1234567890abcdefghijklmnopqrstuv' }; }, async set() {} };
  const response = new Response('not json', { status: 502, headers: { 'Content-Type': 'text/html' } });
  await assert.rejects(
    () => communityApi('/v1/captures', { storage, method: 'POST', body: {}, fetchImpl: async () => response }),
    (error) => {
      assert.ok(error instanceof ProofClipApiError);
      assert.equal(error.kind, 'response');
      return true;
    }
  );
});

test('proofclipApi does not disclose Authorization or credential headers', async () => {
  const storage = { async get() { return { proofclipInstallId: 'proofclip_1234567890abcdefghijklmnopqrstuv' }; }, async set() {} };
  let captured;
  const response = new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  try { await communityApi('/v1/captures', { storage, method: 'POST', body: {}, fetchImpl: async (url, init) => { captured = init; return response; } }); } catch {}
  assert.equal('Authorization' in captured.headers, false);
  assert.equal('Cookie' in captured.headers, false);
});
