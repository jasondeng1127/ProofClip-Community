# ProofClip Community 0.8 self-hosted deployment guide

This guide deploys ProofClip Community as a self-hosted Chrome extension
paired with a Cloudflare Worker and D1 database. You own the Cloudflare
account, D1 database, Notion OAuth integration, Worker secrets, and extension
configuration.

This is a detailed self-hosting workflow, not a one-click or zero-config
installer.

## Prerequisites

You need:

- A Cloudflare account with Workers and D1 enabled.
- A Notion account and workspace where you can create a public OAuth
  integration and authorize a Data Source.
- Chrome or another compatible Chromium browser.
- Node.js and npm.
- Git, if you are deploying from a repository checkout.

ProofClip Community uses **Cloudflare Worker + D1** for its backend. Cloudflare
Pages or a static-asset upload is not the backend deployment path.

## Release package and directories

Download the official `ProofClip Community 0.8.0` release ZIP and extract it
into a directory you control. The extracted package contains:

- `extension/src` — the unpacked Chrome extension.
- `worker` — Worker source, migrations, and the bundling script.
- `deploy` — the Wrangler configuration template and this guide.

In Chrome, use **Load unpacked** with `extension/src` itself. Do not load the
ZIP, the package root, `worker`, `deploy`, an RC directory, a test directory,
or an older extracted candidate.

## 1. Install and verify Wrangler

The bare `wrangler` command may not be available on a new machine. From the
repository or extracted package directory, install a local Wrangler if needed:

```powershell
npm install -D wrangler@latest
```

Prefer the local executable through `npx` for all subsequent commands:

```powershell
npx wrangler --version
```

If npm reports that package install scripts need approval, run:

```powershell
npm approve-scripts
```

Approve only the packages shown by npm that are required by Wrangler, such as
`esbuild` or `workerd`, then rerun the install and verify `npx wrangler
--version`.

Authenticate Wrangler with the Cloudflare account that should own the new
Worker and D1 database. Do not paste Cloudflare or Notion credentials into
this repository.

## 2. Load the extension and obtain its ID

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the extracted `extension/src` directory.
5. Copy the generated extension ID.

The ID is used only as the `PROOFCLIP_EXTENSION_ID` Worker variable. If you
load a different unpacked directory later, its ID may differ; update the
Worker variable and redeploy before using that extension.

## 3. Create a dedicated D1 database

From the `worker` directory, create a new database:

```powershell
cd worker
npx wrangler d1 create <YOUR_D1_DATABASE_NAME>
```

Record both values returned by Wrangler:

- `database_name` — the exact D1 name.
- `database_id` — the D1 UUID.

Use a new, dedicated database for this deployment. Do not reuse a Commercial,
RC, rehearsal, or unrelated test database.

## 4. Create the local Worker configuration

Copy the authoritative template:

```powershell
Copy-Item .\..\deploy\wrangler.template.jsonc .\wrangler.jsonc
```

Edit `worker/wrangler.jsonc` and replace every placeholder with this
deployment's value. The template is the source of the configuration contract.

Incorrect:

```json
"name": "<proofclip-community-08>"
```

Correct:

```json
"name": "proofclip-community-08"
```

`<YOUR_XXX>` means the entire placeholder, including `<` and `>`, must be
replaced. Required non-secret values are:

- Worker `name`.
- D1 `database_name`.
- D1 `database_id`.
- `PROOFCLIP_EXTENSION_ID`.
- `NOTION_CLIENT_ID`.
- `NOTION_REDIRECT_URI`.

Keep the D1 binding exactly:

```json
"binding": "DB"
```

Do not rename `DB`. The Worker source and migrations use that binding.

Keep the template's `compatibility_date`, preview setting, and observability
settings unless you have a documented reason to change them. Do not put a
Client Secret, token-vault key, or any other secret in `wrangler.jsonc`.

## 5. Create the Notion OAuth integration

In the Notion Developer Dashboard, create or select one **public OAuth
integration** owned by you. Obtain its:

- Client ID — an identifier used in the public authorization request.
- Client Secret — a sensitive credential used only by the Worker.

