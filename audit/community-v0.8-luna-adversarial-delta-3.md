## DeepSeek Round-3 Claim Verification Matrix

本报告是 ProofClip Community 0.8 第三轮发布前 adversarial delta audit。所有 DeepSeek 最新陈述均按 CLAIM 处理；本报告只记录本轮实际复验结果，不作最终发布批准，不修改 public release 状态，不执行 push/tag/release。

| Claim | DeepSeek 主张 | 独立结果 | 关键证据 |
|---|---|---|---|
| CLAIM-1 | `release/tmp` 删除，staging 在系统 temp 且成功/失败都会清理 | **PARTIALLY VERIFIED** | `release/tmp*`、日志、workspace staging 均无残留；成功 cut 后 staging 消失，但中途 `mkdir(outDir)` 失败后 staging 仍存在 |
| CLAIM-2 | upstream pin 到 immutable commit `9d9e96a2...` 并带 fingerprint | **VERIFIED** | upstream HEAD、pin commit、计算 fingerprint 均一致；upstream tag `proofclip-v0.8.0-release-preparation-20260814` 指向该 commit |
| CLAIM-3 | 有 git 时验证 upstream HEAD 和 clean worktree，失败即拒绝 | **VERIFIED** | HEAD 不匹配与 dirty fixture 均被 exporter 拒绝；实际 tracked worktree `git status --porcelain` 为空 |
| CLAIM-4 | 无 git 时 fingerprint 可验证 pinned source，篡改 source/pin 会拒绝 | **PARTIALLY VERIFIED** | source 改动且 pin 不变被拒绝；同步改 source+fingerprint 可通过，属于 self-consistency only；fallback 未覆盖 overlay/boundary/exporter 等输入身份 |
| CLAIM-5 | release-audit 绑定 `record.sourceBinding.commit == HEAD`，git unavailable fail-closed | **PARTIALLY VERIFIED** | 6 个 adversarial case 中 fake commit、git unavailable 均 exit 1；当前真实 record 的 commit 为 `null`，真实 audit 仍 exit 1 |
| CLAIM-6 | tag 必须存在且指向 audited HEAD，才能 release-ready | **PARTIALLY VERIFIED** | 无 tag 时 `releaseReady=false`；tag points elsewhere 时 `releaseReady=false` 但 CLI exit 仍为 0；任意 tag 名在 HEAD 可令 `releaseReady=true`，没有 version/RC policy |
| CLAIM-7 | 上轮 6 个反例已转成 10/10 governance regression tests | **PARTIALLY VERIFIED** | governance 10/10、pipeline 5/5；6 个 Luna case 在测试中存在，但 tag、bundle、完整 ZIP 内容扫描未被这 10 个测试覆盖 |
| CLAIM-8 | artifact 内 Worker bundle SHA 被独立验证 | **VERIFIED** | 当前 ZIP SHA 与 record 一致；ZIP 内 `worker/dist/worker.mjs` SHA 与 record 一致；替换 ZIP 内 bundle 后 audit exit 1 |
| CLAIM-9 | manifest、provenance SHA、dirty tree、mandatory rehearsals 都是 fail-closed gates | **PARTIALLY VERIFIED** | manifest/provenance/dirty 均阻断；`NOT_RUN` rehearsals 仍为 `AUTO_GATES_PASS` exit 0，只影响 `releaseReady` |
| CLAIM-10 | CI 执行 public-source verification 和 release-audit | **VERIFIED** | `.github/workflows/ci.yml` 明确包含两步；尚未在远程 CI 实际运行 |
| CLAIM-11 | `release/records` 与 canonical provenance 已 Git tracked，ZIP 仍 ignored | **REFUTED** | `git ls-files` 对 current record、history、canonical provenance 均无输出；ZIP、out、records 均 ignored |
| CLAIM-12 | COPYING_MANIFEST、旧数字、旧 backup 描述、test counts 已收敛 | **REFUTED** | 当前 `MIGRATION.md` 仍写 `115 files`、`199/199`；还写 canonical provenance 已 committed，但实际未 tracked |
| CLAIM-13 | 当前 audit 剩余失败只有 git unavailable | **REFUTED** | 当前 git 可用；真实 audit 失败原因为 record commit missing 与 Community worktree dirty |
| CLAIM-14 | 除 commit/cut、两次真实 rehearsal、tag 外无新 blocker/major | **REFUTED** | 发现 CI bootstrap、rehearsal evidence、tag policy、ZIP-level coverage 等新的 MAJOR candidate |
| CLAIM-15 | upstream 后续变化时 export 会拒绝，Community 不静默漂移 | **VERIFIED** | HEAD 改动、tracked dirty、source fingerprint drift 的反例均被拒绝；无 git fallback 只能证明内容一致，不能证明 Git identity |

