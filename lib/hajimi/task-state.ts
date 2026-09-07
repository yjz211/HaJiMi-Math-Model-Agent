import { createHash, randomUUID } from "node:crypto";
import { appendFile, lstat, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";

import { canonicalJson, MODELING_WORKFLOW_DEFINITION, sha256Text, workflowVersionPin } from "./workflow-definition.ts";
import { assertGovernedRef, assertQuestionGateMatches, expectedQuestionGateRefs } from "./workflow-reducer.ts";
import { mutateWorkflowState, readWorkflowState, writeWorkflowStateAtomic, withTaskLock } from "./workflow-store.ts";
import type {
  HajimiArtifactRef,
  HajimiMicroPlanNode,
  HajimiWorkflowGate,
  HajimiWorkflowState,
} from "./workflow-types.ts";

export const HAJIMI_METADATA_DIR = ".hajimi";
export type HajimiPlanNode = HajimiMicroPlanNode;
export type HajimiTaskState = HajimiWorkflowState;
export type HajimiGate = HajimiWorkflowGate;
export type HajimiContentRef = HajimiArtifactRef;

export interface HajimiTaskIdentity {
  schemaVersion: "hajimi.task.v1";
  taskId: string;
  title: string;
  createdAt: string;
  skillVersion: string;
}

export interface HajimiTaskSnapshot {
  identity: HajimiTaskIdentity;
  state: HajimiWorkflowState;
}

export interface HajimiValidationSummary {
  schema_version: "hajimi.validation.v1";
  validated_at: string;
  strict: boolean;
  passed: boolean;
  summary: { passed: number; failed: number };
  checks?: Array<{ name: string; passed: boolean; severity?: string; detail?: string }>;
}

interface LegacyStateV1 {
  schemaVersion: "hajimi.state.v1";
  revision: number;
  status: HajimiWorkflowState["status"];
  currentObjective: string;
  nextAction: string;
  plan: Array<Omit<HajimiMicroPlanNode, "dependencies" | "outputs"> & { dependencies?: string[]; outputs?: string[] }>;
  activeGate?: {
    gateId: string;
    gate: "route" | "host_capability" | "final_delivery";
    status: "requested" | "accepted" | "rework" | "rejected";
    summary: string;
    requestedAt: string;
  } | null;
  updatedAt: string;
}

function metadataPath(cwd: string, name: string): string {
  return join(resolve(cwd), HAJIMI_METADATA_DIR, name);
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJsonCreate(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
}

function createInitialState(identity: HajimiTaskIdentity, now: string): HajimiWorkflowState {
  return {
    schemaVersion: "hajimi.workflow-state.v2",
    taskId: identity.taskId,
    workflowVersion: workflowVersionPin(),
    revision: 0,
    status: "active",
    currentObjective: "Verify the task materials and establish the problem contract.",
    nextAction: "Inspect and freeze input files for stage 0.",
    focus: { stage: 0, questionId: null },
    milestones: MODELING_WORKFLOW_DEFINITION.stages.map((item) => ({
      stage: item.id,
      title: item.title,
      status: item.id === 0 ? "in_progress" : "not_started",
      attempt: item.id === 0 ? 1 : 0,
      dependencies: item.dependencies,
      requirements: item.requirements.map((requirement) => ({ ...requirement, status: "unmet", evidenceRefs: [] })),
      acceptedRefs: [],
      staleBy: [],
      updatedAt: now,
    })),
    microPlan: [{
      id: "stage-0-inputs",
      title: "Inspect and freeze the problem inputs",
      status: "active",
      dependencies: [],
      outputs: [".hajimi/input-manifest.json"],
    }],
    openGates: [],
    gateHistory: [],
    questions: [],
    rollbacks: [],
    provenance: { experiments: [], evidence: [], claims: [], bindings: [], freezes: [] },
    problemTags: [],
    capabilityGaps: [],
    capabilityRoutes: [],
    updatedAt: now,
  };
}

function migrateLegacyState(identity: HajimiTaskIdentity, legacy: LegacyStateV1): HajimiWorkflowState {
  const now = new Date().toISOString();
  const next = createInitialState(identity, now);
  next.revision = legacy.revision;
  next.status = legacy.status;
  next.currentObjective = legacy.currentObjective;
  next.nextAction = legacy.nextAction;
  next.updatedAt = legacy.updatedAt || now;
  next.microPlan = legacy.plan.map((item) => ({
    ...item,
    dependencies: item.dependencies ?? [],
    outputs: item.outputs ?? item.evidence ?? [],
  }));
  // A legacy seven-node plan is only a dynamic MicroPlan donor. Its node names
  // and completion flags never prove that any governed 0-9 milestone was
  // accepted, so migration deliberately resumes at stage 0.
  next.focus = { stage: 0, questionId: null };
  if (legacy.activeGate?.status === "requested") {
    next.openGates = [{ ...legacy.activeGate, target: { stage: 0, questionId: null }, governedRefs: [] }];
  } else if (legacy.activeGate) {
    next.gateHistory = [{ ...legacy.activeGate, target: { stage: 0, questionId: null }, governedRefs: [], decidedAt: legacy.updatedAt }];
  }
  return next;
}

async function readIdentity(cwd: string): Promise<HajimiTaskIdentity | null> {
  try {
    return await readJson<HajimiTaskIdentity>(metadataPath(cwd, "task.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Pure read: never creates task directories or migrates data. */
export async function readHajimiTask(cwd: string): Promise<HajimiTaskSnapshot | null> {
  const identity = await readIdentity(cwd);
  if (!identity) return null;
  const state = await readWorkflowState(cwd);
  if (!state || state.schemaVersion !== "hajimi.workflow-state.v2") return null;
  return { identity, state };
}

/** Write path: initializes or migrates a task before AgentSession work. */
export async function ensureHajimiTask(cwd: string): Promise<HajimiTaskSnapshot> {
  const root = resolve(cwd);
  const rootStats = await stat(root);
  if (!rootStats.isDirectory()) throw new Error(`HaJiMi task root is not a directory: ${root}`);
  await Promise.all([
    mkdir(join(root, "input"), { recursive: true }),
    mkdir(join(root, "src"), { recursive: true }),
    mkdir(join(root, "work"), { recursive: true }),
    mkdir(join(root, "data", "derived"), { recursive: true }),
    mkdir(join(root, "figures"), { recursive: true }),
    mkdir(join(root, "paper"), { recursive: true }),
    mkdir(join(root, "output"), { recursive: true }),
    mkdir(metadataPath(root, "checkpoints"), { recursive: true }),
    mkdir(metadataPath(root, join("cas", "sha256")), { recursive: true }),
  ]);

  let identity = await readIdentity(root);
  if (!identity) {
    const candidate: HajimiTaskIdentity = {
      schemaVersion: "hajimi.task.v1",
      taskId: randomUUID(),
      title: basename(root),
      createdAt: new Date().toISOString(),
      skillVersion: MODELING_WORKFLOW_DEFINITION.version,
    };
    try {
      await writeJsonCreate(metadataPath(root, "task.json"), candidate);
      identity = candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      identity = await readIdentity(root);
    }
  }
  if (!identity) throw new Error("Failed to initialize HaJiMi task identity");

  const statePath = metadataPath(root, "state.json");
  let raw: HajimiWorkflowState | LegacyStateV1 | null = null;
  try {
    raw = await readJson<HajimiWorkflowState | LegacyStateV1>(statePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      const recovered = await readWorkflowState(root);
      if (recovered) raw = recovered;
      else throw error;
    }
  }
  let state: HajimiWorkflowState;
  if (!raw) {
    state = createInitialState(identity, new Date().toISOString());
    await writeWorkflowStateAtomic(root, state);
  } else if (raw.schemaVersion === "hajimi.state.v1") {
    state = migrateLegacyState(identity, raw);
    await writeWorkflowStateAtomic(root, state);
    await appendFile(metadataPath(root, "workflow-history.jsonl"), `${JSON.stringify({
      schemaVersion: "hajimi.workflow-history.v1",
      commandId: randomUUID(),
      kind: "migrate_v1_to_v2",
      fromRevision: raw.revision,
      toRevision: state.revision,
      recordedAt: new Date().toISOString(),
    })}\n`, "utf8");
  } else {
    state = raw;
  }
  if (state.taskId !== identity.taskId) throw new Error("HaJiMi task identity does not match workflow state");
  return { identity, state };
}

async function mutate(
  cwd: string,
  expectedRevision: number,
  command: Parameters<typeof mutateWorkflowState>[0]["command"],
): Promise<HajimiWorkflowState> {
  return mutateWorkflowState({ cwd, expectedRevision, command, ensure: async () => (await ensureHajimiTask(cwd)).state });
}

export async function updateHajimiState(
  cwd: string,
  expectedRevision: number,
  update: Pick<HajimiWorkflowState, "currentObjective" | "nextAction" | "microPlan">,
): Promise<HajimiWorkflowState> {
  return mutate(cwd, expectedRevision, { kind: "replace_micro_plan", ...update });
}

export async function requestHajimiGate(
  cwd: string,
  expectedRevision: number,
  gate: HajimiWorkflowGate["gate"],
  summary: string,
  target: HajimiWorkflowGate["target"],
  governedRefs: HajimiWorkflowGate["governedRefs"] = [],
): Promise<HajimiWorkflowState> {
  const current = (await ensureHajimiTask(cwd)).state;
  if ((gate === "route" || gate === "question_checkpoint") && target.questionId) {
    const question = current.questions.find(item => item.questionId === target.questionId);
    if (!question) throw new Error(`Unknown gate question: ${target.questionId}`);
    governedRefs = expectedQuestionGateRefs(current, question, gate);
  }
  if (gate === "final_delivery") {
    const candidates = current.provenance.bindings.filter(binding => binding.kind === "paper" && binding.status === "candidate");
    governedRefs = candidates.map(binding => ({ id: binding.bindingId, sha256: sha256Text(canonicalJson(binding)) }));
  }
  governedRefs.forEach((ref) => assertGovernedRef(ref));
  if ((gate === "route" || gate === "question_checkpoint") && target.questionId) {
    if (!current.questions.some((question) => question.questionId === target.questionId)) {
      throw new Error(`Unknown gate question: ${target.questionId}`);
    }
    assertQuestionGateMatches(current, { gate, target, governedRefs });
  }
  if (gate === "evidence_freeze" && governedRefs.length === 0) {
    throw new Error("evidence_freeze gate must bind governed refs");
  }
  if (gate === "final_delivery") {
    const stage8 = current.milestones.find((milestone) => milestone.stage === 8);
    const validation = await readHajimiValidation(cwd);
    if (stage8?.status !== "satisfied") throw new Error("Final delivery gate requires satisfied stage 8");
    if (!validation?.passed || !validation.strict) throw new Error("Final delivery gate requires a passing strict delivery validation");
    const candidates = current.provenance.bindings.filter((binding) => binding.kind === "paper" && binding.status === "candidate");
    if (candidates.length === 0) {
      throw new Error("Final delivery gate requires a claim-bound paper candidate");
    }
    const expected = candidates.map((binding) => ({ id: binding.bindingId, sha256: sha256Text(canonicalJson(binding)) }));
    if (!sameRefs(governedRefs, expected)) throw new Error("Final delivery gate must bind the exact paper candidate hashes");
  }
  return mutate(cwd, expectedRevision, {
    kind: "request_gate",
    gate: { gateId: randomUUID(), gate, status: "requested", summary, target, governedRefs, requestedAt: new Date().toISOString() },
  });
}

export async function resolveHajimiGate(
  cwd: string,
  expectedRevision: number,
  gateId: string,
  decision: "accepted" | "rework" | "rejected",
  note?: string,
): Promise<HajimiWorkflowState> {
  if (decision === "accepted") {
    const current = (await ensureHajimiTask(cwd)).state;
    const gate = current.openGates.find((item) => item.gateId === gateId);
    if (!gate) throw new Error("The HaJiMi gate is no longer active");
    assertQuestionGateMatches(current, gate);
    if (gate.gate === "final_delivery") {
      const candidates = current.provenance.bindings.filter((binding) => binding.kind === "paper" && binding.status === "candidate");
      const expected = candidates.map((binding) => ({ id: binding.bindingId, sha256: sha256Text(canonicalJson(binding)) }));
      if (!sameRefs(gate.governedRefs, expected)) throw new Error("Final delivery candidate changed after the gate was requested");
    }
  }
  return mutate(cwd, expectedRevision, { kind: "resolve_gate", gateId, decision, note });
}

function sameRefs(left: HajimiWorkflowGate["governedRefs"], right: HajimiWorkflowGate["governedRefs"]): boolean {
  const normalize = (refs: HajimiWorkflowGate["governedRefs"]) => [...refs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((ref) => `${ref.id}:${ref.sha256}`);
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

export async function readHajimiValidation(cwd: string): Promise<HajimiValidationSummary | null> {
  try {
    return await readJson<HajimiValidationSummary>(metadataPath(cwd, "validation.json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Legacy audit stream retained for compatibility; managed experiments live in workflow state. */
export async function appendExperiment(cwd: string, record: Record<string, unknown>): Promise<void> {
  await ensureHajimiTask(cwd);
  await appendFile(metadataPath(cwd, "experiments.jsonl"), `${JSON.stringify({ schemaVersion: "hajimi.experiment.v1", recordedAt: new Date().toISOString(), ...record })}\n`, "utf8");
}

export async function registerArtifact(cwd: string, artifactPath: string, note?: string): Promise<HajimiContentRef> {
  const root = resolve(cwd);
  const absolutePath = resolve(root, artifactPath);
  const rel = relative(root, absolutePath);
  if (!rel || rel.startsWith("..") || rel.split(/[\\/]/).includes(HAJIMI_METADATA_DIR)) {
    throw new Error("Artifact must be a task file outside .hajimi");
  }
  const before = await lstat(absolutePath);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error("Artifact must be a regular file");
  const content = await readFile(absolutePath);
  const after = await lstat(absolutePath);
  if (!after.isFile() || after.isSymbolicLink() || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || content.length !== after.size) {
    throw new Error(`Artifact changed while it was being registered: ${rel}`);
  }
  const sha256 = hashBytes(content);
  const ref: HajimiContentRef = {
    id: `sha256:${sha256}`,
    path: rel.replaceAll("\\", "/"),
    sizeBytes: content.length,
    sha256,
    mediaType: mediaTypeFor(absolutePath),
    frozenPath: `.hajimi/cas/sha256/${sha256.slice(0, 2)}/${sha256}`,
  };
  const frozenAbsolute = metadataPath(root, join("cas", "sha256", sha256.slice(0, 2), sha256));
  await mkdir(dirname(frozenAbsolute), { recursive: true });
  try {
    const frozen = await readFile(frozenAbsolute);
    if (hashBytes(frozen) !== sha256) throw new Error(`Content-addressed artifact is corrupted: ${ref.frozenPath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await writeFile(frozenAbsolute, content, { flag: "wx" });
  }
  await appendFile(metadataPath(root, "artifacts.jsonl"), `${JSON.stringify({ schemaVersion: "hajimi.artifact.v2", registeredAt: new Date().toISOString(), note, ...ref })}\n`, "utf8");
  return ref;
}

export async function freezeHajimiInputs(cwd: string): Promise<HajimiContentRef[]> {
  return withTaskLock(cwd, () => freezeInputsLocked(cwd));
}

async function freezeInputsLocked(cwd: string): Promise<HajimiContentRef[]> {
  await ensureHajimiTask(cwd);
  const root = resolve(cwd);
  const files = await walkRegularFiles(join(root, "input"));
  if (!files.length) throw new Error("请先在聊天框上传题目材料，再确认冻结输入。");
  const manifestPath = metadataPath(root, "input-manifest.json");
  try {
    const existing = await readJson<{ files: HajimiContentRef[] }>(manifestPath);
    const currentPaths = files.map((file) => relative(root, file).replaceAll("\\", "/"));
    if (JSON.stringify(currentPaths) !== JSON.stringify(existing.files.map((ref) => ref.path))) {
      throw new Error("Frozen input file set changed after initial import");
    }
    for (const ref of existing.files) {
      const info = await lstat(resolve(root, ref.path));
      if (!info.isFile() || info.isSymbolicLink() || info.size !== ref.sizeBytes || await hashFile(resolve(root, ref.path)) !== ref.sha256) {
        throw new Error(`Frozen input changed after initial import: ${ref.path}`);
      }
    }
    return existing.files;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const refs: HajimiContentRef[] = [];
  for (const file of files) refs.push(await registerArtifact(root, relative(root, file), "frozen input"));
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: "hajimi.input-manifest.v1", frozenAt: new Date().toISOString(), files: refs }, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return refs;
}

export async function createHajimiCheckpoint(cwd: string, summary: string): Promise<string> {
  const snapshot = await ensureHajimiTask(cwd);
  const payload = { schemaVersion: "hajimi.checkpoint.v2", checkpointId: randomUUID(), createdAt: new Date().toISOString(), summary, ...snapshot };
  const name = `${String(snapshot.state.revision).padStart(6, "0")}-${payload.checkpointId}.json`;
  await writeJsonCreate(metadataPath(cwd, join("checkpoints", name)), payload);
  return name;
}

async function walkRegularFiles(root: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Input symlink is not allowed: ${path}`);
    if (entry.isDirectory()) output.push(...await walkRegularFiles(path));
    else if (entry.isFile()) output.push(path);
  }
  return output.sort();
}

async function hashFile(path: string): Promise<string> {
  return hashBytes(await readFile(path));
}

function hashBytes(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function mediaTypeFor(path: string): string {
  return ({
    ".csv": "text/csv",
    ".json": "application/json",
    ".md": "text/markdown",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".tex": "application/x-tex",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  } as Record<string, string>)[extname(path).toLowerCase()] ?? "application/octet-stream";
}
