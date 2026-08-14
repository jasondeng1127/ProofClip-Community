# 0.7 → 0.8 upgrade rehearsal — Community

> Credential-free checklist. Uses a REAL Community 0.7 Chrome profile and a
> REAL 0.7 deployment (its D1 still carries the legacy commercial tables and
> the workspace metadata columns). This rehearsal is a release gate.

## 0. Prepare

- [ ] Snapshot the 0.7 Chrome extension profile directory
      (`<profile>/Default/Extensions/<extension-id>/`) — backup, do not modify.
- [ ] Export the 0.7 Archive (Export JSON) for comparison.
- [ ] Record the 0.7 Worker bundle SHA256 and the D1 table list
      (expected: legacy tables present).

## 1. Upgrade the Worker + D1

```powershell
cd worker
node scripts/bundle-worker.mjs            # 0.8 bundle
wrangler d1 execute <D1> --file src/schema.sql --remote                 # idempotent
wrangler d1 execute <D1> --file migrations/20260813_privacy_nonretention.sql --remote
wrangler deploy
```
- [ ] Schema statements exit 0. The privacy migration clears
      `connections.workspace_id/workspace_name` and prunes `oauth_states`.
- [ ] Legacy commercial tables may remain physically present (no DROP in the
      migration); confirm the 0.8 Worker never references them and the
      extension shows no plan/quota UI.
- [ ] `/v1/license`, `/v1/usage/report`, `/v1/webhooks/lemon`, `/support`
      return 404; `/privacy` returns the self-hosted page.

## 2. Upgrade the extension (same unpacked id)

- [ ] Replace `extension/src` with the 0.8 tree **without uninstalling**
      (keeps the same extension id and local storage), reload the extension.
- [ ] `community-config.mjs` unchanged (same origin) — connection must survive.

## 3. Verify data continuity (the point of this rehearsal)

- [ ] Local Archive: previous 0.7 records present, readable, with delivery
      state and screenshots intact; new long-page captures are not truncated
      and show structured blocks.
- [ ] Settings: Data Source, mapping, templates, capture route retained.
- [ ] Projects, tags, notes retained.
- [ ] Outbox items retained and retry/verified-resend still works.
- [ ] Notion connection still valid WITHOUT re-authorizing (same install id);
      a local card sends successfully to the same Data Source.
- [ ] Export JSON again; the 0.7 export content is a subset of the 0.8 export
      for the same records.

## 4. Rollback rehearsal

- [ ] Restore the backed-up 0.7 `extension/src` and the 0.7 Worker bundle;
      the extension returns to 0.7 behavior with its data intact.

## 5. Record

| Check | Result | Notes (no secrets) |
| --- | --- | --- |
| schema migration | | |
| legacy routes 404 | | |
| Archive continuity | | |
| settings/projects/tags/Outbox | | |
| OAuth without re-auth | | |
| send + export | | |
| rollback | | |

When all pass, update `release/records/release-record.json`:
`rehearsals.upgrade07To08 = "PASS"`, then re-run `node release/release-audit.mjs`.
