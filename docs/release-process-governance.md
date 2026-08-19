# Community Release Process Governance

> 本文档是 ProofClip Community 的发布流程与版本迭代治理规范。它约束的是
> **流程**，不修改任何产品行为。原则用机器可验证的 gate 落地（见
> `release/release-audit.mjs`、`release/verify-cloned-tree.mjs`、
> `release/verify-generated-tree.mjs`、`.github/workflows/`）。

## 1. 核心版本模型

- `main` 是 Community 唯一持续演进的公共源码主线。
- 版本迭代：`main` 上修改 → 测试 → version bump → main 获得最终 commit →
  tag → GitHub Release。
- **禁止**：在另一条长期分支完成新版本、直接从该分支/tag 发布、main 停留旧版本。
- 永久原则：
  - `MAIN_IS_CURRENT_PUBLIC_SOURCE`
  - `DEFAULT_BRANCH_IS_CURRENT_RELEASE_BASELINE`
  - `RELEASE_TAG_MUST_DESCEND_FROM_MAIN`
- 版本历史由 Git Tag / GitHub Release 保存；**不得**创建
  `main-v0.8`/`main-v0.9`/长期 release branch 作为版本存储。

## 2. Single authoritative source

- 权威仓库：`D:\ProofClip-Community`；权威分支：`main`。
- worktree / temporary branch / rehearsal tree / generated tree 可以用于开发、
  测试、审计，但**不具有 release authority**。
- 禁止：`TEST_TREE_AS_SOURCE`、`TEMP_BRANCH_AS_RELEASE_SOURCE`、
  `GENERATED_TREE_BECOMES_LONG_TERM_MAINLINE`。
- 任何临时树中产生的有效修复必须回到 `main`。

## 3. Version iteration

- 0.x → 0.y 只修改实际需要变化的文件（extension/ worker/ migrations/ tests/
  release logic/ version metadata/ release notes）。**不得**为升级重建整棵树。
- Commercial → boundary transform → Community output 只作为 comparison /
  staging / validation input；最终 accepted changes 必须正式整合进 Community
  `main`。

## 4. Branch lifecycle

