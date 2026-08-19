# Contributing

This repository is a self-hosted Community project. Contributions must preserve that boundary: no Official service dependency, no private account identifiers, no tokens or keys, and no telemetry that is not explicitly designed and documented.

Submit a focused change with a regression test and run the extension and Worker test suites. Deployment, OAuth, CORS, schema, and privacy changes require a reproducible local verification note. Do not place secrets, real Notion URLs, customer data, screenshots, or browser exports in an issue or pull request.
## Release workflow

- `main` is the only long-lived branch and the current public source baseline.
- Version history lives in Git tags / GitHub Releases — never in long-lived
  `main-vX`/release branches.
- Temporary branches (`feature/*`, `fix/*`, `audit/*`, `codex/*`) must be
  merged/reconciled into `main`, verified, then deleted.
- Before tagging: `main` must carry the release version, migrations, release
  tooling and CI (enforced by `release/release-audit.mjs`, see
  `docs/release-process-governance.md`).
- Edition boundary: Community-only features never flow automatically from
  Commercial; every export/merge is gated by `release/edition-boundary.json`
  and the commercial-feature leak scan.
