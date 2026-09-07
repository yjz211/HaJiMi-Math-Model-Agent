# Modeling paper-technical-diagram compatibility entrypoint

This adapter changes execution and workflow scope only. It does not rewrite the vendored drawing instructions.

1. Run `python scripts/bootstrap.py --workspace <active-project-root> --profile modeling-competition --capability paper-figure-drawio`.
2. Read `references/paper-technical-diagram.md` completely and follow it as the authoritative prompt for technical, engineering, physical, geometric, architecture, process, and network diagrams, including its Draw.io and TikZ sub-engines.
3. Use the executable paths in `<active-project-root>/.codex-plot-runtime.json`.

The complete original prompt is loaded, including all modeling planning, reconciliation, and quality gates.

Compatibility translation: “Claude” means Codex; legacy tool names map to the available terminal, file-reading, and image-inspection tools. Missing `CLAUDE.md` or `MH_*` variables are not errors because the runtime supplies their execution-time equivalents.

Use the runtime's `export_drawio.py` to wait for detached Windows exports. In the general-paper variant, use the compatibility checker's `general` or `architecture` mode when the original roadmap/decision-flow checker would impose an unrelated shape requirement.


Never paraphrase or weaken the loaded drawing instructions, visual standards, recipes, or review threshold.