- 允许临时 branch：`feature/*` `fix/*` `audit/*` `release/*` `codex/*`
  （codex/* 仅属 Agent 临时施工）。
- 完成后：accepted changes 进入 main → main tests PASS → 无 worktree 依赖 →
  删除 remote temporary branch → 按需删除 local branch / worktree。
- 长期只保留 `main`（除非真实长期维护需求）。

## 5. Mandatory main promotion gate

`DEFAULT_BRANCH_RELEASE_ALIGNMENT`（release-audit 自动 gate）：

- GitHub default branch == main
- main 包含 intended release source
- manifest/package version == target release version
- main runtime tree == accepted release runtime tree
- main 包含 required migrations、release tooling、CI
- public-source boundary verification PASS

任一不成立：`STOP_RELEASE`。不得先 tag/Release/asset 再回来修 main。

## 6. Tag creation rule

正式 tag 必须从已验证的 main commit 创建：

```text
development → accepted changes on main → main clean → CI PASS → release audit PASS
→ version identity verified → tag from main commit → build/bind artifact → Release
```

禁止：从 Codex 临时分支 / rehearsal tree / 未整合的 generated output 打 tag。

## 7. Fresh clone gate

`DEFAULT_CLONE_SMOKE_TEST`（release-ready blocker）：

- `git clone <repository>`（不带 --branch/tag/commit/alternate ref）。
- 验证：branch == main；manifest version == target；新版本判别文件存在；
  旧版本判别不存在；required migrations / release tooling 存在；smoke PASS。
- 实现：`node release/verify-cloned-tree.mjs --remote <url> --version <v> --record`。

## 8. README / presentation asset boundary

- README 是 presentation layer，不是 runtime source identity。
- presentation assets 独立目录：`docs/assets/readme/*`。
- 版本升级默认不替换 README assets；runtime 版本升级不得自动删除/回退已接受的
  README presentation（release-audit 检查 README 相对引用完整性：README_ASSETS）。

## 9. Release artifact ↔ main binding

- Release asset 必须可追溯：asset → release record/provenance → source commit → main history。
- 要求 `RELEASE_SOURCE_COMMIT ∈ MAIN_HISTORY`；最好 tag commit == accepted
  main release commit。
- 从 intermediate/generated tree 构建的 artifact 必须证明 runtime content
  等价于对应 main commit，否则 `STOP_RELEASE`。

## 10. Documentation-only post-release changes

- Release 后允许 main 出现 README/docs/presentation 提交。
- 合法结构：`v0.8.0 tag` → README/docs commit → main（tag 是 main 祖先）。
- runtime source 在下一次产品版本变更前保持版本兼容。

## 11. Worktree governance

- 任何 release closeout 运行 `git worktree list`，每个 worktree 分类：
  ACTIVE_REQUIRED / TEMPORARY_COMPLETED / HISTORICAL / UNKNOWN。
- TEMPORARY_COMPLETED 进入 housekeeping；删除 remote branch 前确认无 worktree 依赖。
- `codex/*` 只是临时施工 identity，不得成为长期公共结构。

## 12. Legacy version handling

- 过去版本由 Tag / GitHub Release 保存。**禁止**长期创建 `main-v0.7-legacy`
  等版本 branch（紧急 repo repair 可建 recovery branch，必须 TEMPORARY、
  验证后删除）。
- 已有正式 v0.7.0 tag/Release 时，无需长期保留 0.7 branch。

## 13. Release acceptance additions（release-audit --release-ready）

- DEFAULT_BRANCH == main
- MAIN_VERSION == target version
- RELEASE_TAG_COMMIT ∈ main history
- DEFAULT_CLONE == target version（cloneSmoke 记录）
- README_RENDER = PASS；README_ASSETS = PASS
- NO_TEMP_RELEASE_BRANCH_DEPENDENCY
- NO_ACTIVE_WORKTREE_DEPENDS_ON_DELETABLE_BRANCH
- TEMP_BRANCH_CLEANUP_PLAN = PASS（worktree 分类无 UNKNOWN/TEMPORARY 残留）

## 14. 0.8 incident regression

- 场景 A（禁止）：main=旧版本、临时分支=新版本、README 宣传新版本 →
  release-audit 必须 FAIL（`DEFAULT_BRANCH_SOURCE_MISMATCH`）。
- 场景 B（允许）：main=新 runtime、tag=新版本、README 有 docs-only 后续提交 →
  release-audit PASS。
- 两个场景都有自动化回归测试（release/tests/release-governance.test.mjs）。

## 15. Desired repository shape

```text
Branches: main
Tags: v0.7.0, v0.8.0, v0.9.0, ...
README: current presentation
main runtime: current Community source
temporary branches: only while work is active
```

## 16. Edition governance（one-version-lag 完整下放模型）

产品模型（权威）：

- `Commercial N+1` = 当前最新产品能力 + ProofClip 托管服务 + 不限次数订阅模式。
- `Community N` = **Commercial N 的完整上一代产品能力** + 开源 + 用户自部署。
- 永久原则：
  - `COMMUNITY_N_EQUALS_COMMERCIAL_N_CAPABILITY_BASELINE`
  - `COMMERCIAL_LEADS_COMMUNITY_BY_ONE_PRODUCT_VERSION`
  - `COMMUNITY_IS_DELAYED_NOT_FEATURE_REDUCED`
- **禁止**把 Community 治理成"阉割版"；禁止把 `COMMERCIAL_ONLY` 当作普通产品功能永久不下放的理由。

版本滞后模型：Community 不得从 Commercial current HEAD 下放；必须从指定的
Commercial release tag / immutable commit / frozen baseline 生成对应版本
（`RELEASE BASELINE LOCK`）：`COMMERCIAL_BASELINE_VERSION` /
`COMMERCIAL_BASELINE_TAG` / `COMMERCIAL_BASELINE_COMMIT` /
`COMMERCIAL_BASELINE_CAPABILITY_MANIFEST`。baseline fingerprint 改变 →
`STOP_RELEASE`。

Capability parity（`release/capability-manifest.json`，可审计）：

- 每个 Commercial 版本冻结 capability ID / name / introduced version /
  source scope / adaptation requirement。
- Community 对同版本能力只能分类为：`PRESENT` / `TRANSFORMED_EQUIVALENT` /
  `NOT_APPLICABLE`；`NOT_APPLICABLE` 必须有明确技术理由。
- 功能一致 ≠ 基础设施相同：Commercial 托管实现的能力，Community 必须提供
  自部署对应物（`TRANSFORMED_EQUIVALENT`，如托管 OAuth → deployer-owned
  OAuth + 加密 token vault）。不得因托管实现不同而删除产品能力。
- 只有真正与 ProofClip 官方运营本身绑定、技术上无自托管对应物的服务层能力
  才允许 `NOT_APPLICABLE`（支付渠道、运营遥测、官方客服/退款门户）。

双向完整性（release-audit 自动 gate）：

- A. FORWARD_VERSION_LEAK：Commercial N+1 能力提前进入 Community N →
  `FORWARD_COMMERCIAL_VERSION_LEAK` → FAIL。
- B. BACKPORT_OMISSION：Commercial N 正常产品能力在 Community N 无理由缺失 →
  `COMMUNITY_CAPABILITY_OMISSION` → FAIL。
- 因此 Community 只做 leak scan 不够；必须同时验证
  `Community N ≈ Commercial N capability baseline` 且不含 N+1 能力。

EDITION_DIFF_REPORT（cut 时写入 release record）：

- commercialBaselineVersion / commercialBaselineCommit / commercialBaselineCapabilities
- communityCapabilities（present / transformedEquivalent / notApplicable / missing）
- forwardVersionLeak / backportOmission
- release-ready 要求：`FORWARD_VERSION_LEAK = NONE`、`UNEXPLAINED_CAPABILITY_OMISSION = NONE`。

Community → Commercial：修复不得自动复制到 Commercial（Carry-over Audit：
ALREADY_PRESENT / AFFECTED / NOT_APPLICABLE / NEEDS_FIX）。

下放资格（COMMUNITY_DOWNSTREAM_ELIGIBILITY）：

- Commercial N baseline 冻结**本身不构成** Community N 的下放资格。
- 必须同时满足：Commercial N+1 已达到规定领先状态（next version frozen），
  或 maintainer 在 capability manifest 记录显式 downstream approval
  （approvedBy / approvedAt）。
- 否则：`COMMUNITY_VERSION_NOT_YET_ELIGIBLE` → STOP_RELEASE。

Capability manifest 强制（CAPABILITY_MANIFEST_REQUIRED）：

- 普通 audit 允许历史 record 缺失 manifest（向后兼容 skip）。
- 所有新的 release-ready：`release/capability-manifest.json` 缺失 →
  `CAPABILITY_MANIFEST_MISSING` → STOP_RELEASE。不得通过 skip 绕过
  Edition Governance。

## 17. 变更规则

- 流程 gate 的修改必须带回归测试；不得为"发布安全"再造一套长期源码历史。
- 所有 accepted product changes 必须回 main；版本由 tag 保存，不由 branch 保存。