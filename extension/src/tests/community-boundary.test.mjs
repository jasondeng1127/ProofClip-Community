import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from '../core/proofclip-api.mjs';

test('Community API origin accepts only a normalized HTTPS deployer endpoint', () => {
  assert.equal(typeof api.getProofClipApiOrigin, 'function');
  const origin = ['https://demo.example', '.workers.dev'].join('');
  assert.equal(api.getProofClipApiOrigin(`${origin}/`), origin);
  assert.throws(() => api.getProofClipApiOrigin('http://localhost:8787'), { name: 'ProofClipApiError' });
});

test('Community manifest contains no Official Worker origin or fixed CWS key', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.key, undefined);
  assert.ok(!manifest.host_permissions.some((entry) => /jasondeng1127|proofclip-api/.test(entry)));
});
