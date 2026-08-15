# ProofClip Community 0.8 Luna Mechanical Release Dossier

Audit date: 2026-08-14

Scope: mechanical pre-release evidence collection for Terra's independent release audit. This dossier does not approve release, change public-release state, create a tag, push, deploy, or publish.

## 1. Audited baseline

| Field | Observed value |
|---|---|
| Workspace | `D:\ProofClip-Community` |
| Branch | `main` |
| HEAD | `ac645ae6b38f9419b9c546e255296e4e4f7afc0d` (`chore: ignore local worktrees`) |
| Manifest version | `0.8.0`, `extension/src/manifest.json:4` |
| Git tag | None. `git tag --sort=-creatordate` returned no tags. |
| Relevant upstream reference | `codex/proofclip-v0.8.0`, private worktree snapshot `D:\网络赚钱\.worktrees\proofclip-v0.8.0`; `release/edition-boundary.json:9` explicitly says it is not pinned to a tag. |
| Current release record | NOT FOUND. No current release record path exists in this worktree. |
| Artifact ZIP | NOT FOUND. Recursive ZIP search returned none. |
| Artifact SHA256 | NOT AVAILABLE because no ZIP artifact exists. |
| Generated tree | `release/out/community-0.8.0/` |
| Provenance | `release/out/community-0.8.0/PROVENANCE.json`; target `0.8.0`, 115 listed files, 359 skipped inputs, boundary SHA256 `630532e62d931e8e410edbb74a5e35b67ca8dfc5145927bb62d479a1f66d41a6` |

Baseline Git status, captured before this dossier was created:

```text
## main
 M .gitignore
 M MIGRATION.md
 M README.md
 M deploy/README.md
 M docs/acceptance/community-baseline.md
 M scripts/verify-public-source.ps1
?? .github/
?? extension/
?? release/
?? scripts/agent-probes/
?? worker/
```

The workspace is not a release snapshot. Before the audit files were added, the working tree contained 6 modified tracked files and 411 untracked files: 96 under `extension/`, 19 under `worker/`, 293 under `release/`, and 3 other files. `release/` included 128 files under `release/tmp/backup-0.7-swap/`. No untracked file was silently treated as committed evidence.

## 2. DSH change scope

No DSH 0.8 commit was identified on the audited `main` branch. HEAD remained `ac645ae6b38f9419b9c546e255296e4e4f7afc0d`; the Community 0.8 source, release pipeline, generated tree, and backup are uncommitted/untracked in this worktree.

Tracked working-tree delta against HEAD: 6 files, `35 insertions / 8 deletions`:

- `.gitignore`: local/generated path rules; the current rule is `release/out/release/tmp/`, which does not ignore the actual `release/tmp/` path.
- `MIGRATION.md`, `README.md`, `deploy/README.md`, `docs/acceptance/community-baseline.md`: Community 0.8 export, self-host and migration statements.
- `scripts/verify-public-source.ps1`: public-source identity and commercial-boundary gate wiring.

Untracked DSH scope:

- `extension/src/`: generated Community 0.8 capture, Archive, settings, routing, Notion and tests.
- `worker/src/`, `worker/migrations/`, `worker/scripts/`: deployer-owned Worker, D1 schema/privacy migration, OAuth/token vault, Notion proxy and bundle script.
- `release/edition-boundary.json`, `release/export-community.mjs`, `release/verify-generated-tree.mjs`, `release/overlay/`, `release/tests/`, `release/out/`: export, exclusion, overlay, provenance and boundary checks.
- `release/tmp/backup-0.7-swap/`, `release/tmp/ext.log`, `release/tmp/wrk.log`: 0.7 backup and prior runtime/test logs; these are in the current untracked workspace and are included in the leakage findings.
- `.github/workflows/ci.yml`, `scripts/agent-probes/`: CI and probe checks.

## 3. Test execution

Runtime: `D:\node.js\node.exe`, version `v24.18.0`. The audit used the absolute Node path for the test suites. The public-source script itself resolved `node` as `D:\node.js\node.exe` in this shell.

