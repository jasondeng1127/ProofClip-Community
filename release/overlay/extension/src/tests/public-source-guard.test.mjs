import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const script = resolve(root, 'scripts', 'verify-public-source.ps1');

test('public-source verification script exists and accepts the tracked Community baseline', () => {
  assert.equal(existsSync(script), true, 'scripts/verify-public-source.ps1 must exist');
  execFileSync('pwsh', ['-NoProfile', '-File', script, '-IncludeUntracked'], { cwd: root, stdio: 'pipe' });
});
