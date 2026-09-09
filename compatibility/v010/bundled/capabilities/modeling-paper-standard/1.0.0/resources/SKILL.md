---
name: modeling-paper-standard
description: Enforce the user-designated Chinese mathematical-modeling paper standard while keeping LaTeX as the authoring workflow. Use for every project task that creates, rewrites, restructures, formats, audits, or finalizes a mathematical-modeling competition paper, including titles, abstracts, section order, Chinese/decimal numbering, figures, tables, references, language patterns, and final PDF layout. Also use when the user mentions 论文格式、论文结构、国赛论文、摘要、章节编号、套路化写作、LaTeX 排版、论文审稿 or the 2026 standard paper template.
---

## 当前第八阶段策略

先读 ../stage8-policy.md。其三阶段顺序与轻量复核优先于下文历史审计循环；全部写作和模板标准仍有效。


# 数学建模论文统一规范

以用户指定的 2026 标准论文模板和论文写作视频课程为共同最高基准：Word 模板约束固定结构、编号和版式，视频课程重点约束语言模板与叙述方法。保持 LaTeX 主流程；不得因为参考文件是 Word 而改用 DOCX 写作。多篇优秀论文只用于印证共同规则，不得覆盖两项最高来源。

## 按当前任务加载契约

先区分写作准备、正文生产、局部内容修改、排版修正和交付审查。所有质量标准保持有效，规则在适用动作之前加载；局部任务不自动扩大为全文重写或整篇论文验收。

- 只做骨架、章节规划和输入准备：读取 structure-contract.md、layout-contract.md；按实际小问题型读取优化或数据分支，确定需要哪些输入和信息动作。只引用既有证据与来源，不生成正文时无需提前加载全部语言课程和终审细则。写正文之前再进入下一步，不能拿准备阶段的精简读取范围直接写全文。
- 新写或全文重构的正文生产：先完整读取 plain-competition-language.md 和 language-contract.md。对当前板块读取 writing-patterns.md、direct-competition-language.md、video-language-playbook.md 的对应完整章节及共同总则，再读取适用题型分支；准备时已读的结构和版式直接复用。首次使用某条规则前必须读到其完整规定，按章节推进而非一次灌入八份文件。不要只读标题或以自行概括替代原文。章节输入表记录当前章节已经覆盖哪些来源和段落，后续写到其他板块时补齐其适用原文。
- 局部内容修改：读取本段及必要的上下文、plain-competition-language.md、language-contract.md 和 writing-patterns.md 对应板块；涉及结构时加读 structure-contract.md，涉及优化或数据方法时加读相应题型分支。保持未修改的公式、数字、标签和结论范围，按 review-contract.md 第 4 节确定回归范围。
- 仅修字体、标题样式、间距、图表摆放：读取 layout-contract.md 和 review-contract.md 第 3.3、3.4、4 节；改变可见编号或章节顺序时再读取 structure-contract.md。先修共享 LaTeX 设置并编译受影响内容；全局格式变化检查全部页面。无需为字体修改重读写作课程或重写正文。
- 交付整篇候选：读取 review-contract.md，按其四个独立维度核对同一候选；未读过的适用契约在对应维度补齐。汇总问题后集中修订，完整交付仍保留全部内容门和最终逐页视觉审查。
- 仅维护本 Skill 或检查器：先检查被修改规则、调用者和相关测试。用骨架或针对性样例验证具体改动，实际论文回归用于验证改造效果，不作为开始修改 Skill 的前置条件，也不自动扩展成修完样例论文。

新写论文先运行资源目录内的 scripts/create_paper_skeleton.py，按 --paper-type 选择 standard 或 data-analysis，填写 sections/；固定字号和编号由骨架提供。已有论文对照骨架定点修正，不覆盖。脚本只创建不存在的输出目录。实际格式用 scripts/check_pdf_typography.py 验证；骨架通过不能替代内容与完整论文验收。

完整契约目录（按上述任务路由读取）：

1. `references/structure-contract.md`
2. `references/writing-patterns.md`
3. `references/plain-competition-language.md`
4. `references/language-contract.md`
5. `references/direct-competition-language.md`
6. `references/video-language-playbook.md`
7. `references/layout-contract.md`
8. `references/review-contract.md`

维护规则时对照 references/requirements-contract.md 与对应原契约；上游个人 Skill 和参考资产不写入修改。

若当前论文或小问属于数据处理、数据分析、统计分析、机器学习或多表附件驱动题，另行完整读取 `references/data-analysis-paper-route.md`，并优先采用其中的数据类专门结构。

若当前论文或小问属于优化、规划、调度、路径、选址、资源分配或多目标决策，另行完整读取 `references/optimization-paper-route.md`，用其检查模型建立、求解与结果分析的内容完整性。

## 完整约束与执行分工

完整规则保存在 references/requirements-contract.md，详细解释仍在原契约中。这里调整加载顺序，不删除、降级或豁免任何约束。全文首次写作按前述目录读取，局部任务按实际影响读取；整篇交付前完整核对 requirements-contract.md 和 review-contract.md。同一会话中已读且未变的原文无需再次返回工具输出。

