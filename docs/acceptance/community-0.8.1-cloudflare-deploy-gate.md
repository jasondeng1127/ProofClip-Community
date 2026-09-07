# ProofClip Community 0.8.1 Cloudflare Deployment Human Gate

Status: HUMAN GATE REQUIRED. This document is a bounded acceptance procedure,
not a deployment record and not release approval. Local tests, a prepared
candidate, or a successful command are not evidence of completed OAuth,
capture, delivery, or release acceptance.

## Scope and authority

Run this gate only against a clean Community 0.8.1 candidate and a deployment
owned by the tester. Use a never-deployed Cloudflare account, a fresh Notion
integration, and a fresh Chrome profile. The tester must perform exactly one
real capture and one second deploy against the same deployment. The invalid
token check is a separate preflight and must happen before the valid deploy.

The human tester is the authority for the live gate. No local or CI PASS may
be recorded as `COMMUNITY_0.8.1_RELEASE_CANDIDATE_PASS`; that decision remains
with the maintainer after reviewing the evidence below.

This document intentionally contains no real Worker URL, account identifier,
secret, OAuth value, callback value, or historical rehearsal identity.

## Offline command list

Run from the repository or candidate root as applicable. These commands do
not contact Cloudflare, Notion, OAuth, or a live deployment:

```powershell
node --test deploy/tests/*.test.mjs
node --test deploy/tests/identity.test.mjs deploy/tests/origin.test.mjs deploy/tests/wrangler-template-contract.test.mjs extension/src/tests/extension-id.test.mjs
node --test release/tests/community-0.8.1-export.test.mjs release/tests/community-0.8.1-provenance.test.mjs
node --test extension/src/tests/*.test.mjs worker/src/tests/*.test.mjs
node --test deploy/tests/complete-contract.test.mjs
node release/verify-community-0.8.1.mjs --candidate=release/out/community-0.8.1 --commit=<source-HEAD> --fingerprint=<content-fingerprint>
git diff --check
```

The deploy wrapper test may honestly skip its POSIX-shell case only when the
environment has no executable POSIX shell. A missing shell is an environment
skip, not a deployment PASS.

## Human procedure

### 1. Invalid-token preflight

Use a fresh local deploy environment containing a deliberately invalid,
non-secret token sentinel and no usable deployment credentials. Run the
documented deploy entrypoint. Confirm the command stops before any Worker or
D1 create call and leaves no new resource. Preserve only the stable failure
code and redacted command output; do not record the token sentinel.

Required outcome: `invalid token creates no resource`

### 2. First deploy and manual handoff

Using the same never-deployed Cloudflare account, fresh Notion integration,
and fresh Chrome profile, provide only the three documented local credential
values. Run the deploy entrypoint once. Save the redacted summary and the
generated extension directory path. Add the printed callback to the same
fresh Notion integration, then load only the printed generated extension
directory in Chrome.

Do not load the candidate root, ZIP, test directory, deployment source, or any
older extraction. Do not edit Worker configuration, extension source, or
resource names by hand.

### 3. One capture and delivery

In the fresh profile, connect Notion, select a Data Source, complete the
documented setup action, and perform one capture. Confirm the exact outcomes
below in the extension and deployer-owned Notion destination:

- `Notion connected`
- `Data Source configured`
- `one capture`
- `Notion page created`
- `Delivery SENT`
- `Outbox 0`
- `/privacy HTTP 200`
- `valid-origin CORS passes`
- `invalid-origin CORS rejected`

The `/privacy` and CORS checks must use the actual deployed origin printed by
the command, while this document stores only the redacted result and not the
origin value. The invalid-origin request must not receive the extension CORS
headers or a successful protected response.

### 4. Second deploy idempotency

Run the same deploy command again against the same local state and remote
resources without deleting anything. Confirm the redacted summaries identify
the same Worker and D1 resources, no duplicate resource is created, and the
deployment remains healthy.

Required outcome: `second deploy reuses Worker/D1`

## Evidence record

Fill this table in a separate private evidence record. Do not put secrets,
OAuth values, full callback URLs, or account identifiers into this document.

| Evidence field | Required evidence | Result |
| --- | --- | --- |
| Candidate identity | Candidate version, source/fingerprint verification result | |
| Resource identity | Redacted Worker/D1 names or safe local references proving same resources on both runs | |
| Generated extension path | Exact local path loaded in the fresh Chrome profile | |
| OAuth | Notion connected result and callback-registration confirmation, with values redacted | |
| Data Source | Selected Data Source and setup result, with identifiers redacted | |
| Delivery | One capture, Notion page created, and `Delivery SENT` | |
| Outbox | `Outbox 0` after the capture | |
| `/privacy` | HTTP status `200` from the deployed origin | |
| CORS | Valid-origin passes; invalid-origin rejected | |
| Idempotency | Second deploy reuses Worker/D1 and creates no duplicate resource | |
| Fail-closed | Invalid token creates no resource before the first valid deploy | |

## Gate decision

Pass only when every evidence field is complete, the exact outcomes are
observed, and the tester confirms no developer intervention or undocumented
recovery was needed. A failure or missing field is `HOLD`; preserve the
redacted evidence and stop. The human maintainer alone may record the final
release decision after this gate.
