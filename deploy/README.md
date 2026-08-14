# Self-hosted deployment

This guide prepares a personal Cloudflare Worker and D1 database. It does not use an Official ProofClip service.

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
wrangler d1 execute <YOUR_D1_DATABASE_NAME> --file migrations/20260813_privacy_nonretention.sql --remote
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

## 5. Smoke test

Open the extension, start the Notion connection flow, approve the deployer's own Notion integration, select a Data Source, save one local capture, and explicitly send it to Notion. A failure must be investigated in the deployer's Worker logs; do not send tokens or screenshots in a public issue.