结论：DeepSeek 所称“7 项全部落地”不成立；CLAIM-1、4、5、6、7、9 为部分成立，CLAIM-11 至 CLAIM-14 被当前工作区事实或独立故障注入反驳。

## 1. Baseline

审计开始时的基线：

- Workspace: `D:\ProofClip-Community`
- Branch: `main`
- HEAD: `ac645ae6b38f9419b9c546e255296e4e4f7afc0d` (`chore: ignore local worktrees`)
- Manifest: `extension/src/manifest.json`, version `0.8.0`
- Community tag at HEAD: none (`git tag --points-at HEAD` 无输出)
- Upstream branch: `codex/proofclip-v0.8.0`
- Upstream HEAD: `9d9e96a2b1994b42aa3419bdfaadc4bd597d6382`
- Upstream tag: `proofclip-v0.8.0-release-preparation-20260814`
- Pin commit: `9d9e96a2b1994b42aa3419bdfaadc4bd597d6382`
- Pin fingerprint: `105b4da8f6939b0b6272f03d6549fdb3ad157b80360cab72807c61015d3dbfa4`
- Computed upstream fingerprint: `105b4da8f6939b0b6272f03d6549fdb3ad157b80360cab72807c61015d3dbfa4`
- Current release record: `D:\ProofClip-Community\release\records\release-record.json`
- Canonical provenance: `D:\ProofClip-Community\release\provenance\community-0.8.0.json`
- Artifact: `D:\ProofClip-Community\release\artifacts\proofclip-community-0.8.0-2026-08-14T08-38-56-050Z.zip`
- Artifact SHA256: `0ffb7ee54d59db17f366a9886e1443a8eb5725d0f157bc700bb7980e85ee5aeb`
- Artifact file count recorded: `152`
- Provenance/generated file count: `116`

实际 Git 状态（审计开始时）：

```text
## main
 M .gitignore
 M MIGRATION.md
 M README.md
 M deploy/README.md
 M docs/acceptance/community-baseline.md
 M scripts/verify-public-source.ps1
?? .github/
?? audit/
?? docs/release-rehearsal-0.8.md
?? docs/upgrade-rehearsal-0.8.md
?? extension/
?? release/
?? scripts/agent-probes/
?? worker/
!! .worktrees/
!! release/artifacts/
!! release/out/
!! release/records/
!! worker/dist/
```

统计：Git tracked files `14`；changed tracked files `6`；untracked top-level entries `8`；ignored entries `5`。因此 Community `git_clean=false`。upstream 的 tracked worktree clean，但 `git status --porcelain --ignored` 仍显示 `.superpowers/`、upstream release ZIP、service `dist/` 和 `wrangler.jsonc` 等 ignored material；本报告的 `upstream_clean=true` 仅表示正常 Git tracked cleanliness，不把 ignored files 当作 dirty。

## 2. DSH diff summary

本轮没有新的 DSH commit；HEAD 仍为 `ac645ae6b38f9419b9c546e255296e4e4f7afc0d`。本轮看到的 DSH 工作区范围为：

