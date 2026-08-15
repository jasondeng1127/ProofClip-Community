# Community 0.8 Release Closeout Delta Audit

Scope was limited to OAuth credential provenance and the Cloudflare Preview/Observability configuration contract. No code was modified and no deployment was performed.

## Task 1 — OAuth Credential Provenance

Verdict: **VERIFIED_EXPECTED_MANUAL_SECRET_MANAGEMENT**

Evidence:

- `deploy/README.md:8,34-51` requires the deployer’s own Notion integration, matching callback URI, and four explicit `wrangler secret put` commands, including `NOTION_CLIENT_ID` and `NOTION_CLIENT_SECRET`.
- `deploy/.dev.vars.example:1-4` contains placeholders only.
- `docs/architecture.md:15` and `docs/self-hosted-notion-oauth.md:3,5` state that the deployer creates the integration and that the client secret remains Worker-only.
- Targeted inspection of `deploy/`, setup/init/bootstrap candidates, `scripts/`, `worker/scripts/`, `release/`, docs, and package-manifest paths found no credential-provisioning code, no `wrangler secret put` automation, no environment-copy path, and no secret-writing deploy helper.
- `release/cut-release.mjs:23,95-124` builds/packages the Worker bundle and deploy artifact only; it does not provision OAuth credentials or run Wrangler deploy/secret commands.
- `wrangler deploy` appears only as a documented manual command. No repository path invokes `wrangler secret put` during redeploy.

Automation writes credentials: **NO**  
Stale-secret automatic reuse path: **NO** (no repository automation path found)  
Classification valid: **YES**  
Release blocker: **NO**

The prior `401 invalid_client` cause is not re-audited here; this result only classifies the credential-provenance mechanism as manual by design.

## Task 2 — Cloudflare Config Contract

Verdict: **PARTIAL**

Evidence:

- `deploy/wrangler.template.jsonc:5` has top-level `"preview_urls": false`.
- `deploy/wrangler.template.jsonc:6-11` has top-level `observability.enabled: true` and nested `observability.logs.enabled: true`.
- The file parses as JSONC-compatible JSON. The official Wrangler `4.115.0` config schema recognizes `preview_urls`, `observability.enabled`, `observability.logs`, and `observability.logs.enabled`; no unknown keys were found in those sections. Cloudflare documents `preview_urls` as a top-level key and observability as a top-level configuration object: [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/), [Preview URLs](https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/), [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/).
- The diff adds only the preview/observability block. `name`, `main`, `compatibility_date`, `d1_databases`, and `vars` are semantically unchanged versus HEAD. `vars.PROOFCLIP_EXTENSION_ID` remains the same binding.
- `deploy/README.md:14` and `docs/release-rehearsal-0.8.md:24` identify this template as the manual source copied to `worker/wrangler.jsonc`.
- No executable deployment helper consumes the template directly. No `worker/wrangler.jsonc`, `worker/wrangler.toml`, or `.wrangler/deploy/config.json` exists in the current workspace. The release cut packages `deploy/` but does not perform a Wrangler deployment.
- No deploy/redeploy log or drift-warning result was found in the existing audit evidence. Therefore disappearance of the warning is **NOT VERIFIED**.

preview_urls: **PASS**  
observability: **PASS**  
logs: **PASS**  
Template actually used by deployment: **YES** — documented manual copy path; actual remote use remains unverified.  
Unexpected config override: **NO** — no local alternate config/redirect was found; Cloudflare Dashboard state was not inspected.  
Release blocker: **YES** — not because the template is invalid, but because the claimed redeploy/drift outcome has no deployment evidence.

## Final Closeout Verdict

**TASK_2_BLOCKED**

Task 1 is closed as expected manual secret management. Task 2’s local contract is valid and preserves the existing Worker/D1/vars bindings, but the requested closeout cannot be marked complete without actual redeploy evidence showing the drift warning is gone.
