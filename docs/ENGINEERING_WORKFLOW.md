# ProofClip Engineering Workflow（一页速查）

> 目标：开发、合并、发布三条路径各一条命令。正确路径 = 最容易的路径。
> 详细治理规则见 docs/release-process-governance.md；实现见 release/preflight.mjs。

## 两条主路径

### A. 普通开发

```text
1. 开始任务（main 上临时 branch/worktree：feature/*、fix/*、codex/*）
2. 修改代码
3. node release/preflight.mjs --fast     （开发循环：只跑受改动影响的检查）
4. node release/preflight.mjs            （STANDARD：全套测试 + 边界 + 能力，准备合并）
5. PASS → 合并/整合回 main → 删除临时 branch/worktree
```

### B. 正式发布

```text
1. 版本准备（main 上 version bump + 冻结提交）
2. node release/preflight.mjs --release-ready   （一次执行、一份报告、一个 verdict）
3. 阅读状态摘要 → 人工保留：FINAL_RELEASE_APPROVAL
4. git tag v<version>[-rcN]（从 main 提交）
5. node release/cut-release.mjs → GitHub Release（ZIP + sha256 + record）
```

### C. Community 下放（one-version-lag）

```text
冻结的 Commercial N baseline → transform/adaptation → capability parity
→ Community main → node release/preflight.mjs --release-ready → Community N Release
```

## 命令速查

| 命令 | 场景 | 说明 |
| --- | --- | --- |
| `node release/preflight.mjs --fast` | 开发循环 | change-aware：extension→扩展套件、worker→Worker 套件、README→资产检查、capability-manifest→能力审计；README-only 不跑产品套件 |
| `node release/preflight.mjs` | 合并前 | 全套：身份/分支/版本/两套件/边界扫描/能力/README/迁移/工具/CI |
| `node release/preflight.mjs --release-ready` | 发布前 | 编排 release-audit --release-ready：main 对齐/tag 血缘/clone smoke/能力 parity/baseline/rehearsal/worktree |
| `node release/release-audit.mjs` | 审计 | 自动 gates（含 DEFAULT_BRANCH_RELEASE_ALIGNMENT 族） |
| `node release/cut-release.mjs` | 切包 | ZIP + SHA256 + release record + EDITION_DIFF_REPORT |
| `node release/verify-cloned-tree.mjs --remote <url> --record` | clone 冒烟 | 全新 clone 必须就是当前公开版本 |

### Community 0.8.1 deployment-layer checks

Community 0.8.1 的部署层检查保持离线：候选 provenance verifier 与
deployment-contract suite 不访问 Cloudflare、Notion、OAuth 或实时部署。
完整命令清单和人工证据字段见
`docs/acceptance/community-0.8.1-cloudflare-deploy-gate.md`。

```powershell
node --test deploy/tests/*.test.mjs
node --test deploy/tests/identity.test.mjs deploy/tests/origin.test.mjs deploy/tests/wrangler-template-contract.test.mjs extension/src/tests/extension-id.test.mjs
node --test release/tests/community-0.8.1-export.test.mjs release/tests/community-0.8.1-provenance.test.mjs
node --test extension/src/tests/*.test.mjs worker/src/tests/*.test.mjs
node --test deploy/tests/complete-contract.test.mjs
```

`release/run-suites.mjs` 新增显式 `deploymentContract` 结果，但既有
0.8.0 extension/Worker suite 的执行与判定语义不变。CI 的这项新增检查
只运行离线候选 verifier 与 deployment-contract；现有分支/tag 检查和
显式 `--with-clone-smoke` 的可选行为保持不变。

所有命令支持 `--json`（机器可读）与 `--verbose`（详细）。

## 输出约定

- 默认输出 10 秒可读的 `PROOFCLIP ENGINEERING STATUS` 摘要。
- 失败必带 `BLOCKER: CODE` 与 `NEXT_ACTION`（如 `WORKING_TREE_DIRTY → COMMIT_OR_REVERT_CHANGES`）。
- 工作区身份不确定 → `WORKSPACE_IDENTITY_UNKNOWN`（FAIL CLOSED，不猜）。

## 人工决策边界

机器决定：测试/对齐/版本/能力/基线/文件/clone/artifact/worktree/README 资产。
人决定：是否接受产品变化、是否批准提前下放、NOT_APPLICABLE 是否合理、是否正式发布。

Community 0.8.1 的 Cloudflare/Notion/OAuth/Chrome 人工部署属于独立的人类
release gate。机器 PASS、候选目录存在或 Worker 命令成功都不等于
`COMMUNITY_0.8.1_RELEASE_CANDIDATE_PASS`；只有完成 bounded human gate 并
由维护者审阅证据后，才可作最终接受决定。

## 已知事项（2026-08-19）

- GitHub main 的 README 仍引用 0.7 时代的 4 个文档与 4 张展示图（docs/edition-availability.md、
  getting-started.md、project-introduction.md、community-release-checklist.md、docs/assets/readme/*.png），
  这些文件在 main 上不存在 → README_ASSETS 当前红。修复方向二选一（维护者决定）：
  更新 README 链接指向现有文档，或恢复对应文件。
