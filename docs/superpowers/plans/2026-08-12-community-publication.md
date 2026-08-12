# ProofClip Community Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the v0.7 frozen import into a public-safe, self-hosted Community edition and release it to GitHub only after local and deployed acceptance evidence is green.

**Architecture:** The extension keeps evidence locally until an explicit send; it talks only to a deployer-configured HTTPS Worker. The Worker owns per-deployer OAuth and D1 state and proxies Notion calls. Commercial entitlement and Official infrastructure paths are removed, not hidden.

**Tech Stack:** Chrome Manifest V3, ES modules, Node's built-in test runner, Cloudflare Workers/D1, Notion OAuth, PowerShell public-source verification, AGPL-3.0-only.

## Global Constraints

- Make no network deployment, GitHub publication, or account change before Task 4 acceptance.
- Never commit a Worker credential, D1 identifier, OAuth secret/token, local extension ID, browser profile, runtime evidence, release archive, or customer data.
- Preserve original evidence immutability and explicit user-authorized delivery.
- Keep all Community UI copy in English.
- Delete obsolete commercial behavior and its tests; do not merely replace the former support email with a placeholder.
- Use `D:\node.js\node.exe --test '.\tests\*.test.mjs'` from `extension\src` and from `worker\src` for each full local suite.
- The public-source gate is `pwsh -NoProfile -File scripts\verify-public-source.ps1 -IncludeUntracked` from repository root.
- Each task is implemented by one fresh subagent, then independently audited by the primary agent before the next task starts.

---

### Task 1: Extension community-only capture flow

**Files:**
- Modify: `extension/src/background.js`, `extension/src/popup.html`, `extension/src/popup.js`, `extension/src/README.md`, and extension styles only where the removed plan UI leaves obsolete layout.
- Delete: commercial-only extension modules and tests, including `core/reminder-state.mjs`, `core/trial-policy.mjs`, and the `bridge-key-wiring`, `daily-quota-wiring`, `quota-record`, `quota-reservation`, `reminder-state`, `trial-license-wiring`, `trial-policy`, and `usage-counters` test files.
- Create: `extension/src/tests/community-commercial-boundary.test.mjs`.
- Modify: every remaining extension test whose expected behavior mentions a subscription, license, bridge key, plan, quota, usage report, or official support request.

**Interfaces:**
- Consumes: the existing local Archive, explicit capture, duplicate guard, and Notion connection/send interfaces.
- Produces: a capture UI that has no plan state, license operation, quota reservation, support-mail path, or request to `/v1/license` or `/v1/usage/report`.

- [ ] **Step 1: Write the failing Community-boundary test.**

The test reads `background.js`, `popup.html`, and `popup.js`; it must reject the commercial message types `ACTIVATE_LICENSE` and `DEACTIVATE_LICENSE`, API paths `/v1/license` and `/v1/usage/report`, and the strings `subscription`, `bridge key`, `support-issued key`, `mailto:` and `50/50` in user-facing source. It must assert that `GET_CONNECTION`, `START_AUTH`, `GET_DATA_SOURCES`, `CAPTURE_WITH_ROUTE`, `CAPTURE_LOCAL`, `SEND_FROM_TOAST`, and `RETRY_OUTBOX` remain wired.

- [ ] **Step 2: Run only the new test and verify it fails because the frozen import still exposes commercial paths.**

Run: `& 'D:\node.js\node.exe' --test '.\tests\community-commercial-boundary.test.mjs'` from `extension\src`.

- [ ] **Step 3: Remove the commercial UI and code paths.**

Remove the Subscription navigation page, key input, activation/deactivation handlers, subscription cache refresh, reminder links, quota reservation/counting, usage-report calls, and plan-specific copy. A successful local capture and an explicit Notion send must remain unrestricted and use the existing Archive/Outbox mechanisms. Keep connection configuration and the privacy disclosure.

- [ ] **Step 4: Remove obsolete tests and update remaining contract tests.**

