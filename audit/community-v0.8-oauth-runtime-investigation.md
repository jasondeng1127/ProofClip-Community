# Community OAuth Runtime Investigation

Scope was limited to the single OAuth runtime failure. No source, release, governance, deployment UX, Outbox, shortcut, or other product changes were made.

## Runtime stage

AUTHORIZATION: PASS  
CALLBACK_REACHED: PASS  
TOKEN_EXCHANGE: FAIL

Evidence: Jason’s real run reached the Notion authorization page, identified `ProofClip Community RC1 20260815`, entered the intended workspace, allowed the selected page/database, and then returned:

`Notion could not exchange the authorization. Return to ProofClip and try again.`

## Deployed Worker

identity: `DEPLOYED_IDENTITY_UNVERIFIED`  
latest OAuth fix deployed: `UNVERIFIED`  
evidence: The configured Worker is `proofclip-community-rc1-20260814`. The local current bundle previously reproduced with SHA-256 `D960D6CFC19D0EA8239817AB6A16973EB78F5D86BCCB1454E71D8A551A236DC1`, but no remote version/deployment metadata was obtainable. Cloudflare dashboard inspection was unreadable/timeout and local `wrangler` is unavailable.

## OAuth configuration

clientId identity: `IDENTITY_UNVERIFIED`  
clientSecret: `IDENTITY_UNVERIFIED`  
redirectUri: `IDENTITY_UNVERIFIED`  
Notion callback match: `NOTION_CALLBACK_CONFIG_UNVERIFIED`

No secret, token, authorization code, or credential value was read or printed.

## Provider response

HTTP status: `UNAVAILABLE`  
error code: `UNAVAILABLE`  
sanitized message: `Notion could not exchange the authorization.`  
failure stage: Worker callback → authorization-code token exchange

The deployed Worker’s generic callback response hides the provider status/body. No Cloudflare log or observability event was available in this run.

## Root cause

**UNRESOLVED** — the failure is proven to occur at token exchange, but deployed bundle identity, credential identity, exact redirect URI configuration, and the provider error are unavailable without Jason’s Cloudflare access/configuration.

## Action taken

NONE.

## Verification

- Jason real OAuth runtime: authorization PASS; callback reached PASS; token exchange FAIL.
- Prior local OAuth targeted evidence: 26/26 passed; not rerun in this single-point stop.
- Prior local bundle reproducibility: PASS; current local bundle SHA recorded above; remote match unverified.
- Read-only Cloudflare inspection: unable to obtain deployment metadata.

## Jason next action

Open Cloudflare Worker `proofclip-community-rc1-20260814`, obtain the latest callback deployment/version identity and one sanitized token-exchange log containing only HTTP status, provider error code/message, and failure timestamp; do not share secrets, tokens, codes, or authorization headers.
