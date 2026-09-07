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
import { automaticRunLocked } from "./automatic-policy.ts";
import { AgentSessionWrapper } from "../rpc-manager.ts";

test("automatic runtime continues normal stops, unlocks terminal failures, and stops at delivery", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-autonomy-"));
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
    assert.equal(automaticRunLocked(state), true);
    assert.deepEqual(await handlers.get("input")!({ source: "rpc", text: "切换半自动" }), { action: "handled" });
    assert.equal((await ensureHajimiTask(cwd)).state.interaction?.mode, "automatic");
    await handlers.get("agent_start")!();
    await handlers.get("message_end")!({ message: { role: "assistant", stopReason: "stop" } });
    await handlers.get("agent_settled")!({}, { isIdle: () => true });
    assert.equal(sent.at(-1)?.options.triggerTurn, true);
    // Ordinary tool failures never become runtime failure or human approval.
    await handlers.get("tool_result")!({ toolName: "bash", isError: true });
    assert.equal(automaticRunLocked((await ensureHajimiTask(cwd)).state), true);
    await handlers.get("message_end")!({ message: { role: "assistant", stopReason: "error", errorMessage: "provider unavailable after retries" } });
    await handlers.get("agent_settled")!({}, { isIdle: () => true });
    assert.equal(automaticRunLocked((await ensureHajimiTask(cwd)).state), false);
    assert.equal(sent.at(-1)?.message.customType, "hajimi-runtime-failure");
    await handlers.get("input")!({ source: "rpc", text: "已恢复，继续" });
    assert.equal(automaticRunLocked((await ensureHajimiTask(cwd)).state), true);
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

test("RPC lock rejects all mutating commands using persisted workflow state", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-auto-rpc-"));
  let calls = 0;
  const wrapper = new AgentSessionWrapper({ sessionManager: { getHeader: () => ({ cwd }) },
    abort: async () => {}, dispose: () => {}, getAllTools: () => [], getActiveToolNames: () => [],
    prompt: async () => { calls++; } } as never);
  try {
    const state = (await ensureHajimiTask(cwd)).state;
    state.focus.stage = 1;
    state.interaction = { ...interactionFor(state), mode: "automatic" };
    await writeWorkflowStateAtomic(cwd, state);
    for (const type of ["prompt", "steer", "follow_up", "abort", "fork", "navigate_tree", "set_model", "set_thinking_level", "compact", "set_tools", "set_agent_mode", "set_auto_retry", "extension_ui_response"]) {
      await assert.rejects(wrapper.send({ type, message: "interfere" }), /全自动正在/);
    }
    assert.deepEqual(await wrapper.send({ type: "get_tools" }), []);
    assert.equal(calls, 0);
  } finally { await wrapper.destroy(); rmSync(cwd, { recursive: true, force: true }); }
});
