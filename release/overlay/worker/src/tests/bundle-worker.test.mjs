import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const node = process.execPath;

test('deployment bundle contains Community routes and no commercial modules', async () => {
  execFileSync(node, [resolve(root, 'scripts/bundle-worker.mjs')], { cwd: root, stdio: 'pipe' });
  const bundle = await readFile(resolve(root, 'dist/worker.mjs'), 'utf8');
  execFileSync(node, ['--check', resolve(root, 'dist/worker.mjs')], { cwd: root, stdio: 'pipe' });
  for (const marker of ['/v1/captures', '/v1/data-sources', '/v1/auth/start', '/privacy', 'createRateLimiter']) {
    assert.ok(bundle.includes(marker), marker + ' must be bundled');
  }
  for (const marker of ['/v1/license', '/v1/usage/report', '/v1/webhooks/lemon', 'lemonsqueezy', 'generateKey', 'publicEntitlementFor', 'subscription']) {
    assert.ok(!bundle.includes(marker), marker + ' must not be bundled');
  }
});

test('bundle modules exclude commercial sources', async () => {
  const script = await readFile(resolve(root, 'scripts/bundle-worker.mjs'), 'utf8');
  for (const moduleName of ['subscription.mjs', 'lemon-license.mjs']) assert.ok(!script.includes(moduleName), moduleName + ' must not be listed');
  for (const moduleName of ['identity.mjs', 'oauth.mjs', 'token-vault.mjs', 'd1-repository.mjs', 'notion-proxy.mjs', 'rate-limit.mjs', 'worker.mjs', 'index.mjs']) {
    assert.ok(script.includes(moduleName), moduleName + ' must be listed');
  }
});
