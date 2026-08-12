import { createOAuthState, exchangeAuthorizationCode, isUsableOAuthState } from './oauth.mjs';
import { encryptToken } from './token-vault.mjs';
import { hashInstallId } from './identity.mjs';
import { decryptToken } from './token-vault.mjs';
import { listDataSources, writeCapture } from './notion-proxy.mjs';
import { createRateLimiter } from './rate-limit.mjs';

const NOTION_AUTHORIZE_URL = 'https://api.notion.com/v1/oauth/authorize';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const validInstallId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(value);
const rateLimitedResponse = (retryAfterMs) => new Response(JSON.stringify({ error: 'Too many requests. Please wait a moment and try again.' }), { status: 429, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))) } });
const callbackPage = (message, status = 200) => new Response(`<!doctype html><meta charset="utf-8"><title>ProofClip</title><p>${message}</p>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
const publicPage = (title, body) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — ProofClip</title><main style="max-width:720px;margin:40px auto;padding:0 20px;font:16px/1.55 system-ui,sans-serif;color:#182230"><h1>${title}</h1>${body}</main>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
const privacyPage = () => publicPage('Privacy', `<p>ProofClip captures a page or selection only after you click a capture button. You may also select and review an optional region screenshot before saving it. Local capture records, including page titles, URLs, selected/page text and any saved region screenshot, remain in your browser.</p><p>Only after you explicitly choose to send a capture is that record transmitted over HTTPS through this deployer's Worker solely to write it to your authorized Notion Data Source. This Worker does not retain capture bodies, selections, screenshots or page URLs. It stores encrypted Notion OAuth material and a hashed installation identifier needed to maintain your connection.</p><p>You can clear local records in the extension and disconnect Notion to delete the server-side connection.</p>`);

function corsHeaders(request, allowedOrigin) {
  const origin = request.headers.get('origin') || '';
  if (!allowedOrigin || origin !== allowedOrigin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, X-ProofClip-Install-Id',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    Vary: 'Origin'
  };
}

function withCors(request, response, allowedOrigin) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(corsHeaders(request, allowedOrigin))) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

// Module-level default so one isolate shares one limiter across worker
// instances; tests inject their own instances with a controlled clock.
const defaultRateLimit = {
  captures: createRateLimiter({ windowMs: 60_000, limit: 60 }),
  oauthStart: createRateLimiter({ windowMs: 60_000, limit: 10 }),
  reads: createRateLimiter({ windowMs: 60_000, limit: 120 })
};

