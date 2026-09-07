import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import {
  boundHajimiToolText,
  createHajimiCoreFactory,
  deliveryValidationCommand,
} from "./core-extension.ts";
import { ensureHajimiTask, updateHajimiState } from "./task-state.ts";
import { mutateWorkflowState } from "./workflow-store.ts";
import { interactionFor, saveInteraction } from "./interaction.ts";
import { writeWorkflowStateAtomic } from "./workflow-store.ts";

test("stage 8 reuses unchanged integrated guidance and restores it after routing or context changes", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-paper-guidance-"));
  const handlers = new Map<string, (...args: never[]) => Promise<unknown>>();
  const notices: Array<{ content: string }> = [];
  const pi = {
    registerTool() {},
    on(name: string, handler: (...args: never[]) => Promise<unknown>) { handlers.set(name, handler); },
    sendMessage(message: { content: string }) { notices.push(message); },
  } as unknown as ExtensionAPI;
  try {
    let state = (await ensureHajimiTask(cwd)).state;
    state.focus.stage = 8;
    await writeWorkflowStateAtomic(cwd, state);
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    const project = async () => (await handlers.get("before_agent_start")!({ systemPrompt: "Base" } as never)) as { message?: { content: string } };
    const first = (await project()).message!.content;
    assert.match(first, /modeling-paper-standard/);
    assert.match(first, /modeling-plot-suite/);
    assert.match(first, /FORMAL-CONSUMPTION BLOCKED/);
    assert.equal((await project()).message, undefined);
    state = (await ensureHajimiTask(cwd)).state;
    await updateHajimiState(cwd, state.revision, { currentObjective: "Prepare current paper section", microPlan: state.microPlan, nextAction: state.nextAction });
    const delta = (await project()).message!.content;
    assert.match(delta, /Prepare current paper section/);
    assert.match(delta, /guidance is unchanged/);
    assert.ok(delta.length < first.length / 2, `${delta.length} vs ${first.length}`);
    await handlers.get("session_compact")!();
    assert.match(notices.at(-1)!.content, /modeling-paper-standard/);
    assert.match(notices.at(-1)!.content, /modeling-plot-suite/);
    state = (await ensureHajimiTask(cwd)).state;
    state.problemTags = ["optimization"];
    await writeWorkflowStateAtomic(cwd, state);
    assert.match((await project()).message!.content, /modeling-paper-standard/);
    await handlers.get("session_tree")!();
    assert.match((await project()).message!.content, /modeling-paper-standard/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("status defaults to concise state and paginates complete historical records", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-concise-status-"));
  const tools = new Map<string, { execute: (id: string, args: unknown) => Promise<{ content: Array<{ text: string }> }> }>();
  const pi = { registerTool(tool: { name: string; execute: (id: string, args: unknown) => Promise<{ content: Array<{ text: string }> }> }) { tools.set(tool.name, tool); }, on() {} } as unknown as ExtensionAPI;
  try {
    const state = (await ensureHajimiTask(cwd)).state;
    state.interaction = { ...interactionFor(state), reports: Array.from({ length: 100 }, () => ({ stage: 0 as const,
      path: "reports/old.md", summary: "historical details".repeat(100), createdAt: state.updatedAt })) };
    await writeWorkflowStateAtomic(cwd, state);
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    const status = tools.get("hajimi_task_status")!;
    const concise = (await status.execute("status", {})).content[0].text;
    assert.ok(concise.length < 5000);
    assert.doesNotMatch(concise, /historical details/);
    const page = JSON.parse((await status.execute("details", { section: "milestones", offset: 3, limit: 2 })).content[0].text);
    assert.deepEqual(page.records, state.milestones.slice(3, 5));
    assert.equal(page.nextOffset, 5);
    const last = JSON.parse((await status.execute("last", { section: "milestones", offset: 9, limit: 2 })).content[0].text);
    assert.equal(last.nextOffset, null);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("bundled Lab methodology references resolve on their first read", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-skill-reference-"));
  const tools = new Map<string, { execute: (id: string, args: unknown) => Promise<{ content: Array<{ text: string }> }> }>();
  const pi = { registerTool(tool: { name: string; execute: (id: string, args: unknown) => Promise<{ content: Array<{ text: string }> }> }) { tools.set(tool.name, tool); }, on() {} } as unknown as ExtensionAPI;
  try {
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    for (const path of ["references/lab-core/SKILL.md", "references/lab-core/1.0.0/methodology/modeling_workflow.md", "references/lab-core/1.1.0/methodology/validation_framework.md"]) {
      const result = await tools.get("read")!.execute("read", { path, limit: 5 });
      assert.ok(result.content[0].text.length > 30);
      assert.doesNotMatch(result.content[0].text, /ENOENT|escapes the task workspace/);
    }
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("delivery validation targets the routed task cwd instead of a nonexistent WSL mount", () => {
  assert.equal(
    deliveryValidationCommand(true),
    "python3 -m hajimi_toolkit validate-delivery .",
  );
  assert.equal(
    deliveryValidationCommand(false),
    "python3 -m hajimi_toolkit validate-delivery . --no-strict",
  );
});

test("entering each stage emits visible guidance, including revisiting stage zero", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-stage-guide-"));
  const tools = new Map<string, { execute: (id: string, args: unknown) => Promise<unknown> }>();
  const notices: Array<{ content: string; display: boolean }> = [];
  const pi = {
    registerTool(tool: { name: string; execute: (id: string, args: unknown) => Promise<unknown> }) { tools.set(tool.name, tool); },
    on() {}, sendMessage(message: { content: string; display: boolean }) { notices.push(message); },
  } as unknown as ExtensionAPI;
  try {
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    let state = (await ensureHajimiTask(cwd)).state;
    const focus = tools.get("hajimi_set_focus")!;
    for (let stage = 1; stage <= 9; stage++) {
      const currentStage = (stage - 1) as 0;
      for (const requirement of state.milestones[currentStage].requirements) {
        state = await mutateWorkflowState({ cwd, expectedRevision: state.revision,
          command: { kind: "set_requirement", stage: currentStage, requirementId: requirement.id, status: "satisfied", evidenceRefs: ["test-ref"] },
          ensure: async () => (await ensureHajimiTask(cwd)).state });
      }
      state = await mutateWorkflowState({ cwd, expectedRevision: state.revision,
        command: { kind: "set_milestone", stage: currentStage, status: "satisfied" },
        ensure: async () => (await ensureHajimiTask(cwd)).state });
      await focus.execute("test", { expectedRevision: state.revision, stage });
      state = (await ensureHajimiTask(cwd)).state;
      assert.match(notices.at(-1)!.content, new RegExp(`第 ${stage} 阶段`));
      assert.equal(notices.at(-1)!.display, true);
    }
    await focus.execute("test", { expectedRevision: state.revision, stage: 0 });
    assert.match(notices.at(-1)!.content, /第 0 阶段.*上传/);
    assert.equal(notices.length, 10);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("HaJiMi tool output is bounded without splitting UTF-8 text", () => {
  const original = Array.from({ length: 100 }, (_, index) => `${index}: 数学建模输出`).join("\n");
  const bounded = boundHajimiToolText(original, 512, 12);
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.originalLines, 100);
  assert.ok(Buffer.byteLength(bounded.text, "utf8") <= 512);
  assert.ok(bounded.text.split("\n").length <= 12);
  assert.doesNotMatch(bounded.text, /�/);
  assert.match(bounded.text, /tool output truncated/);
});

test("before_agent_start replaces the host cwd with task-relative WSL guidance", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-prompt-"));
  const handlers = new Map<string, (...args: never[]) => Promise<unknown>>();
  const pi = {
    registerTool() {},
    on(name: string, handler: (...args: never[]) => Promise<unknown>) {
      handlers.set(name, handler);
    },
  } as unknown as ExtensionAPI;

  try {
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    const handler = handlers.get("before_agent_start");
    assert.ok(handler);
    const result = await handler({
      systemPrompt: `Base prompt\nCurrent working directory: ${cwd.replaceAll("\\", "/")}`,
    } as never) as { systemPrompt: string; message?: { content: string } };
    assert.match(result.message?.content ?? "", /阶段 0：材料就绪/);

    assert.doesNotMatch(result.systemPrompt, /Current working directory: [A-Za-z]:\//);
    assert.match(
      result.systemPrompt,
      /Current working directory: HaJiMi task root \((windows-managed|wsl2) backend; use relative paths\)/,
    );
    assert.match(result.systemPrompt, /\/workspace is only the UI label/);
    assert.doesNotMatch(result.systemPrompt, /Current objective:/);

    const initial = await ensureHajimiTask(cwd);
    await updateHajimiState(cwd, initial.state.revision, {
      currentObjective: "dynamic objective",
      nextAction: "dynamic next action",
      microPlan: [{ id: "dynamic", title: "dynamic", status: "active", dependencies: [], outputs: [] }],
    });
    assert.equal(handlers.has("context"), false, "normal requests must never replace historical state messages");
    const contextResult = await handler({ systemPrompt: "Base prompt" } as never) as { message?: { content: string } };
    const live = contextResult.message;
    assert.match(live?.content ?? "", /revision=1/);
    assert.match(live?.content ?? "", /objective=dynamic objective/);
    assert.match(live?.content ?? "", /guidance is unchanged/);
    assert.doesNotMatch(live?.content ?? "", /阶段 0：材料就绪/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("a persisted chat pause permits inspection, blocks mutation, and aborts the tool turn", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-chat-pause-"));
  const handlers = new Map<string, (...args: never[]) => Promise<unknown>>();
  const pi = {
    registerTool() {},
    sendMessage() {},
    on(name: string, handler: (...args: never[]) => Promise<unknown>) { handlers.set(name, handler); },
  } as unknown as ExtensionAPI;
  try {
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    const initial = (await ensureHajimiTask(cwd)).state;
    const interaction = interactionFor(initial);
    interaction.mode = "supervised";
    interaction.pending = { kind: "stage", stage: 0 };
    await saveInteraction(cwd, initial, interaction);

    const input = handlers.get("input")!;
    assert.equal(await input({ source: "extension", text: "继续下一阶段" } as never), undefined);
    assert.equal(await input({ source: "interactive", text: "请解释报告" } as never), undefined);
    const toolCall = handlers.get("tool_call")!;
    assert.equal(await toolCall({ toolName: "read" } as never), undefined);
    const blocked = await toolCall({ toolName: "write" } as never) as { block: boolean };
    assert.equal(blocked.block, true);
    let aborted = 0;
    await handlers.get("turn_end")!({} as never, { abort() { aborted++; } } as never);
    assert.equal(aborted, 1);

    const continued = await input({ source: "interactive", text: "继续下一阶段", images: [] } as never) as { action: string };
    assert.equal(continued.action, "transform");
    assert.equal((await ensureHajimiTask(cwd)).state.interaction?.pending, null);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("stage 9 exposes only the dedicated submission exception and still requires accepted inputs", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-submission-guard-"));
  const handlers = new Map<string, (...args: never[]) => Promise<unknown>>();
  const tools = new Map<string, { execute: (id: string, args: unknown) => Promise<unknown> }>();
  const pi = { registerTool(tool: { name: string; execute: (id: string, args: unknown) => Promise<unknown> }) { tools.set(tool.name, tool); },
    on(name: string, handler: (...args: never[]) => Promise<unknown>) { handlers.set(name, handler); }, sendMessage() {} } as unknown as ExtensionAPI;
  try {
    const state = (await ensureHajimiTask(cwd)).state;
    state.focus.stage = 9;
    state.interaction = { ...interactionFor(state), finalAccepted: true };
    await writeWorkflowStateAtomic(cwd, state);
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    for (const name of ["bash", "write", "edit", "hajimi_set_requirement", "hajimi_set_milestone"]) {
      assert.equal((await handlers.get("tool_call")!({ toolName: name } as never) as { block: boolean }).block, true);
    }
    assert.equal(await handlers.get("tool_call")!({ toolName: "hajimi_generate_submission" } as never), undefined);
    assert.equal(tools.has("hajimi_complete_submission"), false);
    await assert.rejects(tools.get("hajimi_generate_submission")!.execute("generate", {
      expectedRevision: state.revision, action: "package", configJson: "{}",
    }), /human acceptance with an input snapshot/);
    assert.equal(existsSync(join(cwd, "deliverables")), false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("submission history reads only the matching session branch without reasoning or binary content", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-session-evidence-"));
  const tools = new Map<string, { execute: (...args: never[]) => Promise<{ content: Array<{ text: string }> }> }>();
  const pi = { registerTool(tool: { name: string; execute: (...args: never[]) => Promise<{ content: Array<{ text: string }> }> }) { tools.set(tool.name, tool); }, on() {}, sendMessage() {} } as unknown as ExtensionAPI;
  try {
    await ensureHajimiTask(cwd);
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    const context = { sessionManager: { getCwd: () => cwd, getBranch: () => [
      { type: "model_change", id: "m", timestamp: "2026-09-06", provider: "fixture", modelId: "test-model" },
      { type: "message", id: "u", timestamp: "2026-09-06", message: { role: "user", content: [{ type: "text", text: "实际提示" }] } },
      { type: "message", id: "a", timestamp: "2026-09-06", message: { role: "assistant", content: [{ type: "thinking", thinking: "PRIVATE_REASONING" }, { type: "text", text: "可见回答" }, { type: "image", data: "BINARY_IMAGE" }] } },
    ] } };
    const result = await tools.get("hajimi_task_status")!.execute("history" as never, { section: "session", limit: 5 } as never, undefined as never, undefined as never, context as never);
    const text = result.content[0].text;
    assert.match(text, /实际提示/);
    assert.match(text, /test-model/);
    assert.doesNotMatch(text, /PRIVATE_REASONING|BINARY_IMAGE/);
    context.sessionManager.getCwd = () => join(cwd, "another-task");
    await assert.rejects(tools.get("hajimi_task_status")!.execute("history" as never, { section: "session" } as never, undefined as never, undefined as never, context as never), /matching task session/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("concurrent tool batch cannot write after the milestone pauses", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-batch-pause-"));
  const tools = new Map<string, { execute: (id: string, args: unknown) => Promise<unknown> }>();
  const pi = {
    registerTool(tool: { name: string; execute: (id: string, args: unknown) => Promise<unknown> }) { tools.set(tool.name, tool); },
    on() {}, sendMessage() {},
  } as unknown as ExtensionAPI;
  try {
    let state = (await ensureHajimiTask(cwd)).state;
    state = await saveInteraction(cwd, state, interactionFor(state));
    for (const r of state.milestones[0].requirements) {
      state = await mutateWorkflowState({cwd, expectedRevision:state.revision,
        command:{kind:"set_requirement",stage:0,requirementId:r.id,status:"satisfied",evidenceRefs:["fixture"]},
        ensure:async()=>(await ensureHajimiTask(cwd)).state});
    }
    createHajimiCoreFactory({cwd,productRoot:process.cwd()})(pi);
    const results = await Promise.allSettled([
      tools.get("hajimi_set_milestone")!.execute("end",{expectedRevision:state.revision,stage:0,status:"satisfied"}),
      tools.get("write")!.execute("write",{path:"output/forbidden.txt",content:"forbidden"}),
    ]);
    assert.equal(results[0].status,"fulfilled");
    assert.equal(results[1].status,"rejected");
    assert.equal(existsSync(join(cwd,"output/forbidden.txt")),false);
    assert.equal((await ensureHajimiTask(cwd)).state.interaction?.pending?.kind,"mode");
  } finally {rmSync(cwd,{recursive:true,force:true});}
});
