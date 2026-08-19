# Migration record

Status: **private bootstrap; not for public publication**.

## Source checkpoint

- Private repository: `D:\网络赚钱`
- Product source checkpoint: `9c851ca76e21abe3c287529e16bf434e272bcf82`
- Private tag: `proofclip-v0.7.0-pre-release-freeze-20260809`
- Extraction date: 2026-08-12

## Imported scope

The following private paths are exported from the immutable checkpoint with Git archive:

- `projects/chrome/P-notion-evidence-clipper/src/`
- `projects/service/P-proofclip-api/src/`
- `projects/service/P-proofclip-api/migrations/`

## Explicit exclusions

This repository must not contain private Git history, CWS release packages or materials, screenshots, offline backups, QA runtime evidence, Worker account configuration, D1 identifiers, OAuth credentials, token-vault keys, extension signing/public keys, subscription/Bridge data, or Official service domains.

The imported source is transformed before any public use so it cannot default to Official infrastructure. Publication remains blocked until the public-source verification script, a clean-environment deployment rehearsal, a license decision, and Jason's explicit approval are complete.

## Current migration gate

The isolated source import and offline behavior suites are complete. The first Community source commit is deliberately blocked until the separate remediation phase removes remaining Official UI and support references from the imported v0.7 extension and Worker. This repository has no remote configured and no public action has been performed.
## Community 0.8 export (M1)

- Upstream: private branch `codex/proofclip-v0.8.0` (worktree snapshot; plan A — pin to a tagged release before publication).
- Pipeline: `release/edition-boundary.json` (edition boundary) → `release/export-community.mjs` (copy → exclude → transform → overlay → PROVENANCE) → `release/verify-generated-tree.mjs` (commercial-boundary gate, also wired into `scripts/verify-public-source.ps1`).
- Output: `release/out/community-0.8.0/` — 115 files + `PROVENANCE.json` (targetVersion 0.8.0, per-file source and SHA-256).
- Verified (mainline governance round): generated-tree scan CLEAN; extension suite 204/204; worker suite 60/60; release self-tests 24/24 (pipeline 5 + governance 19, including the two 0.8-incident regressions: main=old/temp=new/README=new must FAIL, tag→docs-only→main must PASS); release-audit is fail-closed with the DEFAULT_BRANCH_RELEASE_ALIGNMENT family and the one-version-lag capability parity gates (release/capability-manifest.json: 24 capabilities, baseline locked to the Commercial 0.8 pin; FORWARD_VERSION_LEAK / COMMUNITY_CAPABILITY_OMISSION detection), (default branch == main, current branch == main, release commit ∈ main history, main carries version/migrations/tooling/CI), DEFAULT_CLONE_SMOKE_TEST (release/verify-cloned-tree.mjs), README_ASSETS and worktree governance gates; EDITION_DIFF_REPORT recorded at cut. v0.8.0 release itself is untouched.
- Status: maintainer approved; the 0.8 tree was swapped into `extension/` and `worker/` (0.7 backup moved out of the workspace to `D:\ProofClip-Community-0.7-backup`). Release closure (round 3): upstream pinned (`edition-boundary.json upstream.pin`, export is fail-closed on HEAD/fingerprint); release-audit is fail-closed (commit==HEAD, clean worktree, manifest version, provenance sha, bundle reproducibility, artifact bundle check, rehearsals required for release-ready); CI runs public-source gate + release-audit; canonical PROVENANCE copy committed under `release/provenance/`. Remaining release gates: git commit + re-cut with commit binding, the two real rehearsals (docs/release-rehearsal-0.8.md, docs/upgrade-rehearsal-0.8.md), release tag, final audit.