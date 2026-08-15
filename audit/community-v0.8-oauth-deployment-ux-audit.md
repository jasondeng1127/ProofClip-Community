# Community 0.8 OAuth + Deployment UX Audit

Audit type: continuation / delta investigation. Scope is limited to the Worker → Cloudflare → Notion → token vault/D1 OAuth chain, Community deployment/distribution UX, and Commercial 0.8 Outbox corresponding-fix re-verification. Shortcuts, full-repository scans, release governance re-audit, new release criteria, and new workspaces were intentionally excluded.

## 1. Executive Conclusion

- OAuth root cause: **PARTIAL** — the failure is localized to the callback’s Notion token-exchange stage, while the current local request contract is correct; the remote Worker bundle/config/provider error is not observable from this workspace.
- Deployment UX: **MANUAL SELF-HOST** — the repository has a useful deployment guide and a Worker bundle helper, but D1 creation, migrations, four secrets, extension ID/CORS binding, API origin, deploy/redeploy, and verification remain manual.
- Doctor: **NOT IMPLEMENTED** — no repository doctor/health/deploy-diagnostic command was found.
- Commercial Outbox: **VERIFIED_FIXED** at source and targeted-test level; separate browser/runtime evidence is not present in this delta.

This is an evidence handoff, not a release approval. No release state, tag, public status, or deployment was changed.

## 2. OAuth Chain