- tracked diff：`.gitignore`、`MIGRATION.md`、`README.md`、`deploy/README.md`、`docs/acceptance/community-baseline.md`、`scripts/verify-public-source.ps1`，合计 `42 insertions / 9 deletions`。
- untracked release system：`.github/workflows/ci.yml`、`release/edition-boundary.json`、`release/export-community.mjs`、`release/cut-release.mjs`、`release/release-audit.mjs`、`release/set-rehearsal.mjs`、`release/verify-generated-tree.mjs`、`release/provenance/`、`release/records/`、`release/tests/`、`release/artifacts/`、`release/out/`。
- product tree：`extension/`、`worker/`，以及 Community overlay 导出的产品测试和实现。
- verification/docs：`scripts/verify-public-source.ps1`、`scripts/agent-probes/`、`docs/release-rehearsal-0.8.md`、`docs/upgrade-rehearsal-0.8.md`。

重要事实：这些新增发布治理文件在当前 index 中并没有落地为 tracked commit；因此“本轮修复已经提交/CI 可从 checkout 复现”的主张不能从当前工作区得到支持。

## 3. Test execution

所有下列命令均为本轮实际执行；没有 retry，也没有观察到 flaky。

| Scope | Actual command | Result |
|---|---|---|
| Extension suite + release hardening | `D:\node.js\node.exe --test --test-reporter=spec .\tests\*.test.mjs`，cwd `extension/src` | **PASSED 200/200**, failed 0, skipped 0, exit 0 |
| Worker suite | `D:\node.js\node.exe --test --test-reporter=spec .\tests\*.test.mjs`，cwd `worker/src` | **PASSED 59/59**, failed 0, skipped 0, exit 0 |
| Community boundary tests | `D:\node.js\node.exe --test --test-reporter=spec extension/src/tests/community-boundary.test.mjs extension/src/tests/community-commercial-boundary.test.mjs worker/src/tests/community-service-boundary.test.mjs` | **PASSED 5/5**, exit 0 |
| Public-source verification | `pwsh -NoProfile -ExecutionPolicy Bypass -File scripts/verify-public-source.ps1 -IncludeUntracked` | **PASSED**, scanned 194 files, exit 0 |
| Pipeline + governance | `D:\node.js\node.exe --test --test-reporter=spec release/tests/export-pipeline.test.mjs release/tests/release-governance.test.mjs` | **PASSED 15/15**: pipeline 5/5, governance 10/10, exit 0 |
| Commercial boundary repo scan | `D:\node.js\node.exe release/verify-generated-tree.mjs --tree D:\ProofClip-Community --repo` | **PASSED**, scanned 116 product files, exit 0 |
| Worker bundle build | `D:\node.js\node.exe worker/scripts/bundle-worker.mjs` | **PASSED**, exit 0 |
| Release audit | `D:\node.js\node.exe release/release-audit.mjs` | **FAILED**, exit 1: `source commit binding missing in record`; `worktree is dirty` |
| Release audit with suites | `D:\node.js\node.exe release/release-audit.mjs --include-tests` | **FAILED**, exit 1 for the same two current-workspace findings; nested extension/worker suites both passed |

未执行或不能由离线套件代替的项目：真实 Cloudflare Worker/D1/Notion OAuth fresh deployment、0.7→0.8 upgrade rehearsal、真实 CORS/browser extension rehearsal、最终 commit/tag 后的 clean checkout CI。它们均按 `NOT VERIFIED` 处理。

## 4. Product parity regression boundary

本轮按增量审计要求没有重新展开完整产品 parity；只确认 0.8 产品与 Community boundary 没有被本轮 release-governance 改动回归：Extension 200/200、Worker 59/59、boundary 5/5、public-source 194 文件扫描均通过。Capture、Full Page、Archive、Notion 的完整能力判断沿用第一轮 dossier，不把离线 suite 误写成真实部署验收。

## 5. Workspace hygiene

- `release/tmp` 不存在；`release/tmp*` 不存在。
- workspace 内没有 `ext.log` 或 `wrk.log`。
- Community workspace 内没有 `backup` 目录；`D:\ProofClip-Community-0.7-backup` 在 workspace 外存在，符合“backup 不进入 Community workspace”的事实。
- 成功 cut fixture：系统 temp staging 在返回后不存在。
- 失败 cut fixture：让 `outDir` 指向一个已存在文件，触发 `EEXIST`；异常返回时系统 temp `proofclip-package-<version>` 仍存在。测试结束后已删除该测试 fixture，证明清理依赖外部善后，不是 cut 的自动 finally 清理。

