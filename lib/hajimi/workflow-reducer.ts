import { randomUUID } from "node:crypto";

import { canonicalJson, sha256Text } from "./workflow-definition.ts";
import type {
  HajimiClaimRecord,
  HajimiEvidenceFreeze,
  HajimiEvidenceRecord,
  HajimiExperimentRecord,
  HajimiMilestoneStatus,
  HajimiPublicationBinding,
  HajimiQuestionWorkPacket,
  HajimiRollbackRecord,
  HajimiStageId,
  HajimiWorkflowGate,
  HajimiWorkflowState,
} from "./workflow-types.ts";

export type HajimiWorkflowCommand =
  | { kind: "complete_submission"; evidenceRefs: string[]; reportPath: string; summary: string }
  | { kind: "freeze_prepared"; gate: HajimiWorkflowGate; freeze: HajimiEvidenceFreeze }
  | { kind: "accept_final"; bindingRefs: string[]; note: string; files: NonNullable<NonNullable<HajimiWorkflowState["interaction"]>["acceptedSubmissionInputs"]>["files"] }
  | { kind: "set_interaction"; interaction: NonNullable<HajimiWorkflowState["interaction"]> }
  | { kind: "replace_micro_plan"; currentObjective: string; nextAction: string; microPlan: HajimiWorkflowState["microPlan"] }
  | { kind: "set_focus"; stage: HajimiStageId; questionId?: string | null; nextAction?: string; routes?: HajimiWorkflowState["capabilityRoutes"] }
  | { kind: "set_milestone"; stage: HajimiStageId; status: HajimiMilestoneStatus; evidenceRefs?: string[]; outputsChecked?: boolean }
  | { kind: "set_requirement"; stage: HajimiStageId; requirementId: string; status: HajimiWorkflowState["milestones"][number]["requirements"][number]["status"]; evidenceRefs: string[]; note?: string }
  | { kind: "upsert_questions"; questions: HajimiQuestionWorkPacket[] }
  | { kind: "request_gate"; gate: HajimiWorkflowGate }
  | { kind: "resolve_gate"; gateId: string; decision: "accepted" | "rework" | "rejected"; note?: string }
  | { kind: "rollback"; record: HajimiRollbackRecord }
  | { kind: "record_experiment"; experiment: HajimiExperimentRecord }
  | { kind: "set_experiment_selection"; experimentId: string; selection: HajimiExperimentRecord["selection"]; reason?: string }
  | { kind: "record_evidence"; evidence: HajimiEvidenceRecord }
  | { kind: "record_claim"; claim: HajimiClaimRecord }
  | { kind: "freeze_evidence"; freeze: HajimiEvidenceFreeze }
  | { kind: "bind_publication"; binding: HajimiPublicationBinding }
  | { kind: "reconcile_provenance"; invalidatedIds: string[]; reason: string }
  | { kind: "record_capability_routes"; routes: HajimiWorkflowState["capabilityRoutes"] };

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function assertGovernedRef(ref: { id: string; sha256: string }, label = "governed ref"): void {
  if (!ref.id.trim() || !SHA256_PATTERN.test(ref.sha256)) {
    throw new Error(`${label} must contain a non-empty id and lowercase SHA-256`);
  }
}

function uniqueGovernedRefs(refs: Array<{ id: string; sha256: string }>): Array<{ id: string; sha256: string }> {
  const output = new Map<string, string>();
  for (const ref of refs) {
    assertGovernedRef(ref);
    const previous = output.get(ref.id);
    if (previous && previous !== ref.sha256) throw new Error(`Governed ref ${ref.id} has conflicting hashes`);
    output.set(ref.id, ref.sha256);
  }
  return [...output].map(([id, sha256]) => ({ id, sha256 })).sort((left, right) => left.id.localeCompare(right.id));
}

function sameGovernedRefs(left: Array<{ id: string; sha256: string }>, right: Array<{ id: string; sha256: string }>): boolean {
  const a = uniqueGovernedRefs(left);
  const b = uniqueGovernedRefs(right);
  return a.length === b.length && a.every((item, index) => item.id === b[index].id && item.sha256 === b[index].sha256);
}

