import { randomUUID } from "node:crypto";
import { join, relative, resolve } from "node:path";

import { StringEnum } from "@earendil-works/pi-ai";
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type ExtensionAPI,
  type InlineExtension,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { HAJIMI_IDENTITY_KERNEL, projectWorkflowContext } from "./context-projector.ts";
import { installCacheDiagnostics } from "./cache-diagnostics.ts";
import { automaticRunLocked, AUTOMATIC_LOCK_MESSAGE } from "./automatic-policy.ts";
import { routeCapabilities } from "./capability-router.ts";
import { readStage8, moveStage8, assertStage8 } from './stage8-phases.ts';
import { beginFigurePlan, requireFigurePlan, validateFigurePlan } from './figure-plan.ts';
import { STAGE_GUIDANCE } from "./modeling-project.ts";
import { finishStage, handleReviewInput, interactionFor, reviewPrompt, saveInteraction, recordReviewInput, acceptInterpretedReview } from "./interaction.ts";
import { deliveryFingerprint, sealDeliveryValidation } from "./delivery-seal.ts";
import { captureStageFiles } from "./stage-files.ts";
import { runSubmissionAction } from "./submission-service.ts";
import {
  appendExperiment,
  createHajimiCheckpoint,
  ensureHajimiTask,
  freezeHajimiInputs,
  registerArtifact,
  requestHajimiGate,
  resolveHajimiGate,
  updateHajimiState,
  type HajimiPlanNode,
} from "./task-state.ts";
import { isHajimiStageId } from "./workflow-types.ts";
import {
  bindPublication,
  freezeSelectedEvidence,
  recordClaim,
  recordEvidence,
  recordManagedExperiment,
  reconcileProvenance,
  replaceQuestionPackets,
  rollbackWorkflow,
  setMilestone,
  setExperimentSelection,
  setRequirement,
  setWorkflowFocus,
} from "./workflow-service.ts";
import { createWorkspaceBackend, type WorkspaceBackend } from "./workspace-backend-factory.ts";

export const HAJIMI_TOOL_NAMES = [
  "hajimi_stage8_phase",
  "hajimi_validate_figure_plan",
  "hajimi_generate_submission",
  "hajimi_accept_user_review",
  "hajimi_task_status",
  "hajimi_update_plan",
  "hajimi_set_focus",
  "hajimi_set_milestone",
  "hajimi_set_requirement",
  "hajimi_set_questions",
  "hajimi_rollback",
  "hajimi_freeze_inputs",
  "hajimi_record_experiment",
  "hajimi_run_managed_experiment",
  "hajimi_select_experiment",
  "hajimi_record_evidence",
  "hajimi_record_claim",
  "hajimi_freeze_evidence",
  "hajimi_bind_publication",
  "hajimi_register_artifact",
  "hajimi_checkpoint",
  "hajimi_validate_delivery",
  "hajimi_request_gate",
] as const;

const HAJIMI_PLAN_TOOL_NAMES = [
  "hajimi_task_status",
  "hajimi_update_plan",
  "hajimi_set_focus",
  "hajimi_set_questions",
  "hajimi_checkpoint",
  "hajimi_request_gate",
] as const;

export function withHajimiTools(
  toolNames: readonly string[],
  mode: "plan" | "ask" | "full" = "full",
): string[] {
  const hajimiTools = mode === "plan" ? HAJIMI_PLAN_TOOL_NAMES : HAJIMI_TOOL_NAMES;
  return [...new Set([...toolNames, ...hajimiTools])];
}

export interface HajimiCoreOptions {
  cwd: string;
  productRoot: string;
  distribution?: string;
  getMode?: () => "plan" | "ask" | "full";
}

const ALWAYS_STAGE_TOOLS = new Set([
  "hajimi_accept_user_review",
  "hajimi_task_status", "hajimi_update_plan", "hajimi_set_focus", "hajimi_set_milestone",
  "hajimi_set_requirement", "hajimi_set_questions", "hajimi_rollback", "hajimi_freeze_inputs",
  "hajimi_register_artifact", "hajimi_checkpoint", "hajimi_request_gate",
]);

export function hajimiToolsForStage(stage: number): string[] {
  const allowed = new Set(ALWAYS_STAGE_TOOLS);
  if (stage >= 3 && stage <= 8) {
    allowed.add("hajimi_record_experiment");
    allowed.add("hajimi_run_managed_experiment");
    allowed.add("hajimi_select_experiment");
    allowed.add("hajimi_record_evidence");
    allowed.add("hajimi_record_claim");
  }
  if (stage === 7 || stage === 8) allowed.add("hajimi_freeze_evidence");
  if (stage === 8) allowed.add("hajimi_validate_figure_plan");
  if (stage === 9) allowed.add("hajimi_generate_submission");
  if (stage === 8) {
    allowed.add("hajimi_stage8_phase");
    allowed.add("hajimi_bind_publication");
    allowed.add("hajimi_validate_delivery");
  }
  return HAJIMI_TOOL_NAMES.filter((name) => allowed.has(name));
}

function applyStageToolPolicy(pi: ExtensionAPI, stage: number, mode: "plan" | "ask" | "full"): void {
  if (typeof pi.getActiveTools !== "function" || typeof pi.setActiveTools !== "function") return;
  const permitted = new Set(hajimiToolsForStage(stage));
  const modePermitted = new Set(mode === "plan" ? HAJIMI_PLAN_TOOL_NAMES : HAJIMI_TOOL_NAMES);
  const active = pi.getActiveTools();
  const nonHajimi = active.filter((name) => !(HAJIMI_TOOL_NAMES as readonly string[]).includes(name));
  const next = [...nonHajimi, ...HAJIMI_TOOL_NAMES.filter((name) => permitted.has(name) && modePermitted.has(name))];
  if (next.length !== active.length || next.some((name, index) => name !== active[index])) pi.setActiveTools(next);
}

const HAJIMI_TOOL_OUTPUT_MAX_BYTES = 50 * 1024;
const HAJIMI_TOOL_OUTPUT_MAX_LINES = 2_000;

