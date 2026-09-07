export const HAJIMI_STAGE_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

export type HajimiStageId = (typeof HAJIMI_STAGE_IDS)[number];
export type HajimiMilestoneStatus =
  | "not_started"
  | "in_progress"
  | "satisfied"
  | "stale"
  | "blocked"
  | "waived";
export type HajimiRequirementStatus = "unmet" | "satisfied" | "waived" | "blocked";
export type HajimiPlanNodeStatus = "pending" | "active" | "completed" | "blocked" | "discarded";

export interface HajimiWorkflowVersionPin {
  id: string;
  version: string;
  protocolVersion: "hajimi.workflow-protocol.v1";
  definitionHash: string;
  sourceManifestHash: string;
}

export interface HajimiRequirementDefinition {
  id: string;
  summary: string;
  evaluator: "human" | "input_manifest" | "question_packets" | "provenance_freeze" | "delivery_validation";
  severity: "required" | "recommended";
}

export interface HajimiStageDefinition {
  id: HajimiStageId;
  title: string;
  summary: string;
  dependencies: HajimiStageId[];
  stageCard: string;
  requirements: HajimiRequirementDefinition[];
}

export interface HajimiWorkflowDefinition {
  schemaVersion: "hajimi.workflow-definition.v1";
  id: "modeling-core";
  version: string;
  protocolVersion: "hajimi.workflow-protocol.v1";
  sourceManifestHash: string;
  stages: HajimiStageDefinition[];
}

export interface HajimiRequirementState extends HajimiRequirementDefinition {
  status: HajimiRequirementStatus;
  evidenceRefs: string[];
  note?: string;
}

export interface HajimiStageMilestone {
  stage: HajimiStageId;
  title: string;
  status: HajimiMilestoneStatus;
  attempt: number;
  dependencies: HajimiStageId[];
  requirements: HajimiRequirementState[];
  acceptedRefs: string[];
  staleBy: string[];
  updatedAt: string;
}

export interface HajimiMicroPlanNode {
  id: string;
  title: string;
  status: HajimiPlanNodeStatus;
  dependencies: string[];
  outputs: string[];
  evidence?: string[];
  note?: string;
}

export interface HajimiWorkflowFocus {
  stage: HajimiStageId;
  questionId: string | null;
}

export interface HajimiGovernedRef {
  id: string;
  sha256: string;
}

export type HajimiGateType = "route" | "question_checkpoint" | "host_capability" | "evidence_freeze" | "final_delivery";

export interface HajimiWorkflowGate {
  gateId: string;
  gate: HajimiGateType;
  status: "requested" | "accepted" | "rework" | "rejected";
  summary: string;
  target: { stage: HajimiStageId; questionId?: string | null };
  governedRefs: HajimiGovernedRef[];
  requestedAt: string;
  decidedAt?: string;
  decisionNote?: string;
}

export interface HajimiQuestionWorkPacket {
  questionId: string;
  title: string;
  contractRef: HajimiGovernedRef;
  dependencies: string[];
  sharedContractRefs: string[];
  routeUncertainty: "low" | "material";
  candidateRefs: HajimiGovernedRef[];
  selectedCandidateRef: HajimiGovernedRef | null;
  microPlan: HajimiMicroPlanNode[];
  status: "not_started" | "in_progress" | "satisfied" | "stale" | "blocked";
  experimentRefs: string[];
  evidenceRefs: string[];
  localValidationRefs: HajimiGovernedRef[];
  reviewRefs: HajimiGovernedRef[];
  routeGateId?: string;
  checkpointGateId?: string;
  staleBy: string[];
}

export interface HajimiRollbackRecord {
  rollbackId: string;
  source: string;
  targetStage: HajimiStageId;
  targetQuestion: string | null;
  invalidatedIds: string[];
  reason: string;
  createdAt: string;
}

export interface HajimiProvenanceState {
  experiments: HajimiExperimentRecord[];
  evidence: HajimiEvidenceRecord[];
  claims: HajimiClaimRecord[];
  bindings: HajimiPublicationBinding[];
  freezes: HajimiEvidenceFreeze[];
}

export interface HajimiArtifactRef extends HajimiGovernedRef {
  path: string;
  frozenPath: string;
  mediaType: string;
  sizeBytes: number;
}

