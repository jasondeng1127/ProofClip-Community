# Community 0.8 Shared Fix + Shortcut Independent Audit

Audit date: 2026-08-15 (Asia/Hong_Kong)

This is an independent evidence review of the previous Luna's shared OAuth/Outbox fix claims and the Community/Commercial shortcut discrepancy. No product code, manifest, CI, release framework, tag, artifact, deployment, or release state was changed by this audit.

## Executive Verdict

- OAuth fix: **VERIFIED**
- Outbox fix: **PARTIAL** — behavior is reproduced in both editions, but the Community implementation is an overlay patch rather than a byte-identical upstream/export result; ambiguous provider-success/transport-failure duplicate protection remains unverified.
- Upstream sync: **PARTIAL** — the pin, fingerprint, read-only export calculation, and generated-tree scan are valid; the claim that the only product delta is the pre-existing `community-config.mjs` is false for the shared Outbox implementation because `background.js` is a modified Community overlay.
- Scope compliance: **PARTIAL** — no CI architecture or release-code redesign was found, and the functional diff is limited to OAuth/Outbox coverage; however, the Community overlay `background.js` was modified in this round and the working tree remains uncommitted.
- Shortcut classification: **UNRESOLVED_RUNTIME_REGISTRATION**
- Final recommendation: **FIX_REQUIRED**

This is not a release approval.

## Audit Baseline

### Community workspace

- Workspace: `D:\ProofClip-Community`
- Branch: `main`
- HEAD: `c09f5ccac038d29ffc13d3b4b25fdcba7e53c32d` (`release(community): freeze Community 0.8 source and canonical provenance`)
- Community manifest: `extension/src/manifest.json`, version `0.8.0`
- Community HEAD has no tag pointing at it.
- Commercial upstream worktree: `D:\网络赚钱\.worktrees\proofclip-v0.8.0`
- Commercial upstream HEAD: `e8ea712f957e25013052a3e8a21458e8f420d74e`
- Commercial upstream status: clean

### Community worktree status

The Community worktree is dirty. Current modified paths are:

```text
M  extension/src/archive.js
M  extension/src/background.js
M  extension/src/community-config.mjs
M  extension/src/core/archive-bulk-send.mjs
M  extension/src/tests/archive-bulk-send.test.mjs
M  extension/src/tests/archive-page-wiring.test.mjs
M  extension/src/tests/direct-routing-wiring.test.mjs
M  release/edition-boundary.json
M  release/overlay/extension/src/background.js
M  release/provenance/community-0.8.0.json
M  worker/src/notion-proxy.mjs
M  worker/src/oauth.mjs
M  worker/src/tests/oauth-foundation.test.mjs
?? docs/superpowers/plans/2026-08-15-community-0.8-shared-bug-fix.md
?? extension/src/tests/outbox-recovery.test.mjs
```

The `community-config.mjs` change contains a real `workers.dev` identity. It is the direct cause of the current public-source and Community boundary failures; it was not treated as a false positive.

## A. OAuth

### Claim

The Commercial upstream OAuth token exchange was repaired to send the Notion API version header and was exported consistently to Community.

### Evidence

- Commercial implementation: `D:\网络赚钱\.worktrees\proofclip-v0.8.0\projects\service\P-proofclip-api\src\oauth.mjs:1,20-23`
- Community implementation: `worker/src/oauth.mjs:1,20-23`
- Authoritative constant: `worker/src/notion-proxy.mjs:1`
- Regression test: `worker/src/tests/oauth-foundation.test.mjs:29-44`
- The test fixture captures the outbound request, rejects the wrong/missing `Notion-Version`, and asserts `Notion-Version: 2026-03-11` on the actual token request.
- Community OAuth implementation, constant, and regression test hashes match the corresponding upstream files after export.
- The upstream commit diff only adds the exported constant, OAuth import/header, and outbound-header regression assertion. No callback, redirect URI, client secret, token storage, or token-vault architecture change was found.

### Tests

Command:

```text
D:\node.js\node.exe --test --test-reporter=spec .\tests\oauth-foundation.test.mjs
```

- Commercial: 4/4 passed, 0 failed, 0 skipped, exit 0.
- Community: 4/4 passed, 0 failed, 0 skipped, exit 0.

### Commercial/Community parity

The OAuth implementation and header assertion are materially consistent. The Community copy is an upstream/exported file, not a downstream-only OAuth patch.

### Verdict

**VERIFIED**

## B. Outbox

### Claim

Prerequisite failures enter recovery, persisted Outbox state uses `NEEDS_VERIFICATION`, batch feedback reports the actual queued count, and resend clears the Outbox after successful delivery.