export function boundHajimiToolText(
  text: string,
  maxBytes = HAJIMI_TOOL_OUTPUT_MAX_BYTES,
  maxLines = HAJIMI_TOOL_OUTPUT_MAX_LINES,
): { text: string; truncated: boolean; originalBytes: number; originalLines: number } {
  const originalBytes = Buffer.byteLength(text, "utf8");
  const originalLines = text ? text.split("\n").length : 0;
  if (originalBytes <= maxBytes && originalLines <= maxLines) {
    return { text, truncated: false, originalBytes, originalLines };
  }
  const notice = `\n\n[HaJiMi tool output truncated: original ${originalLines} lines / ${originalBytes} bytes. Full experiment and validation output remains in registered workspace artifacts.]`;
  const byteBudget = Math.max(0, maxBytes - Buffer.byteLength(notice, "utf8"));
  const lines = text.split("\n").slice(0, Math.max(0, maxLines - 2));
  const buffer = Buffer.from(lines.join("\n"), "utf8");
  let end = Math.min(buffer.length, byteBudget);
  while (end > 0 && end < buffer.length && (buffer[end] & 0xc0) === 0x80) end -= 1;
  return { text: `${buffer.subarray(0, end).toString("utf8")}${notice}`, truncated: true, originalBytes, originalLines };
}

function textResult(text: string, details?: Record<string, unknown>) {
  const bounded = boundHajimiToolText(text);
  return {
    content: [{ type: "text" as const, text: bounded.text }],
    details: bounded.truncated
      ? { ...details, outputGuard: { truncated: true, originalBytes: bounded.originalBytes, originalLines: bounded.originalLines } }
      : details,
  };
}

