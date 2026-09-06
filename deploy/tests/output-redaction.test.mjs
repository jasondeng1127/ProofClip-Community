import assert from 'node:assert/strict';
import test from 'node:test';

import { formatFinalSummary } from '../deploy-core.mjs';

const forbidden = [
  'cf-api-token-secret-sentinel',
  'notion-client-secret-sentinel',
  'token-vault-secret-sentinel',
  'oauth-code-secret-sentinel',
  'authorization-secret-sentinel',
];

test('success summary contains only the public deployment handoff fields', () => {
  const summary = formatFinalSummary({
    ok: true,
    code: 'PASS',
    workerOrigin: 'https://proofclip-community.example.workers.dev',
    callbackUrl: 'https://proofclip-community.example.workers.dev/v1/auth/notion/callback',
    extensionDir: 'C:\\generated\\extension',
    workerName: 'proofclip-community',
    d1Name: 'proofclip-community',
    workerVersion: 'version-sentinel',
    accountId: forbidden[0],
    statePath: forbidden[1],
    stderr: forbidden.join(' '),
  });

  assert.match(summary, /Worker URL: https:\/\/proofclip-community\.example\.workers\.dev/);
  assert.match(summary, /Notion callback URL: https:\/\/proofclip-community\.example\.workers\.dev\/v1\/auth\/notion\/callback/);
  assert.match(summary, /Generated extension directory: C:\\generated\\extension/);
  assert.match(summary, /Worker name: proofclip-community/);
  assert.match(summary, /D1 name: proofclip-community/);
  assert.match(summary, /Worker version: version-sentinel/);
  assert.match(summary, /PASS/);
  for (const value of forbidden) assert.doesNotMatch(summary, new RegExp(value));
  assert.doesNotMatch(summary, /accountId|statePath|stderr/);
});

test('failure summary uses only a stable code and safe recovery guidance', () => {
  const summary = formatFinalSummary({
    ok: false,
    code: 'WRANGLER_FAILED',
    message: forbidden.join(' '),
    details: { stdout: forbidden[0], stderr: forbidden[1] },
  });
  assert.match(summary, /WRANGLER_FAILED/);
  assert.match(summary, /Next action:/);
  for (const value of forbidden) assert.doesNotMatch(summary, new RegExp(value));
  assert.doesNotMatch(summary, /stdout|stderr|details/);
});
