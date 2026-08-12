import { COMMUNITY_API_ORIGIN } from '../community-config.mjs';

const INSTALL_ID_KEY = 'proofclipInstallId';

export class ProofClipApiError extends Error {
  constructor(message, { kind, status } = {}) {
    super(message);
    this.name = 'ProofClipApiError';
    this.kind = kind;
    if (status != null) this.status = status;
  }
}

export function getProofClipApiOrigin(value = COMMUNITY_API_ORIGIN) {
  let origin;
  try {
    origin = new URL(value);
  } catch {
    throw new ProofClipApiError('Configure a valid HTTPS Community API origin before connecting Notion.', { kind: 'configuration' });
  }
  if (origin.protocol !== 'https:' || origin.hostname === 'replace-me.invalid') {
    throw new ProofClipApiError('Configure a valid HTTPS Community API origin before connecting Notion.', { kind: 'configuration' });
  }
  return origin.origin;
}

export function communityPrivacyUrl(value = COMMUNITY_API_ORIGIN) {
  return `${getProofClipApiOrigin(value)}/privacy`;
}

function validInstallId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

export async function getInstallId(storage) {
  const stored = await storage.get(INSTALL_ID_KEY);
  if (validInstallId(stored[INSTALL_ID_KEY])) return stored[INSTALL_ID_KEY];
  const installId = `proofclip_${crypto.randomUUID().replaceAll('-', '')}`;
  await storage.set({ [INSTALL_ID_KEY]: installId });
  return installId;
}

export async function proofclipApi(path, { storage, method = 'GET', body, fetchImpl = fetch, apiOrigin = COMMUNITY_API_ORIGIN } = {}) {
  const installId = await getInstallId(storage);
  const origin = getProofClipApiOrigin(apiOrigin);
  let response;
  try {
    response = await fetchImpl(`${origin}${path}`, {
      method,
      headers: {
        'X-ProofClip-Install-Id': installId,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
  } catch (error) {
    throw new ProofClipApiError(error.message || 'ProofClip could not reach the service.', { kind: 'network' });
  }
  if (response.status === 204) return null;
  let payload;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new ProofClipApiError(
        `ProofClip received an unrecognised response (${response.status}).`,
        { kind: 'response', status: response.status }
      );
    }
    payload = {};
  }
  if (!response.ok) {
    throw new ProofClipApiError(
      payload.error || `ProofClip API request failed (${response.status}).`,
      { kind: 'response', status: response.status }
    );
  }
  return payload;
}
