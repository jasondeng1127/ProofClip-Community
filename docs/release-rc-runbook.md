# Community 0.8 RC runbook（真实发布执行）

> 在**持有 git + release record + 真实部署账户**的环境中执行（不是沙箱）。
> 目标：在冻结 HEAD 上产出绑定了 commit/ZIP/rehearsal/tag 的 RC 候选包。

## 前置确认（冻结前）

- [ ] `LICENSE` 存在于仓库根且为最终许可文本（当前主树缺失；GitHub 发布版已用
      AGPL-3.0-only，可从发布版或基线 `.worktrees/community-public-baseline/LICENSE`
      引入——**许可证最终决策在你**）。
- [ ] `.github/workflows/ci.yml` 与 `.github/workflows/release-readiness.yml` 存在。
- [ ] 本机 git 可用且已配置 user.name/user.email。
- [ ] 工作区无残留：`release/tmp/` 不存在；`release/out/`、`release/artifacts/`、
      `release/records/`、`.audit/` 均被 .gitignore 排除。
- [ ] `node release/verify-generated-tree.mjs --tree . --repo` → CLEAN。
- [ ] 扩展/Worker 套件全绿（200/200 full、59/59）。

## Step 1 — 冻结并提交（source + canonical provenance）

```powershell
cd <repo>
git status --short            # 确认无 release/out、release/artifacts、release/records、.audit 等被列出
git add -A
git commit -m "release(community): freeze Community 0.8 source and canonical provenance"
$FROZEN_HEAD = git rev-parse HEAD
```

- 预期：`release/provenance/community-0.8.0.json`（canonical provenance）被提交；
  release record/ZIP/审计产物不提交。

## Step 2 — 在冻结 HEAD 上重新 cut（必须重切，旧 ZIP 的 commit=null 不可用）

```powershell
node release/cut-release.mjs
node release/release-audit.mjs
```

- 预期：record 内 `sourceBinding.commit == $FROZEN_HEAD`；
  `release-audit` → `AUTO_GATES_PASS`（commit 匹配、worktree 干净、ZIP entry/内容指纹匹配）。
- 记录：`$ZIP_SHA = (Get-Content release/records/release-record.json | ConvertFrom-Json).artifact.sha256`

## Step 3 — fresh self-host rehearsal（真实环境）

按 `docs/release-rehearsal-0.8.md` 逐项执行（全新 Cloudflare/D1/Notion/Chrome）。
重点：OAuth + Set up ProofClip、捕获矩阵、失败/重试路径、CORS 边界。

## Step 4 — 0.7 → 0.8 upgrade rehearsal（真实 profile）

按 `docs/upgrade-rehearsal-0.8.md` 逐项执行（真实 0.7 profile + 0.7 部署升级）。
重点：Archive/settings/projects/Outbox 连续性、OAuth 不重连、回滚演练。

## Step 5 — 写入同一 HEAD + 同一 ZIP 的 evidence（绑定校验）

```powershell
node release/set-rehearsal.mjs --name freshDeploy --result PASS --executor "Jason" --environment "<OS/浏览器/Worker 环境摘要>" --evidence "<日志或文档链接>"
node release/set-rehearsal.mjs --name upgrade07To08 --result PASS --executor "Jason" --environment "<OS/浏览器/Worker 环境摘要>" --evidence "<日志或文档链接>"
```

- 预期：脚本校验 sourceCommit == record.commit 且 artifactSha == record.artifact.sha256；
  不一致会 exit 1（不得 --force 掩盖；如不一致必须回到 Step 2 重新 cut）。

## Step 6 — 打 RC tag（policy：v<version>-rcN）

```powershell
git tag v0.8.0-rc1 $FROZEN_HEAD
```

## Step 7 — 最终 release-ready audit

```powershell
node release/release-audit.mjs --release-ready
```

- 预期：`AUTO_GATES_PASS`、`releaseReady: true`、exit 0。
- 输出应包含：commit 匹配、worktree clean、ZIP 全包校验、bundle 可复现、
  rehearsals 完整 evidence、tag 匹配 policy。

## Step 8 — 发布

- 交 Luna 做最终 candidate binding 复核（只查绑定，不再扩 scope）。
- GitHub Release：上传 `release/artifacts/*.zip` + `.sha256` + `release/records/release-record.json`
  作为 release evidence；canonical provenance 已在 source commit 中。

## 变更规则（防漂移）

- cut 之后**任何**源码/文档改动 → 必须重新 commit + 重新 cut + 重新 rehearsal
  （旧 ZIP 与新 HEAD 不再匹配，audit 的 fingerprint/stale gate 会拒绝）。
- 不要用 `--force` 绕过 set-rehearsal 的绑定校验。
