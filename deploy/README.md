# Self-hosted Community deployment

This guide prepares a deployer-owned Cloudflare Worker, D1 database, and Notion OAuth integration. ProofClip Community has no central hosted dependency.

## Prerequisites

- A Cloudflare account with Workers and D1 enabled.
- A Notion integration created in the deployer's own Notion account.
- Node.js and Wrangler installed locally.
- The unpacked Community extension, which receives the deployer's final extension ID after it is loaded.

## 1. Create local Worker configuration

Copy `wrangler.template.jsonc` to `worker/wrangler.jsonc`. Replace every angle-bracket placeholder with values from the deployer's own Cloudflare account. The local filename is ignored by Git and must never be committed.

Create the D1 database before filling the template:

```powershell
cd worker
wrangler d1 create <YOUR_D1_DATABASE_NAME>
```

Copy the returned database ID into `worker/wrangler.jsonc`.

## 2. Build and initialize D1

```powershell
cd worker
node scripts/bundle-worker.mjs
wrangler d1 execute <YOUR_D1_DATABASE_NAME> --file src/schema.sql --remote
```

## 3. Configure secrets and Notion OAuth

In the deployer's Notion integration, add this callback URL:

```text
https://<YOUR_WORKER_SUBDOMAIN>.workers.dev/v1/auth/notion/callback
```

Set the same URL as `NOTION_REDIRECT_URI`, then set the secrets in the deployer's own Worker:

```powershell
wrangler secret put NOTION_CLIENT_ID
wrangler secret put NOTION_CLIENT_SECRET
wrangler secret put NOTION_REDIRECT_URI
wrangler secret put TOKEN_VAULT_KEY
```

`TOKEN_VAULT_KEY` must be a fresh base64-encoded 32-byte key. It is not an extension setting and must never be copied into source code.

## 4. Configure the extension ID and API origin

Load `extension/src` as an unpacked extension. Copy its generated 32-character extension ID into `PROOFCLIP_EXTENSION_ID` in the Worker configuration, build, and deploy:

```powershell
node scripts/bundle-worker.mjs
wrangler deploy
```

Edit `extension/src/community-config.mjs` so `COMMUNITY_API_ORIGIN` equals the deployed HTTPS Worker origin without a trailing slash, then reload the extension. Do not use the placeholder value.

## 5. Fresh-account rehearsal

Open the extension, start the Notion OAuth flow, approve the deployer's own integration, select a Data Source, save one local capture, and explicitly send it to Notion. Confirm the resulting record appears in that Data Source. Also confirm an extension with a different ID receives no CORS permission. A failure must be investigated in the deployer's Worker logs; do not publish tokens, screenshots, or captured content.

If you modify and run the Worker for remote users, AGPL-3.0 section 13 requires you to offer those users the corresponding source for that modified version.