| Area | Actual command | Result |
|---|---|---|
| Extension suite | From `D:\ProofClip-Community\extension\src`: `D:\node.js\node.exe --test --test-reporter=spec '.\tests\*.test.mjs'` | **FAILED**; 199 tests, 198 passed, 1 failed, 0 skipped, exit 1. Failing test: `tests/public-source-guard.test.mjs`; the gate found five forbidden deployment-identity hits under `release/tmp/backup-0.7-swap/`. |
| Worker suite | From `D:\ProofClip-Community\worker`: `D:\node.js\node.exe --test --test-reporter=spec '.\src\tests\*.test.mjs'` | **PASSED**; 59 passed, 0 failed, 0 skipped, exit 0. |
| Community boundary tests | `D:\node.js\node.exe --test --test-reporter=spec '.\extension\src\tests\community-boundary.test.mjs' '.\extension\src\tests\community-commercial-boundary.test.mjs' '.\worker\src\tests\community-service-boundary.test.mjs'` | **PASSED**; 5 passed, 0 failed, 0 skipped, exit 0. |
| Release hardening | `D:\node.js\node.exe --test --test-reporter=spec '.\extension\src\tests\release-hardening.test.mjs'` | **PASSED**; 1 passed, 0 failed, 0 skipped, exit 0. |
| Release pipeline | `D:\node.js\node.exe --test --test-reporter=spec '.\release\tests\*.test.mjs'` | **PASSED**; 5 passed, 0 failed, 0 skipped, exit 0. Covers determinism, exclusions, overlay, provenance and scanner rejection cases. |
| Agent probes | `D:\node.js\node.exe --test --test-reporter=spec '.\scripts\agent-probes\*.test.mjs'` | **PASSED**; 2 passed, 0 failed, 0 skipped, exit 0. |
| Public-source verification | `pwsh -NoProfile -File '.\scripts\verify-public-source.ps1' -IncludeUntracked` | **FAILED**; exit 1. Five forbidden deployment-identity findings, all in the untracked 0.7 backup. |
| Generated-tree boundary/provenance | `D:\node.js\node.exe '.\release\verify-generated-tree.mjs' '--tree=release/out/community-0.8.0'` | **PASSED**; `Scanned 115 files; CLEAN.`, exit 0. |
| Repo-mode boundary | `D:\node.js\node.exe '.\release\verify-generated-tree.mjs' '--repo'` | **PASSED**; `Scanned 115 files; CLEAN.`, exit 0. This mode intentionally scans only product roots and ignores `release/` and docs. |
| Scanner non-zero check | `D:\node.js\node.exe '.\release\verify-generated-tree.mjs' '--tree=release/does-not-exist'` | **PASSED as a hardening probe**; reported a finding and exit 1. This is not a `release-audit` command. |
| Worker bundle script | `D:\node.js\node.exe '.\worker\scripts\bundle-worker.mjs'` | **PASSED**; exit 0, no stdout. It produced the ignored `worker/dist/worker.mjs`. |

The extension suite was run twice because the first result was captured through a parallel command wrapper. Both runs reproduced exactly `198 pass / 1 fail / 0 skipped`; the repeated failure had the same five paths. No flaky or retry-only behavior was observed. Worker, pipeline, boundary, hardening, probe and bundle checks were not retried after passing.

Not executed or unavailable:

- No `release-audit` script/command exists in the audited repository; no release-audit result can be claimed.
- `COPYING_MANIFEST.json` is absent from the current root and no dedicated source-manifest verification command was found.
- `release/export-community.mjs` was exercised by the pipeline self-tests, but its main command was not run against the private upstream because doing so would rewrite the current generated tree; no claim is made about a fresh current-tree export beyond the passing self-tests and hash comparison.
- No Cloudflare, D1, Notion OAuth, Chrome unpacked-extension, CWS, or external deployment command was executed.

## 4. Product parity matrix

This matrix is source/test parity evidence, not browser or external-service acceptance.