export function createWorker({ repository, env, fetchImpl = fetch, now = () => Date.now(), rateLimit = defaultRateLimit }) {
  const allowedChromeOrigin = /^[a-p]{32}$/.test(env.PROOFCLIP_EXTENSION_ID || '') ? `chrome-extension://${env.PROOFCLIP_EXTENSION_ID}` : null;
  if (!allowedChromeOrigin) {
    console.warn('ProofClip API: PROOFCLIP_EXTENSION_ID is missing or invalid; CORS headers will not be returned for the extension origin.');
  }
  function clientAddress(request) {
    return request.headers.get('cf-connecting-ip') || 'unknown-client';
  }
  function limit(request, bucket) {
    if (!bucket) return null;
    const result = bucket.hit(clientAddress(request));
    return result.allowed ? null : rateLimitedResponse(result.retryAfterMs);
  }
  function protectedExtensionRoute(pathname) {
    return pathname.startsWith('/v1/') && pathname !== '/v1/auth/notion/callback';
  }
  function extensionOriginRejection(request) {
    const origin = request.headers.get('origin');
    if (origin === allowedChromeOrigin) return null;
    return json({ error: 'ProofClip requests must come from the configured extension.' }, 403);
  }
  async function installIdHashFor(request) {
    const installId = request.headers.get('x-proofclip-install-id');
    if (!validInstallId(installId)) throw new Error('A valid ProofClip install identifier is required.');
    return hashInstallId(installId);
  }
  async function start(request) {
    const installId = request.headers.get('x-proofclip-install-id');
    if (!validInstallId(installId)) return json({ error: 'A valid ProofClip install identifier is required.' }, 400);
    const limited = limit(request, rateLimit.oauthStart);
    if (limited) return limited;
    try { await repository.deleteExpiredOAuthStates(now()); } catch { /* cleanup is best-effort */ }
    const state = createOAuthState(now);
    await repository.putOAuthState({ ...state, installIdHash: await hashInstallId(installId) });
    const authorizationUrl = new URL(NOTION_AUTHORIZE_URL);
    authorizationUrl.search = new URLSearchParams({ owner: 'user', client_id: env.NOTION_CLIENT_ID, redirect_uri: env.NOTION_REDIRECT_URI, response_type: 'code', state: state.value }).toString();
    return json({ authorizationUrl: authorizationUrl.href });
  }
  async function callback(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get('code'); const stateValue = url.searchParams.get('state');
    if (!code || !stateValue) return callbackPage('Notion authorization was incomplete. You may close this window.', 400);
    const state = await repository.consumeOAuthState(stateValue, now());
    if (!isUsableOAuthState(state, stateValue, now)) return callbackPage('This Notion authorization has expired or was already used. Return to ProofClip and try again.', 400);
    let token;
    try {
      token = await exchangeAuthorizationCode({ code, redirectUri: env.NOTION_REDIRECT_URI, clientId: env.NOTION_CLIENT_ID, clientSecret: env.NOTION_CLIENT_SECRET, fetchImpl });
    } catch {
      return callbackPage('Notion could not exchange the authorization. Return to ProofClip and try again.', 502);
    }
    try {
      const accessEnvelope = await encryptToken(token.accessToken, env.TOKEN_VAULT_KEY);
      const refreshEnvelope = token.refreshToken ? await encryptToken(token.refreshToken, env.TOKEN_VAULT_KEY) : null;
      await repository.saveConnection({ installIdHash: state.installIdHash, accessEnvelope, refreshEnvelope, workspaceId: token.workspaceId, workspaceName: token.workspaceName, now: now() });
      return callbackPage('Notion is connected. You may close this window and return to ProofClip.');
    } catch { return callbackPage('ProofClip could not safely save this connection. Return to ProofClip and try again.', 502); }
  }
  async function connection(request) {
    const limited = limit(request, rateLimit.reads);
    if (limited) return limited;
    const installId = request.headers.get('x-proofclip-install-id');
    if (!validInstallId(installId)) return json({ error: 'A valid ProofClip install identifier is required.' }, 400);
    const installIdHash = await hashInstallId(installId);
    if (request.method === 'GET') {
      const record = await repository.getConnection(installIdHash);
      return json({ connected: Boolean(record), workspaceName: record?.workspaceName || null, updatedAt: record?.updatedAt || null });
    }
    await repository.deleteConnection(installIdHash);
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  }
  async function authorizedToken(request) {
    const connection = await repository.getTokenConnection(await installIdHashFor(request));
    if (!connection) throw new Error('Notion is not connected.');
    return decryptToken(JSON.parse(connection.accessEnvelope), env.TOKEN_VAULT_KEY);
  }
  async function dataSources(request) {
    const limited = limit(request, rateLimit.reads);
    if (limited) return limited;
    try { return json({ dataSources: await listDataSources(await authorizedToken(request), fetchImpl) }); }
    catch (error) { return json({ error: error.message || 'Data Sources are unavailable.' }, error.message === 'Notion is not connected.' ? 401 : 502); }
  }
  async function capture(request) {
    try {
      const installIdHash = await installIdHashFor(request);
      const limited = limit(request, rateLimit.captures);
      if (limited) return limited;
      const body = await request.json();
      const delivery = await writeCapture(await authorizedToken(request), body.record, body.target, fetchImpl);
      return json({ delivery }, 201);
    }
    catch (error) { const message = error.message || 'Capture could not be delivered.'; const invalidInput = ['Capture record is invalid.', 'Target Data Source is invalid.', 'Capture body exceeds the allowed size.'].includes(message); return json({ error: message }, invalidInput ? 400 : message === 'Notion is not connected.' ? 401 : 502); }
  }
  return { async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request, allowedChromeOrigin) });
    const url = new URL(request.url);
    if (protectedExtensionRoute(url.pathname)) {
      const rejected = extensionOriginRejection(request);
      if (rejected) return withCors(request, rejected, allowedChromeOrigin);
    }
    let response;
    if (request.method === 'GET' && url.pathname === '/privacy') response = privacyPage();
    else if (request.method === 'POST' && (url.pathname === '/v1/auth/start' || url.pathname === '/v1/auth/notion/start')) response = await start(request);
    else if (request.method === 'GET' && url.pathname === '/v1/auth/notion/callback') response = await callback(request);
    else if ((request.method === 'GET' || request.method === 'DELETE') && url.pathname === '/v1/connection') response = await connection(request);
    else if (request.method === 'GET' && url.pathname === '/v1/data-sources') response = await dataSources(request);
    else if (request.method === 'POST' && url.pathname === '/v1/captures') response = await capture(request);
    else response = json({ error: 'Not found.' }, 404);
    return withCors(request, response, allowedChromeOrigin);
  } };
}