### Persisted state and independent reproduction

The independent in-memory browser-storage harness executed the real Community `attemptDelivery` and storage path:

```text
D:\node.js\node.exe --input-type=module -e <read-only Outbox state-transition harness>
```

Observed result:

```json
{
  "first": {"ok": false, "retryState": "NEEDS_VERIFICATION", "queued": true},
  "afterFailure": {"archiveStatus": "FAILED", "outboxCount": 1, "outboxRetryState": "NEEDS_VERIFICATION"},
  "retry": {"ok": true},
  "afterRetry": {"archiveStatus": "SENT", "outboxCount": 0, "captures": 1}
}
```

Relevant implementation:

- Community `extension/src/background.js:346-374`: prerequisite failure is thrown into the existing failure path; archive delivery is synchronized to `FAILED`; Outbox is inserted or updated with `retryState`; the result reports `queued: true`.
- Community `extension/src/background.js:261-269`: successful delivery marks the record `SENT`.
- Community `extension/src/background.js:649-653,781-791`: ordinary retry and explicit `RESEND_AFTER_VERIFICATION` both re-enter `attemptDelivery`.
- Community `extension/src/archive.js:267-272`: batch feedback uses `result.queued`; it no longer claims every failed record entered Outbox.
- Community `extension/src/core/archive-bulk-send.mjs:5-20`: `failed` and `queued` counters are separate.

### Specific symptom answers

- `PENDING` remaining unchanged after a prerequisite failure: **resolved in the tested archive-backed state path**; the archive record became `FAILED`.
- Outbox remaining at zero: **resolved in the tested prerequisite-failure path**; one item persisted.
- “failed records are in Outbox” being false for non-queued failures: **resolved in the tested batch contract**; summary uses the actual `queued` count and distinguishes non-queued failures.

### Batch summary and retry tests

The targeted Commercial and Community Outbox/direct-routing command each passed 25/25. The tests cover:

- persisted verification Outbox item;
- retry state `NEEDS_VERIFICATION`;
- resend clearing the Outbox;
- one successful capture call in the prerequisite-failure/retry scenario;
- separate `failed` and `queued` counts;
- batch copy based on `result.queued`;
- common delivery path for archive send and Outbox resend.

### Duplicate protection limitation

The evidence does **not** prove that an ambiguous provider-success followed by a local transport failure cannot create a duplicate Notion page. The tested failure occurs before the provider page request. `NEEDS_VERIFICATION` correctly requires the user to check Notion before explicit resend, but that is a workflow guard, not proof of provider-side idempotency. This item is **UNVERIFIED**.

### Commercial/Community parity and provenance

The targeted behavior tests passed in both editions. However, the Community `extension/src/background.js` is supplied by `release/overlay/extension/src/background.js`, not by the upstream provenance entry. That overlay was modified in this round with the equivalent Community Outbox change. Therefore the behavior is consistent, but the claim that Community is not an independently patched fork is not established for this implementation file.

### Verdict

**PARTIAL**

Behavioral state transition and batch accounting are verified. Upstream provenance and ambiguous-provider duplicate protection are not fully verified.

## C. Upstream / Export

### Commercial commits

- `190f42329fb14745061ef60117606b2adc8c1457` — `fix: repair notion oauth and outbox recovery`
- `e8ea712f957e25013052a3e8a21458e8f420d74e` — `test: bound outbox recovery source assertion`
- Commercial HEAD is exactly `e8ea712f957e25013052a3e8a21458e8f420d74e` and the upstream worktree was clean.

### Community pin and fingerprint

- `release/edition-boundary.json` pin commit: `e8ea712f957e25013052a3e8a21458e8f420d74e`
- Pin fingerprint: `186a48f754ae6be4f1a1b4d69e04bb516ba747f8f25f14e77ca612d309e6ab20`
- Canonical provenance: `release/provenance/community-0.8.0.json`
- Provenance file count: 117
- Skipped count: 364
- Provenance source counts: 72 upstream, 44 overlay, 1 upstream+transform.

### Export result

A read-only invocation of the existing exporter with `writeOutput: false` verified the pinned upstream and computed 117 files / 364 skipped files with the same pin, fingerprint, and boundary hash as the canonical provenance. No new export output or artifact was generated.

The existing generated tree scan also passed:

```text
D:\node.js\node.exe .\release\verify-generated-tree.mjs
```

Result: 117 files scanned, CLEAN, exit 0.

### Product roots and staging

After newline normalization, the current Community product roots and `release/out/community-0.8.0` differ only at `extension/src/community-config.mjs`:

