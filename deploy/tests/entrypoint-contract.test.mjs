import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readRequired(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  assert.ok(existsSync(absolutePath), `${relativePath} must exist`);
  return readFileSync(absolutePath, 'utf8');
}

test('PowerShell entrypoint delegates from the candidate root', () => {
  const source = readRequired('deploy/deploy.ps1');

  assert.match(source, /\$PSScriptRoot/);
  assert.match(source, /deploy-core\.mjs/);
  assert.match(source, /deploy\.env/);
  assert.match(source, /npm\s+ci\s+--prefix\s+deploy/);
  assert.match(source, /node_modules\/\.bin\/\$wranglerExecutable/);
  assert.match(source, /\$IsWindows/);
  assert.match(source, /wrangler\.cmd/);
  assert.match(source, /wrangler/);
  assert.match(source, /Test-Path[\s\S]*\$wranglerPath/);
  assert.match(source, /exit \$exitCode/);
  assert.doesNotMatch(source, /NOTION_CLIENT_SECRET=/);
  assert.doesNotMatch(source, /TOKEN_VAULT_KEY=/);
  assert.doesNotMatch(source, /--extension-id/);
});

test('POSIX entrypoint delegates from the candidate root', () => {
  const source = readRequired('deploy/deploy.sh');

  assert.match(source, /SCRIPT_DIR/);
  assert.match(source, /deploy-core\.mjs/);
  assert.match(source, /deploy\.env/);
  assert.match(source, /npm\s+ci\s+--prefix\s+deploy/);
  assert.match(source, /command\s+-v\s+node/);
  assert.match(source, /command\s+-v\s+npm/);
  assert.match(source, /node_modules\/\.bin\/wrangler/);
  assert.match(source, /\[\s*!\s+-e\s+"\$WRANGLER_PATH"\s+\]/);
  assert.ok(source.includes('"$#" -ne 0'), 'POSIX wrapper must compare the argument count');
  assert.match(source, /does not accept positional arguments/);
  assert.match(source, /exit 2/);
  const argumentGuard = source.indexOf('"$#" -ne 0');
  assert.ok(argumentGuard >= 0, 'POSIX wrapper must guard positional arguments');
  assert.ok(argumentGuard < source.indexOf('command -v node'), 'POSIX argument guard must run before command checks');
  assert.ok(argumentGuard < source.indexOf('npm ci --prefix deploy'), 'POSIX argument guard must run before install');
  assert.ok(argumentGuard < source.indexOf('node deploy/deploy-core.mjs'), 'POSIX argument guard must run before execution');
  assert.doesNotMatch(source, /printf[\s\S]*\$[@*]/);
  assert.match(source, /exit \$\?/);
  assert.doesNotMatch(source, /NOTION_CLIENT_SECRET=/);
  assert.doesNotMatch(source, /TOKEN_VAULT_KEY=/);
  assert.doesNotMatch(source, /--extension-id/);
});

test('beginner guide contains the exact three-value input block', () => {
  const guide = readRequired('docs/community-0.8.1-deployment.md');
  const inputBlock = [
    'copy deploy/deploy.env.example deploy/deploy.env',
    'fill CF_API_TOKEN, NOTION_CLIENT_ID, NOTION_CLIENT_SECRET',
    'pwsh -File deploy/deploy.ps1'
  ].join('\n');

  assert.ok(guide.includes(inputBlock), 'guide must contain the exact three-value input block');
  assert.match(guide, /save the printed callback URL/i);
  assert.match(guide, /generated extension directory/i);
  assert.match(guide, /Load unpacked/);
  for (const forbidden of [
    'Extension ID',
    'Account ID',
    'Worker name',
    'D1 ID',
    'TOKEN_VAULT_KEY',
    'edit source'
  ]) {
    assert.doesNotMatch(guide, new RegExp(forbidden.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'i'), `guide must not ask for ${forbidden}`);
  }
});

test('root README identifies the Community 0.8.1 deployment path', () => {
  const readme = readRequired('README.md');

  assert.match(readme, /Community 0\.8\.1/);
  assert.match(readme, /docs\/community-0\.8\.1-deployment\.md/);
  assert.match(readme, /Richer full-page capture/);
  assert.match(readme, /Stronger privacy safeguards/);
});