因此 CLAIM-1 只能是 PARTIALLY VERIFIED。

## 6. Upstream pin

`release/edition-boundary.json` 写入了 commit、fingerprint 和 pinnedAt。独立命令确认：

```text
upstream HEAD = 9d9e96a2b1994b42aa3419bdfaadc4bd597d6382
pin commit    = 9d9e96a2b1994b42aa3419bdfaadc4bd597d6382
pin fingerprint     = 105b4da8f6939b0b6272f03d6549fdb3ad157b80360cab72807c61015d3dbfa4
computed fingerprint = 105b4da8f6939b0b6272f03d6549fdb3ad157b80360cab72807c61015d3dbfa4
```

独立 exporter 反例：

- A. `revParse` 返回非 pin commit：拒绝，错误为 `upstream HEAD ... != pinned commit ...`。
- B. HEAD 等于 pin 但 `statusPorcelain` 返回 dirty：拒绝，错误为 `upstream working tree is dirty`。
- C. 修改 pinned source、Git 不可用、pin 不变：拒绝，错误为 `upstream fingerprint mismatch`。
- D. 同时修改 source 和 pin fingerprint 使内容自洽：通过。该结果是 **self-consistency only**，不证明新的 Git commit identity；本项目威胁模型不要求防管理员同步重写全部 evidence，但 release record 不能把 fallback fingerprint 当成已证明的 commit identity。

正常有 Git 的维护流程中，moving tracked worktree 不能静默进入 exporter；这一点 VERIFIED。ignored input 的存在仍需由最终 clean checkout/release procedure 管理。

## 7. Fingerprint fallback

`computeUpstreamFingerprint()` 实际覆盖的是 boundary roots 中 upstream 的 included files，并应用 exclusions；它不把以下身份作为同一个 pin 输入覆盖：

- Community overlay；
- `edition-boundary.json` 本身的完整身份；
- exporter、release config 和 cut workflow；
- Community-owned build script 与其它 release tooling 的 Git identity。

这不是把 Community-owned overlay 错判成 Commercial upstream 的理由，但必须区分：

- **PIN IDENTITY**：Git commit 只能在 Git 可用并检查 HEAD 时证明；
- **CONTENT CONSISTENCY**：无 Git fingerprint 只能证明当前被纳入 fingerprint 的内容与 fingerprint 一致。

当前实现的 fallback 反例 C/D 证明了内容 gate 存在，但覆盖面和 identity 语义不足。因此 `fingerprint_fallback=partial`，未把它当作签名系统问题，也未把 D 误报为安全失败。

## 8. Commit-binding workflow

当前真实 record：

```text
release/records/release-record.json
sourceBinding.commit = null
sourceBinding.workspaceFingerprint = 35b3358d00af8e8ae1813c6d6cfa8c5d06e9162fb91778b11e642d01acd0a655
```

当前 `release-audit` 在 Git 可用时确实比较 `record.sourceBinding.commit` 与 HEAD；当前 record 因 commit 为 null 被阻断。Luna-01 与 Luna-06 也分别证明 fake commit、Git unavailable 会 exit 1。

但 DeepSeek 所称的 tracked-state workflow 与事实不符：`git ls-files release/records/* release/provenance/community-0.8.0.json` 没有输出。代码路径显示：

- `cut-release.mjs` 每次 cut 都写 current record 和 timestamped history；
- `set-rehearsal.mjs` 每次 PASS/FAIL/NOT_RUN 都直接改 current record；
- 如果这些文件真的被 tracked，`commit → cut` 会改 tracked current/history，`set-rehearsal` 也会再次制造 dirty；而 audit 又要求 clean worktree；
- 当前 `.gitignore` 反而把 `release/records/`、`release/artifacts/`、`release/out/` 忽略，避开了这个循环，但这与 CLAIM-11 的 tracked 说法相反。

条件式 fixed-point 风险：若将 current record 直接纳入 tracked HEAD，同时保持 `record.commit == HEAD` 和 clean gate，则 commit 后再 cut 会写入新的 record，record 又指向旧 HEAD；需要额外的 metadata commit/exclusion/out-of-band model，不能靠 DeepSeek 给出的四步文字自动解决。