function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createHajimiCoreFactory(options: HajimiCoreOptions) {
  return (pi: ExtensionAPI) => {
    const cwd = resolve(options.cwd);
    const productRoot = resolve(options.productRoot);
    if (process.env.HAJIMI_CACHE_DIAGNOSTICS === "1") installCacheDiagnostics(pi, cwd);
    const toolkitRoot = join(productRoot, "toolkit", "src");
    const capabilitiesRoot = join(productRoot, "bundled", "capabilities");
    const backend = createWorkspaceBackend(cwd, {
      productRoot,
      distribution: options.distribution,
      toolkitRoot,
      readonlyRoots: [
        join(productRoot, "bundled", "skills", "modeling-workflow-core"),
        capabilitiesRoot,
      ],
      capabilitiesRoot,
    });

    // Pi may dispatch multiple tools from one assistant message concurrently.
    // Recheck the persisted pause when each queued execution starts.
    let executionTail: Promise<unknown> = Promise.resolve();
    const guardedPi: ExtensionAPI = {
      ...pi,
      registerTool(tool) {
        pi.registerTool({
          ...tool,
          execute(...args) {
            const run = executionTail.then(async () => {
              const state = (await ensureHajimiTask(cwd)).state;
              if ((state.interaction?.pending || (state.interaction?.finalAccepted && tool.name !== "hajimi_generate_submission"))
                && !["read", "ls", "find", "grep", "hajimi_task_status", "hajimi_accept_user_review"].includes(tool.name)) {
                throw new Error(reviewPrompt(state));
              }
              if (args[2]?.aborted) throw new Error("Tool execution aborted.");
              if (tool.name === 'bash') await requireFigurePlan(cwd);
              if (state.focus.stage === 8) {
                const input = args[1] as Record<string, unknown>;
                if (tool.name === 'hajimi_validate_delivery') await assertStage8(cwd,['review','ready']);
                if ((tool.name === 'hajimi_set_milestone' && input.stage === 8 && input.status === 'satisfied') || (tool.name === 'hajimi_request_gate' && input.gate === 'final_delivery')) await assertStage8(cwd,['ready']);
              }
              return tool.execute(...args);
            });
            executionTail = run.catch(() => undefined);
            return run;
          },
        });
      },
    };
    registerWorkspaceTools(guardedPi, backend, cwd, productRoot);
    registerTaskTools(guardedPi, backend, cwd, productRoot, options.getMode);
    let stopAfterTurn = false;
    let lastWorkflowText: string | undefined;
    let lastGuidanceText: string | undefined;
    let lastRoutingTags: string | undefined;
    async function workflowMessage(force = false) {
      await reconcileProvenance(cwd);
      const snapshot = await ensureHajimiTask(cwd);
      applyStageToolPolicy(pi, snapshot.state.focus.stage, options.getMode?.() ?? "full");
      const routingTags = JSON.stringify([...snapshot.state.problemTags].sort());
      force ||= routingTags !== lastRoutingTags;
      lastRoutingTags = routingTags;
      const routing = await routeCapabilities({ state: snapshot.state, productRoot });
      const projection = await projectWorkflowContext({ state: snapshot.state, productRoot, capabilityFragments: routing.fragments, stage8Phase: snapshot.state.focus.stage === 8 ? (await readStage8(cwd)).phase : undefined });
      if (!force && projection.text === lastWorkflowText) return undefined;
      // Keep prior guidance in its original persisted message. Only live state
      // changes on most tool turns; restore full guidance after context loss.
      const reuseGuidance = !force && !projection.truncated && projection.guidanceText === lastGuidanceText;
      const content = reuseGuidance
        ? `${projection.liveText}\n[Stage and capability guidance is unchanged; continue applying the earlier guidance.]`
        : projection.text;
      lastWorkflowText = projection.text;
      lastGuidanceText = projection.guidanceText;
      return { customType: "hajimi-live-context", content, display: false,
        details: { revision: snapshot.state.revision, truncated: projection.truncated } };
    }

    pi.on("input", async (event) => {
      if (event.source === "extension") return;
      const snapshot = await ensureHajimiTask(cwd);
      if (automaticRunLocked(snapshot.state)) {
        pi.sendMessage({ customType: "hajimi-auto-lock", display: true, content: AUTOMATIC_LOCK_MESSAGE }, { triggerTurn: false });
        return { action: "handled" as const };
      }
      if (snapshot.state.interaction?.runtimeFailure) {
        const interaction = interactionFor(snapshot.state);
        delete interaction.runtimeFailure;
        await saveInteraction(cwd, snapshot.state, interaction);
      }
      const guidance = await handleReviewInput(cwd, event.text);
      if (guidance) return { action: "transform" as const, text: `${event.text}\n\n${guidance}`, images: event.images };
      await recordReviewInput(cwd, event.text);
    });

    pi.on("turn_end", async (_event, ctx) => {
      const message = await workflowMessage();
      // Pi persists these after all tool results, before preparing its next request.
      if (message) pi.sendMessage(message, { triggerTurn: false });
      if (stopAfterTurn) { stopAfterTurn = false; ctx.abort(); }
    });

    pi.on("session_start", async (_event, ctx) => {
      lastWorkflowText = undefined;
      lastGuidanceText = undefined;
      const snapshot = await ensureHajimiTask(cwd);
      if (!snapshot.state.interaction) {
        const interaction = interactionFor(snapshot.state);
        interaction.stageBaseline = await captureStageFiles(cwd);
        if (snapshot.state.focus.stage > 0) interaction.pending = { kind: "mode", stage: snapshot.state.focus.stage };
        snapshot.state = await saveInteraction(cwd, snapshot.state, interaction);
        if (interaction.pending) pi.sendMessage({ customType: "hajimi-review", display: true, content: reviewPrompt(snapshot.state) }, { triggerTurn: false });
      }
      // Stage 0 accepts uploads incrementally; freeze only after materials are confirmed.
      if (snapshot.state.focus.stage > 0) await freezeHajimiInputs(cwd);
      await backend.prepare?.();
      const health = await backend.health();
      if (automaticRunLocked(snapshot.state)) {
        // A newly bound session cannot own a run from the previous process.
        // Preserve progress and expose recovery after an app/process interruption.
        const interaction = interactionFor(snapshot.state);
        interaction.runtimeFailure = { message: "上一次全自动运行已随会话进程中断，请确认恢复后继续。", recordedAt: new Date().toISOString() };
        await saveInteraction(cwd, snapshot.state, interaction);
        pi.sendMessage({ customType: "hajimi-runtime-failure", display: true, content: interaction.runtimeFailure.message }, { triggerTurn: false });
      }
      applyStageToolPolicy(pi, snapshot.state.focus.stage, options.getMode?.() ?? "full");
      ctx.ui.setStatus("hajimi", `HaJiMi · ${health.distribution ?? health.kind} · /workspace`);
      ctx.ui.notify(`HaJiMi task ready: ${snapshot.identity.title}`, "info");
    });

    pi.on("before_agent_start", async (event) => {
      return {
        message: await workflowMessage(),
        systemPrompt: event.systemPrompt
          .replace(/^You are an expert coding assistant[^\n]*/m, "You are HaJiMi, a mathematical-modeling assistant. Lead the user through the governed 0-9 modeling workflow, with clear stage guidance, uploaded problem materials, reproducible experiments and a reviewed paper.")
          .replace(
            /^Current working directory:.*$/m,
            `Current working directory: HaJiMi task root (${backend.describe().kind} backend; use relative paths)`,
          )
          .concat(`\n\n${HAJIMI_IDENTITY_KERNEL}`)
          .concat(backend.describe().kind === "windows-managed"
            ? "\nExecution contract: native Windows CPython/XeLaTeX with PortableGit Bash. Use task-relative paths and quote paths containing spaces. Do not use /mnt/c, apt, sudo or Linux ELF binaries. Python/python3 resolve to managed CPython. Base offline routes: Matplotlib, TikZ and bundled Draw.io desktop (DRAWIO_PATH; export with export_drawio.py); HTML/Mermaid/SVG-input rendering are not installed. New ctex documents must explicitly select fontset=fandol; no implicit Microsoft fonts. Shell has the current user's permissions, not OS sandboxing."
            : ""),
      };
    });

    pi.on("session_compact", async () => {
      // During auto-compaction, steer is consumed before the next request. Outside
      // a run Pi appends immediately. Never replace an earlier state message.
      const message = await workflowMessage(true);
      if (message) pi.sendMessage(message, { deliverAs: "steer" });
    });

    pi.on("session_tree", () => {
      lastWorkflowText = undefined;
      lastGuidanceText = undefined;
    });

    pi.on("session_before_compact", async () => {
      await createHajimiCheckpoint(cwd, "Automatic checkpoint before Pi context compaction.");
    });

    pi.on("agent_end", async () => {
      await createHajimiCheckpoint(cwd, "Automatic checkpoint after an agent run completed.");
    });

    let lastRunFailure: string | undefined;
    pi.on("agent_start", () => { lastRunFailure = undefined; });
    pi.on("message_end", (event) => {
      if (event.message.role === "assistant") {
        lastRunFailure = event.message.stopReason === "error" || event.message.stopReason === "aborted"
          ? event.message.errorMessage || "模型或运行进程未能完成请求。" : undefined;
      }
    });
    // Wait for Pi's retry/compaction cycle to settle, not its low-level agent_end.
    pi.on("agent_settled", async (_event, ctx) => {
      const snapshot = await ensureHajimiTask(cwd);
      if (!automaticRunLocked(snapshot.state) || !ctx.isIdle()) return;
      if (lastRunFailure) {
        const interaction = interactionFor(snapshot.state);
        interaction.runtimeFailure = { message: lastRunFailure, recordedAt: new Date().toISOString() };
        await saveInteraction(cwd, snapshot.state, interaction);
        pi.sendMessage({ customType: "hajimi-runtime-failure", display: true,
          content: `全自动运行中断，已保留阶段进度。需要恢复运行环境或模型服务后继续：${lastRunFailure}` }, { triggerTurn: false });
        return;
      }
      pi.sendMessage({ customType: "hajimi-auto-continue", display: false,
        content: "全自动模式继续执行当前阶段并依次完成阶段 1—8。普通路线选择按你的推荐决定；工具或验证失败自行诊断修复，不请求用户选择，不把失败标为通过。第 8 阶段交付后停止等待人工验收。" },
      { triggerTurn: true, deliverAs: "followUp" });
    });

    pi.on("tool_call", async (event) => {
      const snapshot = await ensureHajimiTask(cwd);
      if (snapshot.state.interaction?.pending || (snapshot.state.interaction?.finalAccepted && event.toolName !== "hajimi_generate_submission")) {
        if (!["read", "ls", "find", "grep", "hajimi_task_status", "hajimi_accept_user_review"].includes(event.toolName)) {
          stopAfterTurn = true;
          return { block: true, reason: `${reviewPrompt(snapshot.state)} Do not execute further work. Answer the user in chat.` };
        }
      }
      if (!(HAJIMI_TOOL_NAMES as readonly string[]).includes(event.toolName)) return;
      if (!hajimiToolsForStage(snapshot.state.focus.stage).includes(event.toolName)) {
        return {
          block: true,
          reason: `HaJiMi tool ${event.toolName} is unavailable at stage ${snapshot.state.focus.stage}; update the governed workflow first.`,
        };
      }
    });

    pi.on("tool_result", async (event) => {
      if (event.toolName === "hajimi_set_milestone" || event.toolName === "hajimi_request_gate") {
        if ((await ensureHajimiTask(cwd)).state.interaction?.pending) stopAfterTurn = true;
      }
    });

    pi.on("user_bash", () => {
      const operations = backend.bashOperations();
      return { operations: { ...operations, exec: (...args: Parameters<typeof operations.exec>) => {
        const run = executionTail.then(async () => {
          const state = (await ensureHajimiTask(cwd)).state;
          if (state.interaction?.pending || state.interaction?.finalAccepted) throw new Error(reviewPrompt(state));
          if (args[2]?.signal?.aborted) throw new Error("Tool execution aborted.");
          await requireFigurePlan(cwd);
          return operations.exec(...args);
        });
        executionTail = run.catch(() => undefined);
        return run;
      } } };
    });
  };
}

