import { NOTION_VERSION } from './notion-proxy.mjs';

function basicAuthorization(clientId, clientSecret) {
  if (!clientId || !clientSecret) throw new Error('OAuth client configuration is missing.');
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
}

function sanitizeProviderValue(value) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200) : null;
}

function tokenExchangeError(status, body) {
  const providerBody = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const error = new Error('Notion OAuth authorization could not be completed.');
  error.failureStage = 'notion_token_exchange';
  error.providerStatus = Number.isInteger(status) ? status : null;
  error.providerErrorCode = sanitizeProviderValue(providerBody.error || providerBody.error_type || providerBody.code || providerBody.type);
  error.providerMessage = sanitizeProviderValue(providerBody.error_description || providerBody.message);
  return error;
}

export function createOAuthState(now = () => Date.now()) {
  const random = crypto.getRandomValues(new Uint8Array(32));
  const value = btoa(String.fromCharCode(...random)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  return { value, expiresAt: now() + 10 * 60 * 1000 };
}

export function isUsableOAuthState(record, submittedState, now = () => Date.now()) {
  return Boolean(record && !record.consumedAt && record.value === submittedState && Number(record.expiresAt) > now());
}

export async function exchangeAuthorizationCode({ code, redirectUri, clientId, clientSecret, fetchImpl = fetch }) {
  if (!code || !redirectUri) throw new Error('OAuth callback is incomplete.');
  const response = await fetchImpl('https://api.notion.com/v1/oauth/token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: basicAuthorization(clientId, clientSecret), 'Notion-Version': NOTION_VERSION },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw tokenExchangeError(response.status, body);
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null
  };
}