Delete tests that exclusively prove deleted commercial features. Update shared tests so they assert unrestricted explicit capture and Notion preconditions, rather than a 50-work tier or an entitlement response.

- [ ] **Step 5: Verify the extension task.**

Run the new boundary test, then `& 'D:\node.js\node.exe' --test '.\tests\*.test.mjs'` from `extension\src`. Both must exit zero. Also run `rg -n -i 'subscription|license|bridge key|support-issued key|mailto:|/v1/usage/report' extension/src` and account for every remaining match as a non-user-facing migration or test fixture; none may be executable Community behavior.

- [ ] **Step 6: Commit the task.**

Stage only changed and deleted files under `extension/src`, then commit with `feat: remove commercial extension flows`.

### Task 2: Worker and D1 community-only service

**Files:**
- Modify: `worker/src/worker.mjs`, `worker/src/d1-repository.mjs`, `worker/src/schema.sql`, `worker/scripts/bundle-worker.mjs`, and tests that cover retained OAuth, CORS, connection, Data Source, and capture routes.
- Delete: `worker/src/subscription.mjs`, `worker/src/lemon-license.mjs`, `worker/migrations/20260729_lifetime_license.sql`, `worker/migrations/20260729_webhook_state.sql`, `worker/migrations/20260807_subscription_keys.sql`, `worker/scripts/generate-subscription-key.mjs`, `worker/scripts/renew-subscription-key.mjs`, and commercial-only test files `subscription.test.mjs`, `lemon-license.test.mjs`, and `keygen-scripts.test.mjs`.
- Create: `worker/src/tests/community-service-boundary.test.mjs`.

**Interfaces:**
- Consumes: `POST /v1/auth/notion/start`, the OAuth callback, `GET/DELETE /v1/connection`, `GET /v1/data-sources`, and `POST /v1/captures`.
- Produces: a Worker that authorizes the configured extension origin and Notion connection without a license, payment, telemetry, or webhook dependency.

- [ ] **Step 1: Write the failing Worker-boundary test.**

Create an app fixture with a connected Notion token and a valid configured extension ID. Assert a capture reaches the Notion proxy without a license activation. Assert `/v1/license`, `/v1/license/activate`, `/v1/usage/report`, and `/v1/webhooks/lemon` return 404. Assert the Worker source and bundle manifest do not import subscription or Lemon modules.

- [ ] **Step 2: Run only the new test and verify it fails on the frozen routes and imports.**

Run: `& 'D:\node.js\node.exe' --test '.\tests\community-service-boundary.test.mjs'` from `worker\src`.

- [ ] **Step 3: Remove commercial service behavior.**

Delete license entitlement lookup/activation/deactivation, Lemon webhook validation, subscription repository methods, usage counters, legacy license schema/migrations, and key-management scripts. Make capture authorization depend only on a valid configured extension origin and an active Notion connection. Preserve token encryption, state expiry, rate limits, strict CORS, payload validation, and explicit delivery.

- [ ] **Step 4: Replace the public pages and retained tests.**

Rewrite Worker privacy content for deployer-owned self-hosting: local evidence remains in the browser until explicit send; the deployer's Worker stores encrypted OAuth material and no capture body archive. Remove the support/refund route. Update worker tests to remove subscription setup helpers and verify the retained routes without entitlement.

- [ ] **Step 5: Verify the Worker task.**

Run the new boundary test, then `& 'D:\node.js\node.exe' --test '.\tests\*.test.mjs'` from `worker\src`; both must exit zero. Run `rg -n -i 'subscription|license|lemon|bridge|payment|refund|usage/report' worker/src worker/migrations worker/scripts` and leave no executable match.

- [ ] **Step 6: Commit the task.**

Stage only changed and deleted files under `worker`, then commit with `feat: remove commercial worker services`.

### Task 3: Public assets, license, and release gate