- Current working tree: `https://proofclip-community-rc1-20260814.jasondeng1127.workers.dev`
- Public-safe staging/overlay: `https://replace-me.invalid`

The generated staging scan is therefore clean because it contains the placeholder. The working tree scan fails because it contains the real deployer identity.

### Unexpected delta

The statement “the only product difference is the pre-existing `community-config.mjs`” is not true as a complete provenance statement for this shared fix:

- `extension/src/background.js` is an overlay-owned product file and differs from the Commercial implementation because Community removes Commercial quota/licensing behavior.
- `release/overlay/extension/src/background.js` was directly modified in this round for the Outbox prerequisite recovery behavior.
- OAuth, archive batch, Outbox test, and worker OAuth files are upstream/exported or upstream-equivalent; the Outbox implementation path is the exception.

### Verdict

**PARTIAL**

The pin and deterministic export calculation are verified. The “no downstream Community patch” claim is refuted for the overlay background implementation.

## D. Test Matrix

| Area | Actual command/result | Exit | Notes |
|---|---|---:|---|
| Commercial OAuth targeted | 4/4 passed, 0 failed, 0 skipped | 0 | Captured outbound Notion header |
| Commercial Outbox targeted | 25/25 passed, 0 failed, 0 skipped | 0 | Batch, wiring, recovery |
| Commercial Worker full | 93/93 passed, 0 failed, 0 skipped | 0 | `tests/*.test.mjs` |
| Commercial Extension full | 295/296 passed, 1 failed, 0 skipped | 1 | One stale current-release preflight |
| Community OAuth targeted | 4/4 passed, 0 failed, 0 skipped | 0 | Same header contract |
| Community Outbox targeted | 25/25 passed, 0 failed, 0 skipped | 0 | Batch, wiring, recovery |
| Community Worker full | 59/59 passed, 0 failed, 0 skipped | 0 | `tests/*.test.mjs` |
| Community Extension full | 200/204 passed, 4 failed, 0 skipped | 1 | All four failures are deployment-identity/public-source checks |
| Community boundary | 4/5 passed, 1 failed, 0 skipped | 1 | Placeholder assertion fails on real workers.dev identity |
| Public-source verification | 117 files scanned, 2 findings | 1 | `jasondeng1127` and `workers.dev` in `community-config.mjs` |
| Release pipeline + governance tests | 18/18 passed, 0 failed, 0 skipped | 0 | Fixture/self-test coverage; not release readiness |

Representative full-suite command form:

```text
D:\node.js\node.exe --test --test-reporter=spec .\tests\*.test.mjs
```

There were no test retries and no flaky behavior observed in this audit. The initial historical count in the Commercial release record is stale relative to the current upstream test set; the fresh full suite count is 296 tests, not the older 292 count.

The single Commercial Extension failure was isolated to `tests/current-release-preflight.test.mjs`: `Test-CurrentRelease.ps1` rejects that extension source changed after the record's pinned commit `f407aaf...`, while the actual upstream HEAD is now `e8ea712...`. This is a stale old release record/preflight binding, not a failing OAuth or Outbox product assertion.

## E. Scope

### Release framework modified

- No `release/*.mjs` implementation, CI workflow, cut-release logic, provenance algorithm, tag policy, or artifact generation logic was modified in the current diff.
- `release/edition-boundary.json` was updated only for the new upstream pin/fingerprint.
- `release/provenance/community-0.8.0.json` was updated for the new export inputs.

### CI architecture modified

No `.github` or CI architecture change is present in the current diff.

### Unrelated product files modified

No unrelated Capture, Archive, Notion setup, commercial boundary, pricing, quota, license, or payment implementation file was changed by the shared fix diff. The pre-existing real `community-config.mjs` identity change is outside the safe public-source baseline, and the overlay `background.js` change is directly related to Outbox behavior but is a downstream implementation delta.

## F. Shortcut Actual Package Comparison

### Actual loaded paths

- Community loaded path: **NOT AVAILABLE**
- Commercial loaded path: **NOT AVAILABLE**

The Chrome extensions internal page was visible in the user's browser tab list, but the read-only browser audit connection could not claim or inspect the `chrome://extensions` internal page. No alternate profile, local browser profile store, cookies, or extension runtime state was inspected.

Filesystem candidate paths, which are not proof of current Chrome loading, are:

- Community source candidate: `D:\ProofClip-Community\extension\src`
- Community public-safe generated candidate: `D:\ProofClip-Community\release\out\community-0.8.0`
- Commercial source candidate: `D:\网络赚钱\.worktrees\proofclip-v0.8.0\projects\chrome\P-notion-evidence-clipper\src`

### Narrow manifest comparison

