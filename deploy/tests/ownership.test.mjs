import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveDeploymentResources } from '../lib/ownership.mjs';

const names = {
  workerName: 'proofclip-community',
  d1Name: 'proofclip-community',
  marker: 'community-0.8.1'
};

const candidate = {
  extensionId: 'extension-id-sentinel',
  workerOrigin: 'https://worker.example',
  candidateCommit: 'candidate-commit-sentinel',
  candidateSha256: 'candidate-sha256-sentinel'
};

const state = {
  schemaVersion: 1,
  accountId: 'account-id',
  workerId: 'worker-id',
  workerName: names.workerName,
  d1Id: 'd1-id',
  d1Name: names.d1Name,
  extensionId: candidate.extensionId,
  candidateCommit: candidate.candidateCommit,
  candidateSha256: candidate.candidateSha256
};

function ownedWorker(overrides = {}) {
  return {
    id: 'worker-id',
    name: names.workerName,
    type: 'worker',
    marker: names.marker,
    candidateCommit: candidate.candidateCommit,
    candidateSha256: candidate.candidateSha256,
    vars: {
      PROOFCLIP_DEPLOYMENT_MARKER: names.marker,
      PROOFCLIP_EXTENSION_ID: candidate.extensionId,
      NOTION_REDIRECT_URI: 'https://worker.example/v1/auth/notion/callback'
    },
    bindings: [{ name: 'DB', type: 'd1', database_id: 'd1-id' }],
    ...overrides
  };
}

function ownedD1(overrides = {}) {
  return { uuid: 'd1-id', id: 'd1-id', name: names.d1Name, ...overrides };
}

function fakeCloudflare({ accounts = [{ id: 'account-id' }], worker = null, d1 = null } = {}) {
  const calls = { verifyToken: 0, getWorker: 0, getD1: 0, createD1: 0, updateWorker: 0 };
  return {
    calls,
    async verifyToken() { calls.verifyToken += 1; },
    async listAccounts() { return accounts; },
    async getWorker() { calls.getWorker += 1; return worker; },
    async getD1() { calls.getD1 += 1; return d1; },
    async createD1() { calls.createD1 += 1; return ownedD1({ uuid: 'created-d1-id', id: 'created-d1-id' }); },
    async updateWorker() { calls.updateWorker += 1; }
  };
}

test('ambiguous accounts stop before any resource creation', async () => {
  const cloudflare = fakeCloudflare({ accounts: [{ id: 'account-a' }, { id: 'account-b' }] });
  await assert.rejects(
    resolveDeploymentResources({ cloudflare, state: null, candidate, names }),
    (error) => error.code === 'CLOUDFLARE_ACCOUNT_AMBIGUOUS'
  );
  assert.equal(cloudflare.calls.createD1, 0);
  assert.equal(cloudflare.calls.getWorker, 0);
});

test('a same-named resource without local ownership is not claimed', async () => {
  const cloudflare = fakeCloudflare({ worker: { id: 'unknown-worker', name: names.workerName } });
  await assert.rejects(
    resolveDeploymentResources({ cloudflare, state: null, candidate, names }),
    (error) => error.code === 'RESOURCE_OWNERSHIP_UNVERIFIED'
  );
  assert.equal(cloudflare.calls.createD1, 0);
  assert.equal(cloudflare.calls.updateWorker, 0);
});

test('first run creates only the missing deterministic D1 and returns create actions', async () => {
  const cloudflare = fakeCloudflare();
  const result = await resolveDeploymentResources({ cloudflare, state: null, candidate, names });
  assert.equal(result.accountId, 'account-id');
  assert.equal(result.workerAction, 'create');
  assert.equal(result.d1Action, 'create');
  assert.equal(result.d1.id, 'created-d1-id');
  assert.equal(result.workerOrigin, 'https://worker.example');
  assert.equal(cloudflare.calls.createD1, 1);
});