## 9. Tag gate

当前 Community HEAD 没有 tag。代码使用 `git tag --points-at HEAD` 获取字符串，然后以 `Boolean(gates.tagAtHead)` 判断：

```js
gates.releaseReady = gates.rehearsalsComplete && Boolean(gates.tagAtHead) && findings.length === 0;
```

独立注入结果：

- 没有 tag：`releaseReady=false`。
- tag points elsewhere：`exitCode=0`、`AUTO_GATES_PASS`、`releaseReady=false`；tag gate 没有让自动 audit fail closed。
- 任意名称 `arbitrary-tag` points at HEAD：`exitCode=0`、`AUTO_GATES_PASS`、`releaseReady=true`。

因此当前实现没有要求 `v0.8.0-rc1`、正式 `v0.8.0` 或其它明确 release policy；不能把“有任意 tag 在 HEAD”当作 release tag gate。

## 10. Adversarial regression matrix

以下为独立 fixture 的实际结果；`exitCode` 是把 `summary.ok` 映射到 CLI 的 0/1 行为，`AUTO_GATES_PASS` 是 audit readiness 字段。

| Case | exit | AUTO_GATES | releaseReady | Finding |
|---|---:|---|---|---|
| 1. fake commit | 1 | FAIL | false | `record commit ... != HEAD ...` |
| 2. manifest `9.9.9` | 1 | FAIL | false | `STALE: workspace fingerprint differs`; manifest mismatch |
| 3. forged provenance SHA | 1 | FAIL | false | record provenance SHA 不匹配实际文件 |
| 4. dirty worktree | 1 | FAIL | false | worktree dirty |
| 5. rehearsals `NOT_RUN` | **0** | **AUTO_GATES_PASS** | false | findings 空；mandatory rehearsal 没有 fail-closed exit |
| 6. Git unavailable | 1 | FAIL | false | commit binding 与 cleanliness 均 fail-closed |
| 7. ZIP 增加 extra entry，同时重算 ZIP SHA | **0** | **AUTO_GATES_PASS** | **true** | artifact SHA 自洽且 bundle 未变，未做完整 ZIP allowlist/provenance scan |
| 8. source changed without recut | 1 | FAIL | false | `STALE: workspace fingerprint differs` |
| 9. tag points elsewhere | **0** | **AUTO_GATES_PASS** | false | tag 只影响 releaseReady，不影响 audit exit |
| 10. upstream HEAD changed | 1（exporter） | n/a | n/a | `upstream HEAD != pinned commit` |

另行执行的 bundle 反例：替换 ZIP 内 `worker/dist/worker.mjs` 并同步重算 ZIP SHA，但保留原 `bundleSha256`，audit exit 1，finding 为 `bundle inside the artifact does not match the record bundleSha256`。

## 11. Bundle integrity

当前真实 artifact 复算：

```text
record artifact SHA = 0ffb7ee54d59db17f366a9886e1443a8eb5725d0f157bc700bb7980e85ee5aeb
recomputed ZIP SHA  = 0ffb7ee54d59db17f366a9886e1443a8eb5725d0f157bc700bb7980e85ee5aeb
record bundle SHA   = ae8b507561ad98054992dd0c8af8797b16ec04e23caf8688225c7a56c7b67c77
ZIP bundle SHA      = ae8b507561ad98054992dd0c8af8797b16ec04e23caf8688225c7a56c7b67c77
```

`worker/scripts/bundle-worker.mjs` 在当前 Community workspace fingerprint 中会被纳入 extension/worker workspace fingerprint；provenance 将其标为 Community overlay。Node version 也写入 record (`v24.18.0`)。但 upstream pin fingerprint 本身不覆盖 Community overlay build script 的 Git identity。

当前 audit 只从 ZIP 提取并校验 Worker bundle，并没有对整个 ZIP 重新执行 Community boundary/provenance allowlist scan；因此 ZIP 增加额外 entry 后同步重算 ZIP SHA 可以通过。这使 `bundle_integrity=partial`，不是完全的 artifact integrity closure。

