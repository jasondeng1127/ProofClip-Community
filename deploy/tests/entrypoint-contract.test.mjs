import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { promisify } from 'node:util';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const execFileAsync = promisify(execFile);

function findCommand(candidates, args) {
  for (const command of candidates) {
    const result = spawnSync(command, args, { stdio: 'ignore', windowsHide: true });
    if (!result.error && result.status === 0) return command;
  }
  return null;
}

const powerShellCommand = findCommand(['pwsh', 'powershell'], ['-NoLogo', '-NoProfile', '-Command', 'exit 0']);

function findPosixShell() {
  const candidates = process.platform === 'win32'
    ? [
      'sh',
      'bash',
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files\\Git\\usr\\bin\\sh.exe'
    ]
    : ['sh', 'bash'];
  return findCommand(candidates, ['-c', 'exit 0']);
}

const posixShellCommand = findPosixShell();

async function runProcess(command, args, options) {
  try {
    const result = await execFileAsync(command, args, {
      ...options,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: typeof error.code === 'number' ? error.code : 1,
      stdout: error.stdout || '',
      stderr: error.stderr || ''
    };
  }
}

function shellPath(value) {
  return process.platform === 'win32' ? value.replaceAll('\\', '/') : value;
}

async function createExecutionSentinels(root) {
  const bin = resolve(root, 'fake-bin');
  const marker = resolve(root, 'executed.marker');
  await mkdir(bin, { recursive: true });
  await writeFile(resolve(bin, 'node.cmd'), `@echo off\r\n> "${marker}" echo node\r\nexit /b 97\r\n`, 'utf8');
  await writeFile(resolve(bin, 'npm.cmd'), `@echo off\r\n> "${marker}" echo npm\r\nexit /b 97\r\n`, 'utf8');
  await writeFile(resolve(bin, 'node'), `#!/bin/sh\nprintf '%s\\n' node > '${shellPath(marker)}'\nexit 97\n`, 'utf8');
  await writeFile(resolve(bin, 'npm'), `#!/bin/sh\nprintf '%s\\n' npm > '${shellPath(marker)}'\nexit 97\n`, 'utf8');
  await chmod(resolve(bin, 'node'), 0o755);
  await chmod(resolve(bin, 'npm'), 0o755);
  return { bin, marker };
}

function withFakePath(bin) {
  const currentPath = process.env.PATH || '';
  return { ...process.env, PATH: `${bin}${process.platform === 'win32' ? ';' : ':'}${currentPath}` };
}

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
  assert.match(source, /RemainingArguments/);
  assert.match(source, /does not accept positional arguments/);
  assert.match(source, /exit 2/);
  assert.ok(source.indexOf('RemainingArguments') < source.indexOf('Get-Command node'), 'PowerShell argument guard must run before node checks');
  assert.match(source, /exit \$exitCode/);
  assert.doesNotMatch(source, /NOTION_CLIENT_SECRET=/);
  assert.doesNotMatch(source, /TOKEN_VAULT_KEY=/);
  assert.doesNotMatch(source, /--extension-id/);
});

test('PowerShell wrapper rejects a positional argument before node, npm, install, or core execution', { skip: !powerShellCommand }, async () => {
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), 'proofclip-task-6-ps-'));
  try {
    const { bin, marker } = await createExecutionSentinels(fixtureRoot);
    const result = await runProcess(powerShellCommand, [
      '-NoLogo',
      '-NoProfile',
      '-File',
      resolve(repoRoot, 'deploy', 'deploy.ps1'),
      'proofclip-positional-sentinel'
    ], { cwd: repoRoot, env: withFakePath(bin) });

    assert.equal(result.code, 2);
    assert.match(`${result.stdout}${result.stderr}`, /does not accept positional arguments/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /proofclip-positional-sentinel/);
    assert.equal(existsSync(marker), false, 'node/npm/install/core must not execute');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
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

test('POSIX wrapper rejects a positional argument before node, npm, install, or core execution', {
  skip: posixShellCommand ? false : 'No executable POSIX shell was available on this Windows host'
}, async () => {
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), 'proofclip-task-6-posix-'));
  try {
    const { bin, marker } = await createExecutionSentinels(fixtureRoot);
    const result = await runProcess(posixShellCommand, [
      resolve(repoRoot, 'deploy', 'deploy.sh'),
      'proofclip-positional-sentinel'
    ], { cwd: repoRoot, env: withFakePath(bin) });

    assert.equal(result.code, 2);
    assert.match(`${result.stdout}${result.stderr}`, /does not accept positional arguments/);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /proofclip-positional-sentinel/);
    assert.equal(existsSync(marker), false, 'node/npm/install/core must not execute');
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
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
