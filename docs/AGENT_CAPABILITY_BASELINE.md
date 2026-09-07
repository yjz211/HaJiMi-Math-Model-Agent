# HaJiMi Agent 能力基线与 Pi 插件审计

审计日期：2026-09-05。本文记录 HaJiMi 需要的通用 Agent 能力、当前实现位置，以及对热门 Pi npm 插件的静态源码审计结论。审计只下载并解包 npm tarball，没有安装或执行第三方插件代码。

## 架构结论

HaJiMi 当前采用“受治理能力内核 + Pi 内联扩展适配器”，比把两个建模 Skill 直接作为普通 Pi 插件加载更适合产品目标：

1. `bundled/capabilities` 是论文与绘图规范的版本化、哈希化单一事实源；
2. `hajimi-core` 本身已经是 Pi `InlineExtension`，负责生命周期钩子、工具注册和上下文投影；
3. 0—9 阶段、QuestionWorkPacket、Gate、Experiment—Evidence—Claim 和 Evidence Freeze 决定能力能否使用；
4. 第八阶段只通过 Router 注入所需片段，Pi 不读取用户机器上的全局 Codex Skill；
5. 将来若要独立分发，可在该内核外增加一个很薄的 Pi package 外壳，但插件不得另建阶段状态、证据状态或审批状态。

因此，“做成插件”是可选的分发层，不是更深融合的替代方案。当前深度来自工作流治理，而不是安装形式。

## 当前能力矩阵

| 能力 | 状态 | HaJiMi 实现与边界 |
|---|---|---|
| Pi Agent Runtime | 内建 | `AgentSession` 是唯一 Agent Runtime。 |
| 上下文压缩 | 内建 | 使用 Pi 原生压缩；压缩前写 HaJiMi checkpoint，压缩后由最新动态上下文重新投影。 |
| 长期记忆 | 已有 | 使用产品现有 LTM；不得把工作流事实复制成第二套记忆状态。 |
| 0—9 持续任务 | 内建 | `workflow-state.v2`、原子写、revision、任务锁、checkpoint 和恢复共同负责。 |
| 模式与阶段工具权限 | 内建 | Ask/Plan/Full 与当前阶段取交集；不允许的 HaJiMi 工具 fail-closed。 |
| 论文规范 | 已启用 | `modeling-paper-standard@1.0.0`，只在阶段 8 且存在活动 Evidence Freeze 时正式消费。 |
| 建模绘图 | 已启用 | `modeling-plot-suite@1.0.0`，阶段 7 可做证据展示准备，阶段 8 与论文能力联合路由。 |
| WSL2 数值执行 | 内建 | 读写、搜索、Shell、managed experiment 和 Python Toolkit 均通过受限 backend。 |
| Web 研究 | 可选、未安装 | 若后续加入，只能在阶段 2 注册受限研究工具，并写入可追溯来源工件；不得绕过 URL 安全、内容预算和来源哈希。 |
| MCP | 可选、未安装 | 只作为外部研究数据入口；工具必须有命名空间、审批、输出上限和连接生命周期，且不能绕过 WSL/backend。 |
| 子 Agent | 暂不内建 | 可在未来加入只读研究者/审稿人；写入者不能形成第二状态源，所有结果仍须回到主工作流验收。 |
| 通用代码分析套件 | 不采用 | 产品不是通用编程 IDE；仅保留解决数学建模任务所需的文件和诊断能力。 |

## 热门插件静态审计

下载量来自 npm `last-month` 接口，是流行度信号而不是质量证明。版本和更新时间来自 2026-09-05 的 npm 元数据。

| 插件 | 近 30 天下载 | 审计版本 | 结论 |
|---|---:|---:|---|
| `pi-mcp-adapter` | 761,442 | 2.32.1 | 不安装。借鉴参数哈希审批、headless fail-closed、50 KiB/2000 行输出上限、超限工件化、连接 generation fencing 和关停清理。 |
| `pi-web-access` | 401,068 | 0.27.0 | 不安装。借鉴每次重定向重新校验的 SSRF 防护、域名策略、内容 SHA-256、精确 passage offset、TTL/容量双上限和原子缓存。若实现 Web 研究，必须采用同等级边界。 |
| `pi-subagents` | 362,483 | 0.65.0 | 不安装。借鉴 capability ceiling、`auto/confirm/forbid` authority、只读 reviewer、验收证据等级和 completion guard。完整 mission/agent 状态机与 HaJiMi 重复。 |
| `pi-lens` | 60,127 | 4.1.3 | 不安装。它面向通用代码库的 LSP、AST、规则扫描和读写守卫，体积与产品方向不匹配；只保留“缓存必须有硬上限、退化只在上升沿告警”的设计思想。 |
| `@narumitw/pi-goal` | 49,870 | 0.54.4 | 不安装。借鉴最新合同覆盖旧合同、压缩边界恢复、无进展保护和 stale tool-call 阻断；其目标状态不能替代 HaJiMi 0—9 状态。 |
| `@remnic/plugin-pi` | 36,328 | 9.69.56 | 不安装。现有 LTM 和 Pi compaction 已覆盖核心需求；额外 daemon、双重观察与记忆抽取会增加第二事实源。借鉴远端超时熔断和剥离调用方伪造 session/cwd 字段。 |

以上六个包均在所审版本声明 MIT 许可证并支持当前 `@earendil-works` Pi 生态；这不等于第三方运行时可信。Pi 扩展拥有宿主进程权限，任何实际引入仍须固定版本、核对 tarball、审查依赖和权限，并增加打包与离线失败测试。

## 已吸收的机制

- HaJiMi 动态上下文使用固定 `customType`，每次投影先移除旧版本再写入最新版本，避免压缩摘要或旧消息继续支配当前阶段。
- 所有 HaJiMi 工具按模式和阶段求权限交集，工具调用边界再次 fail-closed。
- 工具文本输出设 50 KiB / 2000 行硬上限；实验和验证的完整输出保留在工作区注册工件，而不是塞满模型上下文。
- 能力 manifest 同时声明允许阶段、所需输入、工具范围和上下文片段，并在开发、Python 验证和打包产物中校验文件哈希与资源一致性。
- 任务状态已有 expected revision、串行写锁、原子替换、备份恢复和 checkpoint，不引入第三方 Goal/Mission 状态机。

## 后续引入门槛

只有数学建模任务确有缺口时才新增通用能力。新增 Pi package 或自研插件必须同时满足：

1. 能力归属到明确阶段和题型；
2. 输入、工具、网络、输出和持久化边界可声明并可测试；
3. 不建立第二套任务真相；
4. headless、离线、超时、取消、重启和打包环境均 fail-closed；
5. UI 只显示“内建、已启用、可选或不可用”的产品状态，不暴露通用编程插件工作台。
