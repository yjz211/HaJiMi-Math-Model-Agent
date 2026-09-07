# 题目状态

```yaml
case_id: replace_me
title: replace_me
competition: replace_me
status: waiting_for_problem
training_track: full
paper_training: enabled
completion_target: paper_complete
phase_4_5_mode: question_interleaved_then_integrated_review
```

## 已完成

- 尚无。

## 当前阶段

- 等待原题和附件。

## 关键决策

- 尚无。

## 阻塞问题

- 原题尚未录入。

## 下一步

- 将原题和附件放入 `problem/original/`。

## 论文训练开关

- 默认开启。新题应在阶段 7 证据冻结后进入阶段 8，完成完整论文、摘要、出版级图表与最终排版；随后提交用户人工审查，目标为 `paper_complete`。
- 阶段 8 默认使用 `modeling-plot-suite` 制作至少一张与其他确定性论文图风格一致的总览流程图，并按图类路由数据图、物理/工程图、地图/网络图和验证图；缺少总览图或缺少语义/矢量/版面 QA 时不得通过论文技术验收，除非用户明确批准并记录豁免理由。
- 用户明确要求“只练求解”时，才将其关闭并把完成目标改为 `solver_complete`；变更原因必须记录。

## 人工论文审查

- 阶段 9 是最后阶段：用户人工审查论文内容、表达与最终接受；总控只响应用户明确指出的修改项。
- 用户确认论文通过后，用户可提供或授权优秀论文资源；总控完成对标复盘、记录可迁移经验与不适用边界后，才标记 `paper_complete`。