| Capability | Status | Mechanical evidence |
|---|---|---|
| Capture: Selection | PASS | `extension/src/popup.html:31`, `background.js:464-477`; `shortcuts-wiring`, `context-menu-wiring`, `popup-capture-handoff` tests. |
| Capture: Image area | PASS | `popup.html:32`, `background.js:589-624`; `region-capture`, `region-capture-feedback`, direct-routing tests. |
| Capture: Full page | PASS | `popup.html:33`, `background.js:393-433`; full-page extraction and fallback tests. |
| Capture: Alt+1/2/3 | PASS | `popup.html:31-33`; `shortcuts-wiring.test.mjs`. |
| Capture: context menu | PASS | `background.js:807-823`; `context-menu-wiring.test.mjs`. |
| Capture: duplicate warning | PASS | `background.js:290-339`; `duplicate-confirm-wiring.test.mjs`. |
| Capture: local/direct routing | PASS | `popup.html:28`, `popup.js:355`, `direct-routing*.test.mjs`. |
| Capture: feedback | PASS | `capture-feedback*.test.mjs`, `popup-action-feedback-wiring.test.mjs`, `toast-actions-wiring.test.mjs`. |
| Capture: Outbox | PASS | `popup.html:46`, `popup.js:67-122`, `archive-bulk-send`, `direct-routing` and `delivery-lock` tests. |
| Full Page: canonical full `bodyText` | PASS | `background.js:121-181`; `record-longtext.test.mjs` preserves the exact tail above the retired 200,000-character ceiling. |
| Full Page: no Community 0.7 200,000-character truncation | PASS | `record-longtext.test.mjs:13`; `page-structure.test.mjs`. |
| Full Page: structured blocks | PASS | `background.js:123-161`; `page-structure.test.mjs:132-223`; Worker `notion-proxy.test.mjs`. |
| Full Page: headings/paragraphs/lists/quotes/code | PASS | `page-structure.mjs`, `notion-proxy.mjs:38-65`, structured-block tests. |
| Full Page: safe links/images | PASS | `background.js:46-161`; safe URL/image tests and `notion-proxy.test.mjs`. |
| Full Page: fallback to complete `bodyText` | PASS | `background.js:166-181`; `page-cleaner.test.mjs:98-111`, `page-structure.test.mjs:204`. |
| Full Page: readable adapters | PASS | `site-readable-adapters.mjs`; adapter tests for Wikipedia and CBP. |
| Archive: IndexedDB/local storage migration | PASS | `storage.mjs:28-47`; `archive-idb.test.mjs`, `evidence-migration.test.mjs`. |
| Archive: reader/search/filters | PASS | `archive.js`, `archive-query.test.mjs`, `archive-reader-ui.test.mjs`. |
| Archive: Projects/tags/notes/classification | PASS | `projects.mjs`, `evidence-card.mjs`, `projects.test.mjs`, `evidence-card.test.mjs`. |
| Archive: individual/batch send | PASS | `archive.js`, `archive-bulk-send.test.mjs`, `notion-link.test.mjs`. |
| Archive: delivery status/Notion links | PASS | `record.mjs`, `archive.js`, `evidence-card.test.mjs`, `notion-link.test.mjs`. |
| Archive: Outbox recovery/retry | PASS | `popup.js:67-122`, `archive-bulk-send.test.mjs`, `direct-routing.test.mjs`. |
| Archive: remove/export | PASS | `archive-removal.test.mjs`, `archive-idb.test.mjs`, `popup.js:517-548`. |
| Notion: Data Source listing | PASS | `popup.js:336`, Worker `/v1/data-sources`, `worker.test.mjs`. |
| Notion: one-click setup | PASS | `popup.js:471-481`; `data-source-setup-wiring.test.mjs`, Worker setup tests. |
| Notion: field mapping | PASS | `popup.html:66`, `evidence-templates.mjs`, `notion-proxy.mjs:74-125`; mapping tests. |
| Notion: browser templates | PASS | `popup.html:69`, `evidence-templates.test.mjs`, `template-ui-wiring.test.mjs`. |

Aggregate parity status is **NEEDS REVIEW** for release purposes because no real Chrome browser run or real Notion delivery was performed. The code/test matrix itself has no identified missing 0.8 capability in the listed scope.

## 5. Commercial boundary scan

### 5.1 Actual-risk hits

`release/tmp/backup-0.7-swap/` is an untracked 0.7 backup inside the current Community workspace. The scan found 118 text-like files, 54 matching files and 747 matching lines across subscription, activation, license, Bridge key, quota, payment, Lemon, webhook, official-domain, identity and secret-name classes. These are real repository/package-boundary risks, not harmless test fixtures.

The complete matching file/line inventory is below. `commercial` is the requested Commercial-only token class; `identity` is a private/Official identity class; `secret` is a credential/secret-name class.