export function hajimiCoreInlineExtension(options: HajimiCoreOptions): InlineExtension {
  return { name: "hajimi-core", factory: createHajimiCoreFactory(options) };
}

function registerWorkspaceTools(pi: ExtensionAPI, backend: WorkspaceBackend, cwd: string, productRoot: string): void {
  const read = createReadTool(cwd, { operations: backend.readOperations() });
  const write = createWriteTool(cwd, { operations: backend.writeOperations() });
  const edit = createEditTool(cwd, { operations: backend.editOperations() });
  const bash = createBashTool(cwd, {
    operations: backend.bashOperations(),
    exposeSessionEnvironment: false,
  });
  pi.registerTool({ ...read,
    description: `${read.description} Task-relative paths read task files. references/lab-core/... resolves from the bundled modeling-workflow-core skill directory; use absolute paths for other bundled guidance.`,
    execute(id, params, signal, onUpdate) {
      const path = params.path.replaceAll("\\", "/");
      return read.execute(id, { ...params, path: path.startsWith("references/lab-core/")
        ? resolve(productRoot, "bundled", "skills", "modeling-workflow-core", path === "references/lab-core/SKILL.md" ? "SKILL.md" : path) : params.path }, signal, onUpdate);
    },
  });
  pi.registerTool({ ...write, description: `${write.description} input/ and .hajimi/ are protected.` });
  pi.registerTool({ ...edit, description: `${edit.description} input/ and .hajimi/ are protected.` });
  pi.registerTool({ ...bash, description: `${bash.description} The command runs in the selected HaJiMi backend with current-user privileges; it is not an OS sandbox.` });

  pi.registerTool({
    name: "ls",
    label: "ls",
    description: "List files in the HaJiMi task workspace.",
    promptSnippet: "List directory contents inside the HaJiMi workspace",
    parameters: Type.Object({
      path: Type.Optional(Type.String({ description: "Workspace-relative path; default is the workspace root" })),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 5000 })),
    }),
    async execute(_id, params) {
      const hostPath = backend.resolveHostPath(params.path ?? ".");
      const entries = await backend.list(hostPath, params.limit);
      return textResult(entries.join("\n") || "Directory is empty", { count: entries.length });
    },
  });

  pi.registerTool({
    name: "find",
    label: "find",
    description: "Find files by glob inside the HaJiMi task workspace.",
    promptSnippet: "Find workspace files by glob",
    parameters: Type.Object({
      pattern: Type.String(),
      path: Type.Optional(Type.String()),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 5000 })),
    }),
    async execute(_id, params) {
      const hostPath = backend.resolveHostPath(params.path ?? ".");
      const files = await backend.find(hostPath, params.pattern, params.limit);
      return textResult(files.join("\n") || "No files found", { count: files.length });
    },
  });

  pi.registerTool({
    name: "grep",
    label: "grep",
    description: "Search text files inside the HaJiMi task workspace.",
    promptSnippet: "Search workspace file contents",
    parameters: Type.Object({
      pattern: Type.String(),
      path: Type.Optional(Type.String()),
      glob: Type.Optional(Type.String()),
      ignoreCase: Type.Optional(Type.Boolean()),
      literal: Type.Optional(Type.Boolean()),
      context: Type.Optional(Type.Number({ minimum: 0, maximum: 20 })),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 2000 })),
    }),
    async execute(_id, params) {
      const hostPath = backend.resolveHostPath(params.path ?? ".");
      return textResult(await backend.grep({ hostPath, ...params }));
    },
  });
}

