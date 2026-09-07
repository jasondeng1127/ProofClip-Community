import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { runCommunity081OfflineChecks, resolveOfflineCommunity081Verifier } from '../../release/ci-release-gates.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const acceptancePath = join(repoRoot, 'docs/acceptance/community-0.8.1-cloudflare-deploy-gate.md');
const runSuitesPath = join(repoRoot, 'release/run-suites.mjs');
const ciGatesPath = join(repoRoot, 'release/ci-release-gates.mjs');

function readIfPresent(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

test('Community 0.8.1 gate documents every required offline command family', () => {
  const gate = readIfPresent(acceptancePath);
  const requiredCommands = [
    'node --test deploy/tests/*.test.mjs',
    'node --test deploy/tests/identity.test.mjs deploy/tests/origin.test.mjs deploy/tests/wrangler-template-contract.test.mjs extension/src/tests/extension-id.test.mjs',
    'node --test release/tests/community-0.8.1-export.test.mjs release/tests/community-0.8.1-provenance.test.mjs',
    'node --test extension/src/tests/*.test.mjs worker/src/tests/*.test.mjs',
    'node --test deploy/tests/complete-contract.test.mjs',
    'node release/verify-community-0.8.1.mjs --candidate=release/out/community-0.8.1',
  ];

  for (const command of requiredCommands) {
    assert.ok(gate.includes(command), `acceptance gate must document: ${command}`);
  }
});

test('Community 0.8.1 gate records the exact human outcomes', () => {
  const gate = readIfPresent(acceptancePath);
  const requiredOutcomes = [
    'Notion connected',
    'Data Source configured',
    'one capture',
    'Notion page created',
    'Delivery SENT',
    'Outbox 0',
    '/privacy HTTP 200',
    'second deploy reuses Worker/D1',
    'invalid token creates no resource',
    'valid-origin CORS passes',
    'invalid-origin CORS rejected',
  ];

  for (const outcome of requiredOutcomes) {
    assert.ok(gate.includes(outcome), `acceptance gate must record exact outcome: ${outcome}`);
  }
});

test('release wiring exposes the offline Community 0.8.1 deployment contract', () => {
  const runSuites = readIfPresent(runSuitesPath);
  const ciGates = readIfPresent(ciGatesPath);

  assert.match(runSuites, /deploymentContract/);
  assert.match(runSuites, /complete-contract\.test\.mjs/);
  assert.match(ciGates, /verify-community-0\.8\.1\.mjs/);
  assert.match(ciGates, /complete-contract\.test\.mjs/);
  assert.match(ciGates, /CANDIDATE_ABSENT/);
  assert.match(ciGates, /VERIFIER_NOT_RUN/);
  assert.doesNotMatch(ciGates, /community-0\.8\.1-(?:export|provenance)\.test\.mjs/);
  assert.doesNotMatch(ciGates, /api\.cloudflare\.com|notion\.so|fetch\s*\(/i);
});

test('CI reports candidate absence without substituting tests or contacting a network', async () => {
  const root = await mkdtemp(join(tmpdir(), 'proofclip-ci-no-candidate-'));
  try {
    const resolved = resolveOfflineCommunity081Verifier(root);
    assert.equal(resolved.present, false);
    assert.equal(resolved.finding, 'CANDIDATE_ABSENT / VERIFIER_NOT_RUN');
    const result = runCommunity081OfflineChecks({ root });
    assert.equal(result.ok, false);
    assert.deepEqual(result.findings, ['CANDIDATE_ABSENT / VERIFIER_NOT_RUN']);
    assert.equal(result.verifier, 'not-run');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