```text
release/tmp/backup-0.7-swap/extension/src/background.js | commercial=13-14,19,32,126,135,154-155,159-160,165,170-171,176,182,201,204-205,224,228,304,311,326-327,357,369-370,577,580,692-695,697-698,809
release/tmp/backup-0.7-swap/extension/src/popup.css | commercial=10,52-56,106-108,122
release/tmp/backup-0.7-swap/extension/src/popup.html | commercial=17-18,53,98,100-103,107-109; identity=18,109
release/tmp/backup-0.7-swap/extension/src/popup.js | commercial=5,279,281-283,285,288,294-295,298,301,369,485-488,490-491,493,495,502-504,506-507,510
release/tmp/backup-0.7-swap/extension/src/README.md | commercial=3,5,38,40,44,46,48-50,52,57-58,60-61,63-64,76,78; identity=44
release/tmp/backup-0.7-swap/extension/src/core/evidence-migration.mjs | commercial=3,30,39,47-48
release/tmp/backup-0.7-swap/extension/src/core/quota-reservation.mjs | commercial=1-2,18-19,23-30,34-37,41-45,48
release/tmp/backup-0.7-swap/extension/src/core/record.mjs | commercial=35-37
release/tmp/backup-0.7-swap/extension/src/core/reminder-state.mjs | commercial=4,20-21,23; identity=4
release/tmp/backup-0.7-swap/extension/src/core/storage.mjs | commercial=12-13,51-52,65-66,79-80,84,91,93-94,96
release/tmp/backup-0.7-swap/extension/src/core/trial-policy.mjs | commercial=1,7,9-10,25,31,33,37-38,43,47-48
release/tmp/backup-0.7-swap/extension/src/core/usage-counters.mjs | commercial=2
release/tmp/backup-0.7-swap/extension/src/tests/archive-idb.test.mjs | commercial=83,85-86,90-91
release/tmp/backup-0.7-swap/extension/src/tests/bridge-key-wiring.test.mjs | commercial=8-9,16,19-21,24-25,31
release/tmp/backup-0.7-swap/extension/src/tests/community-boundary.test.mjs | commercial=8; identity=15
release/tmp/backup-0.7-swap/extension/src/tests/context-menu-wiring.test.mjs | commercial=16
release/tmp/backup-0.7-swap/extension/src/tests/daily-quota-wiring.test.mjs | commercial=24,32,37,41-42,45-46,50
release/tmp/backup-0.7-swap/extension/src/tests/evidence-migration.test.mjs | commercial=29,32,38,41,45,48
release/tmp/backup-0.7-swap/extension/src/tests/file-inventory.test.mjs | commercial=26-29
release/tmp/backup-0.7-swap/extension/src/tests/mutate-state.test.mjs | commercial=57-58,60,63,65,67,70,72
release/tmp/backup-0.7-swap/extension/src/tests/popup-action-feedback-wiring.test.mjs | commercial=10,19,21,24-25,30,42-44,46,49-51,54-56,60-62,64-66; identity=27,47
release/tmp/backup-0.7-swap/extension/src/tests/popup-approved-ui.test.mjs | commercial=11,40,86-89,109
release/tmp/backup-0.7-swap/extension/src/tests/privacy-disclosure.test.mjs | commercial=5; identity=13
release/tmp/backup-0.7-swap/extension/src/tests/quota-record.test.mjs | commercial=3,25-26,30,39-40,43,50-51
release/tmp/backup-0.7-swap/extension/src/tests/quota-reservation.test.mjs | commercial=3,9,18-19,28-29,34-35,44,49-50,59,66-67,79-80,82
release/tmp/backup-0.7-swap/extension/src/tests/release-copy.test.mjs | secret=17
release/tmp/backup-0.7-swap/extension/src/tests/release-hardening.test.mjs | commercial=12; identity=12-14
release/tmp/backup-0.7-swap/extension/src/tests/reminder-state.test.mjs | commercial=29,44,47; identity=39,67
release/tmp/backup-0.7-swap/extension/src/tests/side-panel-wiring.test.mjs | commercial=59,76,83-86,88,94,112-113
release/tmp/backup-0.7-swap/extension/src/tests/storage-clear-trial.test.mjs | commercial=20,26,33,36
release/tmp/backup-0.7-swap/extension/src/tests/trial-license-wiring.test.mjs | commercial=9,14,17-18,22,24
release/tmp/backup-0.7-swap/extension/src/tests/trial-policy.test.mjs | commercial=5,12,16,18-20,24-28,31,36-38,41,46-47,50,52-53,61,74,77-79,81
release/tmp/backup-0.7-swap/extension/src/tests/usage-counters.test.mjs | commercial=54
release/tmp/backup-0.7-swap/worker/dist/worker.mjs | commercial=86-87,90,95,97,103,105,108,134-135,139,142-143,146-148,154,157,163-167,170,172,174,177-178,183-184,187,189-190,194,198-200,235-238,240-241,243-244,246-247,249-250,252-253,256-257,259-260,263,265,268-269,271-272,277,280,282,286-288,449,452,493,496-497,512-513,517,562,576,579,581,583-584,586,588-589,595-598,603,610,612,615,617,619-621,623,626,628,631,633,663-664,667,669,672,674,676,678,680,763-766,768; identity=496-497; secret=48,61,664,667
release/tmp/backup-0.7-swap/worker/migrations/20260729_lifetime_license.sql | commercial=1,3
release/tmp/backup-0.7-swap/worker/migrations/20260729_webhook_state.sql | commercial=1-4,6
release/tmp/backup-0.7-swap/worker/migrations/20260807_subscription_keys.sql | commercial=1,10,17
release/tmp/backup-0.7-swap/worker/scripts/bundle-worker.mjs | commercial=10
release/tmp/backup-0.7-swap/worker/scripts/generate-subscription-key.mjs | commercial=1,6-8,10-12,16-17,25,37,42,44,49-51,61-62,75
release/tmp/backup-0.7-swap/worker/scripts/renew-subscription-key.mjs | commercial=1,3,5-6,8-10,17,20,26-27,38-39,50,58,60-61,67
release/tmp/backup-0.7-swap/worker/src/d1-repository.mjs | commercial=27-30,32-33,35-36,38-39,41-42,44-45,48-49,51-52,55,57,60-61,63-64,69,72,74,78-80
release/tmp/backup-0.7-swap/worker/src/lemon-license.mjs | commercial=1,4,10,18-19,22-23,26-27
release/tmp/backup-0.7-swap/worker/src/rate-limit.mjs | commercial=2,5
release/tmp/backup-0.7-swap/worker/src/schema.sql | commercial=17,19,21-22,28-29,31,36,45,52
release/tmp/backup-0.7-swap/worker/src/subscription.mjs | commercial=1,4,9,11,17,19,22,48-49,53,56-57,60-62,68,71,77-81,84,86,88,91-92,97-98,101,103-104,108,112-114
release/tmp/backup-0.7-swap/worker/src/token-vault.mjs | secret=5,18
release/tmp/backup-0.7-swap/worker/src/worker.mjs | commercial=6,13,16-17,32-33,37,82,96,99,101,103-104,106,108-109,115-118,123,130,132,135,137,139-141,143,146,148,151,153,183-184,187,189,192,194,196,198,200,283-286,288; identity=16-17; secret=184,187
release/tmp/backup-0.7-swap/worker/src/tests/bundle-worker.test.mjs | commercial=11,15-18
release/tmp/backup-0.7-swap/worker/src/tests/d1-repository.test.mjs | commercial=15,18,20,22,24
release/tmp/backup-0.7-swap/worker/src/tests/keygen-scripts.test.mjs | commercial=8,10-12,25-26,29,32,42,53,55,57,59-60,69-70,76-77,80,83,91,96,101-102,111-113,115,120-121,135,138,144
release/tmp/backup-0.7-swap/worker/src/tests/lemon-license.test.mjs | commercial=4,6,8-9,13
release/tmp/backup-0.7-swap/worker/src/tests/schema.test.mjs | commercial=11,13-14,16-17,20,22,24
release/tmp/backup-0.7-swap/worker/src/tests/subscription.test.mjs | commercial=4,7,22,61,69,72,84,97,102,113
release/tmp/backup-0.7-swap/worker/src/tests/worker.test.mjs | commercial=5,14-18,27,29,41,81-83,85,87-88,90-92,95,97,99,103,108,110,114-115,179,181,184,191,193,196,203,205,207,219,221-222,224,253,255-256,259,261,264,266,268,271,273,277,279,282,289,292,296,305,310,313,317-319; secret=103
```