**Files:**
- Modify: `README.md`, `MIGRATION.md`, `CONTRIBUTING.md`, `SECURITY.md`, `TRADEMARKS.md`, `deploy/README.md`, `docs/architecture.md`, `docs/security.md`, `docs/self-hosted-notion-oauth.md`, `docs/acceptance/community-baseline.md`, `scripts/verify-public-source.ps1`, and extension/Worker README files.
- Create: `LICENSE`, `COPYING_MANIFEST.json`, `docs/acceptance/community-release-checklist.md`.
- Modify: source-contract tests that verify public copy, deployment documentation, file inventory, and public-source scanning.

**Interfaces:**
- Consumes: Task 1's commercial-free extension and Task 2's commercial-free Worker.
- Produces: a repository whose public docs explain only self-hosted Community behavior, whose license is AGPL-3.0-only, and whose scanner rejects both known private identity and forbidden commercial service artifacts.

- [ ] **Step 1: Write failing documentation and scanner contract tests.**

Add assertions that the root README and deploy guide specify deployer-owned Worker/D1/Notion OAuth and no payment, subscription, license key, telemetry, or official service dependency. Add scanner fixtures that fail on a fixed Worker origin, a private email, a subscription key route, a Lemon webhook, and a committed secret file.

- [ ] **Step 2: Run the focused contracts and confirm they fail against the current documentation and scanner.**

Run the affected extension and Worker test files with `D:\node.js\node.exe --test`; record the expected missing/forbidden assertions before changing implementation.

- [ ] **Step 3: Rewrite documentation and enforce the public boundary.**

Remove payment and commercial migration instructions, reduce D1 setup to the retained schema, document the source-offer requirement for a modified network Worker, retain the separate trademark restriction, and document the exact fresh-account rehearsal. Extend `verify-public-source.ps1` so tracked or untracked files fail when they contain a private deployment identity, secret material, or an executable commercial endpoint/module. Do not use allowlists for removed source.

- [ ] **Step 4: Add license and reproducible manifest.**

Add the verbatim AGPL-3.0-only license text in `LICENSE`. Generate `COPYING_MANIFEST.json` from the clean repository file inventory with relative path and SHA-256 for each public source/documentation file; exclude `.git`, `.worktrees`, ignored local configuration, build output, and any secret/runtime evidence. The manifest must contain no absolute local path.

- [ ] **Step 5: Verify the public release gate.**

Run `pwsh -NoProfile -File scripts\verify-public-source.ps1 -IncludeUntracked` at repository root and require exit zero. Re-run both full Node suites. Check `git status --short` and `git diff --check`; neither may reveal credentials, a live deployment identity, or unrelated source.

- [ ] **Step 6: Commit the task.**

Stage only Task 3 documentation, test, script, `LICENSE`, and `COPYING_MANIFEST.json` files, then commit with `docs: prepare public Community release`.

### Task 4: Fresh deployment rehearsal and publication acceptance

**Files:**
- Modify: `docs/acceptance/community-baseline.md`, `docs/acceptance/community-release-checklist.md`, and `COPYING_MANIFEST.json` only if the accepted source inventory changes.
- Do not create: `worker/wrangler.jsonc`, `.dev.vars`, runtime evidence, screenshots, browser exports, OAuth tokens, D1 identifiers, or copied production configuration.

**Interfaces:**
- Consumes: the clean Task 1-3 source and a new deployer-owned Cloudflare/D1/Notion OAuth configuration.
- Produces: a credential-free acceptance record that distinguishes local source verification, deployment completion, and an actual self-hosted Notion delivery.

- [ ] **Step 1: Run the pre-rehearsal local gate.**

Run the public-source scanner and both full Node suites. Record command, timestamp, exit code, pass/fail counts, and git commit in the release checklist without secrets.

- [ ] **Step 2: Perform the deployer-owned setup.**

Create a new D1 database, apply only the retained schema, create a new Notion integration, set its callback to the newly deployed Worker, store `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET`, `NOTION_REDIRECT_URI`, and a fresh 32-byte base64 `TOKEN_VAULT_KEY` only as Worker secrets, load the unpacked extension, set `PROOFCLIP_EXTENSION_ID`, deploy, then set the extension's local Community API origin. If an account login, payment, CAPTCHA, or irreversible provider confirmation is requested, preserve the screen and hand it to Jason; do not record any credential.

