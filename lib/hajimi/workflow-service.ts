import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { ensureHajimiTask, readHajimiValidation, registerArtifact } from "./task-state.ts";
import { assertDeliverySeal } from "./delivery-seal.ts";
import { captureStageFiles } from "./stage-files.ts";
import { assertPublicationMayConsume, assertQuestionGateMatches, createRollback } from "./workflow-reducer.ts";
import { mutateWorkflowState } from "./workflow-store.ts";
import type {
  HajimiClaimRecord,
  HajimiEvidenceRecord,
  HajimiExperimentRecord,
  HajimiPublicationBinding,
  HajimiQuestionWorkPacket,
  HajimiStageId,
  HajimiWorkflowState,
} from "./workflow-types.ts";

async function mutate(
  cwd: string,
  expectedRevision: number,
  command: Parameters<typeof mutateWorkflowState>[0]["command"],
): Promise<HajimiWorkflowState> {
  return mutateWorkflowState({ cwd, expectedRevision, command, ensure: async () => (await ensureHajimiTask(cwd)).state });
}

export async function setWorkflowFocus(
  cwd: string,
  expectedRevision: number,
  stage: HajimiStageId,
  questionId: string | null,
  nextAction?: string,
  routes?: HajimiWorkflowState["capabilityRoutes"],
): Promise<HajimiWorkflowState> {
  const current = (await ensureHajimiTask(cwd)).state;
  if (current.interaction?.pending) throw new Error("Stage or question review is pending in chat. Wait for the user.");
  if (current.interaction?.mode === "supervised" && current.focus.stage === 4
    && (stage !== 4 || questionId !== current.focus.questionId) && current.focus.questionId) {
    const question = current.questions.find(item => item.questionId === current.focus.questionId);
    const checkpoint = current.gateHistory.find(item => item.gateId === question?.checkpointGateId);
    if (question?.status !== "satisfied" || checkpoint?.status !== "accepted") {
      throw new Error("Complete the current question checkpoint and wait for user review before changing focus.");
    }
  }
  if (stage > current.focus.stage + 1) throw new Error(`Cannot skip from stage ${current.focus.stage} to stage ${stage}.`);
  if (stage > current.focus.stage && current.interaction) {
    if (current.interaction.pending) throw new Error("Stage review is pending in chat. Discuss the report and wait for the user.");
    if (current.interaction.mode === "unselected") throw new Error("Ask the user to choose 全自动 or 半自动 in chat before continuing.");
    const completed = current.milestones.find(item => item.stage === current.focus.stage);
    if (completed?.status !== "satisfied") throw new Error(`Stage ${current.focus.stage} must be satisfied before advancing.`);
    if (!current.interaction.reports.some(report => report.stage === current.focus.stage)) throw new Error(`Stage ${current.focus.stage} must produce a report before advancing.`);
    if (current.focus.stage === 8 && !current.interaction.finalAccepted) throw new Error("The paper must be delivered and accepted by the user before stage 9.");
    if (current.interaction.mode === "supervised" && !current.interaction.reviewedStages.includes(current.focus.stage)) throw new Error("Finish this stage with a report and wait for user review before continuing.");
  }
  if (questionId && !current.questions.some((item) => item.questionId === questionId)) {
    throw new Error(`Unknown question packet: ${questionId}`);
  }
  if (stage > current.focus.stage) {
    const milestone = current.milestones.find((item) => item.stage === stage);
    const blockedBy = milestone?.dependencies.filter((dependencyId) => {
      const dependency = current.milestones.find((item) => item.stage === dependencyId);
      return !dependency || dependency.status !== "satisfied";
    }) ?? [];
    if (blockedBy.length) throw new Error(`Cannot enter stage ${stage}; dependencies are not satisfied: ${blockedBy.join(", ")}`);
  }
  let next = await mutate(cwd, expectedRevision, { kind: "set_focus", stage, questionId, nextAction, routes });
  if (stage !== current.focus.stage && next.interaction) {
    const interaction = structuredClone(next.interaction);
    interaction.stageStartedAt = new Date().toISOString();
    interaction.stageBaseline = await captureStageFiles(cwd);
    next = await mutate(cwd, next.revision, { kind: "set_interaction", interaction });
  }
  return next;
}