## 12. Record/provenance truth model

当前物理状态：

- `release/records/` 有 current record 加 5 个 history snapshot，共 6 个文件；current 与 history 文件名分离，职责上没有混为同一个 JSON。
- 但 current、history、canonical provenance 全部没有进入 Git index；`release/artifacts/`、`release/out/`、`release/records/` 都被 ignore。
- canonical provenance 与 generated `release/out/community-0.8.0/PROVENANCE.json` 当前内容相同，二者 SHA 都是 `a692ca4ccc1b910d5863ff225aaee8f8879ca039caf68ce1a11b34e0ec63db3f`，fileCount 都是 116。
- `export-community.mjs` 在默认 export 时写 generated PROVENANCE 和 canonical copy；`cut-release.mjs` 的 provenance match 默认读 generated copy，但打包与 record SHA 读 canonical copy；`release-audit.mjs` 默认读 canonical copy。

这形成两个不同路径的 provenance 文件，当前结果一致但没有一个显式的 equality gate 把它们当作同一 immutable source。current audit 使用 canonical，cut 的 match 使用 generated；需要在发布治理上明确 canonical-only 或强制两者字节一致。CLAIM-11 的“已 tracked”事实为 REFUTED；truth model 本身为 NEEDS REVIEW。

History 目前只有 5 份，未看到当前轮造成无限增长的证据；但在 tracked history 设计下每次 cut 都会新增一份，必须有 retention/归档政策。

## 13. CI behavior

`.github/workflows/ci.yml` 设计上包含：

- pipeline + governance self-tests；
- extension / Worker suite；
- `scripts/verify-public-source.ps1 -IncludeUntracked`；
- repo commercial-boundary scan；
- `release/release-audit.mjs`。

因此 CI 文件确实包含 public-source 和 release-audit，CLAIM-10 的静态部分成立。但它把 release audit 放在每个 `main` push 和每个 PR 的普通 CI 中，而当前 release record/artifact 是 ignored。一个普通 checkout 没有 `release/records/release-record.json` 和 ZIP artifact 时，release-audit 会因 record/artifact 缺失失败；即使有 record，普通 commit 也通常没有 final tag/rehearsals。

这没有清楚分离 `development CI` 与 `release readiness CI`。当前设计无法同时满足“普通开发 CI 正常”与“最终 release gate 不降级”，属于 **MAJOR**。

Public-source PowerShell gate 使用 `git ls-files --cached --others --exclude-standard`，会纳入 tracked 与 relevant untracked 文件，并额外调用 repo commercial-boundary scan；本轮实际通过 194 文件。它不扫描 ignored ZIP/system temp，这本身可以接受，但最终 artifact 当前只有 bundle-level 独立检查，缺少完整 ZIP-level scan。

## 14. Rehearsal evidence model

`release/set-rehearsal.mjs` 的实际行为只有：

```text
record.rehearsals[name] = result
record.updatedAt = new Date().toISOString()
write current release-record.json
```

它没有要求或写入：

- executedAt（除非把 updatedAt 误当成执行时间）；
- executor；
- evidence path / notes；
- environment identifier；
- source commit / artifact SHA binding。

任何能写该 ignored record 的调用者都可以直接把 `freshDeploy` 或 `upgrade07To08` 改成 PASS。文档有 rehearsal checklist，但本轮没有真实 rehearsal evidence。该模型为 **MAJOR**，且是 release status drift 的新风险。

## 15. Docs closure

当前全仓搜索命中：

- `MIGRATION.md:33`：`115 files`，实际 provenance 是 116；
- `MIGRATION.md:34`：仍写 `199/199 (guard excluded)`，本轮实际 full Extension 是 200/200；
- `MIGRATION.md:35`：写 canonical provenance “committed under `release/provenance/`”，但 `git ls-files` 证明未 tracked；
- `release/edition-boundary.json:170`、`release/README.md:17-18`、`docs/acceptance/community-baseline.md:23`：`COPYING_MANIFEST` 作为 superseded legacy manifest 被提及，属于合法迁移说明，不是产品泄漏；
- `docs/acceptance/community-baseline.md:30`：旧的 199/199 计数仍保留在当前 acceptance 文档；
- test 文件中出现 quota/subscription 等词属于 boundary negative-test 文本，repo scan 对 tests 有明确排除并已通过，不判为实际产品泄漏。

