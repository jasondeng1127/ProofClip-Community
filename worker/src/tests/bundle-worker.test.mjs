import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('deployment bundle retains OAuth, Notion delivery, and rate limiting without commercial modules', async () => {
  execFileSync(process.execPath, [resolve(root, 'scripts/bundle-worker.mjs')], { cwd: root, stdio: 'pipe' });
  const bundle = await readFile(resolve(root, 'dist/worker.mjs'), 'utf8');
  execFileSync(process.execPath, ['--check', resolve(root, 'dist/worker.mjs')], { cwd: root, stdio: 'pipe' });
  assert.match(bundle, /function createOAuthState\(/);
  assert.match(bundle, /function writeCapture\(/);
  assert.match(bundle, /function createRateLimiter\(/);
  assert.doesNotMatch(bundle, new RegExp(['/v1/', 'lic', 'ense'].join('')));
  assert.doesNotMatch(bundle, new RegExp(['/v1/webhooks/', 'le', 'mon'].join('')));
});