- [ ] **Step 3: Execute the end-to-end acceptance.**

Using the independently loaded extension, start Notion OAuth, approve the new integration, select a Data Source, save one local capture, explicitly send it, and confirm the resulting record appears in that new Notion Data Source. Confirm a wrong extension origin receives no CORS permission. Verify no capture body or screenshot is persisted in D1 by reviewing the deployed schema and Worker logic, not by exporting user data.

- [ ] **Step 4: Record evidence and re-run source gates.**

Write only pass/fail outcomes, dates, deployed-origin redaction, and command results into the release checklist. Re-run the scanner and both full Node suites. Recreate `COPYING_MANIFEST.json` only if a tracked release record changed, then scan again.

- [ ] **Step 5: Primary-agent publication action.**

After primary-agent review accepts this task, create a GitHub repository with the AGPL-3.0 license, push `codex/community-public-baseline`, and make the repository public only if the release checklist shows every gate green. Do not upload release binaries, credentials, screenshots, or runtime evidence.

### Task 5: Public-history and origin-boundary release repair

**Files:**
- Modify: `worker/src/worker.mjs`, `worker/src/tests/worker.test.mjs`, `worker/src/tests/community-service-boundary.test.mjs`, and only tests that use the real rehearsal Data Source UUID.
- Modify: `scripts/verify-public-source.ps1` and its source-contract test in `extension/src/tests/public-source-guard.test.mjs`.
- Modify: `COPYING_MANIFEST.json` after the public source changes.
- Primary-agent-only Git action: publish from a new orphan branch containing the final tree as one root commit; never push the current private/bootstrap commit graph.

**Interfaces:**
- Consumes: the verified Community source at Task 4.
- Produces: a Worker that rejects every protected API request unless `Origin` exactly equals the configured extension origin, plus a public scanner that inspects every commit reachable from `HEAD`.

- [ ] **Step 1: Write failing boundary tests.**

Add a Worker test for protected `GET /v1/connection` and `POST /v1/captures` with a valid install identifier but no `Origin`; both must return 403 without CORS permission. Add a scanner contract fixture demonstrating that a forbidden identity in a reachable Git commit is rejected. Replace every real rehearsal Data Source UUID in test fixtures with a clearly synthetic test UUID and assert no known real UUID remains in public source.

- [ ] **Step 2: Verify the tests fail.**

Run the focused Worker and scanner tests. Confirm the missing-Origin requests currently pass and the historical scanner assertion currently has no implementation.

- [ ] **Step 3: Enforce the release boundaries.**

Change the protected-route origin guard so missing, wrong, or unconfigured origins all receive a generic 403 response; only the Notion OAuth callback remains exempt. Extend the scanner to enumerate every commit reachable from `HEAD` and scan each versioned file for forbidden deployment identities, secret material, fixed Worker origins, and executable commercial artifacts. Do not scan dangling or unrelated private Git objects.

- [ ] **Step 4: Prepare clean public content.**

Replace every actual rehearsal Data Source ID with a synthetic fixture UUID that is not a deployed resource. Regenerate `COPYING_MANIFEST.json`. Confirm the existing release checklist remains credential-free.

- [ ] **Step 5: Verify source changes and commit.**

Run focused tests, both full Node suites, manifest validation, and `git diff --check`. The history-aware scanner is expected to remain red on the current private/bootstrap graph until the primary agent performs the orphan-history publication action. Commit source changes as `fix: enforce public release boundaries`.

- [ ] **Step 6: Primary-agent orphan-publication action.**

From the accepted final tree, create a new orphan publication branch with one root commit containing only public-safe files. Verify the history-aware scanner, both full suites, manifest, and diff on that orphan branch. Only then create the GitHub repository and push that orphan branch; do not push the original branch or any private/bootstrap ancestor.
