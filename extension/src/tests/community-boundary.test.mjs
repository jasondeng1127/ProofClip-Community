import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as api from '../core/proofclip-api.mjs';

const STABLE_PUBLIC_KEY = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoE6clBamwq6eJy+8TWYYbrDkUwCOB8b0X3sN7y67BY/qfHsNEgSNgLRsdE7EK+kaQRI1hr0cCRizkmDypEpEuL3YqNsgXI2nZMJjO9uRKirPLhi78vWybVc1EDVhl6gGqftg6rbWPHvlhx2SCMoUknpZ7q+d5eM0TPqF6F3SEFURA7SHyKTuSbTURrQbGfqkVwNukH5vWyojDKQW5Sk3r5ixI//5nxQOC+d5+rkutrd0hkZFEEus+Ty54Y/7u1CrVT7zjLH0Qw8xZ7ajnwHaZe2RFpVZMCPn+9y4EZvieXAmN/j048HPCEg0HFcTFTIfrGLRHGASorE8nPWcFb/AkQIDAQAB';
const OFFICIAL_PUBLIC_KEY = [
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE',
  'Ap38/ucQBpWAS7SrcsZgu1auCseL2judE5wOuc+ezPZ61B0FsMP6G25jJuFfa6thfRkIW+dSEIwkxlq8zbu4ugz1trZQgqiyXMnGiJQV9Ohhz+m3okICFoKzL3xEnIsCAUWl7bZdoAK0jL6yl26MNCk57SCGOLlz+E48Sz3qy2otD03VxwYCZfo1b+/+YAFLJNEFJ7as4sdKkGPptOsqHpDu6+PcCe7fgB5IN5Wp1ponofnwAf6fFwjvuRlFdLSaprBqXo5WmJCe+76IkECO7f1CJVVlur8GXspgk2ZZZfk4cbqn9mtpZEiDJUp9PZFJ3Bt+U1VYyGbcfujdeavLbkwIDAQAB'
].join('');

test('Community API origin accepts only a normalized HTTPS deployer endpoint', () => {
  assert.equal(typeof api.getProofClipApiOrigin, 'function');
  assert.equal(api.getProofClipApiOrigin('https://demo.example.workers.dev/'), 'https://demo.example.workers.dev');
  assert.throws(() => api.getProofClipApiOrigin('http://localhost:8787'), { name: 'ProofClipApiError' });
});

test('Community manifest carries its stable public key but no Official identity', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.key, STABLE_PUBLIC_KEY);
  assert.notEqual(manifest.key, OFFICIAL_PUBLIC_KEY);
  assert.ok(!JSON.stringify(manifest).includes(OFFICIAL_PUBLIC_KEY));
  assert.deepEqual(manifest.host_permissions, ['<all_urls>']);
  assert.ok(!manifest.host_permissions.some((entry) => /jasondeng1127|proofclip-api/.test(entry)));
});

test('community config is a non-routable placeholder until a deployer replaces it', async () => {
  const config = await readFile(new URL('../community-config.mjs', import.meta.url), 'utf8');
  assert.match(config, /replace-me\.invalid/);
  assert.doesNotMatch(config, /workers\.dev/);
});
