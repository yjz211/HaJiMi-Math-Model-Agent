import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { loadCapabilityRegistry, routeCapabilities } from "./capability-router.ts";
import { hajimiToolsForStage } from "./core-extension.ts";
import { ensureHajimiTask } from "./task-state.ts";
import { reduceWorkflowState } from "./workflow-reducer.ts";

test("stage 8 jointly routes the hashed paper and plot capability bundles", async () => {
  const registry = await loadCapabilityRegistry(process.cwd());
  assert.deepEqual(registry.map((item) => item.manifest.id), ["modeling-paper-standard", "modeling-plot-suite", "modeling-submission-package"]);
  for (const capability of registry) {
    assert.equal(capability.manifest.source.kind, "user-authorized-local-codex-skill");
    assert.equal(capability.manifest.source.licenseStatus, "not-declared-in-source-snapshot");
    assert.ok(capability.manifest.allowedStages.length > 0);
    assert.deepEqual(capability.manifest.allowedStages, capability.manifest.activation.stages);
    assert.ok(capability.manifest.requiredInputs.includes("active_evidence_freeze"));
    assert.ok(capability.manifest.toolScopes.length > 0);
    assert.ok(capability.manifest.contextFragments.length > 0);
    assert.ok(capability.manifest.files.some(item => item.path === 'resources/SKILL.md'));
    assert.ok(capability.manifest.files.some(item => item.path.startsWith('resources/scripts/')));
    assert.equal(capability.manifest.files.some((item) => item.path.includes('__pycache__')), false);
  }

  const cwd = mkdtempSync(join(tmpdir(), "hajimi-routing-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    const routed = await routeCapabilities({ productRoot: process.cwd(), state: initial.state, stage: 8, now: "2026-01-01T00:00:00.000Z" });
    assert.deepEqual(routed.decisions.map((item) => item.capabilityId), ["modeling-paper-standard", "modeling-plot-suite"]);
    assert.equal(routed.evidenceFreezeReady, false);
    assert.doesNotMatch(routed.fragments.map((item) => item.text).join("\n"), /FORMAL-CONSUMPTION BLOCKED/);
    assert.ok(routed.contextChars <= 7_000);
    const guidance = routed.fragments.map((item) => item.text).join("\n");
    assert.match(guidance, /modeling-plot-suite.*read .*SKILL\.md/);
    assert.match(guidance, /stage summaries below do not replace/);
    assert.match(guidance, /pre-native-20260904 skill is the authoritative/);
    assert.match(guidance, /references\/paper-figure\.md completely/);
    assert.match(guidance, /original _utils style-guide, recipe prefetch and per-figure workflow/);
    assert.match(guidance, /INFO\/WARNING alone do not justify regeneration/);
    assert.match(guidance, /pu\.setup_style\(\)/);
    assert.match(guidance, /逐图按原版配方取色/);
    assert.match(guidance, /浅色填充/);
    assert.match(guidance, /上页字号 = 代码字号 × \(论文引用宽 ÷ 原生figsize宽\)/);
    assert.match(guidance, /缩放比 0\.9–1\.1/);
    assert.match(guidance, /height ≤ 0\.80/);
    assert.match(guidance, /刻度 \*\*8pt\*\*、轴标签 \*\*9pt\*\* 可作为源字号起点，并非硬下限/);
    assert.doesNotMatch(guidance, /first-pass-design|setup_workspace\.py/);

    const focused = reduceWorkflowState(initial.state, {
      kind: "set_focus",
      stage: 8,
      questionId: null,
      nextAction: "Build the paper candidate",
      routes: routed.decisions,
    });
    assert.equal(focused.focus.stage, 8);
    assert.deepEqual(focused.capabilityRoutes.map((item) => item.capabilityId), ["modeling-paper-standard", "modeling-plot-suite"]);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("capability routing is stage-aware, tag-specific, and conservative while unclassified", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-routing-matrix-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    const stage2 = await routeCapabilities({ productRoot: process.cwd(), state: initial.state, stage: 2 });
    assert.deepEqual(stage2.decisions, []);
    const stage9 = await routeCapabilities({ productRoot: process.cwd(), state: initial.state, stage: 9 });
    assert.deepEqual(stage9.decisions.map(item => item.capabilityId), ['modeling-submission-package']);
    assert.equal(stage9.decisions[0].availability, 'blocked_missing_input');
    assert.match(stage9.decisions[0].activationReason, /human_accepted_paper/);
    assert.match(stage9.fragments.map(item => item.text).join('\n'), /SUBMISSION BLOCKED/);
    const stage7 = await routeCapabilities({ productRoot: process.cwd(), state: initial.state, stage: 7 });
    assert.deepEqual(stage7.decisions, []);
    assert.deepEqual(stage7.fragments, []);
    const stage8 = await routeCapabilities({ productRoot: process.cwd(), state: initial.state, stage: 8 });
    assert.match(stage8.fragments.map((item) => item.text).join("\n"), /SKILL\.md/);
    assert.match(stage8.fragments.map((item) => item.text).join("\n"), /references\/paper-figure\.md completely/);
    assert.match(stage8.fragments.map((item) => item.text).join("\n"), /动手写 `figsize` 前先算/);
    const routes = new Map<string, string[]>();
    for (const tag of ["statistics", "optimization", "network"]) {
      const state = structuredClone(initial.state);
      state.problemTags = [tag];
      const result = await routeCapabilities({ productRoot: process.cwd(), state, stage: 8, now: "2026-01-01T00:00:00.000Z" });
      routes.set(tag, result.decisions.flatMap((item) => item.fragmentIds));
    }
    assert.ok(routes.get("statistics")?.includes("plot-statistics"));
    assert.ok(routes.get("optimization")?.includes("plot-optimization"));
    assert.ok(routes.get("network")?.includes("plot-graph-network"));
    assert.notDeepEqual(routes.get("statistics"), routes.get("optimization"));
    const unclassified = await routeCapabilities({ productRoot: process.cwd(), state: initial.state, stage: 8 });
    assert.ok(unclassified.decisions.every((item) => item.activationReason.includes("unclassified")));
    assert.doesNotMatch(unclassified.fragments.map((item) => item.text).join("\n"), /XGBoost|random forest|genetic algorithm/i);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("active HaJiMi tools follow the governed stage policy", () => {
  assert.equal(hajimiToolsForStage(2).includes("hajimi_bind_publication"), false);
  assert.equal(hajimiToolsForStage(7).includes("hajimi_freeze_evidence"), true);
  assert.equal(hajimiToolsForStage(8).includes("hajimi_bind_publication"), true);
  assert.equal(hajimiToolsForStage(8).includes("hajimi_run_managed_experiment"), true);
});
