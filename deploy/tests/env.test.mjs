import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REQUIRED_ENV_KEYS, loadDeployEnv } from '../lib/env.mjs';
import { redactText } from '../lib/errors.mjs';

test('required env keys stay stable', async () => {
  assert.deepEqual(REQUIRED_ENV_KEYS, [
    'CF_API_TOKEN',
    'NOTION_CLIENT_ID',
    'NOTION_CLIENT_SECRET',
  ]);
});

test('tracked deploy env is rejected', async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'proofclip-deploy-'));
  const envFile = join(repoRoot, 'deploy.env');
  await writeFile(envFile, 'CF_API_TOKEN=a\nNOTION_CLIENT_ID=b\nNOTION_CLIENT_SECRET=c\n', 'utf8');
  await assert.rejects(
    loadDeployEnv({ filePath: envFile, repoRoot, gitFiles: async () => ['deploy/deploy.env'] }),
    (error) => error.code === 'DEPLOY_ENV_TRACKED',
  );
});

test('missing deploy env is rejected', async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'proofclip-deploy-'));
  const envFile = join(repoRoot, 'deploy.env');
  await assert.rejects(
    loadDeployEnv({ filePath: envFile, repoRoot, gitFiles: async () => [] }),
    (error) => error.code === 'DEPLOY_ENV_MISSING',
  );
});

test('valid deploy env returns only required keys', async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), 'proofclip-deploy-'));
  const envFile = join(repoRoot, 'deploy.env');
  await writeFile(
    envFile,
    [
      'CF_API_TOKEN=token-123',
      'NOTION_CLIENT_ID=client-123',
      'NOTION_CLIENT_SECRET=secret-123',
      'EXTRA_KEY=ignore-me',
    ].join('\n'),
    'utf8',
  );
  const values = await loadDeployEnv({ filePath: envFile, repoRoot, gitFiles: async () => [] });
  assert.deepEqual(values, {
    cfApiToken: 'token-123',
    notionClientId: 'client-123',
    notionClientSecret: 'secret-123',
  });
  const synthetic = 'token-123 client-123 secret-123';
  assert.equal(redactText(synthetic), '[REDACTED] [REDACTED] [REDACTED]');
});