| 规则范围 | 写作时的直接来源 | 确定性保证及仍需判断的内容 |
| --- | --- | --- |
| 固定板块、编号、摘要、逐问结构 | structure-contract.md；writing-patterns.md 相应板块 | 骨架提供结构；结构检查核对实际正文，标题齐全不代表内容完整 |
| 语言、主题词、问题—动作—结果、边界 | plain-competition-language.md、language-contract.md；direct-competition-language.md、video-language-playbook.md 相应板块 | 语言检查发现风险，逐段语义审查保留 |
| 优化完整性、约束覆盖、求解与方案解释 | optimization-paper-route.md | 保留覆盖矩阵和 constraintMin；Step 4 简短不限制前三步或结果 |
| 数据公共章、逐问口径、方法后紧邻结果、混合题 | data-analysis-paper-route.md | 按需启用；不强制逐问数据准备标题或流程图 |
| 字号、字体、边距、图表、页数与阅读重心 | layout-contract.md | 骨架及 PDF/结构/章节平衡检查；实际页面与图文解释仍需审阅 |
| 公式、数字、证据、版本、四维审查和修改范围 | review-contract.md | 使用活动冻结 Claim/Evidence，公式复用、数字绑定和交付校验；用户验收前不称 final |

固定边界：LaTeX；论文结束于参考文献、无目录和附录；摘要逐问分段且无公式、不超过一页，重点黑体加粗，关键词仅空格分隔；完整正文 22—30 页，检验与评价叙述量合计不超过模型建立与求解的 30%；禁止凑页、独占页大图表和省略本题化推导；公式、数字、单位与结论范围保持证据支持。所有原有例外、题型分支和人工审查要求以完整契约为准。

## HaJiMi 首稿与增量审查

论文结束于参考文献，不生成附录；复现程序、完整数据和审查记录保存在论文外的支撑文件中。

写作前一次性准备章节输入表（保存在 work/paper-section-inputs.md）：每章列出题目对象、要回答的问题、引用的冻结公式及标签、结果文件与字段、单位精度、已验证边界、拟用图表、应完成的信息动作。优化小问同时引用约束覆盖矩阵。缺失证据先补齐，禁止用占位答案或教学例句填满正文。已有资料直接引用路径和稳定标签，不再抄写整份技术底稿。

先创建固定章节和编号的 LaTeX 骨架，按各问输入表生产完整章节；保持共享符号表、公式环境和图表标签唯一。先写模型与求解、结果解释，再据实际内容完成分析、检验、评价和逐问摘要。写前分配合理篇幅，模型段是重心；不以事后补页替代完整推导。每个章节只加载其适用套路和题型分支，但所有通用语言、结构、证据和版面约束仍须满足。

同一会话已经完整读取且内容未变的契约无需每章重读；压缩或恢复后只补读无法可靠恢复的规则与当前章节相关原文。章节输入表记录适用契约的路径与版本摘要，不能用简短摘要取代首次完整读取。

首次合并后冻结同一候选，独立检查数学与证据、写作与图表、源码版面、实际 PDF 页面四个维度，将问题汇总到一份 QA 记录再集中修订。四维审查不等于重写四遍，也不要求四个代理。每项记录位置、违反的规则、具体修法和受影响范围；没有问题的章节直接保留。

集中修订后重编译并按 review-contract.md 的影响范围回归。局部文字或单图修改需比较新旧分页，检查受影响页及相邻页；分页发生传播时扩大检查范围。全局字体、版式或符号改变仍检查全文；最终交付候选仍须全尺寸逐页审阅。公式漂移、数字来源、22--30 页、30% 章节平衡及所有原有质量门槛不降低。QA 仅记发现、修复和验证证据，不反复复制全文或契约。

新写论文时先运行 `python scripts/create_paper_skeleton.py OUTPUT --title "本题标题" --questions N --paper-type standard`，数据类改为 `data-analysis`；脚本只创建不存在的目录，生成固定字号、章节顺序和空章节文件，无教学答案。正文内容填入 sections/，关键词与摘要重点使用 paperkey 宏。已有论文仅对照骨架纠正实际版式差异，不覆盖已有源码。

交付候选另须运行 `python scripts/check_pdf_typography.py PAPER.pdf` 核对实际题目、摘要与各级标题的字号和宋体/黑体映射；默认 maketitle 和 abstract 环境经常不符合指定字号，不得只看源码文档类选项判断。自动检查之外仍须核对摘要重点确实是黑体加粗、完整正文格式与实际页面。

## 逐节公式复用检查

正文生产和局部改文同样执行 review-contract.md 第 2、3.1 节，不等到整篇终审。每节引用章节输入表中的冻结技术底稿，直接复用已有公式环境和原 label。写完该节运行 `scripts/check_latex_equation_drift.py BASELINE_SECTION CURRENT_SECTION --require-all --exact-labels`，失败只修受影响项；部分稿的底稿范围限定为该节，不能为了通过而从底稿删除应复用公式。底稿在修改前从冻结来源原样提取并记录来源路径、范围及哈希，不能从改后稿反向生成。无既有公式的章节记录不适用理由；新增推导仍需证据验证。整篇审查使用完整技术底稿，不能以局部通过代替全篇检查。

完整交付的 paper/hajimi-paper-config.json 使用 equationBaselineArtifactIds 列出技术公式底稿的已有产物 ID。底稿须为成功受管实验的输出、属于已接受且活动冻结的 Evidence；复用现有记录，不因改文重跑有效求解。底稿包含应复用的完整核心公式及稳定标签，预先展开 input/include 成自包含文件，并在写作前经现有记录与冻结工具保存；不得将改后论文注册为其自身基线。hajimi_validate_delivery 自动核验该引用的冻结归属及文件哈希，并对完整 mainTex 执行精确标签和公式漂移检查。数学变更仍回到受影响技术验证与重新冻结，不能改基线迎合改稿。自动检查不代替核心公式覆盖、无标签公式及新增推导的数学审查。
