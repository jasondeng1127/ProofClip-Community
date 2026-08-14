# Clean self-host deployment rehearsal — Community 0.8

> Credential-free checklist. Execute in a **fresh** Cloudflare account /
> D1 / Notion integration / Chrome profile. All identifiers, origins,
> credentials and tokens stay outside this repository. This rehearsal is a
> release gate: it must pass before READY_FOR_RELEASE_REVIEW.

## 0. Prerequisites (run by the maintainer)

- [ ] Cloudflare account with Workers + D1 enabled (fresh or throwaway).
- [ ] Notion integration created in that account.
- [ ] Node.js + Wrangler installed; `git` available; this repo at the 0.8 tree
      (`extension/src/manifest.json` version 0.8.0).
- [ ] `pwsh -NoProfile -File scripts/verify-public-source.ps1 -IncludeUntracked` exits 0.
- [ ] `node release/release-audit.mjs` reports AUTO_GATES_PASS except the two
      rehearsals (expected NOT_RUN).

## 1. Fresh deploy

```powershell
cd worker
wrangler d1 create <FRESH_D1_NAME>          # record the new database id
```
- [ ] Copy `deploy/wrangler.template.jsonc` to `worker/wrangler.jsonc` and fill
      in the fresh database id and the extension id (obtained in step 3).
- [ ] `node scripts/bundle-worker.mjs` succeeds; `worker/dist/worker.mjs` exists.

## 2. D1 schema (only the two Community statements)

```powershell
wrangler d1 execute <FRESH_D1_NAME> --file src/schema.sql --remote
wrangler d1 execute <FRESH_D1_NAME> --file migrations/20260813_privacy_nonretention.sql --remote
```
- [ ] Both commands exit 0. Expected tables: `oauth_states`, `connections` only.
      Expected: NO licenses/webhook_events/subscriptions/subscription_devices/
      daily_usage/usage_counters tables.

## 3. Secrets, extension, deploy

```powershell
wrangler secret put NOTION_CLIENT_ID
wrangler secret put NOTION_CLIENT_SECRET
wrangler secret put NOTION_REDIRECT_URI    # https://<fresh-worker>.workers.dev/v1/auth/notion/callback
wrangler secret put TOKEN_VAULT_KEY        # fresh base64 32-byte key
node scripts/bundle-worker.mjs
wrangler deploy
```
- [ ] Load `extension/src` unpacked in the fresh Chrome profile; copy its
      32-character extension id into `wrangler.jsonc` (`PROOFCLIP_EXTENSION_ID`)
      and redeploy.
- [ ] Set `COMMUNITY_API_ORIGIN` in `extension/src/community-config.mjs` to the
      fresh Worker origin; reload the extension.

## 4. OAuth and Data Source

- [ ] Open the extension, Connect → Notion approval in the fresh integration.
- [ ] Choose the fresh Data Source → **Set up ProofClip** (fields are added and
      mapped automatically). Save target mapping.
- [ ] Privacy link in the popup resolves to `<fresh-origin>/privacy` and the
      page discloses the self-hosted flow (no mailto, no official identity).

## 5. Capture matrix

- [ ] Alt+1 selection (empty selection refused), Alt+2 region (watermarked,
      Esc/right-click cancels), Alt+3 full page (long page kept in full,
      structured blocks present in Archive reader).
- [ ] Context-menu selection capture on a normal site.
- [ ] Duplicate-capture warning on a repeated URL (Continue / Cancel / countdown).
- [ ] Local route: record appears in Archive; edit project/tags/note; search/filter.
- [ ] Direct route: capture is delivered to the fresh Data Source and NOT added
      to the local Archive; "Open saved page in Notion" link works.

## 6. Delivery failure path

- [ ] Disconnect Notion, send from Archive → failure lands in Outbox with
      NEEDS_VERIFICATION; reconnect and use the verified resend; record is
      delivered once (no duplicate page).

## 7. CORS boundary

- [ ] With the extension origin allowed: `Access-Control-Allow-Origin` echoes it.
- [ ] From an unrelated origin (e.g. curl with a different Origin header on
      `/v1/connection`): 403 with no allow-origin header.

## 8. Record

| Gate | Result | Notes (no secrets) |
| --- | --- | --- |
| public-source scan | | |
| D1 tables | | |
| OAuth + setup | | |
| capture matrix | | |
| failure/retry path | | |
| CORS | | |

When all pass, update `release/records/release-record.json`:
`rehearsals.freshDeploy = "PASS"`, then re-run `node release/release-audit.mjs`.
