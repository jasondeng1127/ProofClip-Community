function basicAuthorization(clientId, clientSecret) {
  if (!clientId || !clientSecret) throw new Error('OAuth client configuration is missing.');
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`;
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
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: basicAuthorization(clientId, clientSecret) },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error('Notion OAuth authorization could not be completed.');
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    workspaceId: body.workspace_id || null,
    workspaceName: body.workspace_name || null
  };
}
