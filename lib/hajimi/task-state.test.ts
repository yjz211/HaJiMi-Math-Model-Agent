import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  appendExperiment,
  createHajimiCheckpoint,
  ensureHajimiTask,
  freezeHajimiInputs,
  registerArtifact,
  readHajimiTask,
  requestHajimiGate,
  resolveHajimiGate,
  updateHajimiState,
} from "./task-state.ts";
import { setMilestone, setWorkflowFocus } from "./workflow-service.ts";

test("HaJiMi task state persists plan, evidence, checkpoint, and human gate", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-task-"));
  try {
    const created = await ensureHajimiTask(cwd);
    assert.equal(created.identity.schemaVersion, "hajimi.task.v1");
    assert.equal(created.state.schemaVersion, "hajimi.workflow-state.v2");
    assert.equal(created.state.milestones.length, 10);
    assert.equal(created.state.microPlan[0].status, "active");

    writeFileSync(join(cwd, "input", "problem.txt"), "minimize x subject to x >= 2", "utf8");
    const inputs = await freezeHajimiInputs(cwd);
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0].path, "input/problem.txt");

    writeFileSync(join(cwd, "output", "answer.json"), '{"x":2}\n', "utf8");
    const artifact = await registerArtifact(cwd, "output/answer.json", "optimal solution");
    assert.equal(artifact.path, "output/answer.json");
    assert.equal(artifact.sha256.length, 64);

    await appendExperiment(cwd, { title: "small exact solve", outcome: "succeeded" });
    const state = await updateHajimiState(cwd, created.state.revision, {
      currentObjective: "Validate the exact solution",
      nextAction: "Run an independent feasibility check",
      microPlan: [{ id: "solve", title: "Solve", status: "completed", dependencies: [], outputs: ["output/answer.json"], evidence: ["output/answer.json"] }],
    });
    assert.equal(state.revision, 1);

    const checkpoint = await createHajimiCheckpoint(cwd, "solution produced");
    assert.match(checkpoint, /^000001-/);

    const waiting = await requestHajimiGate(cwd, state.revision, "host_capability", "Confirm the execution host.", { stage: 0 });
    assert.equal(waiting.status, "waiting_for_user");
    const completed = await resolveHajimiGate(cwd, waiting.revision, waiting.openGates[0].gateId, "accepted");
    assert.equal(completed.status, "active");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("state mutations use expectedRevision and serialize concurrent writers", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-cas-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    const update = (title: string) => updateHajimiState(cwd, initial.state.revision, {
      currentObjective: title,
      nextAction: "next",
      microPlan: [{ id: title, title, status: "active", dependencies: [], outputs: [] }],
    });
    const results = await Promise.allSettled([update("writer-a"), update("writer-b")]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejection = results.find((result) => result.status === "rejected");
    assert.match(String(rejection && rejection.status === "rejected" ? rejection.reason : ""), /revision conflict/);
    assert.equal((await readHajimiTask(cwd))?.state.revision, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("readHajimiTask is pure and legacy seven-node state migrates only as a MicroPlan", async () => {
  const empty = mkdtempSync(join(tmpdir(), "hajimi-readonly-"));
  const legacy = mkdtempSync(join(tmpdir(), "hajimi-legacy-"));
  try {
    assert.equal(await readHajimiTask(empty), null);
    assert.equal(existsSync(join(empty, ".hajimi")), false);

    mkdirSync(join(legacy, ".hajimi"));
    writeFileSync(join(legacy, ".hajimi", "task.json"), JSON.stringify({
      schemaVersion: "hajimi.task.v1",
      taskId: "legacy-task",
      title: "legacy",
      createdAt: "2026-01-01T00:00:00.000Z",
      skillVersion: "1.1.0",
    }));
    writeFileSync(join(legacy, ".hajimi", "state.json"), JSON.stringify({
      schemaVersion: "hajimi.state.v1",
      revision: 7,
      status: "active",
      currentObjective: "legacy objective",
      nextAction: "legacy next",
      plan: [
        { id: "intake", title: "intake", status: "completed" },
        { id: "model", title: "model", status: "active" },
        { id: "delivery", title: "delivery", status: "pending" },
      ],
      activeGate: null,
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const migrated = await ensureHajimiTask(legacy);
    assert.equal(migrated.state.schemaVersion, "hajimi.workflow-state.v2");
    assert.equal(migrated.state.revision, 7);
    assert.equal(migrated.state.milestones.length, 10);
    assert.equal(migrated.state.milestones[0].status, "in_progress");
    assert.ok(migrated.state.milestones.slice(1).every((milestone) => milestone.status === "not_started"));
    assert.equal(migrated.state.focus.stage, 0);
    assert.equal(migrated.state.microPlan.find((node) => node.id === "model")?.status, "active");
  } finally {
    rmSync(empty, { recursive: true, force: true });
    rmSync(legacy, { recursive: true, force: true });
  }
});

test("workflow state read recovers the last complete atomic backup after corruption", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-recovery-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    await updateHajimiState(cwd, initial.state.revision, {
      currentObjective: "new revision",
      nextAction: "next",
      microPlan: [{ id: "next", title: "next", status: "active", dependencies: [], outputs: [] }],
    });
    writeFileSync(join(cwd, ".hajimi", "state.json"), "{corrupt", "utf8");
    const recovered = await readHajimiTask(cwd);
    assert.equal(recovered?.state.revision, 0);
    assert.equal(recovered?.state.schemaVersion, "hajimi.workflow-state.v2");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("input freezing is idempotent and rejects drift instead of accepting a new baseline", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-freeze-"));
  try {
    await ensureHajimiTask(cwd);
    const inputPath = join(cwd, "input", "problem.txt");
    writeFileSync(inputPath, "original problem", "utf8");
    const first = await freezeHajimiInputs(cwd);
    const repeated = await freezeHajimiInputs(cwd);
    assert.deepEqual(repeated, first);

    writeFileSync(inputPath, "changed problem", "utf8");
    await assert.rejects(
      freezeHajimiInputs(cwd),
      /Frozen input changed after initial import/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("stage zero requires real frozen inputs before completion", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-transition-gate-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    await assert.rejects(setMilestone(cwd, initial.state.revision, 0, "satisfied"));
    writeFileSync(join(cwd, "input/problem.txt"), "Problem statement");
    await freezeHajimiInputs(cwd);
    const completed = await setMilestone(cwd, initial.state.revision, 0, "satisfied");
    assert.equal(completed.milestones[0].requirements[0].status, "satisfied");
    await assert.rejects(setWorkflowFocus(cwd, initial.state.revision, 8, null), /Cannot skip|dependencies are not satisfied/);
    assert.equal((await readHajimiTask(cwd))?.state.focus.stage, 0);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("restart and pre-compaction checkpoint preserve the pinned workflow revision, focus, and open gate", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-restart-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    const waiting = await requestHajimiGate(cwd, initial.state.revision, "host_capability", "Confirm WSL runtime.", { stage: 0 });
    await createHajimiCheckpoint(cwd, "before compaction");
    const restarted = await readHajimiTask(cwd);
    assert.equal(restarted?.state.workflowVersion.definitionHash, initial.state.workflowVersion.definitionHash);
    assert.equal(restarted?.state.revision, waiting.revision);
    assert.deepEqual(restarted?.state.focus, { stage: 0, questionId: null });
    assert.equal(restarted?.state.openGates[0]?.gateId, waiting.openGates[0].gateId);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
