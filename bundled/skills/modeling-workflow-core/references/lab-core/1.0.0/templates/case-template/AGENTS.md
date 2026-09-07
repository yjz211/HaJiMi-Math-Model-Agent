# 当前题目局部规则

本目录继承项目根目录 `AGENTS.md`。本文件只记录当前题目的特殊规则。

## 当前题目特殊约束

- 待填写。

## 文件所有权

- 总控：`STATUS.md`、`TASKS.md` 和正式目录的合并。
- 并行 Agent：只写入 `workstreams/<角色>/`。
- 论文 Agent：结果冻结前只写入 `paper/drafts/`。
- 审稿 Agent：只写入 `review/`。

## 论文与图表协议（仅 `paper_training: enabled`）

- 启动前读取 `methodology/paper_training_2026_reference.md` 并调用个人 Skill `modeling-paper-standard`；论文继续使用 LaTeX，但固定板块、大小编号、套路化写作与最终 PDF 版面必须严格对齐用户指定的 2026 模板。
- 论文语言必须执行 Skill 的 `plain-competition-language.md`：采用通俗、直白、肯定的竞赛表达，禁止高压缩科研词、内部工程简称和大量防御性否定；必要术语先解释后命名，边界改写为明确适用条件或下一步行动。
- 摘要不得出现公式；每张图必须在正文中被引用并给出具体观察、解释及其对结论的意义。
- 正式图统一使用项目内 `modeling-plot-suite`：定量数据和真实构型走 `paper-figure`，解析工程几何走 HTML/TikZ，总览与复杂流程默认走 HTML、按需走 Draw.io 或 Mermaid。每张图保存输入摘要、脚本或可编辑源、输出、图注和 QA，并独立声明 `single` 或 `multi-panel` 及理由；不得以美观为由篡改或筛选数据。
- 每篇完整论文至少制作一张高质量总览流程图，覆盖问题分解、模型路线、求解、验证和逐问输出，与数据图和工程图共享视觉语言，并保存语义合同、可编辑矢量源和最终版面 QA。豁免必须由用户明确批准并记录理由。
- 论文与图表验收使用 `review/PAPER_FIGURE_QA_TEMPLATE.md`；不通过不得进入最终输出目录。

## 多 Agent 启动要求

- 每个子 Agent 启动前填写 `workstreams/ASSIGNMENT_TEMPLATE.md`。
- 每个子 Agent 结束时填写其目录中的 `HANDOFF.md`，字段以 `workstreams/HANDOFF_TEMPLATE.md` 为准。
- 独立审查使用 `workstreams/REVIEW_TEMPLATE.md`，审查者不得直接覆盖被审产物。
- 正式状态、路线决策、证据合并和最终文件仍由总控负责。
