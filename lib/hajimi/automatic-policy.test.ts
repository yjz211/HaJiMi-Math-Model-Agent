import { markWorkflowTestWorkspace } from "./workflow-test-workspace.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHajimiCoreFactory } from "./core-extension.ts";
import { ensureHajimiTask } from "./task-state.ts";
import { writeWorkflowStateAtomic } from "./workflow-store.ts";
import { interactionFor } from "./interaction.ts";
import { automaticRunLocked, automaticRunActive } from "./automatic-policy.ts";
import { AgentSessionWrapper } from "../rpc-manager.ts";

test("automatic runtime continues normal stops, unlocks terminal failures, and stops at delivery", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-autonomy-"));
  markWorkflowTestWorkspace(cwd);
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const sent: Array<{ message: Record<string, unknown>; options: Record<string, unknown> }> = [];
  const pi = { registerTool() {}, on(name: string, handler: (...args: unknown[]) => unknown) { handlers.set(name, handler); },
    sendMessage(message: Record<string, unknown>, options: Record<string, unknown>) { sent.push({ message, options }); } } as unknown as ExtensionAPI;
  try {
    const state = (await ensureHajimiTask(cwd)).state;
    state.focus.stage = 4;
    state.interaction = { ...interactionFor(state), mode: "automatic" };
    await writeWorkflowStateAtomic(cwd, state);
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    assert.equal(automaticRunLocked(state), false);
    await handlers.get("input")!({ source: "rpc", text: "切换半自动" });
    assert.equal((await ensureHajimiTask(cwd)).state.interaction?.mode, "supervised");
    await handlers.get("input")!({ source: "rpc", text: "全自动" });
    await handlers.get("agent_start")!();
    await handlers.get("message_end")!({ message: { role: "assistant", stopReason: "stop" } });
    await handlers.get("agent_settled")!({}, { isIdle: () => true });
    assert.equal(sent.at(-1)?.options.triggerTurn, true);
    // Ordinary tool failures never become runtime failure or human approval.
    await handlers.get("tool_result")!({ toolName: "bash", isError: true });
    assert.equal(automaticRunActive((await ensureHajimiTask(cwd)).state), true);
    await handlers.get("message_end")!({ message: { role: "assistant", stopReason: "error", errorMessage: "provider unavailable after retries" } });
    await handlers.get("agent_settled")!({}, { isIdle: () => true });
    assert.equal(automaticRunActive((await ensureHajimiTask(cwd)).state), false);
    assert.equal(sent.at(-1)?.message.customType, "hajimi-runtime-failure");
    await handlers.get("input")!({ source: "rpc", text: "已恢复，继续" });
    assert.equal(automaticRunActive((await ensureHajimiTask(cwd)).state), true);
    const delivered = (await ensureHajimiTask(cwd)).state;
    delivered.focus.stage = 8;
    delivered.interaction!.pending = { kind: "final", stage: 8 };
    await writeWorkflowStateAtomic(cwd, delivered);
    const count = sent.length;
    await handlers.get("agent_settled")!({}, { isIdle: () => true });
    assert.equal(sent.length, count);
    assert.equal(automaticRunLocked(delivered), false);
    delivered.interaction!.mode = "supervised";
    delivered.interaction!.pending = { kind: "stage", stage: 8 };
    assert.equal(automaticRunLocked(delivered), false);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test("automatic RPC accepts user prompts and aborts", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-auto-rpc-"));
  markWorkflowTestWorkspace(cwd);
  let calls = 0;
  const wrapper = new AgentSessionWrapper({ sessionManager: { getHeader: () => ({ cwd }) },
    abort: async () => {}, dispose: () => {}, getAllTools: () => [], getActiveToolNames: () => [],
    prompt: async () => { calls++; } } as never);
  try {
    const state = (await ensureHajimiTask(cwd)).state;
    state.focus.stage = 1;
    state.interaction = { ...interactionFor(state), mode: "automatic" };
    await writeWorkflowStateAtomic(cwd, state);
    await wrapper.send({ type: "prompt", message: "adjust approach" });
    await wrapper.send({ type: "abort" });
    assert.ok((await ensureHajimiTask(cwd)).state.interaction?.runtimeFailure);
    assert.deepEqual(await wrapper.send({ type: "get_tools" }), []);
    assert.equal(calls, 1);
  } finally { await wrapper.destroy(); rmSync(cwd, { recursive: true, force: true }); }
});

for (const blocked of [true, false]) test(`automatic stops ${blocked ? "blocked stage" : "idle continuation loop"}`, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-no-loop-"));
  markWorkflowTestWorkspace(cwd);
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  let continuations = 0;
  const pi = { registerTool() {}, on(name: string, handler: (...args: unknown[]) => unknown) { handlers.set(name, handler); },
    sendMessage(_message: unknown, options: { triggerTurn?: boolean }) { if (options.triggerTurn) continuations++; } } as unknown as ExtensionAPI;
  try {
    const state = (await ensureHajimiTask(cwd)).state;
    state.focus.stage = 6;
    state.interaction = { ...interactionFor(state), mode: "automatic" };
    if (blocked) state.milestones[6].status = "blocked";
    await writeWorkflowStateAtomic(cwd, state);
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    for (let run = 0; run < 6; run++) {
      await handlers.get("agent_start")!();
      await handlers.get("message_end")!({ message: { role: "assistant", stopReason: "stop" } });
      await handlers.get("agent_settled")!({}, { isIdle: () => true });
    }
    assert.equal(continuations, blocked ? 0 : 2);
    assert.ok((await ensureHajimiTask(cwd)).state.interaction?.runtimeFailure);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
