# ProofClip Community Follow-up Backlog

These items are Community-only engineering follow-ups from the final 0.8
acceptance. They are **non-blocking** and must not change the current result:

- Community 0.8 acceptance: `PASS`
- Release blockers: `0`

## TODO-1 — Automated Deployment OAuth Credential Provenance

- Classification: `DEPLOYMENT_RELIABILITY`
- Priority: `FOLLOW-UP`
- Release blocker: `NO`

Investigate how Community deployment obtains and preserves
`NOTION_CLIENT_ID`/`NOTION_CLIENT_SECRET` pairing without reading or exposing
secret values. Cover manual entry versus automation, stale credentials, secret
rotation, and safe preflight validation.

## TODO-2 — Cloudflare Preview / Observability Configuration Parity

- Classification: `DEPLOYMENT_CONFIGURATION_PARITY`
- Priority: `FOLLOW-UP`
- Release blocker: `NO`

Define the expected Preview and Observability states, which settings belong to
the deployment contract, which may remain Dashboard-managed, and how redeploy
avoids configuration drift.

## TODO-3 — Archive Bulk Retry / Outbox Synchronization

- Classification: `OUTBOX_ARCHIVE_STATE_SYNC`
- Priority: `FOLLOW-UP`
- Release blocker: `NO`

Independently investigate Archive bulk retry state propagation across local
evidence delivery state, Outbox, popup state, and reload persistence. A
successful bulk retry should clear the failed item, remove its Outbox entry,
update the popup immediately, remain consistent after reload, and avoid
duplicate sends.

## TODO-4 — One-Command Self-Host Deployment Installer

- Classification: `DEPLOYMENT_UX`
- Priority: `FOLLOW-UP`
- Release blocker: `NO`

The clean manual fresh deployment is functionally accepted, but it still
requires many manual setup steps across Wrangler, D1, configuration, secrets,
schema, migration, bundle, deploy, origin wiring, and health checks. Design a
single configuration entry point and `setup.ps1` flow that automates the
repeatable setup while leaving only necessary third-party authorization and
final human acceptance to the user. Do not reopen or modify Community 0.8 for
this follow-up.

## Scope rule

Do not reopen `DELIVERY_STATUS_WRITEBACK_MISMATCH` because of historical
`PENDING`/`FAILED` records. Do not add Commercial items or cross-project tasks
to this backlog.