export async function setRequirement(
  cwd: string,
  expectedRevision: number,
  stage: HajimiStageId,
  requirementId: string,
  status: HajimiWorkflowState["milestones"][number]["requirements"][number]["status"],
  evidenceRefs: string[],
  note?: string,
): Promise<HajimiWorkflowState> {
  const current = (await ensureHajimiTask(cwd)).state;
  if (stage !== current.focus.stage) throw new Error(`Only requirements for the current stage ${current.focus.stage} may be changed.`);
  const requirement = current.milestones.find(item => item.stage === stage)?.requirements.find(item => item.id === requirementId);
  if (!requirement) throw new Error(`Unknown requirement ${stage}/${requirementId}`);
  if (status === "waived" && requirement.severity === "required") throw new Error(`Required requirement ${requirementId} cannot be waived.`);
  return mutate(cwd, expectedRevision, { kind: "set_requirement", stage, requirementId, status, evidenceRefs, note });
}

export async function setMilestone(
  cwd: string,
  expectedRevision: number,
  stage: HajimiStageId,
  status: HajimiWorkflowState["milestones"][number]["status"],
  evidenceRefs?: string[],
): Promise<HajimiWorkflowState> {
  const current = (await ensureHajimiTask(cwd)).state;
  if (stage !== current.focus.stage) throw new Error(`Only the current stage ${current.focus.stage} milestone may be changed.`);
  if (status === "waived") throw new Error("Stage milestones cannot be waived; complete the stage report or request rework.");
  if (stage === 4 && status === "satisfied") {
    if (!current.questions.length || current.questions.some(question => question.status !== "satisfied")) {
      throw new Error("Stage 4 requires every question to pass its current checkpoint before completion.");
    }
    for (const question of current.questions) {
      const gate = current.gateHistory.find(item => item.gateId === question.checkpointGateId);
      if (!gate || gate.status !== "accepted" || gate.gate !== "question_checkpoint" || gate.target.questionId !== question.questionId) {
        throw new Error("Stage 4 requires an accepted checkpoint for every question.");
      }
      assertQuestionGateMatches(current, gate);
    }
  }
  if (stage === 7 && status === "satisfied" && !current.provenance.freezes.some(f => f.status === "active")) throw new Error("Stage 7 requires an active evidence freeze.");
  if (stage === 8 && status === "satisfied") await assertFinalDeliveryReady(cwd, current);
  if (stage === 9 && status === "satisfied") throw new Error("Stage 9 requires verified submission outputs; generated candidates alone cannot complete the task.");
  return mutate(cwd, expectedRevision, { kind: "set_milestone", stage, status, evidenceRefs });
}

async function assertFinalDeliveryReady(cwd: string, state: HajimiWorkflowState): Promise<string[]> {
  const validation = await readHajimiValidation(cwd);
  if (!validation?.strict || !validation.passed) {
    throw new Error("Stage 8 requires a passing strict delivery validation.");
  }
  const candidates = state.provenance.bindings.filter(binding => binding.kind === "paper" && binding.status === "candidate");
  if (!candidates.length) throw new Error("Stage 8 requires a claim-bound paper candidate.");
  for (const binding of candidates) {
    if (!binding.artifactRef) throw new Error(`Paper binding ${binding.bindingId} has no paper artifact.`);
    assertPublicationMayConsume(state, binding.claimRefs);
    const absolute = resolve(cwd, binding.artifactRef.path);
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink() || info.size !== binding.artifactRef.sizeBytes) {
      throw new Error(`Paper artifact changed or is unavailable: ${binding.artifactRef.path}`);
    }
    const hash = createHash("sha256").update(await readFile(absolute)).digest("hex");
    if (hash !== binding.artifactRef.sha256) throw new Error(`Paper artifact changed after binding: ${binding.artifactRef.path}`);
  }
  await assertDeliverySeal(cwd);
  return candidates.map(binding => binding.bindingId);
}

