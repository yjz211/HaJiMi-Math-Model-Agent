/** Real registered tools + Windows backend. Acceptance/provenance are explicit TEST fixtures. */
import { copyFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHajimiCoreFactory } from "../lib/hajimi/core-extension.ts";
import { ensureHajimiTask, registerArtifact } from "../lib/hajimi/task-state.ts";
import { markNewWindowsWorkspace } from "../lib/hajimi/workspace-backend-factory.ts";
import { writeWorkflowStateAtomic } from "../lib/hajimi/workflow-store.ts";
import { reduceWorkflowState } from "../lib/hajimi/workflow-reducer.ts";
import { interactionFor } from "../lib/hajimi/interaction.ts";
import { captureStageFiles } from "../lib/hajimi/stage-files.ts";

const productRoot = process.cwd();
const cwd = await mkdtemp(join(tmpdir(), "hajimi-submission-tools-"));
{
  await markNewWindowsWorkspace(cwd);
  let { state } = await ensureHajimiTask(cwd);
  await copyFile(process.env.HAJIMI_TEST_SUBMISSION_BODY ?? join(productRoot, "docs/verification/native-20260905/live-skill/5a705a37-6ab0-470f-967a-9248f4ae38ef/paper/efficiency_prepare/main.pdf"), join(cwd, "paper/main.pdf"));
  await copyFile(join(productRoot, "scripts/submission/build_code_appendix.py"), join(cwd, "src/appendix.py"));
  const paper = await registerArtifact(cwd, "paper/main.pdf");
  state.provenance.evidence = [{ evidenceId: "fixture-evidence", experimentRefs: [], artifactRefs: [], validationMethod: "TEST fixture only", status: "frozen", domainValidationStatus: "accepted", limitations: ["Not a real paper acceptance"], staleBy: [] }];
  state.provenance.claims = [{ claimId: "fixture-claim", text: "TEST plumbing only", kind: "qualitative", evidenceRefs: ["fixture-evidence"], status: "supported", staleBy: [] }];
  state.provenance.freezes = [{ freezeId: "fixture-freeze", evidenceRefs: ["fixture-evidence"], claimRefs: ["fixture-claim"], governedRefs: [], createdAt: state.updatedAt, status: "active" }];
  state.provenance.bindings = [{ bindingId: "fixture-paper", kind: "paper", target: paper.path, claimRefs: ["fixture-claim"], artifactRef: paper, status: "candidate", staleBy: [] }];
  state.focus.stage = 8;
  state.interaction = { ...interactionFor(state), mode: "automatic", pending: { kind: "final", stage: 8 } };
  for (const milestone of state.milestones.filter(item => item.stage < 9)) milestone.status = "satisfied";
  state = reduceWorkflowState(state, { kind: "accept_final", bindingRefs: ["fixture-paper"], note: "Synthetic acceptance fixture; not user acceptance of this paper", files: await captureStageFiles(cwd, true) });
  await writeWorkflowStateAtomic(cwd, state);
}
const tools = new Map<string, { execute: (id: string, params: unknown) => Promise<{ content: Array<{ text?: string }> }> }>();
const pi = { registerTool(tool: { name: string; execute: (id: string, params: unknown) => Promise<{ content: Array<{ text?: string }> }> }) { tools.set(tool.name, tool); }, on() {}, sendMessage() {} } as unknown as ExtensionAPI;
createHajimiCoreFactory({ cwd, productRoot })(pi);
{
  const run = async (action: string, config: unknown) => {
    const { state } = await ensureHajimiTask(cwd);
    const result = await tools.get("hajimi_generate_submission")!.execute(action, { expectedRevision: state.revision, action, configJson: JSON.stringify(config) });
    const output = JSON.parse(result.content[0].text!);
    console.log(`${action}: ${output.artifact.path}`);
    return output;
  };
  const code = { source: "src/appendix.py", target: "代码/appendix.py", appendix: "B1", purpose: "代码附录生成器隔离测试" };
  const appendix = await run("code_appendix", { papers: { without_code: "paper/main.pdf" }, code_files: [code] });
  const aiConfig = JSON.parse(await readFile(process.env.HAJIMI_TEST_SUBMISSION_AI_CONFIG ?? "C:/Users/hhhh/AppData/Local/Temp/hajimi-submission-chain-eqntpr77/deliverables/ai/generation-config.json", "utf8"));
  const ai = await run("ai_report", aiConfig);
  const packageResult = await run("package", { papers: { without_code: "paper/main.pdf", with_code: appendix.artifact.path },
    ai_report_pdf: ai.pdfArtifact.path, code_files: [code], data_instructions: "隔离测试，不包含正式题目数据。", run_steps: ["用受管Python运行附录生成器并提供配置JSON。"] });
  console.log(JSON.stringify({ cwd, package: packageResult.artifact.path, status: (await ensureHajimiTask(cwd)).state.status }, null, 2));
}
