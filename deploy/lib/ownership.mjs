import { DeployError } from './errors.mjs';
import { buildNotionRedirectUri, normalizeHttpsOrigin } from './origin.mjs';

const DEFAULT_WORKER_NAME = 'proofclip-community';
const DEFAULT_D1_NAME = 'proofclip-community';
const DEFAULT_MARKER = 'community-0.8.1';
const LOCAL_STATE_FIELDS = new Set([
  'schemaVersion',
  'accountId',
  'workerId',
  'workerName',
  'd1Id',
  'd1Name',
  'extensionId',
  'candidateCommit',
  'candidateSha256'
]);

function fail(code, message, details = {}) {
  throw new DeployError(code, message, details);
}

function text(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function resourceId(resource) {
  return text(resource?.id) || text(resource?.uuid) || text(resource?.database_id);
}

function resourceName(resource) {
  return text(resource?.name) || text(resource?.script_name);
}

function variable(source, keys) {
  if (!source) return null;
  if (Array.isArray(source)) {
    const found = source.find((entry) => keys.includes(entry?.name));
    return text(found?.value);
  }
  if (typeof source !== 'object') return null;
  for (const key of keys) {
    if (text(source[key])) return source[key];
  }
  return null;
}

function workerVariable(worker, keys) {
  for (const source of [
    worker,
    worker?.vars,
    worker?.settings,
    worker?.settings?.vars,
    worker?.config,
    worker?.config?.vars,
    worker?.environment,
    worker?.env
  ]) {
    const value = variable(source, keys);
    if (value) return value;
  }
  return null;
}

function workerBinding(worker, bindingName) {
  const sources = [
    worker?.bindings,
    worker?.settings?.bindings,
    worker?.config?.bindings,
    worker?.d1_databases,
    worker?.settings?.d1_databases,
    worker?.config?.d1_databases
  ];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    const binding = source.find((entry) => entry?.name === bindingName || entry?.binding === bindingName);
    if (binding) return binding;
  }
  return null;
}

function originFromCandidate(candidate) {
  if (text(candidate?.workerOrigin)) return normalizeHttpsOrigin(candidate.workerOrigin);
  if (text(candidate?.origin)) return normalizeHttpsOrigin(candidate.origin);
  if (text(candidate?.redirectUri)) {
    const suffix = '/v1/auth/notion/callback';
    if (!candidate.redirectUri.endsWith(suffix)) fail('RESOURCE_CONFLICT', 'Candidate callback origin is not canonical.');
    return normalizeHttpsOrigin(candidate.redirectUri.slice(0, -suffix.length));
  }
  fail('RESOURCE_CONFLICT', 'Candidate Worker origin is required.');
}

function resolveNames(names = {}) {
  names ||= {};
  const workerName = text(names.workerName) || text(names.worker) || DEFAULT_WORKER_NAME;
  const d1Name = text(names.d1Name) || text(names.d1) || DEFAULT_D1_NAME;
  const marker = text(names.marker) || DEFAULT_MARKER;
  if (workerName !== DEFAULT_WORKER_NAME || d1Name !== DEFAULT_D1_NAME || marker !== DEFAULT_MARKER) {
    fail('RESOURCE_CONFLICT', 'Task 4 resource names and marker are deterministic and cannot be overridden.');
  }
  return { workerName: DEFAULT_WORKER_NAME, d1Name: DEFAULT_D1_NAME, marker: DEFAULT_MARKER };
}

function usableAccounts(value) {
  const accounts = Array.isArray(value) ? value : value?.result;
  return (Array.isArray(accounts) ? accounts : []).filter((account) => text(account?.id));
}

function assertLocalState(state, expected) {
  if (!state) return;
  const fields = [
    ['schemaVersion', 1],
    ['accountId', expected.accountId],
    ['workerName', expected.workerName],
    ['d1Name', expected.d1Name],
    ['extensionId', expected.extensionId],
    ['candidateCommit', expected.candidateCommit],
    ['candidateSha256', expected.candidateSha256]
  ];
  for (const [field, value] of fields) {
    if (state[field] !== value) fail('RESOURCE_CONFLICT', `Local deployment state ${field} does not match the candidate.`);
  }
  if (!text(state.workerId) || !text(state.d1Id)) fail('RESOURCE_CONFLICT', 'Local deployment state is incomplete.');
}

function assertClosedState(state) {
  if (!state) return;
  const fields = typeof state === 'object' && !Array.isArray(state) ? Object.keys(state) : [];
  if (
    typeof state !== 'object'
    || Array.isArray(state)
    || fields.length !== LOCAL_STATE_FIELDS.size
    || fields.some((field) => !LOCAL_STATE_FIELDS.has(field))
  ) {
    fail('DEPLOYMENT_STATE_INVALID', 'Local deployment state contains unsupported fields.');
  }
}