所以旧口径没有全部收敛；CLAIM-12 REFUTED，影响主要是证据可信度和交付复核成本。

## 16. Final release workflow simulation

DeepSeek 给出的四步：

1. `git add` + `commit`；
2. `cut` → `audit`；
3. 跑 rehearsals + `set PASS`；
4. tag → audit `releaseReady=true`。

独立判断：按“records/provenance 已 tracked”的前提，这个顺序不能稳定地产生 `clean HEAD + final record + final artifact + final tag`，因为 cut 和 rehearsal 都会改 tracked record；而 record 又绑定 cut 时的 HEAD。当前实际实现通过 ignore 规避了 dirty，但因此又反驳了“已 tracked”的陈述。当前没有 clean commit/tag 后的真实 end-to-end simulation，不能把该流程标为 VERIFIED。

在当前 ignore 设计下，较接近可执行的顺序应是：

1. 完成 export、修正 docs/CI/release scripts，并把应该进入 source commit 的文件一次性 commit 成冻结 HEAD；
2. 在该冻结 HEAD 上 cut，生成 ignored current record 与 artifact，并确认 record commit 等于该 HEAD、artifact/bundle/provenance SHA 一致；
3. 执行两次真实 rehearsal，保存外部 evidence，并把 evidence metadata 写回 record；
4. 在 record 不改变 source HEAD 的前提下打明确的 release tag；
5. 以 clean checkout + 明确 tag policy 执行最终 release audit，并确认 ZIP-level scan、record、artifact、tag 全部绑定。

若选择 tracked record/provenance，则必须先设计 metadata commit 或审计排除规则，不能沿用现有 `clean worktree` 与 `record.commit == HEAD` 的同时约束。

## 17. New blocker/major

### BLOCKER candidate

没有在当前 ignore 实际模型下确认一个新的、不可绕过的 unconditional blocker；最终 release 当前仍然被未绑定 commit、dirty workspace、未完成 rehearsal、无 Community tag 阻断。条件性 blocker 是：若真的把 current record 纳入 tracked HEAD，又不改变现有 commit/dirty 规则，`commit → cut → audit` 会形成 release closure fixed-point 问题。

### MAJOR candidate

- **MAJOR-1 — CI 分层错误**：普通 PR/push 直接运行需要 current record、artifact、clean HEAD、tag/rehearsal context 的 release audit；当前 ignored artifact/record 也不能从普通 checkout 获得。
- **MAJOR-2 — mandatory rehearsal fail-open**：`NOT_RUN` 时 CLI 仍 exit 0、`AUTO_GATES_PASS`；只把 `releaseReady` 设为 false，不足以作为 fail-closed automation gate。
- **MAJOR-3 — tag policy 缺失**：任意 tag 在 HEAD 都可让 `releaseReady=true`，没有 0.8.0 RC/final tag 名称规则。
- **MAJOR-4 — rehearsal evidence 漂移**：`set-rehearsal.mjs` 只接受裸状态，缺少执行者、环境、evidence、source/artifact binding。
- **MAJOR-5 — artifact ZIP coverage 不完整**：bundle replacement 能被发现，但新增 ZIP entry 并重算 ZIP SHA 可通过；没有完整 ZIP-level boundary/provenance scan。
- **MAJOR-6 — provenance 双路径未明确收敛**：cut 使用 generated copy，artifact/audit 使用 canonical copy；当前二者相同但未由单一 equality gate 锁定。

### MINOR

- `MIGRATION.md` 与 acceptance 文档仍有 115、199/199 和“canonical committed”等过时证据口径。
- 无 Git fallback fingerprint 的输入覆盖范围小于完整 release input；需要在 release docs 中明确它是 content consistency 而非 commit identity。
- release history 当前有 5 份 snapshot，尚无 retention/归档规则。

### NOTE