function recordRef(id: string, value: unknown): { id: string; sha256: string } {
  return { id, sha256: sha256Text(canonicalJson(value)) };
}

export function validateQuestionPacket(question: HajimiQuestionWorkPacket): void {
  assertGovernedRef(question.contractRef, `Question ${question.questionId} contract`);
  question.candidateRefs.forEach((ref) => assertGovernedRef(ref, `Question ${question.questionId} candidate`));
  question.localValidationRefs.forEach((ref) => assertGovernedRef(ref, `Question ${question.questionId} validation`));
  question.reviewRefs.forEach((ref) => assertGovernedRef(ref, `Question ${question.questionId} review`));
  if (question.routeUncertainty === "material" && question.candidateRefs.length < 2) {
    throw new Error(`Question ${question.questionId} has material route uncertainty and requires at least two candidates`);
  }
  if (question.selectedCandidateRef) {
    assertGovernedRef(question.selectedCandidateRef, `Question ${question.questionId} selected candidate`);
    if (!question.candidateRefs.some((ref) => ref.id === question.selectedCandidateRef?.id && ref.sha256 === question.selectedCandidateRef.sha256)) {
      throw new Error(`Question ${question.questionId} selected candidate is not in candidateRefs`);
    }
  }
}

export function expectedQuestionGateRefs(
  state: HajimiWorkflowState,
  question: HajimiQuestionWorkPacket,
  gate: "route" | "question_checkpoint",
): Array<{ id: string; sha256: string }> {
  validateQuestionPacket(question);
  if (!question.selectedCandidateRef) throw new Error(`Question ${question.questionId} has no selected candidate`);
  if (gate === "route") {
    if (question.routeUncertainty !== "material") throw new Error(`Question ${question.questionId} does not require a route gate`);
    return uniqueGovernedRefs([question.contractRef, ...question.candidateRefs, question.selectedCandidateRef]);
  }
  if (question.experimentRefs.length === 0 || question.evidenceRefs.length === 0) {
    throw new Error(`Question ${question.questionId} checkpoint requires managed experiments and evidence`);
  }
  if (question.localValidationRefs.length === 0 || question.reviewRefs.length === 0) {
    throw new Error(`Question ${question.questionId} checkpoint requires local validation and review refs`);
  }
  const experiments = question.experimentRefs.map((id) => {
    const experiment = state.provenance.experiments.find((item) => item.experimentId === id);
    if (!experiment || experiment.status !== "succeeded" || experiment.trust === "legacy_unverified" || ["superseded", "invalidated"].includes(experiment.selection)) {
      throw new Error(`Question ${question.questionId} references an ineligible managed experiment: ${id}`);
    }
    return experiment;
  });
  const experimentIds = new Set(experiments.map((item) => item.experimentId));
  const evidence = question.evidenceRefs.map((id) => {
    const item = state.provenance.evidence.find((candidate) => candidate.evidenceId === id);
    if (!item || !["verified", "cross_validated", "frozen"].includes(item.status) || item.domainValidationStatus !== "accepted") {
      throw new Error(`Question ${question.questionId} references ineligible evidence: ${id}`);
    }
    if (!item.experimentRefs.some((experimentRef) => experimentIds.has(experimentRef))) {
      throw new Error(`Question ${question.questionId} evidence ${id} is not backed by its managed experiments`);
    }
    return item;
  });
  return uniqueGovernedRefs([
    question.contractRef,
    question.selectedCandidateRef,
    ...question.localValidationRefs,
    ...question.reviewRefs,
    ...experiments.map((item) => recordRef(item.experimentId, item)),
    ...evidence.map((item) => recordRef(item.evidenceId, item)),
  ]);
}

export function assertQuestionGateMatches(
  state: HajimiWorkflowState,
  gate: Pick<HajimiWorkflowGate, "gate" | "target" | "governedRefs">,
): void {
  if ((gate.gate !== "route" && gate.gate !== "question_checkpoint") || !gate.target.questionId) return;
  const question = state.questions.find((item) => item.questionId === gate.target.questionId);
  if (!question) throw new Error(`Unknown gate question: ${gate.target.questionId}`);
  const expected = expectedQuestionGateRefs(state, question, gate.gate);
  if (!sameGovernedRefs(expected, gate.governedRefs)) {
    throw new Error(`${gate.gate} gate governed refs do not exactly match question ${question.questionId}`);
  }
}

