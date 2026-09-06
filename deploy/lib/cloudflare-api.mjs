import { DeployError, redactText, registerRedactionSecret } from './errors.mjs';

const API_BASE = 'https://api.cloudflare.com/client/v4';

function requiredText(name, value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function pathSegment(value) {
  return encodeURIComponent(requiredText('Cloudflare resource name', value));
}

function errorForResponse(operation, status) {
  if (status === 403) return 'CLOUDFLARE_PERMISSION_FAILED';
  if (operation === 'verify token' || status === 401) return 'CLOUDFLARE_AUTH_FAILED';
  return 'CLOUDFLARE_PERMISSION_FAILED';
}

function invalidResponse(operation) {
  return new DeployError('CLOUDFLARE_RESPONSE_INVALID', `Cloudflare ${operation} returned an invalid API response.`);
}

function assertResultShape(operation, result, shape) {
  if (shape === 'array' && !Array.isArray(result)) throw invalidResponse(operation);
  if (shape === 'object' && (!result || typeof result !== 'object' || Array.isArray(result))) throw invalidResponse(operation);
}

export function createCloudflareClient({ apiToken, fetchImpl = fetch }) {
  requiredText('apiToken', apiToken);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  registerRedactionSecret(apiToken);

  let verification;

  async function request(operation, path, { method = 'GET', body, resultShape } = {}) {
    const url = `${API_BASE}${path}`;
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${apiToken}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch (error) {
      throw new DeployError(
        'CLOUDFLARE_NETWORK_FAILED',
        redactText(`Cloudflare ${operation} request failed: ${error?.message || 'network error'}`)
      );
    }

    if (!response || !Number.isInteger(response.status)) throw invalidResponse(operation);
    if (response.status < 200 || response.status >= 300) {
      throw new DeployError(
        errorForResponse(operation, response.status),
        `Cloudflare ${operation} failed with HTTP ${response.status}.`,
        { status: response.status }
      );
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw invalidResponse(operation);
    }
    if (!payload || payload.success !== true) throw invalidResponse(operation);
    assertResultShape(operation, payload.result, resultShape);
    return payload?.result;
  }

  async function verifyToken() {
    if (!verification) {
      verification = request('verify token', '/user/tokens/verify', { resultShape: 'object' });
    }
    return verification;
  }

  async function listAccounts() {
    await verifyToken();
    return request('account discovery', '/accounts?per_page=50', { resultShape: 'array' });
  }

  async function getWorkers(accountId) {
    return request('Worker discovery', `/accounts/${pathSegment(accountId)}/workers/scripts`, { resultShape: 'array' });
  }

  async function getWorker(accountId, workerName) {
    const workers = await getWorkers(accountId);
    return workers.find((worker) => worker?.name === workerName || worker?.script_name === workerName) ?? null;
  }

  async function getD1Databases(accountId) {
    return request('D1 discovery', `/accounts/${pathSegment(accountId)}/d1/database?per_page=100`, { resultShape: 'array' });
  }

  async function getD1(accountId, d1Name) {
    const databases = await getD1Databases(accountId);
    return databases.find((database) => database?.name === d1Name) ?? null;
  }

  async function createD1(accountId, d1Name) {
    return request('D1 creation', `/accounts/${pathSegment(accountId)}/d1/database`, {
      method: 'POST',
      body: { name: requiredText('d1Name', d1Name) },
      resultShape: 'object'
    });
  }

  async function getWorkersDevSubdomain(accountId) {
    return request('Workers.dev subdomain lookup', `/accounts/${pathSegment(accountId)}/workers/subdomain`, { resultShape: 'object' });
  }

  return {
    verifyToken,
    listAccounts,
    getWorkers,
    getWorker,
    getD1Databases,
    getD1,
    createD1,
    getWorkersDevSubdomain
  };
}