Judgement for all rows above: **REAL RISK**. The backup is not a legal mention or a negative test; it contains the retired product implementation, UI, routes, migrations, scripts, generated bundle and tests. The 5 public-source failures were specifically:

```text
release/tmp/backup-0.7-swap/extension/src/README.md
release/tmp/backup-0.7-swap/extension/src/core/reminder-state.mjs
release/tmp/backup-0.7-swap/extension/src/popup.html (two identity hits)
release/tmp/backup-0.7-swap/worker/src/worker.mjs
```

### 5.2 Current Community product/source hits

The following current-tree hits were inspected rather than auto-ignored:

| Location | Hit | Judgement |
|---|---|---|
| `extension/src/core/delivery-prerequisites.mjs:5` and its test inputs | Unused `entitlement` parameter | **NEEDS REVIEW / likely dead compatibility parameter**; no entitlement logic is read, but this is a Commercial-shaped symbol in product code. |
| `extension/src/community-config.mjs:2`; generated copy and overlay at the same relative line | “Official endpoint” in a negating comment | **Legal boundary mention / false positive**; it documents that the placeholder is not Official. |
| `extension/src/core/evidence-templates.mjs:14`, `popup.js:334,427,481`, `worker/src/notion-proxy.mjs:125` and corresponding tests | `buyer-account` template ID/name | **False positive**; it is a user evidence template, not managed account or entitlement logic. |
| `worker/src/worker.mjs:12` | “Cloudflare account” in self-hosted privacy page | **Legal self-host documentation / false positive**. |
| `worker/src/rate-limit.mjs:2` | “accounting” in abuse-guard comment | **False positive**; not usage accounting. |
| `worker/src/tests/bundle-worker.test.mjs:18,25`; `d1-repository.test.mjs:54`; `schema.test.mjs:8,33`; `community-service-boundary.test.mjs:72`; `worker.test.mjs:379,387` | Retired commercial routes/tables/modules named to assert absence | **Test text / false positive**; boundary tests passed. |
| `extension/src/tests/cjk-scan.test.mjs:50`; `community-boundary.test.mjs:8,12`; `community-commercial-boundary.test.mjs:22-34`; `delivery-prerequisites.test.mjs:7,14,22,31,39,49`; `evidence-migration.test.mjs:10,17-18`; `file-inventory.test.mjs:32-35`; `popup-action-feedback-wiring.test.mjs:10,18,28`; `privacy-disclosure.test.mjs:5`; `proofclip-api.test.mjs:6,18,21`; `release-copy.test.mjs:13`; `release-hardening.test.mjs:5,13-19`; `side-panel-wiring.test.mjs:15,25,47`; `toast-actions-wiring.test.mjs:8,10-11` | Negative assertions, synthetic identities, example deployer origins and migration assertions | **Test text / false positive**, except the unused `entitlement` parameter noted above. |
| `MIGRATION.md:22,24,28`; `README.md:7,9`; `deploy/README.md:3,39`; `docs/architecture.md:17`; `docs/acceptance/community-baseline.md:8,15,21,25,29`; `TRADEMARKS.md:1,3,5`; `release/README.md:34`; `release/edition-boundary.json:33,38-58,78,97-120,128-136`; `release/tests/export-pipeline.test.mjs:19-22,35,40-41,60,89,110-116`; `scripts/verify-public-source.ps1:19-35` | Boundary, legal, exclusion and scanner definitions | **Legitimate documentation/config/test fixture**, not product leakage. |

