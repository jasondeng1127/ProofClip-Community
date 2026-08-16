# Self-hosted deployment

This guide prepares a personal Cloudflare Worker and D1 database. It does not use an Official ProofClip service.

## Prerequisites

- A Cloudflare account with Workers and D1 enabled.
- A Notion integration created in the deployer's own Notion account.
- Node.js and Wrangler installed locally.
- The unpacked Community extension, which receives the deployer's final extension ID after it is loaded.

## 1. Create local Worker configuration

From the repository root, copy `deploy/wrangler.template.jsonc` to
`worker/wrangler.jsonc`. Replace every angle-bracket placeholder with values
from the deployer's own Cloudflare account. The local filename is ignored by
Git and must never be committed.

Create the D1 database before filling the template:

```powershell
cd worker
wrangler d1 create <YOUR_D1_DATABASE_NAME>
```

Copy the returned database ID into `worker/wrangler.jsonc`.

Keep the D1 binding name exactly `DB`. The Worker source and migrations use
that binding.

## 2. Build and initialize D1

```powershell
cd worker
node scripts/bundle-worker.mjs
wrangler d1 execute <YOUR_D1_DATABASE_NAME> --file src/schema.sql --remote
wrangler d1 execute <YOUR_D1_DATABASE_NAME> --file migrations/20260813_privacy_nonretention.sql --remote
```

## 3. Configure secrets and Notion OAuth

Create or open a **public OAuth integration** in the deployer's own Notion
account. Copy the client ID and client secret from that same integration; do
not pair a client ID from one integration with a secret from another. Add this
exact callback URL to that integration:

```text
https://<YOUR_WORKER_SUBDOMAIN>.workers.dev/v1/auth/notion/callback
```

Set the same URL as `NOTION_REDIRECT_URI` in `worker/wrangler.jsonc`, together
with the matching `NOTION_CLIENT_ID`. Store only the following two values as
Worker secrets:

```powershell
wrangler secret put NOTION_CLIENT_SECRET
wrangler secret put TOKEN_VAULT_KEY
```

`TOKEN_VAULT_KEY` must be a fresh base64-encoded 32-byte key. It is not an extension setting and must never be copied into source code.

## 4. Configure the extension ID and API origin

In Chrome, choose **Load unpacked** and select the `extension/src` directory
itself (not the repository root). Copy the generated 32-character extension
ID into `PROOFCLIP_EXTENSION_ID` in `worker/wrangler.jsonc`. Set
`NOTION_CLIENT_ID` and `NOTION_REDIRECT_URI` there as well. The callback must
be the same URL registered in the Notion integration.

Build and deploy from the repository's `worker` directory:

```powershell
cd worker
node scripts/bundle-worker.mjs
wrangler deploy
```

Edit `extension/src/community-config.mjs` so `COMMUNITY_API_ORIGIN` equals the
deployed HTTPS Worker origin without a trailing slash, then reload the
extension. Do not use the placeholder value. If the extension is loaded from
a different unpacked directory later, update `PROOFCLIP_EXTENSION_ID` and
redeploy before using it.

## 5. Verify the deployment

Open the extension, start the Notion connection flow, approve the deployer's
own Notion integration, select a Data Source, save one local capture, and
explicitly send it to Notion. Confirm `/privacy` opens and the extension shows
the connected state. A failure must be investigated in the deployer's Worker
logs; do not send tokens, authorization codes, secrets, or screenshots in a
public issue.