export async function acceptFinalDelivery(cwd: string, expectedRevision: number, note: string): Promise<HajimiWorkflowState> {
  const current = await assertNoProvenanceDrift(cwd);
  if (current.revision !== expectedRevision) throw new Error(`Revision changed: read task status (current ${current.revision}).`);
  const bindingRefs = await assertFinalDeliveryReady(cwd, current);
  const stage8 = current.milestones.find(item => item.stage === 8);
  if (stage8?.status !== "satisfied") throw new Error("Stage 8 paper delivery is not complete.");
  if (!current.interaction?.reports.some(report => report.stage === 8)) throw new Error("Stage 8 report is missing.");
  const files = await captureStageFiles(cwd, true);
  // Recheck after capture so the accepted snapshot cannot follow a changed paper.
  await assertDeliverySeal(cwd);
  return mutate(cwd, current.revision, { kind: "accept_final", bindingRefs, note, files });
}

export async function replaceQuestionPackets(
  cwd: string,
  expectedRevision: number,
  questions: HajimiQuestionWorkPacket[],
): Promise<HajimiWorkflowState> {
  return mutate(cwd, expectedRevision, { kind: "upsert_questions", questions });
}

export async function reconcileProvenance(cwd: string): Promise<{
  state: HajimiWorkflowState;
  driftedArtifactIds: string[];
}> {
  const current = (await ensureHajimiTask(cwd)).state;
  const refs = current.provenance.experiments.filter(e => !["stale", "superseded"].includes(e.status) && !["superseded", "invalidated"].includes(e.selection)).flatMap((experiment) => [
    ...experiment.codeRefs,
    ...experiment.inputRefs,
    ...experiment.parameterRefs,
    ...experiment.outputRefs,
  ]);
  const driftedArtifactIds: string[] = [];
  for (const ref of refs) {
    try {
      const path = resolve(cwd, ref.path);
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size !== ref.sizeBytes) {
        driftedArtifactIds.push(ref.id);
        continue;
      }
      const actual = createHash("sha256").update(await readFile(path)).digest("hex");
      if (actual !== ref.sha256) driftedArtifactIds.push(ref.id);
    } catch {
      driftedArtifactIds.push(ref.id);
    }
  }
  const unique = [...new Set(driftedArtifactIds)];
  if (unique.length === 0) return { state: current, driftedArtifactIds: [] };
  const state = await mutate(cwd, current.revision, {
    kind: "reconcile_provenance",
    invalidatedIds: unique,
    reason: `artifact_hash_drift:${unique.join(",")}`,
  });
  return { state, driftedArtifactIds: unique };
}

async function assertNoProvenanceDrift(cwd: string): Promise<HajimiWorkflowState> {
  const reconciled = await reconcileProvenance(cwd);
  if (reconciled.driftedArtifactIds.length > 0) {
    throw new Error(`Provenance drift detected and marked stale: ${reconciled.driftedArtifactIds.join(", ")}`);
  }
  return reconciled.state;
}

export async function rollbackWorkflow(input: {
  cwd: string;
  expectedRevision: number;
  source: string;
  targetStage: HajimiStageId;
  targetQuestion?: string | null;
  invalidatedIds?: string[];
  reason: string;
}): Promise<HajimiWorkflowState> {
  const current = (await ensureHajimiTask(input.cwd)).state;
  if (input.targetQuestion && !current.questions.some((item) => item.questionId === input.targetQuestion)) {
    throw new Error(`Unknown rollback question: ${input.targetQuestion}`);
  }
  if (input.targetStage > current.focus.stage) throw new Error("Rollback cannot advance to a future stage.");
  const record = createRollback({
    source: input.source,
    targetStage: input.targetStage,
    targetQuestion: input.targetQuestion ?? null,
    invalidatedIds: input.invalidatedIds ?? [],
    reason: input.reason,
  });
  return mutate(input.cwd, input.expectedRevision, { kind: "rollback", record });
}

export interface ManagedExperimentInput {
  experimentId?: string;
  title: string;
  command: string;
  codePaths: string[];
  inputPaths: string[];
  parameterPaths: string[];
  outputPaths: string[];
  environment: Record<string, string>;
  seed?: number;
  exitCode: number | null;
  startedAt: string;
  completedAt: string;
  status: "succeeded" | "failed" | "inconclusive";
  trust?: "legacy_unverified" | "attested";
}