The same current product/test hits are present in `release/overlay/` and `release/out/community-0.8.0/` at the corresponding relative paths because the tree comparison found 0 mismatches for 96 extension files and 19 worker files. No ZIP artifact was available to scan.

### 5.3 Secret/private-material and path scan

- No `.zip` or `.sha256` file exists in the current worktree.
- No `wrangler.jsonc`, non-example `.dev.vars`, `secrets/`, `runtime-evidence/`, `profiles/` or `browser-profile/` path was found by the path scan.
- `deploy/README.md:46-51`, `docs/architecture.md:13-15`, `docs/self-hosted-notion-oauth.md:5`, and Worker source/test lines naming `NOTION_CLIENT_SECRET` and `TOKEN_VAULT_KEY` are instructions, variable names or test fixtures; no literal OAuth credential/private key value was found in current product source.
- `release/tmp/ext.log` and `release/tmp/wrk.log` are untracked test/runtime logs. They contain prior test output, not a literal credential in this scan, but are **private runtime evidence candidates** and are not suitable release inputs.

## 6. Self-host boundary evidence

| Boundary | Status | Evidence |
|---|---|---|
| Deployer-owned Worker | PASS at source/test level | `extension/src/community-config.mjs`, `worker/src/index.mjs`, `docs/architecture.md`, `deploy/README.md`; Community boundary tests pass. |
| Deployer-owned D1 | PASS at source/test level | `worker/src/d1-repository.mjs`, `worker/src/schema.sql`, `worker/src/tests/d1-repository.test.mjs`, `schema.test.mjs`. |
| Deployer-owned OAuth | PASS at offline harness level | `worker/src/oauth.mjs`, `worker/src/token-vault.mjs`, `worker/src/tests/oauth-foundation.test.mjs`, `worker.test.mjs`. |
| Deployer-owned extension config | PASS at source/test level | `community-config.mjs` is a non-routable placeholder; API-origin and manifest tests pass. |
| No central Official service dependency | PASS for current product roots; overall worktree NEEDS REVIEW | `verify-generated-tree --repo` is clean for 115 scanned product files; public-source verification fails because the untracked 0.7 backup remains in the repository tree. |
| Local Archive stays browser-side | PASS at code/test level | `storage.mjs`, `archive-store.mjs`, `archive-idb.test.mjs`, privacy text. |
| Explicit Notion send | PASS at code/test level | `popup.html:28`, `background.js`, `worker/src/worker.mjs:118-127`, direct/local routing tests. |
| Worker/D1 do not persist capture body/screenshots | PASS at offline code/test level | `worker/src/worker.mjs:12`, `worker/src/notion-proxy.mjs`, `d1-repository.test.mjs`, `worker.test.mjs`; no deployed D1 was inspected. |

Overall self-host status: **NEEDS REVIEW** because the source boundary is mechanically clean in product roots but the worktree has the backup leakage and no real deployer-owned rehearsal.

## 7. Release governance evidence

| Governance item | Status | Evidence |
|---|---|---|
| Unique current release record | MISSING | No current record file/path found. |
| History separated from current | NEEDS REVIEW | No `history` record found; `MIGRATION.md` mixes historical 0.7 and current 0.8 statements. |
| `source_commit` matches HEAD | MISSING | `PROVENANCE.json` has upstream branch/worktree and file hashes, but no source commit field. |
| Release tag matches | MISSING | Current Git has no tags; boundary says upstream is a working-tree snapshot. |
| Artifact ZIP exists | MISSING | No ZIP found. |
| Artifact SHA256 re-computes consistently | NOT VERIFIED | No artifact or sidecar exists. |
| Generated per-file provenance hashes | PASS | `verify-generated-tree --tree=release/out/community-0.8.0` scanned 115 listed files and exited 0. |
| Artifact is demonstrably from the corresponding commit | MISSING | No artifact commit binding and no `source_commit` record. |
| Old artifact detection | NOT AVAILABLE | No `release-audit` implementation or current/old artifact record found. |
| Modify packaged file => old artifact stale | NOT AVAILABLE | No stale-artifact command or artifact exists. |
| Worker bundle outside provenance | NEEDS REVIEW | After `worker/scripts/bundle-worker.mjs`, `release/out/community-0.8.0/worker/dist/worker.mjs` exists as an extra file. Actual tree count is 117 including `PROVENANCE.json`; provenance lists 115 product files. The scanner explicitly skips `worker/dist/`. |
| Evidence synchronized after work item completion | NOT VERIFIED | Community repo has no current `tasks.yaml`/work-item evidence record; this dossier is the only new audit record. |
| `READY_TO_RELEASE` split into stages | NOT VERIFIED | No current release governance record or staged status found. |
| Critical governance errors are non-zero | PARTIAL PASS | `verify-generated-tree` exits 1 on missing tree and its pipeline tests reject forbidden tokens/path/hash drift. No `release-audit` command exists to verify its exit semantics. |

