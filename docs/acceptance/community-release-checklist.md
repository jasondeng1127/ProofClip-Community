# Community release checklist

This checklist records credential-free release evidence. Do not add origins, account names, extension IDs, database IDs, tokens, screenshots, captured content, or browser exports.

## Local source gate

- [x] 2026-08-12T03:05:26Z at `32dd997d80245bfd87d9994aac048192c6d9b8d3`: `pwsh -NoProfile -File scripts/verify-public-source.ps1 -IncludeUntracked` exited 0 (127 files passed).
- [x] 2026-08-12T03:05:26Z at `32dd997d80245bfd87d9994aac048192c6d9b8d3`: extension suite `& 'D:\node.js\node.exe' --test '.\tests\*.test.mjs'` from `extension\src` exited 0 (214 passed, 0 failed).
- [x] 2026-08-12T03:05:26Z at `32dd997d80245bfd87d9994aac048192c6d9b8d3`: Worker suite `& 'D:\node.js\node.exe' --test '.\tests\*.test.mjs'` from `worker\src` exited 0 (31 passed, 0 failed).
- [x] 2026-08-12T03:05:26Z: `COPYING_MANIFEST.json` contained 126 relative public paths with no excluded local-state paths; manifest contract test passed.
- [x] 2026-08-12T03:19:55Z: after this record and manifest update, scanner exited 0 (127 files), extension suite exited 0 (214 passed, 0 failed), Worker suite exited 0 (31 passed, 0 failed), and `git diff --check` was clean.

## Fresh deployer-owned rehearsal

- [x] 2026-08-12: Created a new deployer-owned Cloudflare D1, Worker, and Notion OAuth integration. All identifiers, origins, credentials, and tokens remain outside this repository.
- [x] 2026-08-12: Applied only `worker/src/schema.sql`, bound the new D1, deployed the Community Worker bundle, configured the separately loaded extension ID, and set OAuth/token-vault values as Worker runtime secrets. The local extension API origin was configured only for the rehearsal and restored to its public placeholder afterward.
- [x] 2026-08-12: OAuth completed; a Data Source was selected and saved locally; one local capture was explicitly sent; and the resulting Notion record was confirmed through the user-authorized rehearsal observation.
- [x] 2026-08-12: Configured-origin CORS was verified with an exact allow-origin response; an unrelated extension origin was denied with no allow-origin response.
- [x] 2026-08-12: Source/schema review passed: the retained D1 schema has only OAuth-state and encrypted-connection metadata tables; Worker contract tests passed and assert no capture body or screenshot retention.

## Result record

| Gate | Date (UTC) | Commit | Result | Notes without secrets |
| --- | --- | --- | --- | --- |
| Local source gate | 2026-08-12T03:05:26Z | `32dd997d80245bfd87d9994aac048192c6d9b8d3` | Pass | Scanner: 127 files; extension: 214 passed; Worker: 31 passed; all commands exited 0. |
| Fresh deployer-owned rehearsal | 2026-08-12 | `32dd997d80245bfd87d9994aac048192c6d9b8d3` | Pass | New D1/schema, Worker/D1 deployment, OAuth, local Data Source mapping, local capture, explicit Notion delivery, configured-origin CORS allow, wrong-origin CORS denial, and non-retention boundary were verified. No sensitive runtime values were recorded. |