test('owned second run reuses the Worker and D1 without updates', async () => {
  const cloudflare = fakeCloudflare({ worker: ownedWorker(), d1: ownedD1() });
  const result = await resolveDeploymentResources({ cloudflare, state, candidate, names });
  assert.deepEqual(
    { workerAction: result.workerAction, d1Action: result.d1Action },
    { workerAction: 'reuse', d1Action: 'reuse' }
  );
  assert.equal(result.accountId, state.accountId);
  assert.equal(result.worker.id, state.workerId);
  assert.equal(result.d1.id, state.d1Id);
  assert.equal(result.workerOrigin, candidate.workerOrigin);
  assert.equal(cloudflare.calls.createD1, 0);
  assert.equal(cloudflare.calls.updateWorker, 0);
});

test('caller-overridden Worker and D1 names are rejected before discovery or creation', async () => {
  const cloudflare = fakeCloudflare();
  await assert.rejects(
    resolveDeploymentResources({
      cloudflare,
      state: null,
      candidate,
      names: { workerName: 'proofclip-community-2', d1Name: 'proofclip-community-2', marker: names.marker }
    }),
    (error) => error.code === 'RESOURCE_CONFLICT'
  );
  assert.equal(cloudflare.calls.getWorker, 0);
  assert.equal(cloudflare.calls.createD1, 0);
});

test('missing remote candidate identity is a conflict and cannot be reused', async () => {
  const remoteWorker = ownedWorker();
  delete remoteWorker.candidateCommit;
  delete remoteWorker.candidateSha256;
  const cloudflare = fakeCloudflare({ worker: remoteWorker, d1: ownedD1() });
  await assert.rejects(
    resolveDeploymentResources({ cloudflare, state, candidate, names }),
    (error) => error.code === 'RESOURCE_CONFLICT'
  );
  assert.equal(cloudflare.calls.createD1, 0);
  assert.equal(cloudflare.calls.updateWorker, 0);
});

test('a non-Worker remote resource cannot be reused', async () => {
  const cloudflare = fakeCloudflare({ worker: ownedWorker({ type: 'pages_project' }), d1: ownedD1() });
  await assert.rejects(
    resolveDeploymentResources({ cloudflare, state, candidate, names }),
    (error) => error.code === 'RESOURCE_CONFLICT'
  );
});

test('local state rejects extra credential, token, secret, and vault fields', async () => {
  const cloudflare = fakeCloudflare();
  const invalidState = {
    ...state,
    CF_API_TOKEN: 'cf-api-token-sentinel',
    NOTION_CLIENT_SECRET: 'client-secret-sentinel',
    TOKEN_VAULT_KEY: 'vault-key-sentinel'
  };
  await assert.rejects(
    resolveDeploymentResources({ cloudflare, state: invalidState, candidate, names }),
    (error) => error.code === 'DEPLOYMENT_STATE_INVALID'
      && !error.message.includes('cf-api-token-sentinel')
      && !error.message.includes('client-secret-sentinel')
      && !error.message.includes('vault-key-sentinel')
  );
  assert.equal(cloudflare.calls.verifyToken, 0);
  assert.equal(cloudflare.calls.getWorker, 0);
});

for (const [label, mutate] of [
  ['Extension ID', (worker) => ({ ...worker, vars: { ...worker.vars, PROOFCLIP_EXTENSION_ID: 'changed-extension-id' } })],
  ['D1 ID', (worker) => ({ ...worker, bindings: [{ name: 'DB', type: 'd1', database_id: 'changed-d1-id' }] })],
  ['marker', (worker) => ({ ...worker, marker: 'changed-marker', vars: { ...worker.vars, PROOFCLIP_DEPLOYMENT_MARKER: 'changed-marker' } })],
  ['callback origin', (worker) => ({ ...worker, vars: { ...worker.vars, NOTION_REDIRECT_URI: 'https://other.example/v1/auth/notion/callback' } })]
]) {
  test(`changed ${label} is a conflict with no update`, async () => {
    const cloudflare = fakeCloudflare({ worker: mutate(ownedWorker()), d1: ownedD1() });
    await assert.rejects(
      resolveDeploymentResources({ cloudflare, state, candidate, names }),
      (error) => error.code === 'RESOURCE_CONFLICT'
    );
    assert.equal(cloudflare.calls.createD1, 0);
    assert.equal(cloudflare.calls.updateWorker, 0);
  });
}
