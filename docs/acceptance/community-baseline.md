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
3. Generate `COPYING_MANIFEST.json` after the clean scan and make the first public-safe source commit.
4. Run a fresh Cloudflare/D1/Notion OAuth deployment rehearsal using new deployer-owned accounts and an independently loaded extension ID.
5. Confirm the code license and publish the repository only with Jason's approval.
