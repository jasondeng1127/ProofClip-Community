# Community baseline acceptance — 2026-08-12

## Local-source baseline

- Community source has no fixed deployment identity or central service dependency.
- The extension is configured with a deployer-owned HTTPS Worker origin and keeps evidence local until an explicit send.
- The Worker accepts only its configured extension origin, stores encrypted Notion OAuth material in deployer-owned D1, and does not retain capture bodies or screenshots.
- `LICENSE` declares AGPL-3.0-only; `TRADEMARKS.md` keeps brand permission separate.
- The current public-source scanner, manifest, and offline test results are recorded in [the release checklist](community-release-checklist.md).

## Required before a deployment or publication

1. Run the scanner and both offline suites from a clean checkout.
2. Regenerate and validate `COPYING_MANIFEST.json` if the tracked source inventory changes.
3. Complete the fresh deployer-owned Cloudflare/D1/Notion OAuth rehearsal and record only credential-free results.
4. Obtain the required repository-host and deployment approvals before any external action.