Client ID and Client Secret are different values and must come from the same
integration. Never copy a Client Secret from Commercial, another Community
deployment, an RC/rehearsal environment, or a different integration.

Register this callback URL, replacing each placeholder with your own Worker
name and Cloudflare Workers account subdomain:

```text
https://<WORKER_NAME>.<ACCOUNT_WORKERS_DEV_SUBDOMAIN>.workers.dev/v1/auth/notion/callback
```

Set the identical URL as `NOTION_REDIRECT_URI`. The Notion Dashboard value and
the Worker value must match exactly, including scheme, hostname, path, and
case. Do not confuse the Client Secret with the Worker name, workers.dev
account subdomain, or redirect URI.

The Client Secret must never be committed to Git, written into public
documentation, placed in `wrangler.jsonc`, posted to a public issue, included
in a screenshot, or shared in public chat/logs. If it is exposed, rotate it in
the Notion Dashboard before continuing.

## 6. Configure Worker secrets

From the `worker` directory, enter the Client Secret directly into Wrangler's
secure prompt:

```powershell
npx wrangler secret put NOTION_CLIENT_SECRET
```

Do not echo or save the value in a file.

`TOKEN_VAULT_KEY` must be a cryptographically secure random value whose Base64
decoding produces exactly 32 bytes. This is a Worker secret, not an extension
setting and not a human password.

The following PowerShell example generates the value in memory and pipes it to
Wrangler without intentionally printing it:

```powershell
$vaultBytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($vaultBytes)
$vaultKey = [Convert]::ToBase64String($vaultBytes)
try {
  $vaultKey | npx wrangler secret put TOKEN_VAULT_KEY
} finally {
  Remove-Variable vaultBytes, vaultKey -ErrorAction SilentlyContinue
}
```

If your Wrangler version requires an interactive prompt instead, paste the
generated Base64 value only into that prompt and clear the value from any
clipboard or temporary notes afterward.

## 7. Initialize the D1 database

From the `worker` directory, apply the Community schema and the privacy
non-retention migration to the remote D1 database:

```powershell
npx wrangler d1 execute <YOUR_D1_DATABASE_NAME> --file src/schema.sql --remote
npx wrangler d1 execute <YOUR_D1_DATABASE_NAME> --file migrations/20260813_privacy_nonretention.sql --remote
```

Use the `worker/src/schema.sql` and
`worker/migrations/20260813_privacy_nonretention.sql` files from the official
release package. Do not use old RC, rehearsal, backup, or historical package
paths.

## 8. Bundle and deploy the Worker

Build the Worker bundle from the package's `worker` directory:

```powershell
node scripts/bundle-worker.mjs
npx wrangler deploy
```

The deploy output contains the actual HTTPS Worker origin:

```text
https://<WORKER_NAME>.<ACCOUNT_WORKERS_DEV_SUBDOMAIN>.workers.dev
```

Use the origin returned for this deployment. Do not use a URL from an RC,
rehearsal, Commercial, or older test Worker.

## 9. Point the extension at the deployed Worker

Edit `extension/src/community-config.mjs` and set `COMMUNITY_API_ORIGIN` to
the deployed HTTPS origin without a trailing slash:

```js
export const COMMUNITY_API_ORIGIN = 'https://<YOUR_WORKER_ORIGIN>';
```

Do not leave `https://replace-me.invalid` in the loaded extension. After
saving the file, return to `chrome://extensions` and click **Reload** for the
same unpacked extension directory.

## 10. Health check

Open the deployed privacy endpoint:

```text
https://<YOUR_WORKER_ORIGIN>/privacy
```

It must return HTTP 200. The response should describe the self-hosted flow and
the non-retention boundary without exposing credentials or private account
configuration.

## 11. Connect Notion and configure the Data Source

In ProofClip:

1. Open **Settings**.
2. Choose **Connect Notion**.
3. Authorize the public OAuth integration in Notion.
4. Confirm that the extension shows **Notion connected.**
5. Select the intended Notion Data Source.
6. Choose **Set up ProofClip**.
7. Review and save **Field Mapping**.