export async function recordManagedExperiment(
  cwd: string,
  expectedRevision: number,
  input: ManagedExperimentInput,
): Promise<{ state: HajimiWorkflowState; experiment: HajimiExperimentRecord }> {
  if (input.completedAt < input.startedAt) throw new Error("Experiment completion precedes its start");
  const register = (paths: string[], role: string) => Promise.all(paths.map((path) => registerArtifact(cwd, path, `experiment ${role}`)));
  const [codeRefs, inputRefs, parameterRefs, outputRefs] = await Promise.all([
    register(input.codePaths, "code"),
    register(input.inputPaths, "input"),
    register(input.parameterPaths, "parameters"),
    register(input.outputPaths, "output"),
  ]);
  if (input.status === "succeeded" && outputRefs.length === 0) {
    throw new Error("A succeeded managed experiment must register at least one output");
  }
  const experiment: HajimiExperimentRecord = {
    experimentId: input.experimentId ?? randomUUID(),
    title: input.title,
    trust: input.trust ?? "attested",
    status: input.status,
    selection: "candidate",
    command: input.command,
    codeRefs,
    inputRefs,
    parameterRefs,
    outputRefs,
    environment: input.environment,
    seed: input.seed,
    exitCode: input.exitCode,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    staleBy: [],
  };
  const state = await mutate(cwd, expectedRevision, { kind: "record_experiment", experiment });
  return { state, experiment };
}

export async function recordEvidence(
  cwd: string,
  expectedRevision: number,
  input: Omit<HajimiEvidenceRecord, "evidenceId" | "staleBy"> & { evidenceId?: string },
): Promise<{ state: HajimiWorkflowState; evidence: HajimiEvidenceRecord }> {
  const current = await assertNoProvenanceDrift(cwd);
  for (const experimentRef of input.experimentRefs) {
    const experiment = current.provenance.experiments.find((item) => item.experimentId === experimentRef);
    if (!experiment || experiment.status !== "succeeded" || experiment.trust === "legacy_unverified") {
      throw new Error(`Evidence references an unavailable trusted experiment: ${experimentRef}`);
    }
  }
  const registeredArtifacts = new Set(current.provenance.experiments.flatMap((item) => [
    ...item.codeRefs, ...item.inputRefs, ...item.parameterRefs, ...item.outputRefs,
  ]).map((item) => item.id));
  for (const artifactRef of input.artifactRefs) {
    if (!registeredArtifacts.has(artifactRef)) throw new Error(`Evidence references an unknown experiment artifact: ${artifactRef}`);
  }
  if (input.status === "cross_validated") {
    const experiments = input.experimentRefs.map((id) => current.provenance.experiments.find((item) => item.experimentId === id)!);
    if (experiments.length < 2 || new Set(experiments.map((item) => item.experimentId)).size < 2) {
      throw new Error("Cross-validated evidence requires at least two independent managed experiments");
    }
    const executionSignatures = new Set(experiments.map((item) => JSON.stringify({
      command: item.command,
      environment: item.environment,
      seed: item.seed,
      code: item.codeRefs.map((ref) => ref.sha256).sort(),
      parameters: item.parameterRefs.map((ref) => ref.sha256).sort(),
    })));
    if (executionSignatures.size < 2) throw new Error("Cross-validated evidence experiments are not independent");
    const outputSignatures = experiments.map((item) => item.outputRefs
      .filter((ref) => !/\.(?:stdout|stderr)\.log$/i.test(ref.path))
      .map((ref) => ref.sha256)
      .sort()
      .join(":"));
    if (outputSignatures.some((signature) => !signature) || new Set(outputSignatures).size !== 1) {
      throw new Error("Cross-validation failed because repeated experiment output hashes differ");
    }
  }
  if (input.status === "frozen") throw new Error("Use freezeEvidence to freeze evidence");
  const evidence: HajimiEvidenceRecord = {
    ...input,
    evidenceId: input.evidenceId ?? randomUUID(),
    staleBy: [],
  };
  const state = await mutate(cwd, expectedRevision, { kind: "record_evidence", evidence });
  return { state, evidence };
}

