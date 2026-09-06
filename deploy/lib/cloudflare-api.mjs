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
  if (operation === 'verify token' || status === 401) return 'CLOUDFLARE_AUTH_FAILED';
  return 'CLOUDFLARE_PERMISSION_FAILED';
}

export function createCloudflareClient({ apiToken, fetchImpl = fetch }) {
  requiredText('apiToken', apiToken);
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  registerRedactionSecret(apiToken);

  let verification;

  async function request(operation, path, { method = 'GET', body } = {}) {
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

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.success === false) {
      throw new DeployError(
        errorForResponse(operation, response.status),
        `Cloudflare ${operation} failed with HTTP ${response.status}.`,
        { status: response.status }
      );
    }
    return payload?.result;
  }

  async function verifyToken() {
    if (!verification) {
      verification = request('verify token', '/user/tokens/verify').then((result) => result ?? {});
    }
    return verification;
  }

  async function listAccounts() {
    await verifyToken();
    return (await request('account discovery', '/accounts?per_page=50')) ?? [];
  }

  async function getWorkers(accountId) {
    return (await request('Worker discovery', `/accounts/${pathSegment(accountId)}/workers/scripts`)) ?? [];
  }

  async function getWorker(accountId, workerName) {
    const workers = await getWorkers(accountId);
    return workers.find((worker) => worker?.name === workerName || worker?.script_name === workerName) ?? null;
  }

  async function getD1Databases(accountId) {
    return (await request('D1 discovery', `/accounts/${pathSegment(accountId)}/d1/database?per_page=100`)) ?? [];
  }

  async function getD1(accountId, d1Name) {
    const databases = await getD1Databases(accountId);
    return databases.find((database) => database?.name === d1Name) ?? null;
  }

  async function createD1(accountId, d1Name) {
    return request('D1 creation', `/accounts/${pathSegment(accountId)}/d1/database`, {
      method: 'POST',
      body: { name: requiredText('d1Name', d1Name) }
    });
  }

  async function getWorkersDevSubdomain(accountId) {
    return request('Workers.dev subdomain lookup', `/accounts/${pathSegment(accountId)}/workers/subdomain`);
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
