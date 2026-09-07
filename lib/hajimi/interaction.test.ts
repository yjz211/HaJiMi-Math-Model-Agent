import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { captureStageFiles } from "./stage-files.ts";
import { finishStage, handleReviewInput, interactionFor, saveInteraction, reviewAssent, recordReviewInput, acceptInterpretedReview } from "./interaction.ts";
import { ensureHajimiTask, readHajimiTask, freezeHajimiInputs } from "./task-state.ts";
import { setMilestone, setRequirement, setWorkflowFocus } from "./workflow-service.ts";
import type { HajimiStageId, HajimiWorkflowState } from "./workflow-types.ts";

test("natural review assent tolerates wording while preserving objections and questions", () => {
  for (const text of ["没问题，继续吧", "没有问题，继续", "好的，按你的推荐来", "我觉得可以，下一步重点检查异常值", "同意，没有其他建议", "这个阶段没问题，往下做", "通过：先检查异常值"]) {
    assert.ok(reviewAssent(text), text);
  }
  for (const text of ["不同意，先改模型", "可以继续吗？", "先别继续", "看着可以，但是有问题", "建议下一阶段检查异常值", "请解释这个结论", "通过不了", "同意之前请先修改"]) {
    assert.equal(reviewAssent(text), null, text);
  }
});