## 8. Upgrade / migration evidence

| 0.7 to 0.8 area | Status | Evidence and limit |
|---|---|---|
| Local Archive migration | PASS offline / NOT VERIFIED in a real profile | `storage.mjs:28-47`, `archive-idb.test.mjs`, `evidence-migration.test.mjs`; tests use fixtures, not an actual Chrome 0.7 profile. |
| Settings and capture route | PASS offline | `evidence-migration.mjs:13-15,29-37`, `storage.mjs:62-79`, migration tests. |
| Projects | PASS offline | `evidence-migration.mjs:36`, `projects.mjs`, `projects.test.mjs`. |
| Tags/notes/classification | PASS offline | `evidence-card.mjs`, `projects.mjs:58-69`, `evidence-card.test.mjs`, `projects.test.mjs`. |
| Outbox | PASS offline | `evidence-migration.mjs:17-23,35`, archive/Outbox tests. |
| Worker schema | PASS static/offline | `worker/src/schema.sql`, `worker/migrations/20260813_privacy_nonretention.sql`, `schema.test.mjs`. |
| OAuth/config | PASS static/offline | `worker/src/oauth.mjs`, token vault, `community-config.mjs`, OAuth/boundary tests. |
| Real 0.7 to 0.8 upgrade rehearsal | NOT VERIFIED | No Cloudflare/D1/Chrome/Notion rehearsal was run. |

## 9. Reproduction / rehearsal results

| Flow | Offline evidence | Real rehearsal |
|---|---|---|
| Selection/local capture | Wiring and route tests pass; no browser tab was controlled | NOT VERIFIED |
| Full Page capture | Page structure, long-text, readable-adapter and fallback tests pass | NOT VERIFIED |
| Archive search/read/classification | IndexedDB, query, reader, project/tag/note tests pass | NOT VERIFIED in Chrome |
| Local to Notion | Worker mock harness delivers a connected capture; Notion mapping tests pass | NOT VERIFIED against a real Notion Data Source |
| Direct to Notion | Direct-routing and Worker capture tests pass | NOT VERIFIED against a real Notion Data Source |
| Failed delivery to Outbox | Bulk-send/direct-routing/retry tests pass | NOT VERIFIED in a browser |
| Retry | Retry policy and Outbox tests pass | NOT VERIFIED in a browser |
| Configured CORS allowed | Worker tests pass for configured extension origin | NOT VERIFIED on a deployed Worker |
| Unrelated extension origin denied | Worker tests pass for wrong explicit Origin | NOT VERIFIED on a deployed Worker |
| OAuth | Mock provider exchange/state/token-vault tests pass | NOT VERIFIED with a real Notion OAuth app |
| No-retention | Payload/repository/schema tests and privacy page assert no capture-body persistence | NOT VERIFIED against deployed D1 logs/storage |

No external environment was available or used for the real rehearsal. The repository's `deploy/README.md:64-66` describes the smoke test but does not constitute execution evidence.

## 10. Unverified items

- No ZIP artifact and no artifact SHA256.
- No current release record, separated history record, source commit binding, release tag, or staged `READY_TO_RELEASE` state.
- No `release-audit` tool; no old-artifact or stale-artifact audit.
- No `COPYING_MANIFEST.json` in the audited root and no dedicated source-manifest verification.
- No real Chrome, Cloudflare Worker, D1, Notion OAuth, Notion Data Source, CORS deployment, or CWS rehearsal.
- No actual 0.7 Chrome profile migration rehearsal.
- `release/out/community-0.8.0/worker/dist/worker.mjs` is outside provenance and skipped by the scanner.
- `release/tmp/backup-0.7-swap/` and runtime logs remain in the untracked worktree.
- `MIGRATION.md:34-35` claims Extension `198/198` although this audit observed `198 pass / 1 fail` for the 199-test suite.

## 11. Findings

### BLOCKER candidate

- **Public-source boundary is red in the audited worktree.** An untracked `release/tmp/backup-0.7-swap/` contains retired commercial extension/Worker source, routes, migrations, key scripts, generated bundle and tests. The public-source gate exits 1 on five private/Official deployment-identity locations, and the broader scan found 54 matching text files and 747 matching lines. This is a release-input boundary failure, not a test-only false positive.
- **No reproducible release artifact exists.** There is no ZIP, SHA256, tag, current release record, or source-commit binding, so the audited worktree cannot be tied to a distributable package.