| Stage | Expected | Observed | Evidence | Status |
| --- | --- | --- | --- | --- |
| Extension | Use the configured Community HTTPS origin, generate/persist an install ID, and call `POST /v1/auth/start`. | Source does this; Jason’s real flow reached the OAuth failure page. | `extension/src/core/proofclip-api.mjs:1-47`; `extension/src/background.js:680-682` | **SOURCE PASS / E2E PARTIAL** |
| auth/start | Validate install ID, hash it, persist one-time state in D1, and build the Notion authorization URL from deployer env. | Local route test stores state and returns the expected URL. Live POST was intentionally not run because it creates OAuth state. | `worker/src/worker.mjs:49-59`; targeted Worker tests | **LOCAL PASS / REMOTE UNVERIFIED** |
| Notion authorize | Use `owner=user`, `client_id`, `redirect_uri`, `response_type=code`, and state. | Local source matches the documented authorization shape. A new authorization was not started during this delta. | `worker/src/worker.mjs:57-58`; [Notion authorization guide](https://developers.notion.com/guides/get-started/authorization) | **SOURCE PASS / LIVE UNVERIFIED** |
| callback | Receive code/state, consume state once, reject replay/expiry, then exchange the code. | Deployed callback route is reachable: no-parameter probe returned 400. Jason’s real callback displayed “Notion could not exchange the authorization.” | `worker/src/worker.mjs:61-78`; evidence log | **ROUTE PASS / RUNTIME FAIL** |
| Worker token exchange | POST to `https://api.notion.com/v1/oauth/token` using Basic client credentials, JSON grant, redirect URI, and `Notion-Version`. | Current local source and reproducible bundle include `Notion-Version: 2026-03-11`; targeted tests pass. The actual deployed request is unknown. The request shape matches Notion’s current token documentation. | `worker/src/oauth.mjs:1-29`; `worker/src/notion-proxy.mjs:1`; [Notion create-token reference](https://developers.notion.com/reference/create-a-token) | **LOCAL PASS / REMOTE UNKNOWN** |
| token vault / D1 | Encrypt access/refresh tokens with the deployer’s 32-byte AES-GCM key and save only encrypted envelopes plus minimal identity/timestamps. | Local vault, D1 repository, callback-save, and no-token-leak tests pass. The live failing flow did not reach a confirmed successful token save. | `worker/src/token-vault.mjs:1-39`; `worker/src/d1-repository.mjs:1-27`; `worker/src/schema.sql:1-18` | **LOCAL PASS / LIVE UNVERIFIED** |
| connection | Query by hashed install ID, then permit Data Source/setup/capture routes with the saved token. | Unrelated Origin is rejected online with 403; missing install ID is rejected with 400. Connected status and remote D1 row were not inspected. | `worker/src/worker.mjs:80-96,129-163`; read-only CORS probes | **BOUNDARY PASS / CONNECTION UNVERIFIED** |

### Chain interpretation

The user-visible error maps to the `callback()` catch around `exchangeAuthorizationCode()`. That confirms the failing stage, not the provider’s underlying reason. The current source sends the fields and header required by the current Notion documentation, so “missing `Notion-Version` in the current local source” is refuted. It is not possible to say whether the deployed Worker has this fix.

## 3. Root Cause

### Confirmed

- The real user flow fails after the Notion callback reaches the Worker’s token-exchange handling.
- The current local implementation sends Basic auth, JSON `grant_type/code/redirect_uri`, and `Notion-Version: 2026-03-11`; the targeted exchange test passes.
- The current local bundle is reproducible from current source: expected and actual SHA-256 are both `D960D6CFC19D0EA8239817AB6A16973EB78F5D86BCCB1454E71D8A551A236DC1`.

### Contributing

- The callback deliberately collapses all provider failures into the generic message, so the provider HTTP status/body is not available to the user or this audit.
- The deployment guide requires manual alignment of the Notion callback URL, `NOTION_REDIRECT_URI`, client ID, client secret, token-vault key, D1 binding, and extension ID. There is no automated preflight for these values.
- The current staged artifact records bundle SHA `AE8B507561AD98054992DD0C8AF8797B16EC04E23CAF8688225C7A56C7B67C77`, while the current dirty-tree bundle is `D960D6CFC19D0EA8239817AB6A16973EB78F5D86BCCB1454E71D8A551A236DC1`. If the online Worker came from the staged artifact, it may predate the local OAuth header fix; this is a leading hypothesis, not a confirmed fact.

### Refuted by current evidence

- A current-local-code Notion contract mismatch is not supported: the local shape matches the provider’s documented token exchange.
- A random unrelated extension origin is not accepted by the online Worker: the read-only probe returned 403 without an allow-origin header.
- A local token-vault cryptography or D1 repository failure is not reproduced by the targeted tests.

### Unverified

- The actual provider status/body for Jason’s failed exchange (`invalid_client`, redirect mismatch, expired/invalid code, missing header, or another provider error).
- The deployed Worker bundle SHA/commit and whether its environment contains the current OAuth fix.
- The deployed Notion integration’s registered callback URI versus `NOTION_REDIRECT_URI`.
- Cloudflare Worker secrets, remote D1 schema/rows, and Worker logs. No secrets or tokens were read.

## 4. Local vs Deployed Worker

| Item | Evidence | Result |
| --- | --- | --- |
| Local source identity | Community `main`, HEAD `c09f5ccac038d29ffc13d3b4b25fdcba7e53c32d`; OAuth and related changes are in the dirty working tree, not committed at this HEAD. | **KNOWN, DIRTY** |
| Local source OAuth fix | `worker/src/oauth.mjs` imports `NOTION_VERSION` and sends it in the token request. | **PRESENT** |
| Local bundle identity | `worker/dist/worker.mjs`, 35,201 bytes, SHA-256 `D960D6CFC19D0EA8239817AB6A16973EB78F5D86BCCB1454E71D8A551A236DC1`; reproduced in memory from current source. | **MATCHES CURRENT SOURCE** |
| Configured extension origin | `extension/src/community-config.mjs` points to `https://proofclip-community-rc1-20260814.jasondeng1127.workers.dev`. | **KNOWN, UNCOMMITTED** |
| Known deployed identity | Online endpoint returned Cloudflare responses for `/privacy`, callback-without-parameters, and CORS probes, but exposes no commit or bundle identity. Wrangler is unavailable locally and no Cloudflare account/log access was used. | **UNKNOWN** |
| Artifact comparison | Staged artifact `proofclip-community-0.8.0-2026-08-14T14-01-33-042Z.zip`, SHA-256 `04BFDC15EC78485286646CAC702AF9B935F4027F72EAFC5FFC22F34FEDF47CCC`; embedded bundle SHA is `AE8B...`, not current local `D960...`. | **NOT MATCHED** |
| Source/bundle/deployed match | No remote identity endpoint, deployment manifest, or Cloudflare log was available. | **UNVERIFIED** |

## 5. Deployment UX Matrix

| Feature | Implemented? | Automated? | Tested? | E2E? | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Worker bundle | Yes | Yes, bundle helper only | Yes; reproducibility matched | No remote deployment run | PASS for build helper | `worker/scripts/bundle-worker.mjs`; bundle check log |
| Worker/D1 config template | Yes | No | Template/source only | No | PARTIAL | `deploy/wrangler.template.jsonc` |
| D1 creation and schema/migration | SQL and documented Wrangler commands | No | No remote D1 | No | MANUAL / NOT VERIFIED | `deploy/README.md:14-32`; `worker/src/schema.sql`; `worker/migrations/20260813_privacy_nonretention.sql` |
| Notion integration and callback registration | Documented | No | No live settings inspection | OAuth currently fails | INCOMPLETE | `deploy/README.md:36-48` |
| Worker secrets | Four secret names documented | No | No secret values inspected | No | MANUAL / NOT VERIFIED | `deploy/README.md:42-50`; `deploy/.dev.vars.example` |
| Extension ID / CORS binding | `PROOFCLIP_EXTENSION_ID` validation and rejection path exist | No; ID copy and redeploy are manual | Wrong-origin online probe passed; allowed real ID not known | No | PARTIAL | `worker/src/worker.mjs:24-42,149-163` |
| Extension API origin | Source validation exists; actual origin is manually edited | No | Source/config inspected; current config is dirty | No | PARTIAL / HIGH RISK | `extension/src/community-config.mjs`; `deploy/README.md:55-63` |
| Deploy/redeploy | Wrangler commands documented | No orchestrator; `wrangler` unavailable in PATH | Not run | No | MANUAL SELF-HOST / NOT VERIFIED | `deploy/README.md:55-60`; tool discovery log |
| Smoke verification | Documented OAuth/Data Source/local/direct capture sequence | No | Only safe public probes; real OAuth fails | No | INCOMPLETE | `deploy/README.md:65-66`; `docs/release-rehearsal-0.8.md` |
| Doctor/health check | None found | No | Command does not exist | No | NOT IMPLEMENTED | repository file inventory; `doctor_files=0` |
| Upgrade/rollback | Rehearsal checklist exists | No | Not run in this delta | No | NOT VERIFIED | `docs/upgrade-rehearsal-0.8.md` |

### Overall deployment UX classification

**MANUAL SELF-HOST.** One bundle helper does not make the end-to-end deployment script-assisted: the deployer still performs provider setup, D1 operations, four secret writes, extension-ID binding, API-origin editing, deploy/redeploy, and manual smoke verification.

## 6. Fresh User Deployment Walkthrough

The actual documented path is:

1. Install Node.js and Wrangler; obtain a Cloudflare account, a Notion integration, and the unpacked extension.
2. Copy `deploy/wrangler.template.jsonc` to `worker/wrangler.jsonc`, create a D1 database, and fill the Worker name/database ID/extension ID fields.
3. Run the bundle helper and two remote D1 commands for schema and privacy migration.
4. Register the callback URL in the deployer’s Notion integration and write four Worker secrets: `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`, and `TOKEN_VAULT_KEY`.
5. Load the extension to obtain its 32-character ID, update the Worker config, bundle again, and run `wrangler deploy`.
6. Edit `extension/src/community-config.mjs` to the deployed HTTPS origin and reload the extension.
7. Connect Notion, approve the integration, select a Data Source, run **Set up ProofClip**, save a local capture, and explicitly send it to Notion.
8. For release-grade verification, additionally run the documented CORS, failure/Outbox retry, capture matrix, privacy, and upgrade checks.

Minimum documented interaction count (not a claim that these are easy):

| Category | Count | Basis |
| --- | ---: | --- |
| Repository automation | 1 helper capability (`bundle-worker.mjs`), invoked twice in the documented flow | `deploy/README.md` |
| Manual local/configuration groups | At least 8 groups: template, D1, schema/migration, secrets, extension ID, deploy/redeploy, API origin/reload, smoke verification | deployment guide steps |
| Provider/dashboard tasks | At least 2: create D1 and create/configure Notion integration; exact UI click count is not documented | deployment guide |
| Secret writes | 4 named secrets | `deploy/README.md:42-50` |
| Verification gates | 6 rows in the clean deployment rehearsal record, plus the upgrade rehearsal record | `docs/release-rehearsal-0.8.md`; `docs/upgrade-rehearsal-0.8.md` |
| Automated end-to-end deployment | 0 | no orchestrator/doctor and no live rehearsal |

## 7. Doctor Assessment

| Question | Result |
| --- | --- |
| Command exists? | **NO**. No repository file matching doctor/health/diagnostic setup was found. |
| Scope implemented? | **NONE**. Existing scripts bundle or verify source; they do not inspect Cloudflare secrets, D1, OAuth, CORS, or remote identity. |
| Actually run? | The repository inventory was run; no doctor command could be run. `wrangler` was not available on PATH. |
| Final doctor status | **DOCTOR = NOT IMPLEMENTED** |

## 8. Commercial Outbox Verification

### Commercial source and tests

- Commercial 0.8 targeted command exited 0: **25 passed, 0 failed** across Outbox recovery, batch send, archive wiring, and direct-routing wiring.
- The shared fix is present in Commercial source: prerequisite failures are routed through the existing `attemptDelivery` catch/queue path; batch results expose `queued`; archive feedback reports queued count rather than treating every failed item as persisted.

### Community parity and tests

- Community targeted command exited 0: **25 passed, 0 failed** across the corresponding test set.
- Community source contains the same bounded behavior: prerequisite failure becomes `FAILED` plus a queued `NEEDS_VERIFICATION` item, batch result reports `queued`, and verification resend clears the item after recovery.

### Runtime evidence separation

- Jason independently verified Community prerequisite-failure runtime: `Archive=FAILED`, `Outbox=3`, and batch summary count equals Outbox count. This is user-provided runtime evidence and closes the previously open Outbox front-half question.
- No fresh Commercial browser/runtime session was executed in this delta. Therefore `VERIFIED_FIXED` means source plus targeted behavior tests; it does not claim a new Commercial browser rehearsal.

## 9. Remaining Blockers / Unverified Items

- The real Notion OAuth flow still fails for Jason with “Notion could not exchange the authorization.”
- The provider’s actual exchange response is hidden by the generic callback error; Cloudflare logs or a safe diagnostic must identify the HTTP status/error class.
- Remote Worker bundle identity and deployment commit are unknown; the staged artifact bundle does not match the current dirty-tree bundle.
- Notion callback registration and `NOTION_REDIRECT_URI` exact equality are unverified.
- Worker secrets, token-vault key validity, remote D1 schema, and D1 connection writes are unverified.
- A real fresh-account deployment rehearsal is not verified.
- Allowed-extension-origin CORS success is not verified against the actual installed extension ID; only unrelated-origin denial is observed online.
- 0.7 → 0.8 migration, upgrade continuity, and rollback remain NOT VERIFIED.
- No Doctor/health/preflight command exists.
- Commercial Outbox browser/runtime evidence was not rerun; only source and targeted tests are verified.

## 10. Minimal Next Actions (maximum 5)

1. Jason: inspect the deployed Worker’s version/bundle identity and the Cloudflare log for one failed callback; capture only provider HTTP status/error class, never tokens or secrets.
2. Jason: verify the Notion integration callback URI is byte-for-byte equal to the deployed Worker `NOTION_REDIRECT_URI`, then start a fresh authorization attempt.
3. If the deployed bundle is not the current reproducible bundle, redeploy the intended bundle after binding its SHA to the deployment record; do not treat the current remote route as fixed until this is proven.
4. Add or run a credential-free preflight/Doctor covering callback URI, required env names, D1 binding/schema, extension ID/CORS, and deployed bundle identity before another E2E attempt.
5. Complete a fresh self-host OAuth → Data Source setup → local/direct capture → Outbox recovery rehearsal and record the evidence; keep 0.7 → 0.8 upgrade rehearsal separate.

## Findings

### BLOCKER candidate

- **OAuth live path is currently unusable for the observed deployment.** A real user cannot complete Notion connection, and the failing provider reason is not yet captured. This is a candidate for Terra to assess, not a final release decision.

### MAJOR candidate

- **Source/deployed/artifact identity is not closed.** Current local OAuth source/bundle differs from the staged artifact’s recorded Worker bundle, and the online Worker exposes no identity. The OAuth fix cannot be credited to the deployed service without Jason’s Cloudflare evidence.
- **Fresh self-host deployment is not operationally proven.** The path is manual, has no Doctor, and the actual OAuth/Data Source flow fails.

### MINOR

- **Provider diagnostics are too opaque.** The generic callback message protects secrets but prevents mechanical distinction between invalid client, redirect mismatch, expired code, missing header, or provider outage.

### NOTE

- Online `/privacy` returned 200 with self-hosted disclosure.
- Online callback route returned the expected 400 for missing code/state.
- Online unrelated-origin `/v1/connection` returned 403.
- Shortcut investigation is intentionally closed based on Jason’s real Alt+1/2/3 verification.
- Release governance was intentionally not re-audited in this delta.

## Evidence Index

| Conclusion | File / command / artifact | Evidence |
| --- | --- | --- |
| Current baseline and dirty scope | `D:\ProofClip-Community`, `git rev-parse HEAD`, `git status --short --branch`, upstream `e8ea712f957e25013052a3e8a21458e8f420d74e` | This report and `audit/community-v0.8-oauth-deployment-ux-checks.txt` |
| Local OAuth chain | `worker/src/oauth.mjs`, `worker/src/worker.mjs`, `worker/src/token-vault.mjs`, `worker/src/d1-repository.mjs`, `worker/src/schema.sql` | Targeted Worker command: 26/26 passed |
| Provider contract comparison | Notion token endpoint and authorization docs | [Create a token](https://developers.notion.com/reference/create-a-token); [Authorization guide](https://developers.notion.com/guides/get-started/authorization) |
| Local bundle identity | `worker/scripts/bundle-worker.mjs`, `worker/dist/worker.mjs` | Current bundle SHA `D960D6CFC19D0EA8239817AB6A16973EB78F5D86BCCB1454E71D8A551A236DC1`; reproducibility result in evidence log |
| Remote route observations | configured Worker origin; safe GET/CORS probes | CF-Rays and status/body captured in evidence log |
| Deployment UX | `deploy/README.md`, `deploy/wrangler.template.jsonc`, `deploy/.dev.vars.example`, `docs/release-rehearsal-0.8.md` | Manual step inventory; `wrangler_available=False`; `doctor_files=0` |
| Commercial Outbox | upstream Commercial test paths at pinned commit `e8ea712f957e25013052a3e8a21458e8f420d74e` | 25/25 passed; exact command/result in evidence log |
| Community Outbox parity | `extension/src/background.js`, `extension/src/core/archive-bulk-send.mjs`, `extension/src/archive.js`, corresponding tests | 25/25 passed; Jason runtime evidence recorded above |
| Staged artifact | `D:\ProofClip-Community\release\artifacts\proofclip-community-0.8.0-2026-08-14T14-01-33-042Z.zip` | SHA-256 `04BFDC15EC78485286646CAC702AF9B935F4027F72EAFC5FFC22F34FEDF47CCC`; record `release/records/release-record.json` |
| Prior baseline dossier | `audit/community-v0.8-luna-release-dossier.md` and `.json` | Prior release dossier retained; unrelated suites/governance were not rerun |