test("semantic review is bound to the latest actual user message and retains direction", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-semantic-review-"));
  try {
    let state = await initializeInteraction(cwd);
    const interaction = interactionFor(state);
    interaction.mode = "supervised";
    interaction.pending = { kind: "stage", stage: 0 };
    await saveInteraction(cwd, state, interaction);
    await assert.rejects(acceptInterpretedReview(cwd, "invented"), /No matching/);
    await recordReviewInput(cwd, "无需调整，下一步重点比较两种方案");
    const oldId = (await readHajimiTask(cwd))!.state.interaction!.reviewInput!.id;
    await recordReviewInput(cwd, "还有问题，先修改");
    await assert.rejects(acceptInterpretedReview(cwd, oldId), /No matching/);
    state = (await readHajimiTask(cwd))!.state;
    await assert.rejects(acceptInterpretedReview(cwd, state.interaction!.reviewInput!.id), /question or objection/);
    await recordReviewInput(cwd, "无需调整，下一步重点比较两种方案");
    const currentId = (await readHajimiTask(cwd))!.state.interaction!.reviewInput!.id;
    await acceptInterpretedReview(cwd, currentId);
    state = (await readHajimiTask(cwd))!.state;
    assert.equal(state.interaction!.pending, null);
    assert.equal(state.interaction!.nextStageDirection!.text, "无需调整，下一步重点比较两种方案");
    await assert.rejects(acceptInterpretedReview(cwd, currentId), /No matching/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

async function initializeInteraction(cwd: string): Promise<HajimiWorkflowState> {
  const initial = (await ensureHajimiTask(cwd)).state;
  const interaction = interactionFor(initial);
  interaction.stageBaseline = await captureStageFiles(cwd);
  return saveInteraction(cwd, initial, interaction);
}

async function satisfyCurrent(cwd: string, state: HajimiWorkflowState): Promise<HajimiWorkflowState> {
  const stage = state.focus.stage;
  if (stage === 0) {
    writeFileSync(join(cwd, "input/problem.txt"), "Compare two methods.");
    await freezeHajimiInputs(cwd);
  }
  for (const requirement of state.milestones[stage].requirements) {
    state = await setRequirement(cwd, state.revision, stage, requirement.id, "satisfied", [`stage-${stage}-evidence`]);
  }
  writeFileSync(join(cwd, "work/stage-result.md"), "Problem facts, assumptions and outputs.");
  return setMilestone(cwd, state.revision, stage, "satisfied", ["work/stage-result.md"]);
}

test("stage 0 pauses for an explicit mode and automatic mode advances without later stage pauses", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-auto-interaction-"));
  try {
    mkdirSync(join(cwd, "output"), { recursive: true });
    writeFileSync(join(cwd, "output", "existing.txt"), "before\n");
    let state = await initializeInteraction(cwd);
    writeFileSync(join(cwd, "output", "existing.txt"), "after\n");
    writeFileSync(join(cwd, "output", "new.txt"), "new\n");
    state = await satisfyCurrent(cwd, state);
    const stage0 = await finishStage(cwd, state, "materials ready");
    assert.equal(stage0.state.interaction?.pending?.kind, "mode");
    assert.match(stage0.report.text, /type=raw/);
    assert.match(stage0.report.text, /本阶段修改/);
    assert.match(stage0.report.text, /本阶段新增/);
    assert.equal(await handleReviewInput(cwd, "全自动并帮我继续"), null, "a longer sentence must not silently authorize mode selection");
    assert.equal((await readHajimiTask(cwd))!.state.interaction?.pending?.kind, "mode");
    assert.match((await handleReviewInput(cwd, "全自动")) ?? "", /已选择全自动/);
    await handleReviewInput(cwd, "清爽快速运行型");
    state = (await readHajimiTask(cwd))!.state;
    state = await setWorkflowFocus(cwd, state.revision, 1, null);
    state = await satisfyCurrent(cwd, state);
    const stage1 = await finishStage(cwd, state, "problem defined");
    assert.equal(stage1.state.interaction?.pending, null);
    assert.doesNotMatch(stage1.report.text, /本阶段已停止执行/);
    await setWorkflowFocus(cwd, stage1.state.revision, 2, null);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("supervised mode hard-stops after a stage report and discussion does not authorize continuation", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-supervised-interaction-"));
  try {
    let state = await initializeInteraction(cwd);
    state = await satisfyCurrent(cwd, state);
    state = (await finishStage(cwd, state, "stage zero")).state;
    await handleReviewInput(cwd, "半自动");
    await handleReviewInput(cwd, "清爽快速运行型");
    state = (await readHajimiTask(cwd))!.state;
    state = await setWorkflowFocus(cwd, state.revision, 1, null);
    state = await satisfyCurrent(cwd, state);
    state = (await finishStage(cwd, state, "stage one")).state;
    assert.equal(state.interaction?.pending?.kind, "stage");
    assert.equal(await handleReviewInput(cwd, "请解释一下这个结论"), null);
    state = (await readHajimiTask(cwd))!.state;
    await assert.rejects(setWorkflowFocus(cwd, state.revision, 2, null), /pending in chat/);
    await handleReviewInput(cwd, "继续下一阶段");
    state = (await readHajimiTask(cwd))!.state;
    assert.equal(state.interaction?.pending, null);
    await setWorkflowFocus(cwd, state.revision, 2, null);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("forward transitions cannot skip stages, use waived milestones, or edit a non-current stage", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-forward-guards-"));
  try {
    const state = await initializeInteraction(cwd);
    await assert.rejects(handleReviewInput(cwd, "返工第 8 阶段：润色"), /只能返工/);
    assert.equal((await readHajimiTask(cwd))!.state.focus.stage, 0);
    await assert.rejects(setWorkflowFocus(cwd, state.revision, 2, null), /Cannot skip/);
    await assert.rejects(setMilestone(cwd, state.revision, 0, "waived"), /cannot be waived/);
    await assert.rejects(setMilestone(cwd, state.revision, 1, "in_progress"), /current stage/);
    await assert.rejects(setRequirement(cwd, state.revision, 1 as HajimiStageId, "problem_contract", "satisfied", ["x"]), /current stage/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("next-stage suggestions require stage acceptance and survive a state reload", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-stage-direction-"));
  try {
    let state = await initializeInteraction(cwd);
    state = await satisfyCurrent(cwd, state);
    state = (await finishStage(cwd, state)).state;
    await handleReviewInput(cwd, "半自动");
    await handleReviewInput(cwd, "清爽快速运行型");
    state = (await readHajimiTask(cwd))!.state;
    state = await setWorkflowFocus(cwd, state.revision, 1, null);
    state = await satisfyCurrent(cwd, state);
    const finished = await finishStage(cwd, state);
    assert.match(finished.report.text, /下一阶段有没有方向建议/);
    assert.equal(await handleReviewInput(cwd, "下一阶段先检查异常值"), null);
    assert.equal((await readHajimiTask(cwd))!.state.interaction?.pending?.kind, "stage");
    await handleReviewInput(cwd, "继续下一阶段：先检查异常值，再比较插补方法");
    state = (await readHajimiTask(cwd))!.state;
    assert.equal(state.interaction?.pending, null);
    assert.deepEqual(state.interaction?.nextStageDirection, { stage: 2, text: "先检查异常值，再比较插补方法" });
    await setWorkflowFocus(cwd, state.revision, 2, null);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("stage seven keeps supervised style feedback and does not pause automatic work", async () => {
 const cwd=mkdtempSync(join(tmpdir(),"hajimi-style-handoff-"));
 try {
  for(const mode of ["automatic","supervised"] as const){
   let state=await initializeInteraction(cwd);
   state={...state,focus:{...state.focus,stage:7},interaction:{...interactionFor(state),mode}};
   const finished=await finishStage(cwd,state,"evidence ready");
   if (mode === "automatic") { assert.equal(finished.state.interaction?.pending, null); continue; }
   assert.equal(finished.state.interaction?.pending?.stage,7);
   assert.match(finished.report.text,/鲜艳舒适型/);assert.match(finished.report.text,/稳重科研型/);
   await handleReviewInput(cwd,"继续，鲜艳舒适型");
   const after=(await readHajimiTask(cwd))!.state;
   assert.equal(after.interaction?.nextStageDirection?.stage,8);
   assert.match(after.interaction?.nextStageDirection?.text??"",/鲜艳舒适型/);
  }
 }finally{rmSync(cwd,{recursive:true,force:true});}
});


test("onboarding asks independent questions and persists strict policy", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-policy-choice-"));
  try {
    let state = await initializeInteraction(cwd);
    state = await satisfyCurrent(cwd, state);
    const finished = await finishStage(cwd, state);
    assert.match(finished.report.text, /第一题/);
    assert.doesNotMatch(finished.report.text, /第二题|全自动＋/);
    assert.equal(await handleReviewInput(cwd, "全自动＋清爽快速运行型"), null);
    const second = await handleReviewInput(cwd, "全自动");
    assert.match(second!, /第二题/);
    assert.match(second!, /1.5倍/);
    state = (await readHajimiTask(cwd))!.state;
    await assert.rejects(setWorkflowFocus(cwd, state.revision, 1, null), /pending/);
    await handleReviewInput(cwd, "严格清单门禁型");
    state = (await readHajimiTask(cwd))!.state;
    assert.equal(state.interaction?.mode, "automatic");
    assert.equal(state.interaction?.executionPolicy, "strict");
    assert.equal(state.interaction?.pending, null);
    state = (await finishStage(cwd, state, "Materials already checked")).state;
    assert.equal(state.interaction?.pending, null, "repeating the stage zero report must not ask mode choices again");
    state = await setWorkflowFocus(cwd, state.revision, 1, null);
    await assert.rejects(setMilestone(cwd, state.revision, 1, "satisfied", ["work/stage-result.md"]), /Strict checklist/);
    await handleReviewInput(cwd, "半自动");
    state = (await readHajimiTask(cwd))!.state;
    assert.equal(state.interaction?.executionPolicy, "strict");
    await handleReviewInput(cwd, "清爽快速运行型");
    state = (await readHajimiTask(cwd))!.state;
    assert.equal(state.interaction?.mode, "supervised");
    await setMilestone(cwd, state.revision, 1, "satisfied", ["work/stage-result.md"]);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