export function validateQuestionDag(questions: HajimiQuestionWorkPacket[]): void {
  const ids = new Set(questions.map((question) => question.questionId));
  if (ids.size !== questions.length) throw new Error("Question ids must be unique");
  for (const question of questions) {
    validateQuestionPacket(question);
    for (const dependency of question.dependencies) {
      if (!ids.has(dependency)) throw new Error(`Question ${question.questionId} depends on unknown question ${dependency}`);
      if (dependency === question.questionId) throw new Error(`Question ${question.questionId} cannot depend on itself`);
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`Question dependency cycle includes ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    const question = questions.find((item) => item.questionId === id)!;
    question.dependencies.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  questions.forEach((question) => visit(question.questionId));
}

export function dependentQuestionIds(questions: HajimiQuestionWorkPacket[], roots: string[]): string[] {
  const affected = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const question of questions) {
      if (!affected.has(question.questionId) && question.dependencies.some((id) => affected.has(id))) {
        affected.add(question.questionId);
        changed = true;
      }
    }
  }
  return [...affected];
}

function upsertById<T>(items: T[], value: T, key: (item: T) => string): T[] {
  const id = key(value);
  return items.some((item) => key(item) === id)
    ? items.map((item) => (key(item) === id ? value : item))
    : [...items, value];
}

function staleProvenance(state: HajimiWorkflowState, invalidatedIds: Set<string>, reason: string): HajimiWorkflowState["provenance"] {
  const experiments = state.provenance.experiments.map((item) =>
    invalidatedIds.has(item.experimentId) || [...item.codeRefs, ...item.inputRefs, ...item.parameterRefs, ...item.outputRefs].some((ref) => invalidatedIds.has(ref.id))
      ? { ...item, status: "stale" as const, staleBy: [...new Set([...item.staleBy, reason])] }
      : item,
  );
  const staleExperimentIds = new Set(experiments.filter((item) => item.status === "stale").map((item) => item.experimentId));
  const evidence = state.provenance.evidence.map((item) =>
    invalidatedIds.has(item.evidenceId) || item.experimentRefs.some((id) => staleExperimentIds.has(id) || invalidatedIds.has(id))
      ? { ...item, status: "stale" as const, staleBy: [...new Set([...item.staleBy, reason])] }
      : item,
  );
  const staleEvidenceIds = new Set(evidence.filter((item) => item.status === "stale").map((item) => item.evidenceId));
  const claims = state.provenance.claims.map((item) =>
    invalidatedIds.has(item.claimId) || item.evidenceRefs.some((id) => staleEvidenceIds.has(id) || invalidatedIds.has(id))
      ? { ...item, status: "stale" as const, staleBy: [...new Set([...item.staleBy, reason])] }
      : item,
  );
  const staleClaimIds = new Set(claims.filter((item) => item.status === "stale").map((item) => item.claimId));
  const bindings = state.provenance.bindings.map((item) =>
    invalidatedIds.has(item.bindingId) || item.claimRefs.some((id) => staleClaimIds.has(id) || invalidatedIds.has(id))
      ? { ...item, status: "stale" as const, staleBy: [...new Set([...item.staleBy, reason])] }
      : item,
  );
  const freezes = state.provenance.freezes.map((item) =>
    item.evidenceRefs.some((id) => staleEvidenceIds.has(id)) || item.claimRefs.some((id) => staleClaimIds.has(id))
      ? { ...item, status: "stale" as const }
      : item,
  );
  return { experiments, evidence, claims, bindings, freezes };
}

export function reduceWorkflowState(
  state: HajimiWorkflowState,
  command: HajimiWorkflowCommand,
  now = new Date().toISOString(),
): HajimiWorkflowState {
  const next: HajimiWorkflowState = structuredClone(state);
  switch (command.kind) {
    case "complete_submission": {
      if (next.focus.stage !== 9 || !next.interaction?.finalAccepted || next.interaction.pending || command.evidenceRefs.length < 1) {
        throw new Error("Submission completion requires accepted inputs and a generated ZIP artifact.");
      }
      next.milestones = next.milestones.map(item => item.stage !== 9 ? item : { ...item, status: "satisfied", acceptedRefs: [...new Set([...item.acceptedRefs, ...command.evidenceRefs])],
        requirements: item.requirements.map(requirement => requirement.id !== "submission_package" ? requirement : { ...requirement, status: "satisfied", evidenceRefs: command.evidenceRefs }), updatedAt: now });
      next.status = "completed";
      next.interaction.reports.push({ stage: 9, path: command.reportPath, summary: command.summary, createdAt: now });
      next.nextAction = "Submission package generated and delivered; preserve accepted inputs and historical packages.";
      break;
    }
    case "freeze_prepared": {
      next.openGates = next.openGates.filter(gate => gate.gate !== "evidence_freeze");
      const requested = reduceWorkflowState(next, { kind: "request_gate", gate: command.gate }, now);
      const accepted = reduceWorkflowState(requested, { kind: "resolve_gate", gateId: command.gate.gateId, decision: "accepted", note: "Program-validated technical freeze; human review occurs at stage completion." }, now);
      return reduceWorkflowState(accepted, { kind: "freeze_evidence", freeze: command.freeze }, now);
    }
    case "accept_final": {
      if (next.focus.stage !== 8 || next.interaction?.pending?.kind !== "final") {
        throw new Error("Final acceptance is only valid while the stage 8 paper is awaiting human review");
      }
      const interaction = structuredClone(next.interaction);
      interaction.pending = null;
      interaction.reviewedStages = [...new Set([...interaction.reviewedStages, 8 as HajimiStageId])];
      interaction.finalAccepted = true;
      interaction.acceptedSubmissionInputs = {
        files: command.files,
        provenanceHash: sha256Text(canonicalJson({ provenance: next.provenance, questions: next.questions })),
        bindingRefs: command.bindingRefs,
      };
      next.interaction = interaction;
      next.focus = { stage: 9, questionId: null };
      const submissionStage = next.milestones.find(item => item.stage === 9);
      if (submissionStage && !submissionStage.requirements.some(item => item.id === "submission_package")) {
        submissionStage.requirements.push({ id: "submission_package", summary: "两版论文、代码和AI说明已生成并打包为ZIP。",
          evaluator: "delivery_validation", severity: "required", status: "unmet", evidenceRefs: [] });
      }
      next.milestones = next.milestones.map((milestone) => milestone.stage !== 9 ? milestone : {
        ...milestone,
        status: "in_progress" as const,
        acceptedRefs: command.bindingRefs,
        requirements: milestone.requirements.map((requirement) => requirement.id !== "human_final_review" ? requirement : {
          ...requirement,
          status: "satisfied" as const,
          evidenceRefs: command.bindingRefs,
          note: command.note,
        }),
        updatedAt: now,
      });
      next.status = "active";
      next.nextAction = "Use the stage 9 submission capability to generate materials and package the accepted inputs.";
      break;
    }
    case "set_interaction":
      next.interaction = command.interaction;
      next.status = command.interaction.pending ? "waiting_for_user"
        : command.interaction.finalAccepted && next.milestones.find(item => item.stage === 9)?.status === "satisfied" ? "completed" : "active";
      break;
    case "replace_micro_plan":
      next.currentObjective = command.currentObjective;
      next.nextAction = command.nextAction;
      next.microPlan = command.microPlan;
      next.status = "active";
      break;
    case "set_focus":
      next.focus = { stage: command.stage, questionId: command.questionId ?? null };
      if (command.nextAction) next.nextAction = command.nextAction;
      for (const route of command.routes?.filter((item) => item.persisted) ?? []) {
        next.capabilityRoutes = upsertById(next.capabilityRoutes, route, (item) => item.routeId);
      }
      break;
    case "set_milestone": {
      if (command.status === "satisfied") {
        const milestone = next.milestones.find((item) => item.stage === command.stage);
        if (!milestone) throw new Error(`Unknown milestone ${command.stage}`);
        const open = milestone.requirements.filter((item) => item.status !== "satisfied");
        if (open.length && command.outputsChecked && next.interaction?.executionPolicy !== "strict") {
          for (const requirement of open) {
            requirement.status = "satisfied";
            requirement.evidenceRefs = command.evidenceRefs ?? [];
            requirement.note = "Stage outputs checked by the completion service; substantive findings remain subject to review.";
          }
        } else if (open.length) throw new Error(`Milestone ${command.stage} has open requirements: ${open.map((item) => item.id).join(", ")}`);

      }
      next.milestones = next.milestones.map((item) => item.stage === command.stage ? {
        ...item,
        status: command.status,
        acceptedRefs: command.evidenceRefs ?? item.acceptedRefs,
        attempt: command.status === "in_progress" && item.status !== "in_progress" ? item.attempt + 1 : item.attempt,
        updatedAt: now,
      } : item);
      if (command.stage === 4 && command.status === "satisfied" && command.outputsChecked) {
        next.questions = next.questions.map(q => ({ ...q, status: "satisfied", staleBy: [] }));
      }
      break;
    }
    case "set_requirement": {
      let found = false;
      next.milestones = next.milestones.map((item) => item.stage !== command.stage ? item : {
        ...item,
        requirements: item.requirements.map((requirement) => {
          if (requirement.id !== command.requirementId) return requirement;
          found = true;
          return { ...requirement, status: command.status, evidenceRefs: command.evidenceRefs, note: command.note };
        }),
        updatedAt: now,
      });
      if (!found) throw new Error(`Unknown requirement ${command.stage}/${command.requirementId}`);
      break;
    }
    case "upsert_questions":
      validateQuestionDag(command.questions);
      for (const question of command.questions) {
        const previous = next.questions.find(item => item.questionId === question.questionId);
        if (question.checkpointGateId && question.checkpointGateId !== previous?.checkpointGateId) {
          throw new Error(`Question ${question.questionId} must obtain an accepted checkpoint gate through the gate workflow`);
        }
      }
      {
        const oldHashes = new Map(next.questions.map((question) => [question.contractRef.id, question.contractRef.sha256]));
        const newHashes = new Map(command.questions.map((question) => [question.contractRef.id, question.contractRef.sha256]));
        const changedContractIds = new Set<string>();
        for (const [id, oldHash] of oldHashes) {
          const newHash = newHashes.get(id);
          if (newHash !== undefined && newHash !== oldHash) changedContractIds.add(id);
        }
        const directlyChangedQuestions = command.questions.filter((question) => {
          const previous = next.questions.find((item) => item.questionId === question.questionId);
          return Boolean(previous && (
            previous.contractRef.id !== question.contractRef.id
            || previous.contractRef.sha256 !== question.contractRef.sha256
            || previous.sharedContractRefs.slice().sort().join("\n") !== question.sharedContractRefs.slice().sort().join("\n")
            || changedContractIds.has(question.contractRef.id)
            || question.sharedContractRefs.some((id) => changedContractIds.has(id))
          ));
        }).map((question) => question.questionId);
        next.questions = command.questions;
        if (directlyChangedQuestions.length > 0) {
          const rollbackId = randomUUID();
          const affected = new Set(dependentQuestionIds(next.questions, directlyChangedQuestions));
          next.questions = next.questions.map((question) => affected.has(question.questionId) ? {
            ...question,
            status: "stale" as const,
            staleBy: [...new Set([...question.staleBy, rollbackId])],
          } : question);
          next.milestones = next.milestones.map((milestone) => milestone.stage === 4
            ? { ...milestone, status: "in_progress" as const, staleBy: [...new Set([...milestone.staleBy, rollbackId])], updatedAt: now }
            : milestone.stage >= 5 && milestone.stage <= 8 && milestone.status !== "not_started"
              ? { ...milestone, status: "stale" as const, staleBy: [...new Set([...milestone.staleBy, rollbackId])], updatedAt: now }
              : milestone);
          next.rollbacks.push({
            rollbackId,
            source: "shared_contract_change",
            targetStage: 4,
            targetQuestion: directlyChangedQuestions[0] ?? null,
            invalidatedIds: [...changedContractIds],
            reason: `Question/shared contract changed: ${directlyChangedQuestions.join(", ")}`,
            createdAt: now,
          });
          next.provenance = staleProvenance(next, changedContractIds, rollbackId);
        }
      }
      for (const question of command.questions.filter((item) => item.status === "satisfied" && (item.checkpointGateId || item.routeGateId))) {
        const checkpoint = next.gateHistory.find((gate) => gate.gateId === question.checkpointGateId);
        if (!checkpoint || checkpoint.gate !== "question_checkpoint" || checkpoint.status !== "accepted") {
          throw new Error(`Question ${question.questionId} cannot be satisfied before an accepted checkpoint gate`);
        }
        if (checkpoint.target.questionId !== question.questionId) throw new Error("Checkpoint belongs to another question");
        assertQuestionGateMatches(next, checkpoint);
        if (question.routeUncertainty === "material") {
          const route = next.gateHistory.find((gate) => gate.gateId === question.routeGateId);
          if (!route || route.gate !== "route" || route.status !== "accepted") {
            throw new Error(`Question ${question.questionId} requires an accepted route gate`);
          }
        }
      }
      break;
    case "request_gate":
      next.openGates = [...next.openGates.filter((gate) => gate.gateId !== command.gate.gateId), command.gate];
      if (command.gate.target.questionId) {
        next.questions = next.questions.map((question) => question.questionId !== command.gate.target.questionId ? question : {
          ...question,
          routeGateId: command.gate.gate === "route" ? command.gate.gateId : question.routeGateId,
          checkpointGateId: command.gate.gate === "question_checkpoint" ? command.gate.gateId : question.checkpointGateId,
        });
      }
      next.status = "waiting_for_user";
      break;
    case "resolve_gate": {
      const gate = next.openGates.find((item) => item.gateId === command.gateId);
      if (!gate) throw new Error("The HaJiMi gate is no longer active");
      if (command.decision === "accepted") assertQuestionGateMatches(next, gate);
      const decided = { ...gate, status: command.decision, decidedAt: now, decisionNote: command.note };
      next.openGates = next.openGates.filter((item) => item.gateId !== command.gateId);
      next.gateHistory.push(decided);
      if (gate.target.questionId) {
        const affected = new Set(dependentQuestionIds(next.questions, [gate.target.questionId]));
        next.questions = next.questions.map((question) => {
          if (question.questionId === gate.target.questionId && command.decision === "accepted") {
            return { ...question, status: gate.gate === "question_checkpoint" ? "satisfied" as const : "in_progress" as const };
          }
          if (command.decision !== "accepted" && affected.has(question.questionId)) {
            return { ...question, status: "stale" as const, staleBy: [...new Set([...question.staleBy, gate.gateId])] };
          }
          return question;
        });
        if (command.decision !== "accepted") {
          next.milestones = next.milestones.map((milestone) => milestone.stage === 4
            ? { ...milestone, status: "in_progress" as const, staleBy: [...new Set([...milestone.staleBy, gate.gateId])], updatedAt: now }
            : milestone.stage >= 5 && milestone.stage <= 8 && milestone.status !== "not_started"
              ? { ...milestone, status: "stale" as const, staleBy: [...new Set([...milestone.staleBy, gate.gateId])], updatedAt: now }
              : milestone);
        }
        if (command.decision === "accepted" && gate.gate === "question_checkpoint" && next.questions.length > 0 && next.questions.every((question) => question.status === "satisfied")) {
          next.milestones = next.milestones.map((milestone) => milestone.stage !== 4 ? milestone : {
            ...milestone,
            requirements: milestone.requirements.map((requirement) => requirement.id !== "question_packets" ? requirement : {
              ...requirement,
              status: "satisfied" as const,
              evidenceRefs: next.questions.map((question) => question.checkpointGateId!).filter(Boolean),
            }),
            updatedAt: now,
          });
        }
      }
      next.status = command.decision === "accepted" && gate.gate === "final_delivery" ? "completed" : "active";
      next.nextAction = command.decision === "accepted"
        ? gate.gate === "final_delivery" ? "Delivery accepted." : "Continue with the accepted route."
        : command.decision === "rework" ? "Revise the work using the gate feedback." : "Stop the rejected route and propose an alternative.";
      break;
    }
    case "rollback": {
      const affectedQuestions = new Set(dependentQuestionIds(next.questions, command.record.targetQuestion
        ? [command.record.targetQuestion] : command.record.targetStage <= 4 ? next.questions.map(item => item.questionId) : []));
      const invalidatedIds = new Set(command.record.invalidatedIds);
      for (const question of next.questions.filter(item => affectedQuestions.has(item.questionId))) {
        for (const id of [...question.experimentRefs, ...question.evidenceRefs]) invalidatedIds.add(id);
      }
      // A local rollback must not silently invalidate another accepted question's shared run.
      const explicitlyInvalidated = staleProvenance(next, new Set(command.record.invalidatedIds), command.record.rollbackId);
      const derivedInvalidation = staleProvenance(next, invalidatedIds, command.record.rollbackId);
      for (const question of next.questions.filter(item => !affectedQuestions.has(item.questionId) && item.status === "satisfied")) {
        const unexpectedlyStale = question.experimentRefs.some(id =>
          derivedInvalidation.experiments.some(item => item.experimentId === id && item.status === "stale")
          && !explicitlyInvalidated.experiments.some(item => item.experimentId === id && item.status === "stale"))
          || question.evidenceRefs.some(id =>
            derivedInvalidation.evidence.some(item => item.evidenceId === id && item.status === "stale")
            && !explicitlyInvalidated.evidence.some(item => item.evidenceId === id && item.status === "stale"));
        if (unexpectedlyStale) throw new Error(`Rollback would invalidate shared evidence used by accepted question ${question.questionId}. For work-packet binding only, use hajimi_set_questions, preserve accepted packets, and submit changed packets for checkpoint review. If computation is genuinely invalid, explicitly list its experiment/evidence or changed artifact IDs in invalidatedIds.`);
      }
      const supersededGates = next.openGates.filter(gate => gate.target.questionId && affectedQuestions.has(gate.target.questionId));
      next.openGates = next.openGates.filter(gate => !supersededGates.includes(gate));
      next.gateHistory.push(...supersededGates.map(gate => ({ ...gate, status: "rework" as const,
        decidedAt: now, decisionNote: command.record.reason })));
      next.questions = next.questions.map((item) => affectedQuestions.has(item.questionId) ? {
        ...item,
        checkpointGateId: undefined,
        status: "stale" as const,
        staleBy: [...new Set([...item.staleBy, command.record.rollbackId])],
      } : item);
      next.milestones = next.milestones.map((item) => {
        const locallyAffected = command.record.targetQuestion !== null
          ? item.stage === 4 || (item.stage >= 5 && item.stage <= 8)
          : item.stage >= command.record.targetStage;
        if (!locallyAffected || (item.status === "not_started" && item.stage > command.record.targetStage)) return item;
        return {
          ...item,
          status: command.record.targetQuestion !== null && item.stage === 4 ? "in_progress" as const : "stale" as const,
          staleBy: [...new Set([...item.staleBy, command.record.rollbackId])],
          updatedAt: now,
        };
      });
      next.rollbacks.push({ ...command.record, invalidatedIds: [...invalidatedIds] });
      next.focus = { stage: command.record.targetStage, questionId: command.record.targetQuestion };
      next.provenance = staleProvenance(next, invalidatedIds, command.record.rollbackId);
      if (command.record.targetQuestion === null && command.record.targetStage <= 7) {
        next.provenance.freezes = next.provenance.freezes.map(item => item.status === "active" ? { ...item, status: "stale" as const } : item);
        next.provenance.bindings = next.provenance.bindings.map(item => ["candidate", "published"].includes(item.status)
          ? { ...item, status: "stale" as const, staleBy: [...new Set([...item.staleBy, command.record.rollbackId])] }
          : item);
      } else if (command.record.targetQuestion === null && command.record.targetStage === 8) {
        next.provenance.bindings = next.provenance.bindings.map(item => item.kind === "paper" && item.status === "candidate"
          ? { ...item, status: "stale" as const, staleBy: [...new Set([...item.staleBy, command.record.rollbackId])] }
          : item);
      }
      next.status = "active";
      next.nextAction = `Rework from stage ${command.record.targetStage}${command.record.targetQuestion ? ` for ${command.record.targetQuestion}` : ""}.`;
      break;
    }
    case "record_experiment":
      next.provenance.experiments = upsertById(next.provenance.experiments, command.experiment, (item) => item.experimentId);
      break;
    case "set_experiment_selection": {
      let found = false;
      next.provenance.experiments = next.provenance.experiments.map((experiment) => {
        if (experiment.experimentId !== command.experimentId) return experiment;
        found = true;
        const status = command.selection === "superseded" ? "superseded" as const
          : command.selection === "invalidated" ? "stale" as const
            : experiment.status;
        return {
          ...experiment,
          selection: command.selection,
          status,
          staleBy: command.reason && command.selection !== "selected"
            ? [...new Set([...experiment.staleBy, command.reason])]
            : experiment.staleBy,
        };
      });
      if (!found) throw new Error(`Unknown experiment ${command.experimentId}`);
      if (command.selection === "superseded" || command.selection === "invalidated") {
        next.provenance = staleProvenance(next, new Set([command.experimentId]), command.reason ?? command.selection);
      }
      break;
    }
    case "record_evidence":
      next.provenance.evidence = upsertById(next.provenance.evidence, command.evidence, (item) => item.evidenceId);
      break;
    case "record_claim":
      next.provenance.claims = upsertById(next.provenance.claims, command.claim, (item) => item.claimId);
      break;
    case "freeze_evidence":
      next.provenance.freezes = upsertById(next.provenance.freezes, command.freeze, (item) => item.freezeId);
      next.provenance.evidence = next.provenance.evidence.map((item) => command.freeze.evidenceRefs.includes(item.evidenceId) ? { ...item, status: "frozen" } : item);
      next.milestones = next.milestones.map((milestone) => milestone.stage !== 7 ? milestone : {
        ...milestone,
        requirements: milestone.requirements.map((requirement) => requirement.id !== "evidence_freeze" ? requirement : {
          ...requirement,
          status: "satisfied" as const,
          evidenceRefs: [command.freeze.freezeId],
        }),
        updatedAt: now,
      });
      break;
    case "bind_publication":
      assertPublicationMayConsume(next, command.binding.claimRefs);
      next.provenance.bindings = upsertById(next.provenance.bindings, command.binding, (item) => item.bindingId);
      break;
    case "reconcile_provenance":
      next.provenance = staleProvenance(next, new Set(command.invalidatedIds), command.reason);
      if (command.invalidatedIds.length > 0) {
        next.milestones = next.milestones.map((milestone) => milestone.stage >= 5 && milestone.stage <= 8 && milestone.status !== "not_started"
          ? { ...milestone, status: "stale" as const, staleBy: [...new Set([...milestone.staleBy, command.reason])], updatedAt: now }
          : milestone);
      }
      break;
    case "record_capability_routes":
      for (const route of command.routes.filter((item) => item.persisted)) {
        next.capabilityRoutes = upsertById(next.capabilityRoutes, route, (item) => item.routeId);
      }
      break;
  }
  next.updatedAt = now;
  return next;
}

export function assertPublicationMayConsume(state: HajimiWorkflowState, claimRefs: string[]): void {
  if (claimRefs.length === 0) return; // Ordinary paper delivery does not require the optional evidence ledger.
  const activeFreezeClaims = new Set(
    state.provenance.freezes.filter((item) => item.status === "active").flatMap((item) => item.claimRefs),
  );
  for (const claimRef of claimRefs) {
    const claim = state.provenance.claims.find((item) => item.claimId === claimRef);
    if (!claim || !["supported", "published"].includes(claim.status) || !activeFreezeClaims.has(claimRef)) {
      throw new Error(`Publication claim ${claimRef} is not supported by an active evidence freeze`);
    }
    for (const evidenceRef of claim.evidenceRefs) {
      const evidence = state.provenance.evidence.find((item) => item.evidenceId === evidenceRef);
      if (!evidence || evidence.status !== "frozen" || evidence.domainValidationStatus !== "accepted") {
        throw new Error(`Publication evidence ${evidenceRef} is not frozen and domain-accepted`);
      }
    }
  }
}

export function createRollback(input: Omit<HajimiRollbackRecord, "rollbackId" | "createdAt">): HajimiRollbackRecord {
  return { ...input, rollbackId: randomUUID(), createdAt: new Date().toISOString() };
}
