import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const script = resolve(root, 'scripts', 'verify-public-source.ps1');

test('public-source verification script exists and accepts the tracked Community baseline', () => {
  assert.equal(existsSync(script), true, 'scripts/verify-public-source.ps1 must exist');
  execFileSync('pwsh', ['-NoProfile', '-File', script, '-IncludeUntracked'], { cwd: root, stdio: 'pipe' });
});

test('public-source verification rejects changed and Official manifest keys and restores the manifest', async () => {
  const manifestPath = resolve(root, 'extension/src/manifest.json');
  const originalText = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(originalText);
  const officialKey = [
    'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQE',
    'Ap38/ucQBpWAS7SrcsZgu1auCseL2judE5wOuc+ezPZ61B0FsMP6G25jJuFfa6thfRkIW+dSEIwkxlq8zbu4ugz1trZQgqiyXMnGiJQV9Ohhz+m3okICFoKzL3xEnIsCAUWl7bZdoAK0jL6yl26MNCk57SCGOLlz+E48Sz3qy2otD03VxwYCZfo1b+/+YAFLJNEFJ7as4sdKkGPptOsqHpDu6+PcCe7fgB5IN5Wp1ponofnwAf6fFwjvuRlFdLSaprBqXo5WmJCe+76IkECO7f1CJVVlur8GXspgk2ZZZfk4cbqn9mtpZEiDJUp9PZFJ3Bt+U1VYyGbcfujdeavLbkwIDAQAB'
  ].join('');
  const changedKey = manifest.key.replace('oE6c', 'pE6c');

  function runVerificationExpectingFailure() {
    try {
      execFileSync('pwsh', ['-NoProfile', '-File', script, '-IncludeUntracked'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      assert.fail('public-source verification unexpectedly passed');
    } catch (error) {
      assert.notEqual(error.status, 0);
      return `${error.stdout || ''}\n${error.stderr || ''}`;
    }
  }

  try {
    for (const [label, key] of [['changed', changedKey], ['Official', officialKey]]) {
      await writeFile(manifestPath, JSON.stringify({ ...manifest, key }, null, 2) + '\n');
      const output = runVerificationExpectingFailure();
      assert.match(output, /stable public[\s|]+key|forbidden deployment identity/i, label);
    }
  } finally {
    await writeFile(manifestPath, originalText);
  }
  assert.equal(await readFile(manifestPath, 'utf8'), originalText);
});
