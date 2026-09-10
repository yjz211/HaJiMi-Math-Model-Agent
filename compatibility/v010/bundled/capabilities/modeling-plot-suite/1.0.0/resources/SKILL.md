---
name: modeling-plot-suite
description: Manifest-driven router for mathematical-modeling competition figures. Reproduces the planning-to-render flow, routes each planned figure to the correct renderer, reconciles missing outputs, and audits final LaTeX size and page appearance.
---

# Modeling Plot Suite

Use the pattern: classify upstream, record a machine-readable contract, execute the core render passes, then reconcile and audit. Do not choose a renderer from visual taste alone and do not load every drawing workflow.

## Required decision sequence

1. Read `references/router-contract.md` completely. For a full problem, paper, or multi-figure request, create or update the anchored `FIGURE_MANIFEST` before drawing. Validate it with `python scripts/validate_figure_manifest.py --manifest <planning-document> --profile modeling --full-paper`; fix every failure before rendering. For one explicit figure, apply the same classification rules; a separate manifest is optional.
2. Run `python scripts/bootstrap.py --workspace <active-project-root> --profile modeling-competition --capability all` before the first deterministic figure.
3. Execute only the non-empty renderer classes, in this order:
   - DATA/TABLE -> `paper-figure`;
   - DETERMINISTIC DIAGRAMS -> `paper-technical-diagram`, the manifest-compatible umbrella for Draw.io and TikZ, including engineering, physical, geometric, network, scheduling, architecture, and process diagrams;
   - ILLUSTRATION -> `paper-illustration` only for qualifying pictorial or 3-D physical/engineering scenes;
   - HTML -> only when the user explicitly selects HTML instead of Draw.io;
   - MERMAID -> only when Mermaid or text-native maintainability is requested.
4. For each non-empty class, read `workflows/<name>.md`, then its linked `references/<name>.md`, completely and preserve its drawing methods and templates. Review scope, timing and repair limits follow `../stage8-policy.md`; legacy review loops do not add extra rounds.
5. Reconcile the manifest after every pass. A missing planned output keeps the task open; retry or use only the documented fallback for that class. Never silently reclassify a missing figure.
6. For paper-bound figures, read `references/paper-layout-gate.md`; apply its size guidance with review scope and timing governed by `../stage8-policy.md`. Inspect individual figures during drawing and compiled pages after paper layout; a figures-only request does not require a compiled paper.

When uncertain whether something is a data curve or a TikZ construction, classify it as DATA. Route all non-data diagrams that require exact, reproducible structure to `paper-technical-diagram`, then choose Draw.io or TikZ internally. AI illustration must not replace evidence plots, engineering schematics that can be drawn deterministically, precise topology, or mathematical geometry.

## Completion gate

Finish only when the manifest is reconciled, every selected workflow passes its own checks, `figures/latex_includes.tex` has normalized sizes when LaTeX delivery is in scope, the paper uses those sizes unchanged, and the compiled paper page has been visually checked when a paper source is available.
