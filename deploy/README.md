# Self-hosted deployment

This guide prepares a personal Cloudflare Worker and D1 database. It does not use an Official ProofClip service.

## Prerequisites

- A Cloudflare account with Workers and D1 enabled.
- A Notion integration created in the deployer's own Notion account.
- Node.js and Wrangler installed locally.
- The unpacked Community extension, which receives the deployer's final extension ID after it is loaded.

## Canonical setup contract

Use the following sequence for the extracted release candidate. The `WHERE`,
`ACTION`, `VALUE SOURCE`, and `EXPECTED` columns are part of the deployment
contract; do not substitute a development, Temp, rehearsal, or historical RC
tree.

| Step | WHERE | ACTION | VALUE SOURCE | EXPECTED |
| --- | --- | --- | --- | --- |
| 0. Extract | Windows Explorer | Extract the candidate, then use `<candidate-root>/extension/src` as the unpacked extension directory. | The single candidate ZIP | Chrome loads the extension from `extension/src` itself, not the repository root, a Temp tree, a rehearsal tree, or an old RC tree. |
| 1. Worker template | `<candidate-root>/deploy/wrangler.template.jsonc` → `<candidate-root>/worker/wrangler.jsonc` | Copy the template and replace placeholders only with this deployment's values. | The deployer's Cloudflare account and the deployer's own Notion integration | `DB` is the D1 binding; no live secret is committed. |
| 2. D1 | Cloudflare D1 and `worker/wrangler.jsonc` | Create the D1 database, then copy its returned ID into the existing `DB` binding. | `wrangler d1 create` output | `DB` points to the intended database before Worker deployment. |
| 3. Notion integration | Notion Developer Dashboard | Create or select one **public OAuth integration** and register the exact Worker callback URL. | The deployer's own Notion account and Worker HTTPS origin | The integration is public and the callback matches `NOTION_REDIRECT_URI` byte-for-byte. |
| 4. Client credentials | `worker/wrangler.jsonc` and Worker secrets | Put the client ID in `NOTION_CLIENT_ID`; put the client secret in `NOTION_CLIENT_SECRET`. | Both values must come from the same Notion integration | The ID/secret pair belongs to one integration; never copy one from Commercial, another Community environment, or a different integration. |
| 5. Credential hygiene | Notion Dashboard copy operation and Wrangler input | Paste exact credential text; remove accidental surrounding spaces/newlines and do not use smart quotes, full-width characters, or other Unicode substitutions. | The integration's displayed ASCII values | The stored input is the exact provider value and Basic Auth encoding can complete without character errors. |
| 6. Vault key | Worker secret `TOKEN_VAULT_KEY` | Generate 32 cryptographically secure random bytes, Base64-encode them, and store only the Base64 value as a secret. | A cryptographic random generator, never a human password | Decoding the stored Base64 value yields exactly 32 bytes; the value is not in source or extension storage. |
| 7. Extension identity | Chrome → Extensions → Load unpacked → `<candidate-root>/extension/src` | Load the exact candidate directory and copy the generated extension ID into `PROOFCLIP_EXTENSION_ID`. | Chrome's ID for this loaded unpacked directory | Worker CORS/API checks accept this exact ID after deployment. |
| 8. Worker config | `<candidate-root>/worker/wrangler.jsonc` | Keep `compatibility_date` at `2026-08-14`, `preview_urls` at `false`, and `observability.enabled` plus `observability.logs.enabled` at `true`. | The checked-in template | The deployed Worker uses the documented compatibility and logging settings. |
| 9. Build and deploy | `<candidate-root>/worker` | Run the bundle command, execute the schema and privacy migration, then deploy the Worker. | The candidate's `worker/src`, `worker/migrations`, and Wrangler config | The Worker is deployed only after `DB`, extension ID, OAuth variables, and secrets are configured. |
| 10. Extension origin | `<candidate-root>/extension/src/community-config.mjs` | Set `COMMUNITY_API_ORIGIN` to the deployed HTTPS Worker origin without a trailing slash, then reload the same extension. | The just-completed Worker deployment | `/privacy` returns HTTP 200 and the extension reaches the deployer's Worker. |
| 11. Product flow | ProofClip → Connect → Data Source → Capture → Archive | Complete Notion OAuth, select a Data Source, save a capture, and explicitly send it. | The deployer's Notion integration and Data Source | A Notion record is created with `Delivery status = SENT`, and Outbox is `0`. |

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