function registerTaskTools(
  pi: ExtensionAPI,
  backend: WorkspaceBackend,
  cwd: string,
  productRoot: string,
  getMode?: () => "plan" | "ask" | "full",
): void {
  pi.registerTool({
    name:'hajimi_stage8_phase', label:'Stage 8 phase',
    description:'Advance figures -> writing -> review -> ready. Figures: one brief overlap inspection and one coordinated placement repair if needed, no paper float positioning. Writing preserves existing skill/template standards and stable figures. Review is light; only severe issues justify a targeted rollback. Report minor issues to the human. Pass completed figurePaths for legacy plans; current FIGURE_PLAN outputs are included automatically.',
    parameters:Type.Object({phase:StringEnum(['figures','writing','review','ready'] as const),note:Type.String({minLength:1}),figurePaths:Type.Optional(Type.Array(Type.String())),severeIssues:Type.Optional(Type.Array(Type.String())),repairPaths:Type.Optional(Type.Array(Type.String()))}),
    async execute(_id,params){return textResult(JSON.stringify(await moveStage8(cwd,params.phase,params.note,params.figurePaths,params.severeIssues,params.repairPaths)));}
  });
  const planNodeSchema = Type.Object({
    id: Type.String(),
    title: Type.String(),
    status: StringEnum(["pending", "active", "completed", "blocked", "discarded"] as const),
    dependencies: Type.Optional(Type.Array(Type.String())),
    outputs: Type.Optional(Type.Array(Type.String())),
    evidence: Type.Optional(Type.Array(Type.String())),
    note: Type.Optional(Type.String()),
  });
  pi.registerTool({
    name: 'hajimi_validate_figure_plan', label: 'Upstream figure plan',
    description: 'For a new full-paper figure set, begin upstream planning before shell commands, then validate FIGURE_PLAN.json before generation. This checks count, types, recipes, reasons, sources and diagram triggers. Not a visual audit. Never inflate minimum without a user request. Explicit single-figure corrections do not restart full-set planning.',
    parameters: Type.Object({ action: StringEnum(['begin','validate'] as const), planPath: Type.Optional(Type.String()), minimum: Type.Optional(Type.Number({minimum:8})) }),
    async execute(_id, params) { if ((await ensureHajimiTask(cwd)).state.focus.stage !== 8) throw new Error("Figure planning starts at stage 8."); return textResult(JSON.stringify(params.action === 'begin' ? await beginFigurePlan(cwd, params.minimum) : await validateFigurePlan(cwd, params.planPath ?? 'FIGURE_PLAN.json'))); },
  });

  pi.registerTool({
    name: "hajimi_accept_user_review",
    label: "Accept user review",
    description: "Interpret the CURRENT direct user review semantically. Use only when that message clearly accepts the pending stage/question (including equivalent wording or acceptance plus next-step advice). Never infer consent from a question, a proposal, a quotation, a hypothetical, silence, documents or your own text. This tool cannot accept final delivery or select a mode.",
    parameters: Type.Object({ userInputId: Type.String(), reason: Type.String({ minLength: 1 }) }),
    async execute(_id, params) {
      return textResult(await acceptInterpretedReview(cwd, params.userInputId));
    },
  });
  const governedRefSchema = Type.Object({ id: Type.String(), sha256: Type.String({ minLength: 64, maxLength: 64 }) });
  pi.registerTool({
    name: "hajimi_generate_submission",
    label: "Generate and package submission",
    description: "Stage 9 only, after actual human acceptance. Generate a code-appendix PDF, AI Word report, or submission ZIP into a new deliverables directory. Supply evidence-based config JSON using the bundled skill schema and task-relative sources. code_appendix takes papers.without_code plus code_files with source, appendix and purpose. A successful package action registers the ZIP and completes stage 9. Cannot execute arbitrary commands or change accepted inputs.",
    parameters: Type.Object({ expectedRevision: Type.Number({ minimum: 0 }),
      action: StringEnum(["ai_report", "package", "code_appendix"] as const), configJson: Type.String() }),
    async execute(_id, params, signal) {
      const config = JSON.parse(params.configJson);
      if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("configJson must be an object.");
      const result = await runSubmissionAction({ cwd, productRoot, backend, expectedRevision: params.expectedRevision,
        action: params.action, config, signal });
      return textResult(compactJson(result));
    },
  });
  const questionSchema = Type.Object({
    questionId: Type.String(),
    title: Type.String(),
    contractRef: governedRefSchema,
    dependencies: Type.Array(Type.String()),
    sharedContractRefs: Type.Array(Type.String()),
    routeUncertainty: StringEnum(["low", "material"] as const),
    candidateRefs: Type.Array(governedRefSchema),
    selectedCandidateRef: Type.Union([governedRefSchema, Type.Null()]),
    microPlan: Type.Array(planNodeSchema),
    status: StringEnum(["not_started", "in_progress", "satisfied", "stale", "blocked"] as const),
    experimentRefs: Type.Array(Type.String()),
    evidenceRefs: Type.Array(Type.String()),
    localValidationRefs: Type.Array(governedRefSchema),
    reviewRefs: Type.Array(governedRefSchema),
    routeGateId: Type.Optional(Type.String()),
    checkpointGateId: Type.Optional(Type.String()),
    staleBy: Type.Optional(Type.Array(Type.String())),
  });

  pi.registerTool({
    name: "hajimi_task_status",
    label: "HaJiMi task status",
    description: "Read concise authoritative current state. Use section to retrieve detailed records in pages; increase offset until nextOffset is null.",
    promptSnippet: "Read the current mathematical-modeling task state",
    parameters: Type.Object({
      section: Type.Optional(StringEnum(["session", "milestones", "microPlan", "questions", "openGates", "gateHistory", "rollbacks", "experiments", "evidence", "claims", "bindings", "freezes"] as const)),
      offset: Type.Optional(Type.Integer({ minimum: 0 })),
      limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const snapshot = await ensureHajimiTask(cwd);
      const { state } = snapshot;
      let result: unknown;
      if (params.section === "session") {
        if (!ctx?.sessionManager || resolve(ctx.sessionManager.getCwd()) !== cwd) throw new Error("No matching task session is available.");
        const entries = ctx.sessionManager.getBranch().filter(entry => entry.type === "message" || entry.type === "model_change");
        const offset = params.offset ?? 0, limit = params.limit ?? 5;
        const records = entries.slice(offset, offset + limit).map(entry => {
          if (entry.type === "model_change") return { type: entry.type, id: entry.id, date: entry.timestamp, provider: entry.provider, model: entry.modelId };
          if (entry.type !== "message") return null;
          const message = entry.message as unknown as Record<string, unknown>;
          const content = Array.isArray(message.content) ? message.content.filter(part => part.type === "text" || part.type === "toolCall")
            .map(part => part.type === "text" ? { type: "text", text: String(part.text).slice(0, 6000), truncated: String(part.text).length > 6000 }
              : { type: "toolCall", name: part.name, id: part.id }) : typeof message.content === "string" ? message.content.slice(0, 6000) : [];
          return { type: "message", id: entry.id, date: entry.timestamp, role: message.role, model: message.model, provider: message.provider,
            toolName: message.toolName, toolCallId: message.toolCallId, isError: message.isError, content };
        });
        result = { scope: "Current task session branch only; internal evidence, not submission-ready text. No reasoning traces or binary images are included.",
          records, total: entries.length, nextOffset: offset + limit < entries.length ? offset + limit : null };
      } else if (params.section) {
        const section = params.section;
        const records = section in state.provenance
          ? state.provenance[section as keyof typeof state.provenance]
          : state[section as "milestones" | "microPlan" | "questions" | "openGates" | "gateHistory" | "rollbacks"];
        const offset = params.offset ?? 0;
        const limit = params.limit ?? 5;
        result = { revision: state.revision, section, total: records.length,
          records: records.slice(offset, offset + limit),
          nextOffset: offset + limit < records.length ? offset + limit : null };
      } else {
        result = { identity: snapshot.identity, revision: state.revision, status: state.status,
          focus: state.focus, currentObjective: state.currentObjective, nextAction: state.nextAction,
          interaction: { mode: state.interaction?.mode ?? "unselected", pending: state.interaction?.pending ?? null,
            finalAccepted: state.interaction?.finalAccepted ?? false },
          milestone: state.milestones.find(item => item.stage === state.focus.stage),
          questions: state.questions.map(item => ({ questionId: item.questionId, status: item.status, dependencies: item.dependencies })),
          openGates: state.openGates,
          detailHint: "Retrieve plans, question packets and provenance with section, offset and limit. Full records remain in the task store." };
      }
      return textResult(compactJson(result), {
        revision: snapshot.state.revision,
        stage: snapshot.state.focus.stage,
        taskStatus: snapshot.state.status,
      });
    },
  });

  pi.registerTool({
    name: "hajimi_set_focus",
    label: "Set workflow focus",
    description: "Move the active focus to a revisitable 0-9 milestone and optional question packet.",
    promptSnippet: "Focus the current HaJiMi milestone or question",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      stage: Type.Number({ minimum: 0, maximum: 9 }),
      questionId: Type.Optional(Type.String()),
      nextAction: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      if (!isHajimiStageId(params.stage)) throw new Error("stage must be an integer from 0 through 9");
      const current = (await ensureHajimiTask(cwd)).state;
      const routing = await routeCapabilities({ state: current, productRoot, stage: params.stage });
      const state = await setWorkflowFocus(cwd, params.expectedRevision, params.stage, params.questionId ?? null, params.nextAction, routing.decisions);
      applyStageToolPolicy(pi, state.focus.stage, getMode?.() ?? "full");
      if (current.focus.stage !== state.focus.stage) {
        pi.sendMessage({ customType: "hajimi-stage-guide", display: true,
          content: `第 ${state.focus.stage} 阶段 · ${STAGE_GUIDANCE[state.focus.stage]}`,
          details: { stage: state.focus.stage, revision: state.revision } }, { triggerTurn: false });
      }
      return textResult(`Workflow focus updated to stage ${state.focus.stage} at revision ${state.revision}.\n${STAGE_GUIDANCE[state.focus.stage]}\nExplain this stage and its expected outputs to the user before your next tool call.`, { revision: state.revision });
    },
  });

  pi.registerTool({
    name: "hajimi_set_milestone",
    label: "Update milestone",
    description: "Update one 0-9 milestone without flattening the dynamic micro-plan.",
    promptSnippet: "Update a HaJiMi milestone status",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      stage: Type.Number({ minimum: 0, maximum: 9 }),
      status: StringEnum(["not_started", "in_progress", "satisfied", "stale", "blocked", "waived"] as const),
      evidenceRefs: Type.Optional(Type.Array(Type.String())),
      summary: Type.Optional(Type.String({ description: "Stage findings, methods, validation and unresolved issues for the user report." })),
      files: Type.Optional(Type.Array(Type.Object({ path: Type.String(), purpose: Type.String() }))),
    }),
    async execute(_id, params) {
      if (!isHajimiStageId(params.stage)) throw new Error("stage must be an integer from 0 through 9");
      let state = await setMilestone(cwd, params.expectedRevision, params.stage, params.status, params.evidenceRefs);
      if (params.status === "satisfied" && params.stage === state.focus.stage && params.stage <= 8 && state.interaction) {
        const completed = await finishStage(cwd, state, params.summary, params.files);
        state = completed.state;
        pi.sendMessage({ customType: "hajimi-stage-report", display: true, content: completed.report.text,
          details: { stage: params.stage, path: completed.report.path } }, { triggerTurn: false });
      }
      return textResult(`Milestone ${params.stage} updated at revision ${state.revision}.`, { revision: state.revision });
    },
  });

  pi.registerTool({
    name: "hajimi_set_requirement",
    label: "Update milestone requirement",
    description: "Attach evidence and update one explicit milestone requirement before satisfying the milestone.",
    promptSnippet: "Update a HaJiMi stage requirement with evidence",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      stage: Type.Number({ minimum: 0, maximum: 9 }),
      requirementId: Type.String(),
      status: StringEnum(["unmet", "satisfied", "waived", "blocked"] as const),
      evidenceRefs: Type.Array(Type.String()),
      note: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      if (!isHajimiStageId(params.stage)) throw new Error("stage must be an integer from 0 through 9");
      const state = await setRequirement(cwd, params.expectedRevision, params.stage, params.requirementId, params.status, params.evidenceRefs, params.note);
      return textResult(`Requirement ${params.requirementId} updated at revision ${state.revision}.`, { revision: state.revision });
    },
  });

  pi.registerTool({
    name: "hajimi_set_questions",
    label: "Set question work packets",
    description: "Validate and replace the question dependency DAG and per-question micro-plans. For binding-only updates, preserve accepted packets and existing valid experiment/evidence refs; do not rollback or rerun unchanged computation. Submit changed packets for checkpoint review as required.",
    promptSnippet: "Persist dependency-aware QuestionWorkPackets",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      questions: Type.Array(questionSchema, { minItems: 1, maxItems: 50 }),
    }),
    async execute(_id, params) {
      const questions = params.questions.map((question) => ({
        ...question,
        microPlan: question.microPlan.map((node) => ({ ...node, dependencies: node.dependencies ?? [], outputs: node.outputs ?? node.evidence ?? [] })),
        staleBy: question.staleBy ?? [],
      }));
      const state = await replaceQuestionPackets(cwd, params.expectedRevision, questions);
      return textResult(`Stored ${state.questions.length} question work packet(s) at revision ${state.revision}.`, { revision: state.revision });
    },
  });

  pi.registerTool({
    name: "hajimi_rollback",
    label: "Rollback workflow",
    description: "Invalidate a stage or question and its computation evidence through the dependency/provenance chain. Do not use for work-packet rebinding or checkpoint preparation; use hajimi_set_questions instead. Shared evidence can affect other questions: when genuinely invalid, explicitly list the affected experiment/evidence or changed artifact IDs in invalidatedIds.",
    promptSnippet: "Rollback a HaJiMi stage or question with precise stale propagation",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      source: Type.String(),
      targetStage: Type.Number({ minimum: 0, maximum: 9 }),
      targetQuestion: Type.Optional(Type.String()),
      invalidatedIds: Type.Optional(Type.Array(Type.String())),
      reason: Type.String(),
    }),
    async execute(_id, params) {
      if (!isHajimiStageId(params.targetStage)) throw new Error("targetStage must be an integer from 0 through 9");
      const state = await rollbackWorkflow({
        cwd,
        expectedRevision: params.expectedRevision,
        source: params.source,
        targetStage: params.targetStage,
        targetQuestion: params.targetQuestion,
        invalidatedIds: params.invalidatedIds,
        reason: params.reason,
      });
      return textResult(`Rollback recorded at revision ${state.revision}.`, { revision: state.revision, rollback: state.rollbacks.at(-1) });
    },
  });

  pi.registerTool({
    name: "hajimi_update_plan",
    label: "Update modeling plan",
    description: "Atomically replace the dynamic modeling plan and its immediate objective.",
    promptSnippet: "Update the persistent mathematical-modeling plan",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      currentObjective: Type.String(),
      nextAction: Type.String(),
      plan: Type.Array(planNodeSchema, { minItems: 1, maxItems: 100 }),
    }),
    async execute(_id, params) {
      const state = await updateHajimiState(cwd, params.expectedRevision, {
        currentObjective: params.currentObjective,
        nextAction: params.nextAction,
        microPlan: params.plan.map((node) => ({
          ...node,
          dependencies: node.dependencies ?? [],
          outputs: node.outputs ?? node.evidence ?? [],
        })) as HajimiPlanNode[],
      });
      return textResult(`Plan updated to revision ${state.revision}.`, { revision: state.revision });
    },
  });

  pi.registerTool({
    name: "hajimi_freeze_inputs",
    label: "Freeze task inputs",
    description: "Hash and content-address all regular files under input/. Symlinks are rejected.",
    promptSnippet: "Freeze and hash the task input files",
    parameters: Type.Object({ expectedRevision: Type.Number({ minimum: 0 }) }),
    async execute(_id, params) {
      const refs = await freezeHajimiInputs(cwd);
      const state = await setRequirement(cwd, params.expectedRevision, 0, "input_manifest", "satisfied", refs.map((ref) => ref.id));
      return textResult(compactJson(refs), { count: refs.length, revision: state.revision });
    },
  });

  pi.registerTool({
    name: "hajimi_record_experiment",
    label: "Record experiment",
    description: "Append a material executed experiment to the HaJiMi experiment ledger.",
    promptSnippet: "Record a material modeling experiment and its outcome",
    parameters: Type.Object({
      title: Type.String(),
      command: Type.String(),
      outcome: StringEnum(["succeeded", "failed", "inconclusive"] as const),
      resultSummary: Type.String(),
      artifacts: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_id, params) {
      await appendExperiment(cwd, params);
      return textResult("Experiment recorded.");
    },
  });

  pi.registerTool({
    name: "hajimi_run_managed_experiment",
    label: "Run managed experiment",
    description: "Execute in the selected HaJiMi backend, then bind the observed command outcome to content-addressed inputs, code, parameters, environment, and outputs.",
    promptSnippet: "Run and record a provenance-complete managed experiment",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      title: Type.String(),
      command: Type.String(),
      codePaths: Type.Array(Type.String()),
      inputPaths: Type.Array(Type.String()),
      parameterPaths: Type.Array(Type.String()),
      outputPaths: Type.Array(Type.String()),
      seed: Type.Optional(Type.Number()),
      timeoutSeconds: Type.Optional(Type.Number({ minimum: 1, maximum: 86400 })),
    }),
    async execute(_id, params, signal, onUpdate) {
      onUpdate?.(textResult(`Running managed experiment: ${params.title}`));
      const experimentId = randomUUID();
      const startedAt = new Date().toISOString();
      const execution = await backend.runShell(params.command, {
        cwd,
        signal,
        timeoutSeconds: params.timeoutSeconds ?? 3600,
        onData: (chunk) => onUpdate?.(textResult(chunk.toString("utf8"))),
      });
      const completedAt = new Date().toISOString();
      const logDirectory = join(cwd, "work", "experiments");
      await backend.mkdir(logDirectory);
      const stdoutPath = join(logDirectory, `${experimentId}.stdout.log`);
      const stderrPath = join(logDirectory, `${experimentId}.stderr.log`);
      await Promise.all([
        backend.writeFile(stdoutPath, execution.stdout.toString("utf8")),
        backend.writeFile(stderrPath, execution.stderr.toString("utf8")),
      ]);
      const health = await backend.health();
      const environment = Object.fromEntries(
        Object.entries(health).flatMap(([key, value]) => value === null || value === undefined ? [] : [[key, String(value)]]),
      );
      const result = await recordManagedExperiment(cwd, params.expectedRevision, {
        experimentId,
        title: params.title,
        command: params.command,
        codePaths: params.codePaths,
        inputPaths: params.inputPaths,
        parameterPaths: params.parameterPaths,
        outputPaths: [...params.outputPaths, relative(cwd, stdoutPath), relative(cwd, stderrPath)],
        environment,
        seed: params.seed,
        exitCode: execution.exitCode,
        startedAt,
        completedAt,
        status: execution.exitCode === 0 ? "succeeded" : "failed",
        trust: "attested",
      });
      const output = [execution.stdout.toString("utf8"), execution.stderr.toString("utf8")].filter(Boolean).join("\n").trim();
      return textResult(
        `${output ? `${output}\n` : ""}Managed experiment ${execution.exitCode === 0 ? "succeeded" : "failed"}; recorded at revision ${result.state.revision}.`,
        { revision: result.state.revision, experimentId: result.experiment.experimentId, exitCode: execution.exitCode },
      );
    },
  });

  pi.registerTool({
    name: "hajimi_record_evidence",
    label: "Record evidence",
    description: "Create validated evidence from trusted managed experiments and registered artifacts.",
    promptSnippet: "Record experiment-backed evidence",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      experimentRefs: Type.Array(Type.String(), { minItems: 1 }),
      artifactRefs: Type.Array(Type.String(), { minItems: 1 }),
      validationMethod: Type.String(),
      status: StringEnum(["attested", "verified", "cross_validated"] as const),
      domainValidationStatus: StringEnum(["not_reviewed", "plausible", "accepted", "rejected"] as const),
      limitations: Type.Array(Type.String()),
    }),
    async execute(_id, params) {
      const result = await recordEvidence(cwd, params.expectedRevision, params);
      return textResult(`Evidence recorded at revision ${result.state.revision}.`, { revision: result.state.revision, evidenceId: result.evidence.evidenceId });
    },
  });

  pi.registerTool({
    name: "hajimi_select_experiment",
    label: "Select experiment lifecycle",
    description: "Mark a managed experiment candidate as selected, superseded, or invalidated and propagate staleness when needed.",
    promptSnippet: "Select or retire a managed experiment",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      experimentId: Type.String(),
      selection: StringEnum(["candidate", "selected", "superseded", "invalidated"] as const),
      reason: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      const state = await setExperimentSelection(cwd, params.expectedRevision, params.experimentId, params.selection, params.reason);
      return textResult(`Experiment ${params.experimentId} is now ${params.selection} at revision ${state.revision}.`, { revision: state.revision });
    },
  });

  pi.registerTool({
    name: "hajimi_record_claim",
    label: "Record claim",
    description: "Create a draft estimate or a formal evidence-backed claim.",
    promptSnippet: "Record a traceable modeling claim",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      text: Type.String(),
      kind: StringEnum(["estimate", "qualitative", "numeric"] as const),
      value: Type.Optional(Type.Union([Type.Number(), Type.String()])),
      unit: Type.Optional(Type.String()),
      evidenceRefs: Type.Array(Type.String()),
      status: StringEnum(["draft", "supported"] as const),
    }),
    async execute(_id, params) {
      const result = await recordClaim(cwd, params.expectedRevision, params);
      return textResult(`Claim recorded at revision ${result.state.revision}.`, { revision: result.state.revision, claimId: result.claim.claimId });
    },
  });

  pi.registerTool({
    name: "hajimi_freeze_evidence",
    label: "Freeze evidence",
    description: "Freeze domain-accepted verified evidence and fully supported claims for formal publication use.",
    promptSnippet: "Freeze the evidence and claims approved for stage 8",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      evidenceRefs: Type.Array(Type.String(), { minItems: 1 }),
      claimRefs: Type.Array(Type.String(), { minItems: 1 }),
      acceptedGateId: Type.Optional(Type.String({ description: "Legacy field; the program computes the exact gate automatically." })),
    }),
    async execute(_id, params) {
      const state = await freezeSelectedEvidence(cwd, params.expectedRevision, params.evidenceRefs, params.claimRefs);
      return textResult(`Evidence freeze created at revision ${state.revision}.`, { revision: state.revision, freezeId: state.provenance.freezes.at(-1)?.freezeId });
    },
  });

  pi.registerTool({
    name: "hajimi_bind_publication",
    label: "Bind publication artifact",
    description: "Bind a figure, paper, or final answer to claims from an active evidence freeze.",
    promptSnippet: "Bind a publication candidate to frozen claims",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      kind: StringEnum(["figure", "paper", "final_answer"] as const),
      target: Type.String(),
      claimRefs: Type.Array(Type.String(), { minItems: 1 }),
      artifactPath: Type.Optional(Type.String()),
      claimBindingPath: Type.Optional(Type.String()),
    }),
    async execute(_id, params) {
      const artifactRef = params.artifactPath ? await registerArtifact(cwd, params.artifactPath, `${params.kind} publication binding`) : undefined;
      const claimMarkerRef = params.claimBindingPath ? await registerArtifact(cwd, params.claimBindingPath, `${params.kind} numeric claim sidecar`) : undefined;
      const state = await bindPublication(cwd, params.expectedRevision, {
        kind: params.kind,
        target: params.target,
        claimRefs: params.claimRefs,
        artifactRef,
        claimMarkerRef,
        status: "candidate",
      });
      return textResult(`Publication candidate bound at revision ${state.revision}.`, { revision: state.revision, bindingId: state.provenance.bindings.at(-1)?.bindingId });
    },
  });

  pi.registerTool({
    name: "hajimi_register_artifact",
    label: "Register artifact",
    description: "Hash and register a result, figure, paper, or other evidence-bearing task artifact.",
    promptSnippet: "Register a result or delivery artifact with its SHA-256",
    parameters: Type.Object({ path: Type.String(), note: Type.Optional(Type.String()) }),
    async execute(_id, params) {
      const ref = await registerArtifact(cwd, params.path, params.note);
      return textResult(compactJson(ref), ref as unknown as Record<string, unknown>);
    },
  });

  pi.registerTool({
    name: "hajimi_checkpoint",
    label: "Create checkpoint",
    description: "Persist a recoverable task checkpoint after a major experiment or route change.",
    promptSnippet: "Create a durable modeling-task checkpoint",
    parameters: Type.Object({ summary: Type.String() }),
    async execute(_id, params) {
      const name = await createHajimiCheckpoint(cwd, params.summary);
      return textResult(`Checkpoint created: ${name}`, { name });
    },
  });

  pi.registerTool({
    name: "hajimi_validate_delivery",
    label: "Validate delivery",
    description: "Run HaJiMi's deterministic input, artifact, figure, LaTeX, PDF, and traceability checks.",
    promptSnippet: "Validate modeling deliverables before final submission",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      strict: Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params, signal, onUpdate) {
      onUpdate?.(textResult("Running HaJiMi delivery validation in the selected runtime..."));
      const before = await deliveryFingerprint(cwd);
      const command = deliveryValidationCommand(params.strict !== false);
      const result = await backend.runShell(command, { cwd, signal, timeoutSeconds: 300 });
      const output = [result.stdout.toString("utf8"), result.stderr.toString("utf8")].filter(Boolean).join("\n").trim();
      if (result.exitCode !== 0) throw new Error(output || `Validation failed with exit code ${result.exitCode}`);
      await sealDeliveryValidation(cwd, before);
      const current = (await ensureHajimiTask(cwd)).state;
      const bindingRefs = current.provenance.bindings
        .filter((binding) => binding.kind === "paper" && binding.status === "candidate")
        .map((binding) => binding.bindingId);
      if (bindingRefs.length === 0) throw new Error("Delivery validation passed file checks but no claim-bound publication candidate exists");
      const state = await setRequirement(cwd, params.expectedRevision, 8, "delivery_candidate", "satisfied", bindingRefs);
      return textResult(output || "Delivery validation passed.", { exitCode: result.exitCode, revision: state.revision });
    },
  });

  pi.registerTool({
    name: "hajimi_request_gate",
    label: "Request human gate",
    description: "Record a workflow decision. Technical gates are derived automatically. Human stage review happens in chat, without popups. Use hajimi_freeze_evidence with evidenceRefs and claimRefs to freeze; never assemble hash lists.",
    promptSnippet: "Ask the user to approve a consequential modeling decision or final delivery",
    parameters: Type.Object({
      expectedRevision: Type.Number({ minimum: 0 }),
      gate: StringEnum(["route", "question_checkpoint", "host_capability", "evidence_freeze", "final_delivery"] as const),
      summary: Type.String(),
      stage: Type.Number({ minimum: 0, maximum: 9 }),
      questionId: Type.Optional(Type.String()),
      governedRefs: Type.Optional(Type.Array(governedRefSchema)),
    }),
    async execute(_id, params) {
      if (!isHajimiStageId(params.stage)) throw new Error("stage must be an integer from 0 through 9");
      if (params.gate === "evidence_freeze") return textResult("Call hajimi_freeze_evidence with evidenceRefs and claimRefs. The program computes all hashes and performs the technical freeze; no separate approval or governedRefs is needed.");
      const requested = await requestHajimiGate(
        cwd,
        params.expectedRevision,
        params.gate,
        params.summary,
        { stage: params.stage, questionId: params.questionId ?? null },
        params.governedRefs ?? [],
      );
      const gateId = requested.openGates.at(-1)!.gateId;
      const interaction = interactionFor(requested);
      if (params.gate === "final_delivery" || interaction.mode === "unselected"
        || (params.gate === "question_checkpoint" && interaction.mode === "supervised")) {
        interaction.pending = { kind: params.gate === "final_delivery" ? "final" : "gate", stage: params.stage, gateId };
        const state = await saveInteraction(cwd, requested, interaction);
        pi.sendMessage({ customType: "hajimi-review", display: true, content: `${params.summary}\n\n${reviewPrompt(state)}` }, { triggerTurn: false });
        return textResult("Decision presented in chat. Wait for the user's response.");
      }
      const decided = await resolveHajimiGate(cwd, requested.revision, gateId, "accepted", "Technical gate accepted under the selected workflow mode; review occurs at stage completion.");
      return textResult("Workflow decision recorded. Continue to the stage report.", { gateId, revision: decided.revision });
    },
  });
}

export function deliveryValidationCommand(strict: boolean): string {
  return `python3 -m hajimi_toolkit validate-delivery .${strict ? "" : " --no-strict"}`;
}