### MAJOR candidate

- **No release governance implementation is present.** `release-audit`, current/history records, stale-artifact detection, evidence synchronization and staged release statuses are absent. The existing provenance is file-level only and points to an unpinned private worktree snapshot.
- **Generated bundle is outside provenance.** `worker/dist/worker.mjs` appears after the bundle script, is not listed in `PROVENANCE.json`, and is explicitly skipped by the scanner. A future package inclusion decision is therefore not mechanically bound.
- **Real deployment and migration acceptance are absent.** Offline tests pass for source behavior, but no real Worker/D1/OAuth/Chrome/Notion or 0.7 profile rehearsal was executed.

### MINOR

- `.gitignore:29` appears to contain `release/out/release/tmp/` instead of rules covering `release/tmp/` and the intended generated paths, allowing the 0.7 backup and logs to remain untracked in the workspace.
- `extension/src/core/delivery-prerequisites.mjs:5` retains an unused `entitlement` parameter; it does not gate delivery, but it is a Commercial-shaped residue requiring Terra's review.
- `COPYING_MANIFEST.json` is declared in `edition-boundary.json:87-89` as Community-owned but is absent from the current root.
- `MIGRATION.md` test counts are stale relative to this audit (`198/198` text versus the actual `198 pass / 1 fail / 0 skipped` suite).

### NOTE

- `release/tmp/ext.log` and `release/tmp/wrk.log` are untracked prior test/runtime evidence and should not enter a public package.
- Current product-root boundary checks are clean: generated tree and repo-mode scanner each report 115 files clean; extension/worker source trees match the generated product roots byte-for-byte for 96 and 19 files respectively.
- Current source/test hits for commercial words in boundary configuration, legal docs, negative tests, sample deployer origins and template names were inspected and classified as legitimate documentation/test text or false positives; they were not silently ignored.

## 12. Evidence index

| Evidence | Path/commit | Command or binding |
|---|---|---|
| Audited Git baseline | `D:\ProofClip-Community`, HEAD `ac645ae6b38f9419b9c546e255296e4e4f7afc0d` | `git branch --show-current`, `git rev-parse HEAD`, `git status --short --branch`, `git tag --sort=-creatordate` |
| Version | `extension/src/manifest.json:4` | Manifest read under `D:\node.js\node.exe` v24.18.0 |
| Export boundary | `release/edition-boundary.json` | `release/tests/export-pipeline.test.mjs`; `release/README.md` |
| Generated provenance | `release/out/community-0.8.0/PROVENANCE.json` | `D:\node.js\node.exe release/verify-generated-tree.mjs --tree=release/out/community-0.8.0`; 115 clean |
| Product-root parity | `extension/src/`, `worker/`, `release/out/community-0.8.0/extension/src/`, `release/out/community-0.8.0/worker/` | read-only SHA-256 comparison; 96 and 19 files, 0 mismatches |
| Extension tests | `extension/src/tests/` | `D:\node.js\node.exe --test --test-reporter=spec '.\tests\*.test.mjs'`; 198 pass, 1 fail, 0 skipped |
| Worker tests | `worker/src/tests/` | `D:\node.js\node.exe --test --test-reporter=spec '.\src\tests\*.test.mjs'`; 59 pass |
| Community boundaries | `extension/src/tests/community-boundary.test.mjs`, `community-commercial-boundary.test.mjs`, `worker/src/tests/community-service-boundary.test.mjs` | explicit boundary command; 5 pass |
| Release hardening | `extension/src/tests/release-hardening.test.mjs` | explicit test command; 1 pass |
| Public-source gate | `scripts/verify-public-source.ps1` | `pwsh -NoProfile -File scripts/verify-public-source.ps1 -IncludeUntracked`; exit 1, five backup hits |
| Commercial scan | `release/tmp/backup-0.7-swap/` | read-only regex scan; 54 files / 747 lines, inventory in section 5 |
| Worker bundle | `worker/scripts/bundle-worker.mjs` and generated `worker/dist/worker.mjs` | direct bundle command exit 0; dist is not provenance-bound |
| Offline migration | `extension/src/core/evidence-migration.mjs`, `storage.mjs`, `worker/migrations/20260813_privacy_nonretention.sql` | extension/worker suites and targeted migration/schema tests |
| Runtime logs | `release/tmp/ext.log`, `release/tmp/wrk.log` | existing untracked logs; not treated as fresh release acceptance |
| Audit dossier | `audit/community-v0.8-luna-release-dossier.md`, `audit/community-v0.8-luna-release-dossier.json` | created by this audit turn; final existence/JSON validation follows in handoff |

This dossier is evidence for Terra's independent review only. It is not a release approval.
