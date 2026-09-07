---
name: modeling-workflow-core
description: HaJiMi's built-in mathematical modeling workflow. Use for every task that involves a mathematical model, data analysis, forecasting, optimization, simulation, graph methods, validation, figures, or a modeling paper.
compatibility: HaJiMi with a writable task workspace, Python 3, and the hajimi_toolkit command.
---

# Mathematical modeling workflow

Use this skill for the entire modeling task. It is a working method, not a rigid state machine.

## Start every task

1. Inspect the frozen files under `input/`. Do not search other cases or historical solutions.
2. Call `hajimi_task_status`, retain its `revision`, and pass that value as `expectedRevision` to the next state-changing HaJiMi tool. On a revision conflict, read status again and deliberately rebase the intended change.
3. Read these references before selecting a model:
   - `references/lab-core/1.0.0/methodology/modeling_workflow.md`
   - `references/lab-core/1.1.0/methodology/validation_framework.md`
4. Separate problem facts, assumptions, inferred facts, and computed results.
5. Make the simplest executable baseline before adopting a complex method.

## Required modeling loop

- Define each requested output, variable, unit, objective, and constraint.
- Audit data quality and leakage before fitting or optimization.
- Compare plausible approaches when the choice can change the answer.
- Run all code. Never invent a numeric result, figure, citation, or successful validation.
- Test a hand-checkable small case, boundaries, invariants, and applicable V0-V5 checks.
- Register important experiments and artifacts with the HaJiMi tools.
- Keep paper numbers and figures traceable to machine-readable results.
- If evidence contradicts the current route, revise the plan rather than defending it.

## Governed workflow state

- The bundled 0—9 milestones are revisitable acceptance boundaries. The MicroPlan is the small dynamic plan for the current objective; never replace the milestones with a flat checklist.
- In stage 4, persist a dependency-valid `QuestionWorkPacket` for every subquestion. Material route uncertainty requires an accepted route gate. A question is complete only after its governed checkpoint gate is accepted.
- Use `hajimi_rollback` when a contract, model, implementation, or validation changes. It invalidates only the affected question dependency closure, then propagates stale status through downstream evidence and publication bindings.
- Record formal computation with `hajimi_record_managed_experiment`, then Evidence and Claim records. Ordinary discussion may use a clearly labeled draft `estimate`; figures, papers, and final answers may consume only supported claims in an active evidence freeze.
- Stage 8 automatically activates HaJiMi's bundled `modeling-paper-standard` and `modeling-plot-suite` capabilities. Follow their routed stage cards and task-specific reading: preparation loads structure/layout and the relevant question route; prose production loads its applicable language and section requirements before writing; whole-paper delivery retains every review gate. Use active frozen Claim/Evidence, the native skeleton, the paper config, publication bindings and `hajimi_validate_delivery` together. Do not look for global Codex skills or bypass the governed workflow.

## Workspace convention

Use these directories:

- `input/`: frozen read-only problem statement and attachments.
- `src/`: reproducible source code.
- `work/`: scratch analysis and intermediate files.
- `data/derived/`: generated datasets.
- `figures/`: generated figures.
- `paper/`: LaTeX and the compiled paper.
- `output/`: final deliverables.

HaJiMi owns `.hajimi/`; do not create or edit its files directly.

## Checkpoints and delivery

Create a checkpoint after a material route change or a completed major experiment. Before final delivery:

1. Require a recorded successful run of the chosen pipeline on the current frozen inputs, with verified managed experiments, supported evidence/claims and an active freeze. Re-run affected computations if inputs, formulas, code or dependencies changed; reuse still-valid records for prose and layout changes. A previous run over different inputs or invalidated evidence cannot satisfy this requirement.
2. Bind every figure and paper candidate to frozen claims. For papers, set `equationBaselineArtifactIds` in the paper config to the pre-writing, self-contained technical formula outputs covered by active frozen Evidence; reuse valid records. Then call `hajimi_validate_delivery` with the current revision. Formula changes require affected technical validation and a new freeze, not replacing the baseline to match rewritten prose.
3. Stage 8 follows figures → writing → review → ready with hajimi_stage8_phase. Preserve writing standards and evidence. Resolve serious validation errors; record advisory language/layout issues for human review without mandatory rework loops.
4. Call `hajimi_request_gate` with `gate="final_delivery"` and a concise evidence-backed summary.

The files under `references/` are the approved MathModeling-AI-Lab capability snapshot. Read only the reference needed for the current action.