export async function recordClaim(
  cwd: string,
  expectedRevision: number,
  input: Omit<HajimiClaimRecord, "claimId" | "staleBy"> & { claimId?: string },
): Promise<{ state: HajimiWorkflowState; claim: HajimiClaimRecord }> {
  const current = await assertNoProvenanceDrift(cwd);
  if (input.kind !== "estimate" && input.evidenceRefs.length === 0) {
    throw new Error("A formal claim must cite evidence");
  }
  if (input.status === "supported") {
    for (const evidenceRef of input.evidenceRefs) {
      const evidence = current.provenance.evidence.find((item) => item.evidenceId === evidenceRef);
      if (!evidence || !["verified", "cross_validated", "frozen"].includes(evidence.status) || evidence.domainValidationStatus !== "accepted") {
        throw new Error(`Supported claim references unaccepted evidence: ${evidenceRef}`);
      }
    }
  }
  const claim: HajimiClaimRecord = { ...input, claimId: input.claimId ?? randomUUID(), staleBy: [] };
  const state = await mutate(cwd, expectedRevision, { kind: "record_claim", claim });
  return { state, claim };
}

export async function freezeEvidence(
  cwd: string,
  expectedRevision: number,
  evidenceRefs: string[],
  claimRefs: string[],
  acceptedGateId: string,
): Promise<HajimiWorkflowState> {
  const current = await assertNoProvenanceDrift(cwd);
  if (evidenceRefs.length === 0 || claimRefs.length === 0) throw new Error("An evidence freeze requires evidence and claims");
  for (const evidenceRef of evidenceRefs) {
    const evidence = current.provenance.evidence.find((item) => item.evidenceId === evidenceRef);
    if (!evidence || !["verified", "cross_validated"].includes(evidence.status) || evidence.domainValidationStatus !== "accepted") {
      throw new Error(`Evidence is not eligible to freeze: ${evidenceRef}`);
    }
  }
  for (const claimRef of claimRefs) {
    const claim = current.provenance.claims.find((item) => item.claimId === claimRef);
    if (!claim || claim.status !== "supported" || claim.evidenceRefs.some((item) => !evidenceRefs.includes(item))) {
      throw new Error(`Claim is not fully supported by this freeze: ${claimRef}`);
    }
  }
  const artifactById = new Map(current.provenance.experiments.flatMap((item) => [
    ...item.codeRefs, ...item.inputRefs, ...item.parameterRefs, ...item.outputRefs,
  ]).map((item) => [item.id, item]));
  const governedIds = new Set(
    current.provenance.evidence
      .filter((item) => evidenceRefs.includes(item.evidenceId))
      .flatMap((item) => item.artifactRefs),
  );
  const governedRefs = [...governedIds].map((id) => {
    const artifact = artifactById.get(id);
    if (!artifact) throw new Error(`Freeze artifact is unavailable: ${id}`);
    return { id, sha256: artifact.sha256 };
  });
  const gate = current.gateHistory.find((item) => item.gateId === acceptedGateId);
  if (!gate || gate.gate !== "evidence_freeze" || gate.status !== "accepted") {
    throw new Error("Evidence freeze requires an accepted evidence_freeze gate");
  }
  const approved = new Map(gate.governedRefs.map((item) => [item.id, item.sha256]));
  if (approved.size !== governedRefs.length || governedRefs.some((item) => approved.get(item.id) !== item.sha256)) {
    throw new Error("Evidence freeze content does not match the accepted gate");
  }
  return mutate(cwd, expectedRevision, {
    kind: "freeze_evidence",
    freeze: { freezeId: randomUUID(), evidenceRefs, claimRefs, governedRefs, createdAt: new Date().toISOString(), status: "active" },
  });
}