The selected Data Source must be accessible to the integration. Do not paste a
Notion token into the extension; the OAuth material is held by your Worker
and D1 using the token-vault contract.

## 12. Final deployment acceptance

Run at least one real end-to-end capture after setup. A complete acceptance
should preferably cover:

- **Selection** capture (`Alt+1`).
- **Image area / Region** capture (`Alt+2`).
- **Body / Full page** capture (`Alt+3`).

For each mode, verify as applicable:

- A Notion record is created.
- The source URL and captured time are present.
- Delivery status is `SENT`.
- The extension reports success.
- Outbox is `0` after successful delivery.

The extension also supports a local Archive, search and filters, projects,
tags, notes, explicit Archive sends, and retryable failed deliveries. A
successful direct delivery is not silently added to the local Archive.

## Troubleshooting

### `wrangler` is not recognized

Use the local installation flow and `npx wrangler ...` rather than assuming a
global Wrangler installation:

```powershell
npm install -D wrangler@latest
npx wrangler --version
```

### npm asks for install-script approval

Run `npm approve-scripts`, approve only the required Wrangler dependencies
shown by npm, then rerun the install. Do not approve unrelated packages.

### Cloudflare Pages was uploaded

Pages/static upload is not the Community backend deployment path. Community
requires a Worker with a bound D1 database; deploy from `worker` with
`npx wrangler deploy`.

### D1 binding errors

The binding name must remain `DB`. A Wrangler-suggested binding name does not
override the Community contract. Confirm `binding: "DB"` and the intended
database name and ID in `worker/wrangler.jsonc`.

### Literal `<YOUR_XXX>` values remain

Replace the entire placeholder, including angle brackets. For example, use
`"name": "my-worker"`, not `"name": "<my-worker>"`.

### The Extension ID is rejected

Open `chrome://extensions`, inspect the ID for the exact loaded
`extension/src` directory, set it as `PROOFCLIP_EXTENSION_ID`, and redeploy.
Do not use an ID from another extracted directory.

### Client ID and Client Secret are confused

The Client ID is a public identifier used in authorization; the Client Secret
is sensitive and is entered only with `npx wrangler secret put
NOTION_CLIENT_SECRET`. Both must come from the same Notion integration.

### workers.dev subdomain and Client Secret are confused

The workers.dev subdomain is part of the Worker hostname and callback URL. It
is not a Notion credential. The Client Secret belongs only in the Worker
secret store.

### Redirect URI mismatch

Compare the Notion integration callback and `NOTION_REDIRECT_URI` character by
character. Use the actual deployed Worker hostname, the
`/v1/auth/notion/callback` path, HTTPS, and no trailing slash or wildcard.

### TOKEN_VAULT_KEY fails validation

Generate fresh cryptographic random bytes. The Base64-decoded value must be
exactly 32 bytes. Do not use a password, a short random string, a hex string
without the required decoding contract, or a value copied from another
deployment.

### `/privacy` does not return HTTP 200

Confirm the Worker deployed successfully, the URL is the actual Worker origin,
and you are not opening a Pages URL or an old RC/rehearsal hostname. Inspect
your own Wrangler output and Worker logs without sharing secrets or tokens.

### OAuth callback fails

First confirm the Worker origin, Client ID, Client Secret pairing, and exact
redirect URI. Do not paste authorization codes, tokens, or secrets into an
issue or public chat. Recheck that the integration is public OAuth and that
the authorized Data Source is shared with it.

### The extension still uses `replace-me.invalid`

Edit `extension/src/community-config.mjs` in the exact directory loaded by
Chrome, set the real deployed HTTPS origin without a trailing slash, save, and
click **Reload** on that extension. A different loaded directory can have a
different Extension ID and must be configured separately.

## Privacy and credential hygiene

ProofClip captures only after an explicit user action. Local evidence remains
in the browser until the user explicitly sends it. The extension does not
store a Notion OAuth token. The deployer-owned Worker and D1 store the
encrypted OAuth material required for delivery, while the Worker does not
persist capture bodies, selections, screenshots, or page URLs.

Never publish Client Secrets, token-vault keys, OAuth codes, access tokens,
refresh tokens, or private account identifiers.
