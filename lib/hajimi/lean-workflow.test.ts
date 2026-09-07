import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHajimiCoreFactory } from "./core-extension.ts";
import { ensureHajimiTask, freezeHajimiInputs } from "./task-state.ts";
import { interactionFor, handleReviewInput } from "./interaction.ts";
import { writeWorkflowStateAtomic } from "./workflow-store.ts";
import { MODELING_START_PROMPT } from "./modeling-project.ts";

test("lean reports require actual outputs and cannot silently waive incomplete modeling", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "hajimi-lean-journey-"));
  const tools = new Map<string, { execute(id: string, args: unknown): Promise<unknown> }>();
  const pi = { registerTool(tool: { name: string; execute(id: string, args: unknown): Promise<unknown> }) { tools.set(tool.name, tool); }, on() {}, sendMessage() {} } as unknown as ExtensionAPI;
  const call = (name: string, args: Record<string, unknown>) => tools.get(name)!.execute("test", { expectedRevision: 0, ...args });
  try {
    let state = (await ensureHajimiTask(cwd)).state;
    state.interaction = interactionFor(state);
    await writeWorkflowStateAtomic(cwd, state);
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    await writeFile(join(cwd, "input/problem.txt"), "Compare two methods.");
    await assert.rejects(call("hajimi_set_milestone", { stage: 0, status: "satisfied" }));
    await freezeHajimiInputs(cwd);
    await call("hajimi_set_milestone", { stage: 0, status: "satisfied", summary: "Materials checked" });
    await handleReviewInput(cwd, "全自动");
    await handleReviewInput(cwd, "清爽快速运行型");
    await call("hajimi_set_focus", { stage: 1 });
    await writeFile(join(cwd, "work/result.md"), "Problem facts, assumptions and audited data.");
    for (const stage of [1, 2]) {
      await assert.rejects(call("hajimi_set_milestone", { stage, status: "satisfied" }), /actual output/);
      await call("hajimi_set_milestone", { stage, status: "satisfied", files: [{ path: "work/result.md", purpose: "Stage findings" }] });
    }
    await assert.rejects(call("hajimi_set_milestone", { stage: 3, status: "satisfied", files: [{ path: "work/result.md", purpose: "Summary" }] }), /code and its saved results/);
    state = (await ensureHajimiTask(cwd)).state;
    assert.equal(state.focus.stage, 3);
    assert.equal(state.milestones[1].requirements[0].status, "satisfied");
    assert.equal(state.milestones[3].requirements[0].status, "unmet");
    assert.equal(state.provenance.freezes.length, 0);
    assert.match(MODELING_START_PROMPT, /不要提前询问/);
    const guide = await readFile("bundled/workflows/modeling-core/1.0.0/stage-cards/4.md", "utf8");
    for (const term of ["多路线", "交叉验证", "独立实现", "敏感性", "继续迭代"]) assert.ok(guide.includes(term));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("independent tools use runtime revisions while waivers remain unavailable", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "hajimi-lean-tools-"));
  const tools = new Map<string, { execute(id: string, args: unknown): Promise<unknown> }>();
  const pi = { registerTool(tool: { name: string; execute(id: string, args: unknown): Promise<unknown> }) { tools.set(tool.name, tool); }, on() {} } as unknown as ExtensionAPI;
  try {
    const state = (await ensureHajimiTask(cwd)).state;
    state.focus.stage = 2;
    await writeWorkflowStateAtomic(cwd, state);
    createHajimiCoreFactory({ cwd, productRoot: process.cwd() })(pi);
    const tool = tools.get("hajimi_set_requirement")!;
    const results = await Promise.allSettled(["satisfied", "blocked"].map(status => tool.execute(status, { expectedRevision: 0, stage: 2, requirementId: "data_and_sources", status, evidenceRefs: [] })));
    for (const result of results) assert.equal(result.status, "fulfilled");
    await assert.rejects(tool.execute("waived", { expectedRevision: 0, stage: 2, requirementId: "data_and_sources", status: "waived", evidenceRefs: [] }), /cannot be waived/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