export interface HajimiExperimentRecord {
  experimentId: string;
  title: string;
  trust: "legacy_unverified" | "attested" | "verified";
  status: "succeeded" | "failed" | "inconclusive" | "stale" | "superseded";
  selection: "candidate" | "selected" | "superseded" | "invalidated";
  command: string;
  codeRefs: HajimiArtifactRef[];
  inputRefs: HajimiArtifactRef[];
  parameterRefs: HajimiArtifactRef[];
  outputRefs: HajimiArtifactRef[];
  environment: Record<string, string>;
  seed?: number;
  exitCode: number | null;
  startedAt: string;
  completedAt: string;
  staleBy: string[];
}

export interface HajimiEvidenceRecord {
  evidenceId: string;
  experimentRefs: string[];
  artifactRefs: string[];
  validationMethod: string;
  status: "attested" | "verified" | "cross_validated" | "frozen" | "stale" | "superseded" | "invalidated";
  domainValidationStatus: "not_reviewed" | "plausible" | "accepted" | "rejected";
  limitations: string[];
  staleBy: string[];
}

export interface HajimiClaimRecord {
  claimId: string;
  text: string;
  kind: "estimate" | "qualitative" | "numeric";
  value?: number | string;
  unit?: string;
  evidenceRefs: string[];
  status: "draft" | "supported" | "published" | "stale" | "superseded" | "invalidated";
  staleBy: string[];
}

export interface HajimiPublicationBinding {
  bindingId: string;
  kind: "figure" | "paper" | "final_answer";
  target: string;
  claimRefs: string[];
  artifactRef?: HajimiArtifactRef;
  claimMarkerRef?: HajimiArtifactRef;
  status: "candidate" | "published" | "stale" | "superseded" | "invalidated";
  staleBy: string[];
}

export interface HajimiEvidenceFreeze {
  freezeId: string;
  evidenceRefs: string[];
  claimRefs: string[];
  governedRefs: HajimiGovernedRef[];
  createdAt: string;
  status: "active" | "stale" | "superseded";
}

export interface HajimiCapabilityRouteDecision {
  routeId: string;
  capabilityId: string;
  capabilityVersion: string;
  sourceHash: string;
  activationReason: string;
  fragmentIds: string[];
  availability: "ready" | "blocked_missing_input";
  stage: HajimiStageId;
  persisted: boolean;
  routedAt: string;
}

export interface HajimiWorkflowState {
  interaction?: HajimiInteraction;
  schemaVersion: "hajimi.workflow-state.v2";
  taskId: string;
  workflowVersion: HajimiWorkflowVersionPin;
  revision: number;
  status: "active" | "waiting_for_user" | "completed";
  currentObjective: string;
  nextAction: string;
  focus: HajimiWorkflowFocus;
  milestones: HajimiStageMilestone[];
  microPlan: HajimiMicroPlanNode[];
  openGates: HajimiWorkflowGate[];
  gateHistory: HajimiWorkflowGate[];
  questions: HajimiQuestionWorkPacket[];
  rollbacks: HajimiRollbackRecord[];
  provenance: HajimiProvenanceState;
  problemTags: string[];
  capabilityGaps: string[];
  capabilityRoutes: HajimiCapabilityRouteDecision[];
  updatedAt: string;
}

export interface HajimiInteraction {
  runtimeFailure?: { message: string; recordedAt: string };
  reviewInput?: { id: string; text: string; stage: HajimiStageId; gateId?: string };
  mode: "unselected" | "automatic" | "supervised";
  stageStartedAt: string;
  pending: { kind: "mode" | "stage" | "final" | "gate"; stage: HajimiStageId; reportPath?: string; gateId?: string } | null;
  reports: Array<{ stage: HajimiStageId; path: string; summary: string; createdAt: string }>;
  reviewedStages: HajimiStageId[];
  finalAccepted: boolean;
  acceptedSubmissionInputs?: { files: HajimiStageFileSnapshot[]; provenanceHash: string; bindingRefs: string[] };
  stageBaseline?: HajimiStageFileSnapshot[];
  nextStageDirection?: { stage: HajimiStageId; text: string };
}

export interface HajimiStageFileSnapshot {
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface HajimiWorkflowHistoryEntry {
  schemaVersion: "hajimi.workflow-history.v1";
  commandId: string;
  kind: string;
  fromRevision: number;
  toRevision: number;
  recordedAt: string;
  detail?: Record<string, unknown>;
}

export function isHajimiStageId(value: number): value is HajimiStageId {
  return Number.isInteger(value) && value >= 0 && value <= 9;
}

export function emptyProvenanceState(): HajimiProvenanceState {
  return { experiments: [], evidence: [], claims: [], bindings: [], freezes: [] };
}
