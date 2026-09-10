# Modeling paper-figure compatibility entrypoint

This adapter changes execution and workflow scope only. It does not rewrite the vendored drawing instructions.

1. Run `python scripts/bootstrap.py --workspace <active-project-root> --profile modeling-competition --capability paper-figure`.
2. Read `references/paper-figure.md` completely and follow it as the authoritative prompt for visual design, chart/diagram construction, templates, export quality, review, and iteration. 适配实际数据时，尽量保留原模板的视觉结构、配色层次和关键图形元素，仅按数据语义与可读性需要作必要调整。 修图时优先调整位置、间距和尺寸，尽量保留色条、图例、关键标记等信息元素；确需删减时，说明原因及替代的表达方式。
生成前先根据样本量、重复值和分布形态判断图形是否适合数据，再保真适配模板；小样本或大量相同值时可保留原始散点与简洁箱线，不必叠加密度层。采用雨云图时保留散点、箱体与半小提琴的错位布局，避免为凑齐元素而重叠堆放。

3. Use the executable paths in `<active-project-root>/.codex-plot-runtime.json`.

The complete original prompt is loaded, including all modeling planning, reconciliation, and quality gates.

Compatibility translation: “Claude” means Codex; legacy tool names map to the available terminal, file-reading, and image-inspection tools. Missing `CLAUDE.md` or `MH_*` variables are not errors because the runtime supplies their execution-time equivalents.

Preserve the loaded drawing methods, templates and recipes. Review scope, timing and repair limits follow `../stage8-policy.md` relative to resources; legacy audit and repair loops do not add extra rounds.
