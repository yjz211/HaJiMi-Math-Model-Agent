# HaJiMi 受治理建模架构

本文是 HaJiMi PoC 的产品架构与验收入口。上游 Pi Agent Desktop 的通用实现仍记录在 `ARCHITECTURE.md`；当两者表述冲突时，HaJiMi 的运行边界以本文和 `lib/hajimi` 中的可执行合同为准。

## 产品不变量

1. Pi `AgentSession` 是唯一 Agent Runtime，HaJiMi 不维护第二套 Python Agent Loop、Provider 或对话状态。
2. 数学建模采用稳定的 0—9 里程碑；阶段内由可变 `MicroPlan` 和逐问 `QuestionWorkPacket` 表达真实任务图，而不是把研究过程压成只能前进的线性状态机。
3. 状态修改必须携带 `expectedRevision`，并经过任务级互斥、原子替换和备份恢复。只读状态 API 不初始化、不迁移、不修改任务文件。
4. 论文中的数字、表格、图和结论必须来自 `Experiment → Evidence → Claim → Binding`，正式写作只消费活动的 `Evidence Freeze`。
5. WSL2 是统一执行边界而非完整安全沙盒。模型密钥不进入 WSL；题目目录之外的路径、`.hajimi` 直接访问和 `input/` 改写均由 backend 拒绝。

## 四批能力闭环

| 批次 | 已实现的可执行合同 | 主要位置 |
|---|---|---|
| Batch 1 · 身份与持续状态 | HaJiMi 独立身份、0—9 workflow definition、`workflow-state.v2`、revision、任务锁、旧七节点迁移为 `MicroPlan`、阶段 capsule、纯读 status API | `lib/hajimi/workflow-*`、`task-state.ts`、`app/api/hajimi/status` |
| Batch 2 · 逐问执行 | `QuestionWorkPacket`、问题依赖 DAG、逐问候选与 `MicroPlan`、route/checkpoint Gate、依赖闭包内的局部失效与回退 | `workflow-reducer.ts`、`workflow-service.ts` |
| Batch 3 · 证据链 | managed experiment、工件哈希、选择/淘汰状态、独立交叉验证、Evidence/Claim/Freeze、Figure/Paper binding、漂移传播 | `provenance.ts`、`workflow-service.ts`、`toolkit/src/hajimi_toolkit` |
| Batch 4 · 能力路由 | 阶段、题型和缺口驱动的自动 Router，版本化能力注册表，上下文预算，可审计 route，开发版/standalone/packaged 资源哈希一致性 | `capability-router.ts`、`bundled/capabilities`、`scripts/check-hajimi-*` |

Batch 之间不是四套系统。它们共享同一个 `workflow-state.v2`，并由 `hajimi-core` Pi `InlineExtension` 投影给当前会话。

## 运行链路

~~~text
Desktop UI
  └─ Pi AgentSession 0.85.0                 唯一模型与工具循环
      └─ hajimi-core InlineExtension         生命周期、阶段上下文、工具注册
          ├─ WorkflowService                 revision / Gate / DAG / rollback
          ├─ CapabilityRouter                阶段 + 题型 + freeze → 上下文片段
          └─ WslWorkspaceBackend             题目目录内文件、搜索、Shell
              └─ hajimi-toolkit              输入、实验、证据、论文/PDF 验证
~~~

每次 Agent 开始前，扩展读取最新状态并用固定 `customType` 替换旧动态上下文。压缩前写 checkpoint；压缩后仍由最新状态重新投影，因此摘要不会成为新的工作流事实源。

Ask、Plan、Full 模式与当前阶段的工具策略取交集。UI 隐藏工具不是安全边界，工具调用入口会再次检查当前模式和阶段并 fail-closed。

## 阶段 8：论文与绘图的深度融合

`modeling-paper-standard@1.0.0` 和 `modeling-plot-suite@1.0.0` 不是从用户全局 Codex Skill 临时读取的说明书，而是适配后的产品能力包：

- `bundled/capabilities` 是版本、内容和哈希的单一事实源；manifest 声明允许阶段、必需输入、工具范围和按题型选择的上下文片段。
- 绘图能力可在阶段 7 参与展示结果整理；阶段 8 自动与论文规范联合路由。
- 没有活动 Evidence Freeze 时，route 明确为 `blocked_missing_input`，正式图表与论文生成不得消费未冻结结果。
- Router 只注入当前阶段和题型需要的高优先级片段，并受字符预算限制；工具文本另有 50 KiB / 2000 行上限。
- 图表计划、定量图、确定性技术图、可选科学插图、LaTeX 页面集成和最终页面审计均由 route manifest 与 Stage 8 验证合同闭环。
- `check-hajimi-capabilities` 校验能力包本身；`check-hajimi-resource-parity` 比较源码与打包资源，防止开发可用、安装包缺失或版本漂移。

这比直接将两个 Skill 安装为普通 Pi 插件更深：能力何时可用、能消费什么证据、能调用什么工具、怎样进入交付候选稿，都由同一工作流状态决定。

## 插件与通用 Agent 能力

HaJiMi 不因 Pi 宿主较空白就叠加多个重合状态系统。当前已经覆盖：Pi 原生上下文压缩、压缩前 checkpoint、原子状态、恢复、上下文覆盖、阶段工具权限、输出预算和产品已有 LTM。

热门插件的静态源码审计与采用理由见 `AGENT_CAPABILITY_BASELINE.md`。当前不安装 Goal、Memory daemon、Subagents、Lens、MCP 或 Web 插件。未来只有在明确建模阶段出现能力缺口时才增加；任何插件都只能是受阶段治理的能力或薄分发外壳，不能新建第二套任务、证据或审批状态。

## 建模工作台 UI

首屏固定显示 0—9 阶段轨道、当前目标、下一步、逐问工作包、开放 Gate、Evidence Freeze、交付验证和 Stage 8 双能力状态。未选择目录时展示完整建模入口；选择目录后，在聊天上方展示任务工作台。

通用编程产品入口不出现在主界面：Branch Navigator、Branch/Clone、Skills、Extensions/MCP 和 System Prompt 已移除。保留模型配置、题目目录/会话、上下文用量、成果文件、语言、主题和会话导出。

## 交付验证

开发验证：

~~~powershell
npx tsc --noEmit
npm run lint
npm test
npm run test:windows
node scripts/check-hajimi-capabilities.mjs
node --test --test-force-exit "scripts/check-hajimi-resource-parity.test.mjs"
~~~

Toolkit 验证：

~~~bash
~/.hajimi/venv/bin/python -m pytest toolkit/tests
~~~

最终构建必须从 `npm run build:standalone` 进入，不能单独运行 `next build`。Windows 便携版使用 `npm run pack`，随后执行 standalone/package smoke、资源 parity 和实际启动轻测。

`practice_011` 只用于流程回归，不可作为真实建模能力或论文质量的评测结论。
