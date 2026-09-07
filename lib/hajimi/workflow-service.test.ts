import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { ensureHajimiTask, readHajimiTask, registerArtifact, requestHajimiGate, resolveHajimiGate } from "./task-state.ts";
import {
  bindPublication,
  freezeSelectedEvidence,
  recordClaim,
  recordEvidence,
  recordManagedExperiment,
  reconcileProvenance,
  replaceQuestionPackets,
  rollbackWorkflow,
  setExperimentSelection,
  setMilestone,
  setRequirement,
} from "./workflow-service.ts";
import { deliveryFingerprint, sealDeliveryValidation } from "./delivery-seal.ts";
import { assertSubmissionInputs } from "./submission-inputs.ts";
import { runSubmissionAction } from "./submission-service.ts";
import type { WorkspaceBackend } from "./workspace-backend-factory.ts";
import { expectedQuestionGateRefs, reduceWorkflowState } from "./workflow-reducer.ts";
import { finishStage, handleReviewInput, interactionFor } from "./interaction.ts";
import { writeWorkflowStateAtomic } from "./workflow-store.ts";
import type { HajimiQuestionWorkPacket } from "./workflow-types.ts";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHajimiCoreFactory } from "./core-extension.ts";

test("legacy untouched stale stages normalize on reload without hiding prior work", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-legacy-stale-"));
  try {
    const state = (await ensureHajimiTask(cwd)).state;
    state.focus.stage = 4;
    for (const stage of [5, 6, 7, 8]) state.milestones[stage].status = "stale";
    state.milestones[6].attempt = 1;
    state.milestones[7].acceptedRefs = ["prior-evidence"];
    state.interaction = interactionFor(state);
    state.interaction.reports.push({ stage: 8, path: "reports/old.md", summary: "prior draft", createdAt: state.updatedAt });
    await writeWorkflowStateAtomic(cwd, state);
    const restored = (await readHajimiTask(cwd))!.state;
    assert.equal(restored.milestones[5].status, "not_started");
    for (const stage of [6, 7, 8]) assert.equal(restored.milestones[stage].status, "stale");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
import { setWorkflowFocus } from "./workflow-service.ts";

test("evidence invalidation preserves unstarted stages while invalidating completed work", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-unstarted-"));
  try {
    const { state } = await ensureHajimiTask(cwd);
    state.milestones.find(item => item.stage === 5)!.status = "satisfied";
    const next = reduceWorkflowState(state, { kind: "reconcile_provenance", invalidatedIds: ["changed-evidence"], reason: "source changed" });
    assert.equal(next.milestones.find(item => item.stage === 5)!.status, "stale");
    for (const stage of [6, 7, 8]) {
      assert.equal(next.milestones.find(item => item.stage === stage)!.status, "not_started");
      assert.deepEqual(next.milestones.find(item => item.stage === stage)!.staleBy, []);
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

async function createFreezableChain(cwd: string) {
  const initial = await ensureHajimiTask(cwd);
  writeFileSync(join(cwd, "src", "solve.py"), "print(42)\n");
  writeFileSync(join(cwd, "input", "problem.txt"), "problem\n");
  writeFileSync(join(cwd, "work", "params.json"), "{}\n");
  writeFileSync(join(cwd, "output", "result.json"), "{\"answer\":42}\n");
  const managed = await recordManagedExperiment(cwd, initial.state.revision, {
    title: "solve", command: "python3 src/solve.py", codePaths: ["src/solve.py"], inputPaths: ["input/problem.txt"],
    parameterPaths: ["work/params.json"], outputPaths: ["output/result.json"], environment: {}, exitCode: 0,
    startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", status: "succeeded",
  });
  const evidence = await recordEvidence(cwd, managed.state.revision, {
    experimentRefs: [managed.experiment.experimentId], artifactRefs: [managed.experiment.outputRefs[0].id],
    validationMethod: "exact", status: "verified", domainValidationStatus: "accepted", limitations: [],
  });
  const claim = await recordClaim(cwd, evidence.state.revision, {
    text: "answer", kind: "numeric", value: 42, evidenceRefs: [evidence.evidence.evidenceId], status: "supported",
  });
  return { managed, evidence, claim };
}

test("supervised question checkpoint stops queued work until actual user acceptance", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-question-chat-review-"));
  const tools = new Map<string, { execute: (id: string, args: unknown) => Promise<unknown> }>();
  const messages: Array<{ content: string }> = [];
  const pi = { registerTool(tool: { name: string; execute: (id: string, args: unknown) => Promise<unknown> }) { tools.set(tool.name, tool); },
    on() {}, sendMessage(message: { content: string }) { messages.push(message); } } as unknown as ExtensionAPI;
  try {
    const chain = await createFreezableChain(cwd);
    const q1 = { ...question("q1"), experimentRefs: [chain.managed.experiment.experimentId],
      evidenceRefs: [chain.evidence.evidence.evidenceId],
      localValidationRefs: [{ id: "validation", sha256: "e".repeat(64) }],
      reviewRefs: [{ id: "review", sha256: "f".repeat(64) }] };
    let state = await replaceQuestionPackets(cwd, chain.claim.state.revision, [q1, question("q2", ["q1"])]);
    state.focus = { stage: 4, questionId: "q1" };
    state.interaction = { ...interactionFor(state), mode: "supervised" };
    await writeWorkflowStateAtomic(cwd, state);
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    state = await setWorkflowFocus(cwd, state.revision, 4, "q2");
    const results = await Promise.allSettled([
      tools.get("hajimi_request_gate")!.execute("review", { expectedRevision: state.revision, gate: "question_checkpoint",
        summary: "q1 result, validation and issues", stage: 4, questionId: "q1" }),
      tools.get("write")!.execute("next", { path: "output/not-approved.txt", content: "must not run" }),
    ]);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "rejected");
    assert.match(messages.at(-1)!.content, /本问已停止/);
    state = (await ensureHajimiTask(cwd)).state;
    assert.equal(state.openGates[0].status, "requested");
    assert.equal(state.questions[0].status, "in_progress");
    assert.equal(await handleReviewInput(cwd, "请解释验证"), null);
    await assert.rejects(setWorkflowFocus(cwd, state.revision, 4, "q2"), /pending in chat/);
    await handleReviewInput(cwd, "同意继续");
    state = (await ensureHajimiTask(cwd)).state;
    assert.equal(state.questions[0].status, "satisfied");
    assert.equal(state.interaction?.pending, null);
    await setWorkflowFocus(cwd, state.revision, 4, "q2");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("program-derived evidence freeze is atomic, idempotent, and ignores a legacy mismatched gate", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-derived-freeze-"));
  try {
    const chain = await createFreezableChain(cwd);
    const wrongRevision = chain.claim.state.revision;
    await assert.rejects(
      freezeSelectedEvidence(cwd, wrongRevision, ["missing-evidence"], [chain.claim.claim.claimId]),
      /verified and domain-accepted/,
    );
    assert.equal((await readHajimiTask(cwd))!.state.provenance.freezes.length, 0);
    assert.equal((await readHajimiTask(cwd))!.state.openGates.length, 0);

    const legacy = await requestHajimiGate(cwd, wrongRevision, "evidence_freeze", "legacy copied hashes", { stage: 7 }, [
      { id: "wrong-path", sha256: "a".repeat(64) },
    ]);
    const accepted = await resolveHajimiGate(cwd, legacy.revision, legacy.openGates[0].gateId, "accepted");
    const frozen = await freezeSelectedEvidence(cwd, accepted.revision, [chain.evidence.evidence.evidenceId], [chain.claim.claim.claimId]);
    assert.equal(frozen.provenance.freezes.length, 1);
    assert.equal(frozen.openGates.filter(gate => gate.gate === "evidence_freeze").length, 0);
    assert.deepEqual(frozen.provenance.freezes[0].governedRefs, [{
      id: chain.managed.experiment.outputRefs[0].id,
      sha256: chain.managed.experiment.outputRefs[0].sha256,
    }]);
    const retried = await freezeSelectedEvidence(cwd, frozen.revision, [chain.evidence.evidence.evidenceId], [chain.claim.claim.claimId]);
    assert.equal(retried.revision, frozen.revision);
    assert.equal(retried.provenance.freezes.length, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("question rollback derives invalidation and cannot reuse its old accepted checkpoint", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-question-rollback-chain-"));
  try {
    const chain = await createFreezableChain(cwd);
    const q1 = { ...question("q1"), experimentRefs: [chain.managed.experiment.experimentId],
      evidenceRefs: [chain.evidence.evidence.evidenceId],
      localValidationRefs: [{ id: "validation", sha256: "e".repeat(64) }],
      reviewRefs: [{ id: "review", sha256: "f".repeat(64) }] };
    let state = await replaceQuestionPackets(cwd, chain.claim.state.revision, [q1, question("q2", ["q1"]), question("q3")]);
    state.focus = { stage: 4, questionId: "q1" };
    await writeWorkflowStateAtomic(cwd, state);
    state = await requestHajimiGate(cwd, state.revision, "question_checkpoint", "Review q1", { stage: 4, questionId: "q1" });
    state = await resolveHajimiGate(cwd, state.revision, state.openGates[0].gateId, "accepted");
    const approvedPackets = state.questions;
    state = await rollbackWorkflow({ cwd, expectedRevision: state.revision, source: "user_chat_rework", targetStage: 4,
      targetQuestion: "q1", invalidatedIds: [], reason: "Revise q1 model" });
    assert.equal(state.provenance.experiments[0].status, "stale");
    assert.equal(state.provenance.evidence[0].status, "stale");
    assert.equal(state.provenance.claims[0].status, "stale");
    assert.equal(state.questions[1].status, "stale");
    assert.equal(state.questions[2].status, "in_progress");
    await assert.rejects(replaceQuestionPackets(cwd, state.revision, approvedPackets), /accepted checkpoint gate/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("local rollback rejects implicit invalidation of another accepted question's shared experiment", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-shared-rollback-"));
  try {
    const chain = await createFreezableChain(cwd);
    const refs = { experimentRefs: [chain.managed.experiment.experimentId], evidenceRefs: [chain.evidence.evidence.evidenceId],
      localValidationRefs: [{ id: "validation", sha256: "e".repeat(64) }], reviewRefs: [{ id: "review", sha256: "f".repeat(64) }] };
    let state = await replaceQuestionPackets(cwd, chain.claim.state.revision,
      [{ ...question("q1"), ...refs }, { ...question("q2", ["q1"]), ...refs }]);
    state.focus = { stage: 4, questionId: "q1" };
    await writeWorkflowStateAtomic(cwd, state);
    state = await requestHajimiGate(cwd, state.revision, "question_checkpoint", "Review q1", { stage: 4, questionId: "q1" });
    state = await resolveHajimiGate(cwd, state.revision, state.openGates[0].gateId, "accepted");
    const rollback = { cwd, expectedRevision: state.revision, source: "packet preparation", targetStage: 4 as const,
      targetQuestion: "q2", invalidatedIds: ["q2"], reason: "Rebind only" };
    const persisted = (await readHajimiTask(cwd))!.state;
    await assert.rejects(rollbackWorkflow(rollback), /shared evidence.*q1.*hajimi_set_questions/);
    assert.deepEqual((await readHajimiTask(cwd))!.state, persisted);
    state = await replaceQuestionPackets(cwd, state.revision, state.questions);
    assert.equal(state.provenance.experiments[0].status, "succeeded");
    const invalidated = await rollbackWorkflow({ ...rollback, expectedRevision: state.revision,
      invalidatedIds: [chain.managed.experiment.experimentId], reason: "Shared computation is invalid" });
    assert.equal(invalidated.provenance.experiments[0].status, "stale");
    assert.equal(invalidated.provenance.evidence[0].status, "stale");
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("stage 8 always stops and final acceptance revalidates the exact paper without packaging", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-final-review-"));
  try {
    const chain = await createFreezableChain(cwd);
    let state = await freezeSelectedEvidence(cwd, chain.claim.state.revision, [chain.evidence.evidence.evidenceId], [chain.claim.claim.claimId]);
    const paperText = "%PDF-1.4\nThe answer is 42.\n%%EOF\n";
    writeFileSync(join(cwd, "paper", "main.tex"), "Paper source");
    writeFileSync(join(cwd, "paper", "main.pdf"), paperText);
    writeFileSync(join(cwd, "paper", "claims.json"), JSON.stringify({
      schemaVersion: "hajimi.claim-bindings.v1",
      claims: [{ claimId: chain.claim.claim.claimId, value: 42, unit: "" }],
    }));
    const paperRef = await registerArtifact(cwd, "paper/main.pdf");
    const markerRef = await registerArtifact(cwd, "paper/claims.json");
    state = await bindPublication(cwd, state.revision, {
      kind: "paper", target: "paper/main.pdf", claimRefs: [chain.claim.claim.claimId], artifactRef: paperRef,
      claimMarkerRef: markerRef, status: "candidate",
    });
    const interaction = interactionFor(state);
    interaction.mode = "automatic";
    state = {
      ...state,
      focus: { stage: 8, questionId: null },
      interaction,
      milestones: state.milestones.map(item => item.stage < 8 ? { ...item, status: "satisfied" as const } : item),
    };
    await writeWorkflowStateAtomic(cwd, state);
    // A hard error must block both sealing and milestone completion.
    writeFileSync(join(cwd, ".hajimi", "validation.json"), JSON.stringify({
      schema_version: "hajimi.validation.v1", strict: true, passed: false,
      checks: [{ name: "missing_evidence", passed: false, severity: "error" }],
      summary: { passed: 12, failed: 1 },
    }));
    await assert.rejects(sealDeliveryValidation(cwd, await deliveryFingerprint(cwd)), /passing strict validation/);
    await assert.rejects(setMilestone(cwd, state.revision, 8, "satisfied", ["paper/main.pdf"]), /FIGURE_PLAN/);
    // Advisory failures stay visible but must allow delivery and human acceptance.
    writeFileSync(join(cwd, ".hajimi", "validation.json"), JSON.stringify({
      schema_version: "hajimi.validation.v1", validated_at: new Date().toISOString(), strict: true, passed: true,
      checks: [{ name: "large_float", passed: false, severity: "warning" }],
      summary: { passed: 12, failed: 1 },
    }));
    await sealDeliveryValidation(cwd, await deliveryFingerprint(cwd));
    state = await setRequirement(cwd, state.revision, 8, "delivery_candidate", "satisfied", [state.provenance.bindings[0].bindingId]);
    // This test covers acceptance of an already checked candidate. The actual
    // completion checks above reject the intentionally incomplete paper fixture.
    state.milestones[8].status = "satisfied";
    await writeWorkflowStateAtomic(cwd, state);
    state = (await finishStage(cwd, state, "paper delivered")).state;
    assert.equal(state.focus.stage, 8);
    assert.equal(state.interaction?.pending?.kind, "final");

    writeFileSync(join(cwd, "paper", "main.pdf"), "tampered\n");
    await assert.rejects(handleReviewInput(cwd, "验收通过"), /paper changed/);
    assert.equal((await readHajimiTask(cwd))!.state.focus.stage, 8);
    writeFileSync(join(cwd, "paper", "main.pdf"), paperText);
    writeFileSync(join(cwd, "paper", "claims.json"), "broken sidecar");
    // Optional sidecar drift does not block the user's review of the actual PDF.
    writeFileSync(join(cwd, "paper", "claims.json"), JSON.stringify({
      schemaVersion: "hajimi.claim-bindings.v1",
      claims: [{ claimId: chain.claim.claim.claimId, value: 42, unit: "" }],
    }));
    assert.match((await handleReviewInput(cwd, "验收通过")) ?? "", /人工验收/);
    const accepted = (await readHajimiTask(cwd))!.state;
    assert.equal(accepted.focus.stage, 9);
    assert.equal(accepted.milestones[9].status, "in_progress");
    assert.equal(accepted.status, "active");
    assert.equal(accepted.interaction?.finalAccepted, true);
    await assertSubmissionInputs(cwd, accepted);
    mkdirSync(join(cwd, "deliverables"), { recursive: true });
    writeFileSync(join(cwd, "deliverables", "candidate.txt"), "new submission output");
    await assertSubmissionInputs(cwd, accepted);
    writeFileSync(join(cwd, "paper", "main.pdf"), "changed after acceptance");
    await assert.rejects(assertSubmissionInputs(cwd, accepted), /Accepted input changed/);
    writeFileSync(join(cwd, "paper", "main.pdf"), paperText);
    writeFileSync(join(cwd, "paper", "unauthorized.txt"), "outside output area");
    await assertSubmissionInputs(cwd, accepted);
    const changedEvidence = structuredClone(accepted);
    changedEvidence.provenance.freezes[0].status = "stale";
    await assertSubmissionInputs(cwd, changedEvidence);
    assert.match(accepted.nextAction, /generate materials and package/);
    rmSync(join(cwd, "paper", "unauthorized.txt"));
    const productRoot = process.cwd();
    const packageConfig = { papers: { without_code: "paper/main.pdf" },
      code_files: [{ source: "src/solve.py", target: "代码/solve.py", appendix: "B1", purpose: "计算" }] };
    const backend = (writeZip: boolean) => ({
      async runShell() {
        const output = readdirSync(join(cwd, "deliverables"), { withFileTypes: true })
          .filter(item => item.isDirectory() && item.name.startsWith("submission-"))
          .map(item => join(cwd, "deliverables", item.name))
          .sort((a, b) => statSync(a).mtimeMs - statSync(b).mtimeMs).at(-1)!;
        if (writeZip) writeFileSync(join(output, "提交包.zip"), "synthetic zip fixture");
        return { exitCode: 0, stdout: Buffer.from(JSON.stringify({ status: "generated" })), stderr: Buffer.alloc(0) };
      },
    }) as unknown as WorkspaceBackend;
    await assert.rejects(runSubmissionAction({ cwd, productRoot, backend: backend(false), expectedRevision: accepted.revision,
      action: "package", config: packageConfig }), /ENOENT|no such file/i);
    assert.equal((await readHajimiTask(cwd))!.state.status, "active");
    const generated = await runSubmissionAction({ cwd, productRoot, backend: backend(true), expectedRevision: accepted.revision,
      action: "package", config: packageConfig });
    const completed = (await readHajimiTask(cwd))!.state;
    assert.equal(generated.status, "completed");
    assert.equal(generated.artifact.mediaType, "application/zip");
    assert.equal(completed.status, "completed");
    assert.equal(completed.milestones[9].requirements.find(item => item.id === "submission_package")?.status, "satisfied");
    assert.deepEqual(completed.milestones[9].requirements.find(item => item.id === "submission_package")?.evidenceRefs, [generated.artifact.id]);
    assert.equal(readdirSync(cwd).some(name => /\.(?:zip|7z|tar)$/i.test(name)), false);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

function question(questionId: string, dependencies: string[] = []): HajimiQuestionWorkPacket {
  const selectedCandidateRef = { id: `candidate-${questionId}`, sha256: "b".repeat(64) };
  return {
    questionId,
    title: questionId,
    contractRef: { id: `contract-${questionId}`, sha256: "a".repeat(64) },
    dependencies,
    sharedContractRefs: [],
    routeUncertainty: "low",
    candidateRefs: [selectedCandidateRef],
    selectedCandidateRef,
    microPlan: [],
    status: "in_progress",
    experimentRefs: [],
    evidenceRefs: [],
    localValidationRefs: [],
    reviewRefs: [],
    staleBy: [],
  };
}

test("question DAG validation and rollback affect only the question dependency closure", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-questions-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    const withQuestions = await replaceQuestionPackets(cwd, initial.state.revision, [
      question("q1"), question("q2", ["q1"]), question("q3", ["q2"]), question("q4"),
    ]);
    await assert.rejects(
      replaceQuestionPackets(cwd, withQuestions.revision, [question("q1", ["q2"]), question("q2", ["q1"])]),
      /cycle/,
    );
    withQuestions.focus.stage = 4;
    await writeWorkflowStateAtomic(cwd, withQuestions);
    const rolledBack = await rollbackWorkflow({
      cwd,
      expectedRevision: withQuestions.revision,
      source: "question checkpoint",
      targetStage: 4,
      targetQuestion: "q2",
      reason: "q2 contract changed",
    });
    assert.equal(rolledBack.questions.find((item) => item.questionId === "q1")?.status, "in_progress");
    assert.equal(rolledBack.questions.find((item) => item.questionId === "q2")?.status, "stale");
    assert.equal(rolledBack.questions.find((item) => item.questionId === "q3")?.status, "stale");
    assert.equal(rolledBack.questions.find((item) => item.questionId === "q4")?.status, "in_progress");
    assert.equal(rolledBack.milestones[4].status, "in_progress");
    assert.equal(rolledBack.milestones[5].status, "not_started");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("route and question-checkpoint gates are bound to governed refs and drive packet status", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-question-gates-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    const q1 = {
      ...question("q1"),
      routeUncertainty: "material" as const,
      candidateRefs: [
        { id: "candidate-q1", sha256: "b".repeat(64) },
        { id: "candidate-q1-alt", sha256: "d".repeat(64) },
      ],
    };
    const packets = await replaceQuestionPackets(cwd, initial.state.revision, [q1, question("q2", ["q1"])]);
    const routeRefs = expectedQuestionGateRefs(packets, packets.questions[0], "route");
    const routeRequested = await requestHajimiGate(
      cwd,
      packets.revision,
      "route",
      "Choose q1 route",
      { stage: 4, questionId: "q1" },
      routeRefs,
    );
    const routeGate = routeRequested.openGates[0];
    assert.equal(routeRequested.questions[0].routeGateId, routeGate.gateId);
    assert.equal(routeGate.governedRefs.length, 3);
    const routeAccepted = await resolveHajimiGate(cwd, routeRequested.revision, routeGate.gateId, "accepted");
    assert.equal(routeAccepted.questions[0].status, "in_progress");

    writeFileSync(join(cwd, "src", "q1.py"), "print(1)\n");
    writeFileSync(join(cwd, "input", "q1.txt"), "q1\n");
    writeFileSync(join(cwd, "work", "q1-params.json"), "{}\n");
    writeFileSync(join(cwd, "output", "q1.json"), "{\"answer\":1}\n");
    const managed = await recordManagedExperiment(cwd, routeAccepted.revision, {
      title: "q1 solve", command: "python3 src/q1.py", codePaths: ["src/q1.py"], inputPaths: ["input/q1.txt"],
      parameterPaths: ["work/q1-params.json"], outputPaths: ["output/q1.json"], environment: { python: "3.12" },
      exitCode: 0, startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", status: "succeeded",
    });
    const evidence = await recordEvidence(cwd, managed.state.revision, {
      experimentRefs: [managed.experiment.experimentId], artifactRefs: [managed.experiment.outputRefs[0].id],
      validationMethod: "exact recomputation", status: "verified", domainValidationStatus: "accepted", limitations: [],
    });
    const validationRef = { id: "q1-local-validation", sha256: "e".repeat(64) };
    const reviewRef = { id: "q1-review", sha256: "f".repeat(64) };
    const updatedQ1 = {
      ...routeAccepted.questions[0],
      experimentRefs: [managed.experiment.experimentId],
      evidenceRefs: [evidence.evidence.evidenceId],
      localValidationRefs: [validationRef],
      reviewRefs: [reviewRef],
    };
    const ready = await replaceQuestionPackets(cwd, evidence.state.revision, [updatedQ1, routeAccepted.questions[1]]);
    const checkpointRefs = expectedQuestionGateRefs(ready, ready.questions[0], "question_checkpoint");

    const checkpointRequested = await requestHajimiGate(
      cwd,
      ready.revision,
      "question_checkpoint",
      "Review q1 result",
      { stage: 4, questionId: "q1" },
      checkpointRefs,
    );
    const checkpointGate = checkpointRequested.openGates[0];
    const checkpointAccepted = await resolveHajimiGate(cwd, checkpointRequested.revision, checkpointGate.gateId, "accepted");
    assert.equal(checkpointAccepted.questions[0].status, "satisfied");
    assert.equal(checkpointAccepted.questions[1].status, "in_progress");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("optional publication binding derives its snapshot and remains traceable on rollback", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-provenance-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    writeFileSync(join(cwd, "src", "solve.py"), "print(42)\n");
    writeFileSync(join(cwd, "input", "problem.txt"), "problem\n");
    writeFileSync(join(cwd, "work", "params.json"), "{\"seed\":1}\n");
    writeFileSync(join(cwd, "output", "result.json"), "{\"answer\":42}\n");
    writeFileSync(join(cwd, "paper", "main.tex"), "The optimum is 42.\n");
    writeFileSync(join(cwd, "paper", "claim-bindings.json"), JSON.stringify({
      schemaVersion: "hajimi.claim-bindings.v1",
      claims: [{ claimId: "claim-42", value: 42, unit: "" }],
    }));
    const managed = await recordManagedExperiment(cwd, initial.state.revision, {
      title: "deterministic solve",
      command: "python3 src/solve.py",
      codePaths: ["src/solve.py"],
      inputPaths: ["input/problem.txt"],
      parameterPaths: ["work/params.json"],
      outputPaths: ["output/result.json"],
      environment: { python: "3.12" },
      seed: 1,
      exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "2026-01-01T00:00:01.000Z",
      status: "succeeded",
      trust: "attested",
    });
    const evidenceResult = await recordEvidence(cwd, managed.state.revision, {
      experimentRefs: [managed.experiment.experimentId],
      artifactRefs: [managed.experiment.outputRefs[0].id],
      validationMethod: "independent exact recomputation",
      status: "verified",
      domainValidationStatus: "accepted",
      limitations: [],
    });
    const claimResult = await recordClaim(cwd, evidenceResult.state.revision, {
      claimId: "claim-42",
      text: "The optimum is 42.",
      kind: "numeric",
      value: 42,
      evidenceRefs: [evidenceResult.evidence.evidenceId],
      status: "supported",
    });
    const paperRef = await registerArtifact(cwd, "paper/main.tex", "paper candidate");
    const markerRef = await registerArtifact(cwd, "paper/claim-bindings.json", "numeric claim sidecar");
    const automaticBinding = await bindPublication(cwd, claimResult.state.revision, {
      kind: "paper", target: "paper/main.tex", claimRefs: [claimResult.claim.claimId],
      artifactRef: paperRef, claimMarkerRef: markerRef, status: "candidate",
    });
    assert.equal(automaticBinding.provenance.freezes.length, 1);
    const frozen = automaticBinding;
    const bound = await bindPublication(cwd, frozen.revision, {
      kind: "paper",
      target: "paper/main.tex",
      claimRefs: [claimResult.claim.claimId],
      artifactRef: paperRef,
      claimMarkerRef: markerRef,
      status: "candidate",
    });
    bound.focus.stage = 8;
    await writeWorkflowStateAtomic(cwd, bound);
    const stale = await rollbackWorkflow({
      cwd,
      expectedRevision: bound.revision,
      source: "validation",
      targetStage: 4,
      invalidatedIds: [managed.experiment.experimentId],
      reason: "solver defect",
    });
    assert.equal(stale.provenance.experiments[0].status, "stale");
    assert.equal(stale.provenance.evidence[0].status, "stale");
    assert.equal(stale.provenance.claims[0].status, "stale");
    assert.equal(stale.provenance.bindings[0].status, "stale");
    assert.equal(stale.provenance.freezes[0].status, "stale");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("material routes and checkpoint protocol cannot be bypassed by caller progress strings", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-question-negative-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    await assert.rejects(
      replaceQuestionPackets(cwd, initial.state.revision, [{ ...question("q1"), routeUncertainty: "material" }]),
      /at least two candidates/,
    );
    const stored = await replaceQuestionPackets(cwd, initial.state.revision, [question("q1")]);
    const claimed = { ...stored.questions[0], protocol_steps_completed: "all" } as HajimiQuestionWorkPacket & { protocol_steps_completed: string };
    const updated = await replaceQuestionPackets(cwd, stored.revision, [claimed]);
    await assert.rejects(
      requestHajimiGate(cwd, updated.revision, "question_checkpoint", "pretend complete", { stage: 4, questionId: "q1" }, [claimed.contractRef]),
      /requires managed experiments and evidence/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("registered artifact drift stales only its Experiment-Evidence-Claim publication chain", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-drift-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    for (const [path, content] of [
      ["src/solve.py", "print(1)\n"], ["input/problem.txt", "problem\n"], ["work/params.json", "{}\n"],
      ["output/a.json", "{\"answer\":1}\n"], ["output/b.json", "{\"answer\":2}\n"],
    ]) writeFileSync(join(cwd, path), content);
    const first = await recordManagedExperiment(cwd, initial.state.revision, {
      title: "first", command: "python3 src/solve.py", codePaths: ["src/solve.py"], inputPaths: ["input/problem.txt"],
      parameterPaths: ["work/params.json"], outputPaths: ["output/a.json"], environment: {}, exitCode: 0,
      startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", status: "succeeded",
    });
    const second = await recordManagedExperiment(cwd, first.state.revision, {
      title: "second", command: "python3 src/solve.py --other", codePaths: ["src/solve.py"], inputPaths: ["input/problem.txt"],
      parameterPaths: ["work/params.json"], outputPaths: ["output/b.json"], environment: {}, exitCode: 0,
      startedAt: "2026-01-01T00:00:02.000Z", completedAt: "2026-01-01T00:00:03.000Z", status: "succeeded",
    });
    writeFileSync(join(cwd, "output", "a.json"), "{\"answer\":99}\n");
    const reconciled = await reconcileProvenance(cwd);
    assert.deepEqual(reconciled.driftedArtifactIds, [first.experiment.outputRefs[0].id]);
    assert.equal(reconciled.state.provenance.experiments.find((item) => item.experimentId === first.experiment.experimentId)?.status, "stale");
    assert.equal(reconciled.state.provenance.experiments.find((item) => item.experimentId === second.experiment.experimentId)?.status, "succeeded");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("cross-validation rejects differing output hashes and superseded experiments", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-cross-validation-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    for (const [path, content] of [["src/a.py", "print(1)\n"], ["src/b.py", "print(2)\n"], ["input/p.txt", "p\n"], ["work/p.json", "{}\n"], ["output/a.json", "1\n"], ["output/b.json", "2\n"]]) {
      writeFileSync(join(cwd, path), content);
    }
    const a = await recordManagedExperiment(cwd, initial.state.revision, { title: "a", command: "python3 src/a.py", codePaths: ["src/a.py"], inputPaths: ["input/p.txt"], parameterPaths: ["work/p.json"], outputPaths: ["output/a.json"], environment: {}, exitCode: 0, startedAt: "2026-01-01T00:00:00.000Z", completedAt: "2026-01-01T00:00:01.000Z", status: "succeeded" });
    const b = await recordManagedExperiment(cwd, a.state.revision, { title: "b", command: "python3 src/b.py", codePaths: ["src/b.py"], inputPaths: ["input/p.txt"], parameterPaths: ["work/p.json"], outputPaths: ["output/b.json"], environment: {}, exitCode: 0, startedAt: "2026-01-01T00:00:02.000Z", completedAt: "2026-01-01T00:00:03.000Z", status: "succeeded" });
    await assert.rejects(recordEvidence(cwd, b.state.revision, {
      experimentRefs: [a.experiment.experimentId, b.experiment.experimentId],
      artifactRefs: [a.experiment.outputRefs[0].id, b.experiment.outputRefs[0].id], validationMethod: "repeat",
      status: "cross_validated", domainValidationStatus: "accepted", limitations: [],
    }), /output hashes differ/);
    const superseded = await setExperimentSelection(cwd, b.state.revision, a.experiment.experimentId, "superseded", "better route selected");
    await assert.rejects(recordEvidence(cwd, superseded.revision, {
      experimentRefs: [a.experiment.experimentId], artifactRefs: [a.experiment.outputRefs[0].id], validationMethod: "invalid",
      status: "verified", domainValidationStatus: "accepted", limitations: [],
    }), /unavailable trusted experiment/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("shared contract changes stale direct consumers and their dependency closure only", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-shared-contract-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    const shared = { id: "shared-units", sha256: "1".repeat(64) };
    const q1 = { ...question("q1"), contractRef: shared };
    const q2 = { ...question("q2"), sharedContractRefs: [shared.id] };
    const q3 = question("q3", ["q2"]);
    const q4 = question("q4");
    const stored = await replaceQuestionPackets(cwd, initial.state.revision, [q1, q2, q3, q4]);
    const changed = await replaceQuestionPackets(cwd, stored.revision, [
      { ...q1, contractRef: { ...shared, sha256: "2".repeat(64) } }, q2, q3, q4,
    ]);
    assert.equal(changed.questions.find((item) => item.questionId === "q1")?.status, "stale");
    assert.equal(changed.questions.find((item) => item.questionId === "q2")?.status, "stale");
    assert.equal(changed.questions.find((item) => item.questionId === "q3")?.status, "stale");
    assert.equal(changed.questions.find((item) => item.questionId === "q4")?.status, "in_progress");
    assert.equal(changed.rollbacks.at(-1)?.source, "shared_contract_change");
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("accepted question gates fail closed when a governed object changes after request", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-gate-drift-"));
  try {
    const initial = await ensureHajimiTask(cwd);
    const material = {
      ...question("q1"), routeUncertainty: "material" as const,
      candidateRefs: [{ id: "candidate-q1", sha256: "b".repeat(64) }, { id: "alt", sha256: "c".repeat(64) }],
    };
    const stored = await replaceQuestionPackets(cwd, initial.state.revision, [material]);
    const refs = expectedQuestionGateRefs(stored, stored.questions[0], "route");
    const requested = await requestHajimiGate(cwd, stored.revision, "route", "select", { stage: 4, questionId: "q1" }, refs);
    const changedPacket = {
      ...requested.questions[0],
      candidateRefs: [{ id: "candidate-q1", sha256: "b".repeat(64) }, { id: "alt", sha256: "d".repeat(64) }],
    };
    const changed = await replaceQuestionPackets(cwd, requested.revision, [changedPacket]);
    await assert.rejects(resolveHajimiGate(cwd, changed.revision, requested.openGates[0].gateId, "accepted"), /do not exactly match/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("stage seven rework can refreeze reusable evidence without rerunning experiments", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-refreeze-"));
  try {
    const chain = await createFreezableChain(cwd);
    let state = await freezeSelectedEvidence(cwd, chain.claim.state.revision, [chain.evidence.evidence.evidenceId], [chain.claim.claim.claimId]);
    state.focus.stage = 7;
    state.interaction = interactionFor(state);
    state.interaction.mode = "supervised";
    await writeWorkflowStateAtomic(cwd, state);
    await handleReviewInput(cwd, "返工第 7 阶段：调整展示说明");
    state = (await readHajimiTask(cwd))!.state;
    const refrozen = await freezeSelectedEvidence(cwd, state.revision, [chain.evidence.evidence.evidenceId], [chain.claim.claim.claimId]);
    assert.equal(refrozen.provenance.experiments[0].status, "succeeded");
    assert.equal(refrozen.provenance.freezes.filter(f => f.status === "active").length, 1);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});


test("optional batch binds sixteen publications with one snapshot and no hand-authored sidecar", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-batch-publications-"));
  const tools = new Map<string, { execute(id: string, args: unknown): Promise<unknown> }>();
  const pi = { registerTool(tool: { name: string; execute(id: string, args: unknown): Promise<unknown> }) { tools.set(tool.name, tool); }, on() {} } as unknown as ExtensionAPI;
  try {
    const chain = await createFreezableChain(cwd);
    const state = chain.claim.state;
    state.focus.stage = 8;
    await writeWorkflowStateAtomic(cwd, state);
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    const publications = Array.from({ length: 16 }, (_, i) => ({ kind: i === 15 ? "paper" : "figure", artifactPath: `output/item-${i}.txt` }));
    for (const item of publications) writeFileSync(join(cwd, item.artifactPath), "Computed value 42");
    const response = await tools.get("hajimi_bind_publications")!.execute("batch", {
      claimRefs: [chain.claim.claim.claimId], publications,
    }) as { content: Array<{ text: string }> };
    const result = JSON.parse(response.content[0].text);
    assert.equal(result.results.length, 16);
    assert.ok(result.results.every((r: { error?: string }) => !r.error), response.content[0].text);
    const final = (await ensureHajimiTask(cwd)).state;
    assert.equal(final.provenance.bindings.length, 16);
    assert.equal(final.provenance.freezes.length, 1);
    assert.ok(final.provenance.bindings.at(-1)?.claimMarkerRef);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