| Command | Community 0.7 | Community 0.8 current | Commercial 0.8 |
|---|---|---|---|
| `proofclip-capture-selection` | Alt+1; Capture selection | Alt+1; Capture selection | Alt+1; Capture selection |
| `proofclip-capture-region` | Alt+2; Capture region | Alt+2; Capture region | Alt+2; Capture region |
| `proofclip-capture-body` | Alt+3; Capture page body | Alt+3; Capture page body | Alt+3; Capture page body |

No platform-specific command values are declared in any of the three source manifests. Command IDs, descriptions, and suggested keys are unchanged from Community 0.7 to 0.8. The relevant non-command manifest delta is the version (`0.7.0` → `0.8.0`) and the Community identity/security boundary remains unpinned; Commercial retains its fixed public key and Official host permission.

### Source evidence

- Community 0.7 manifest: `git show codex/community-public-baseline:extension/src/manifest.json`
- Current Community manifest: `extension/src/manifest.json:40-59`
- Commercial manifest: `D:\网络赚钱\.worktrees\proofclip-v0.8.0\projects\chrome\P-notion-evidence-clipper\src\manifest.json:40-61`

## G. Extension Identity

- Community 0.7 actual runtime ID: **UNKNOWN**
- Community 0.8 actual runtime ID: **UNKNOWN**
- Commercial 0.8 actual runtime ID: **UNKNOWN**
- Community 0.7 manifest `key`: absent; unpacked ID is derived by Chrome.
- Community 0.8 manifest `key`: absent; unpacked ID is derived by Chrome.
- Commercial 0.8 manifest `key`: present; source package pins a public-key identity.

Same identity for Community 0.7 → 0.8: **UNKNOWN**.

The source manifest does not decide whether the user loaded 0.8 by replacing the same unpacked path or loaded a separate unpacked instance. The upgrade rehearsal document requires replacement without uninstalling to preserve identity, but no real rehearsal evidence was available in this audit.

Current Community UI entry is the current RC candidate: **UNKNOWN**.

## H. Runtime Shortcut State

### Independent runtime API

- `chrome.commands.getAll()` for Community: **NOT AVAILABLE**
- `chrome.commands.getAll()` for Commercial: **NOT AVAILABLE**
- Chrome UI shortcut state: **NOT independently readable in this audit**

### Reported observation, not independently verified

The user-provided observation says:

- Community: body Alt+3; selection unset; region unset.
- Commercial: selection Alt+1; region Alt+2; body unavailable because Alt+3 is occupied.

This observation is recorded as a lead, not as independently confirmed runtime evidence.

## I. Shortcut Root-Cause Classification

**UNRESOLVED_RUNTIME_REGISTRATION**

Reason:

1. The Community 0.7, current Community 0.8, and Commercial 0.8 source manifests all declare the expected three suggested keys.
2. There is no source-level command-name or suggested-key delta that supports `CONFIRMED_PACKAGE_EXPORT_BUG`.
3. Community's unpacked identity is path-derived, but the actual loaded paths and IDs were not observable; therefore `INSTALL_IDENTITY_STATE` and `CONFIRMED_UPGRADE_REGRESSION` cannot be independently established.
4. The observed partial runtime binding remains unexplained by the evidence available in this audit, and `chrome.commands.getAll()` was unavailable.

## Confirmed Remaining Release Blockers

- Community public-source verification exits 1 with two real findings for the current `community-config.mjs` deployer identity (`jasondeng1127` / `workers.dev`).
- Community boundary verification exits 1 because the configured origin is no longer the required non-routable placeholder.
- Community full extension suite exits 1 with the same four identity/public-source failures.
- Commercial current-release preflight exits 1 because its old release record is still pinned to `f407aaf...` while the upstream source is now `e8ea712...`.
- The Community fix work remains uncommitted on `main`; this audit did not commit, tag, push, re-cut, or publish anything.

## Unverified

- Actual Chrome loaded package paths for Community and Commercial.
- Actual runtime extension IDs and whether Community 0.7 → 0.8 preserved identity.
- Whether the current Chrome UI entry is the current 0.8 RC candidate.
- `chrome.commands.getAll()` results.
- Real Chrome shortcut registration behavior after a same-identity 0.7 → 0.8 replacement.
- Real OAuth runtime against a deployer-owned Worker/Notion OAuth client.
- Ambiguous provider-success/local-failure duplicate-page protection.
- A clean commit/tag/release-record binding for this post-fix Community candidate.

## Final Recommendation

**FIX_REQUIRED**

This classification is limited to the evidence gaps and confirmed source-boundary/release-record failures above. It is not a release decision.