- 产品离线 regression 本轮仍全绿；本报告没有据此给出真实部署或发布批准。
- 当前 artifact SHA 和 ZIP 内 Worker bundle SHA 均已独立重算一致。
- 没有进入 `RELEASED`，没有创建 Community tag，没有 push。

## 18. Final judgment

1. **DeepSeek 的“7 项全部落地”是否成立？** 不成立。总体为 **PARTIALLY VERIFIED**，不是 VERIFIED。
2. **四步人工发布流程是否真的可执行？** 按其“tracked record/provenance 已成立”的前提不成立；按当前 ignored record 的实现只能作为未完成的条件式流程，缺少 clean commit/tag 后的实际闭环证据。因此本轮 `release_workflow_simulation=failed`。
3. **是否发现新的 blocker / major？** 发现 6 个 MAJOR candidate；没有确认新的 unconditional blocker，但 tracked-record fixed-point 是条件性 blocker candidate。
4. **自动化部分是否可以停止继续开发？** 不可以。产品功能开发可以与本轮 release governance 分离，但 CI 分层、mandatory rehearsal exit、tag policy、evidence binding、ZIP-level scan 和 provenance truth model 仍需处理。
5. **现在是否只剩真实 rehearsal + 最终 tag/commit closure？** 不是。除两次真实 rehearsal 和最终 commit/tag closure 外，仍有上述自动化与证据治理问题。

总体自动化判定：**AUTOMATED_RELEASE_CLOSURE_NOT_VERIFIED**。

当前状态仍为 pre-release / STAGED evidence；不建议把本报告解释为 `READY_FOR_RELEASE_REVIEW`，也不进入 `RELEASED`。

## 19. Evidence index

| 结论 | 文件/commit | 实际命令或证据 | Artifact/SHA | 日志/报告 |
|---|---|---|---|---|
| Baseline / current source | `D:\ProofClip-Community`, HEAD `ac645ae6b38f9419b9c546e255296e4e4f7afc0d` | `git status --short --branch`; `git status --ignored --short`; `git ls-files` | n/a | 本报告 §1 |
| Upstream pin | `release/edition-boundary.json`; upstream commit `9d9e96a2b1994b42aa3419bdfaadc4bd597d6382` | `git -C D:\网络赚钱\.worktrees\proofclip-v0.8.0 rev-parse HEAD`; `computeUpstreamFingerprint()` | pin fingerprint `105b4da8...` | 本报告 §6-7 |
| Product regression | `extension/`, `worker/` at current workspace | extension/worker `node --test` commands | n/a | 本报告 §3 |
| Public/boundary scan | `scripts/verify-public-source.ps1`, `release/verify-generated-tree.mjs` | public-source `-IncludeUntracked`; repo scan `--repo` | n/a | 本报告 §3 |
| Current release record | `release/records/release-record.json` (untracked/ignored) | `node release/release-audit.mjs` | record commit `null`; artifact SHA `0ffb7ee5...` | 本报告 §8, §12 |
| Artifact and bundle | `release/artifacts/proofclip-community-0.8.0-2026-08-14T08-38-56-050Z.zip` | independent SHA recompute; `tar -xOf ... worker/dist/worker.mjs` | ZIP `0ffb7ee54d59db17f366a9886e1443a8eb5725d0f157bc700bb7980e85ee5aeb`; bundle `ae8b507561ad98054992dd0c8af8797b16ec04e23caf8688225c7a56c7b67c77` | 本报告 §11 |
| Governance tests | `release/tests/export-pipeline.test.mjs`, `release/tests/release-governance.test.mjs` | `D:\node.js\node.exe --test ...` | n/a | 本报告 §3, §10 |
| Cut cleanup injection | `release/cut-release.mjs` | success/failure temp fixture; failure forced `EEXIST` | n/a | 本报告 §5 |
| Rehearsal model | `release/set-rehearsal.mjs` | source inspection; no real rehearsal executed | n/a | 本报告 §14 |
| CI design | `.github/workflows/ci.yml` (untracked) | source inspection; remote CI not run | n/a | 本报告 §13 |

本轮没有生成独立命令日志文件；实际命令、退出码、finding 和报告路径均保留在本 dossier 及其 JSON 摘要中。
