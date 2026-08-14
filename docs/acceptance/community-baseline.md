# Community baseline acceptance — 2026-08-12

## Completed locally

- Created an independent Git repository at `D:\ProofClip-Community`; it does not share the private workspace Git directory or history.
- Initialized the repository with a private bootstrap commit only. No Community source commit and no remote repository exist.
- Exported the v0.7 frozen source checkpoint through Git archive into `extension/src`, `worker/src`, `worker/migrations`, and `worker/scripts`.
- Replaced the extension's Official Worker origin and fixed CWS public key with a deployer-owned Community API configuration boundary.
- Updated source-contract tests from private release-document dependencies to Community repository, source inventory, and deployment-identity boundaries.
- Extension offline suite: `251/251` passed.
- Worker offline suite: `79/79` passed.

## Deliberately blocked until remediation

`pwsh -NoProfile -File scripts/verify-public-source.ps1 -IncludeUntracked` correctly fails. It detects remaining Official support and service references in imported v0.7 UI, user-facing extension documentation, reminder logic, and Worker support content. Those references must be replaced or removed in the later remediation phase; they must not be whitelisted.

Because that gate is red, do not commit the imported source as a future-public history, do not add a remote, do not create a GitHub repository, do not deploy a Community Worker, and do not distribute the extension.

## Still required before public release

1. Complete the Community copy/subscription/support remediation without regressing core capture behavior.
2. Re-run public-source verification with zero findings.
3. Generate the source manifest (`PROVENANCE.json` via `release/export-community.mjs` — supersedes the legacy `COPYING_MANIFEST.json`) after the clean scan and make the first public-safe source commit.
4. Run a fresh Cloudflare/D1/Notion OAuth deployment rehearsal using new deployer-owned accounts and an independently loaded extension ID.
5. Confirm the code license and publish the repository only with Jason's approval.
## Community 0.8 generation (M1) — post-swap

- Deterministic export pipeline (`release/export-community.mjs` + `release/edition-boundary.json` + `release/overlay/`) produced `release/out/community-0.8.0/` (PROVENANCE.json, targetVersion 0.8.0) from the private `codex/proofclip-v0.8.0` worktree snapshot.
- Commercial facilities (subscription/license/quota/usage/webhook, official identities, private material) are excluded from the generated tree; UI carries no plan/quota copy.
- Gates: generated-tree scan CLEAN; extension suite 200/200 full (199/199 with the public-source guard excluded); worker suite 59/59; pipeline self-tests 5/5; governance self-tests 10/10 (Luna adversarial cases included); release-audit auto gates green in a git environment.
- 2026: maintainer approved the swap; `extension/` and `worker/` now hold the 0.8 tree (0.7 backup moved out of the workspace to `D:\ProofClip-Community-0.7-backup`). Repo-mode commercial-boundary scan CLEAN.