/** The program derives gate refs. Language models never copy artifact hashes. */
export async function freezeSelectedEvidence(cwd: string, expectedRevision: number, evidenceRefs: string[], claimRefs: string[]) {
  const state = await assertNoProvenanceDrift(cwd);
  if (state.revision !== expectedRevision) throw new Error(`Revision changed: read task status (current ${state.revision}).`);
  const existing = state.provenance.freezes.find(f => f.status === "active"
    && JSON.stringify([...f.evidenceRefs].sort()) === JSON.stringify([...new Set(evidenceRefs)].sort())
    && JSON.stringify([...f.claimRefs].sort()) === JSON.stringify([...new Set(claimRefs)].sort()));
  if (!evidenceRefs.length || !claimRefs.length) throw new Error("Select evidence and claims before freezing.");
  const selected = evidenceRefs.map(id => state.provenance.evidence.find(e => e.evidenceId === id));
  if (selected.some(e => !e || !["verified", "cross_validated", "frozen"].includes(e.status) || e.domainValidationStatus !== "accepted")) throw new Error("Selected evidence must be verified and domain-accepted.");
  for (const evidence of selected) {
    for (const experimentId of evidence!.experimentRefs) {
      const experiment = state.provenance.experiments.find(item => item.experimentId === experimentId);
      if (!experiment || experiment.status !== "succeeded" || experiment.trust === "legacy_unverified" || ["superseded", "invalidated"].includes(experiment.selection)) {
        throw new Error(`Selected evidence references an ineligible experiment: ${experimentId}`);
      }
    }
  }
  if (claimRefs.some(id => { const c = state.provenance.claims.find(c => c.claimId === id); return !c || c.status !== "supported" || c.evidenceRefs.some(e => !evidenceRefs.includes(e)); })) throw new Error("Selected claims must be supported by the selected evidence.");
  if (existing) return state;
  const artifacts = new Map(state.provenance.experiments.flatMap(e => [...e.codeRefs, ...e.inputRefs, ...e.parameterRefs, ...e.outputRefs]).map(a => [a.id, a]));
  const refs = [...new Set(selected.flatMap(e => e!.artifactRefs))].map(id => {
    const a = artifacts.get(id);
    if (!a) throw new Error(`Missing artifact ${id}`);
    return { id: a.id, sha256: a.sha256 };
  });
  const now = new Date().toISOString();
  return mutate(cwd, state.revision, { kind: "freeze_prepared",
    gate: { gateId: randomUUID(), gate: "evidence_freeze", status: "requested", summary: "Program-derived verified evidence selection", target: { stage: 7 }, governedRefs: refs, requestedAt: now },
    freeze: { freezeId: randomUUID(), evidenceRefs: [...new Set(evidenceRefs)], claimRefs: [...new Set(claimRefs)], governedRefs: refs, createdAt: now, status: "active" },
  });
}

export async function bindPublication(
  cwd: string,
  expectedRevision: number,
  input: Omit<HajimiPublicationBinding, "bindingId" | "staleBy"> & { bindingId?: string },
): Promise<HajimiWorkflowState> {
  const current = await assertNoProvenanceDrift(cwd);
  await assertPublicationMarkers(cwd, current, input);
  const binding: HajimiPublicationBinding = { ...input, bindingId: input.bindingId ?? randomUUID(), staleBy: [] };
  return mutate(cwd, expectedRevision, { kind: "bind_publication", binding });
}

async function assertPublicationMarkers(
  cwd: string,
  state: HajimiWorkflowState,
  input: Omit<HajimiPublicationBinding, "bindingId" | "staleBy"> & { bindingId?: string },
): Promise<void> {
  if (input.kind !== "paper") return;
  const numericClaims = input.claimRefs.map((id) => state.provenance.claims.find((claim) => claim.claimId === id))
    .filter((claim): claim is HajimiClaimRecord => Boolean(claim?.kind === "numeric"));
  if (numericClaims.length === 0) return;
  if (!input.claimMarkerRef) throw new Error("A paper with numeric claims requires a claim-binding sidecar");
  const sidecarPath = resolve(cwd, input.claimMarkerRef.path);
  const raw = await readFile(sidecarPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The numeric claim-binding sidecar must be valid JSON");
  }
  const sidecar = parsed as { schemaVersion?: string; claims?: Array<{ claimId?: string; value?: string | number; unit?: string }> };
  if (sidecar.schemaVersion !== "hajimi.claim-bindings.v1" || !Array.isArray(sidecar.claims)) {
    throw new Error("Invalid numeric claim-binding sidecar schema");
  }
  for (const claim of numericClaims) {
    const marker = sidecar.claims.find((item) => item.claimId === claim.claimId);
    if (!marker || JSON.stringify(marker.value) !== JSON.stringify(claim.value) || (marker.unit ?? "") !== (claim.unit ?? "")) {
      throw new Error(`Paper does not bind numeric claim ${claim.claimId} to its exact value and unit`);
    }
  }
}

export async function setExperimentSelection(
  cwd: string,
  expectedRevision: number,
  experimentId: string,
  selection: HajimiExperimentRecord["selection"],
  reason?: string,
): Promise<HajimiWorkflowState> {
  return mutate(cwd, expectedRevision, { kind: "set_experiment_selection", experimentId, selection, reason });
}
