# Modeling paper-figure compatibility entrypoint

This adapter changes execution and workflow scope only. It does not rewrite the vendored drawing instructions.

1. Run `python scripts/bootstrap.py --workspace <active-project-root> --profile modeling-competition --capability paper-figure`.
2. Read `references/paper-figure.md` completely and follow it as the authoritative prompt for visual design, chart/diagram construction, templates, export quality, review, and iteration.
3. Use the executable paths in `<active-project-root>/.codex-plot-runtime.json`.

The complete original prompt is loaded, including all modeling planning, reconciliation, and quality gates.

Compatibility translation: “Claude” means Codex; legacy tool names map to the available terminal, file-reading, and image-inspection tools. Missing `CLAUDE.md` or `MH_*` variables are not errors because the runtime supplies their execution-time equivalents.

Never paraphrase or weaken the loaded drawing instructions, visual standards, recipes, or review threshold.