function assertOwnedWorker(worker, d1, expected) {
  const workerType = text(worker?.type) || text(worker?.resourceType) || text(worker?.resource_type);
  if (workerType !== 'worker') fail('RESOURCE_CONFLICT', 'The existing resource is not a Worker.');
  if (resourceId(worker) !== expected.workerId || resourceName(worker) !== expected.workerName) {
    fail('RESOURCE_CONFLICT', 'The existing Worker identity does not match local deployment state.');
  }
  const marker = workerVariable(worker, ['PROOFCLIP_DEPLOYMENT_MARKER', 'marker', 'deploymentMarker']);
  if (marker !== expected.marker) fail('RESOURCE_CONFLICT', 'The existing Worker deployment marker conflicts with the candidate.');

  const extensionId = workerVariable(worker, ['PROOFCLIP_EXTENSION_ID', 'extensionId']);
  if (extensionId !== expected.extensionId) fail('RESOURCE_CONFLICT', 'The existing Worker Extension ID conflicts with the candidate.');

  const redirectUri = workerVariable(worker, ['NOTION_REDIRECT_URI', 'redirectUri', 'callbackUri']);
  if (redirectUri !== expected.redirectUri) fail('RESOURCE_CONFLICT', 'The existing Worker callback origin conflicts with the candidate.');

  const binding = workerBinding(worker, 'DB');
  const bindingId = text(binding?.database_id) || text(binding?.databaseId) || text(binding?.id) || text(binding?.uuid);
  if (!binding || bindingId !== expected.d1Id || !['d1', 'd1_database', 'd1-database'].includes(String(binding.type || 'd1').toLowerCase())) {
    fail('RESOURCE_CONFLICT', 'The existing Worker D1 binding conflicts with local deployment state.');
  }

  for (const [field, keys] of [
    ['candidateCommit', ['PROOFCLIP_CANDIDATE_COMMIT', 'candidateCommit']],
    ['candidateSha256', ['PROOFCLIP_CANDIDATE_SHA256', 'candidateSha256']]
  ]) {
    const remoteValue = workerVariable(worker, keys);
    if (remoteValue !== expected[field]) {
      fail('RESOURCE_CONFLICT', `The existing Worker ${field} conflicts with the candidate.`);
    }
  }

  if (resourceId(d1) !== expected.d1Id || resourceName(d1) !== expected.d1Name) {
    fail('RESOURCE_CONFLICT', 'The existing D1 identity does not match local deployment state.');
  }
}

export async function resolveDeploymentResources({ cloudflare, state = null, candidate, names = {}, accountId: preflightAccountId = null }) {
  if (!cloudflare || typeof cloudflare.listAccounts !== 'function') throw new TypeError('cloudflare client is required');
  if (!candidate || typeof candidate !== 'object') throw new TypeError('candidate is required');
  assertClosedState(state);
  const resolvedNames = resolveNames(names);
  const extensionId = text(candidate.extensionId);
  const candidateCommit = text(candidate.candidateCommit);
  const candidateSha256 = text(candidate.candidateSha256);
  if (!extensionId || !candidateCommit || !candidateSha256) {
    fail('RESOURCE_CONFLICT', 'Candidate identity is incomplete.');
  }
  const workerOrigin = originFromCandidate(candidate);
  const redirectUri = buildNotionRedirectUri(workerOrigin);

  let accountId = preflightAccountId;
  if (accountId === null || accountId === undefined) {
    if (typeof cloudflare.verifyToken === 'function') await cloudflare.verifyToken();
    const accounts = usableAccounts(await cloudflare.listAccounts());
    if (accounts.length === 0) fail('CLOUDFLARE_ACCOUNT_UNAVAILABLE', 'No usable Cloudflare account is available.');
    if (accounts.length !== 1) fail('CLOUDFLARE_ACCOUNT_AMBIGUOUS', 'Exactly one usable Cloudflare account is required.');
    accountId = accounts[0].id;
  }
  if (!text(accountId)) fail('CLOUDFLARE_ACCOUNT_UNAVAILABLE', 'No usable Cloudflare account is available.');
  const expected = {
    accountId,
    workerName: resolvedNames.workerName,
    d1Name: resolvedNames.d1Name,
    marker: resolvedNames.marker,
    extensionId,
    candidateCommit,
    candidateSha256,
    workerOrigin,
    redirectUri,
    workerId: state?.workerId,
    d1Id: state?.d1Id
  };

  assertLocalState(state, expected);
  const worker = await cloudflare.getWorker(accountId, resolvedNames.workerName);
  const d1 = await cloudflare.getD1(accountId, resolvedNames.d1Name);

  if (!state) {
    if (worker || d1) fail('RESOURCE_OWNERSHIP_UNVERIFIED', 'A same-named Cloudflare resource has no matching local ownership record.');
    const createdD1 = await cloudflare.createD1(accountId, resolvedNames.d1Name);
    return {
      accountId,
      worker: null,
      d1: createdD1,
      workerAction: 'create',
      d1Action: 'create',
      workerOrigin
    };
  }

  if (!worker || !d1) fail('RESOURCE_CONFLICT', 'Local deployment state points to a missing Cloudflare resource.');
  assertOwnedWorker(worker, d1, expected);
  return { accountId, worker, d1, workerAction: 'reuse', d1Action: 'reuse', workerOrigin };
}
