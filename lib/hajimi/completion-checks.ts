import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { captureStageFiles } from "./stage-files.ts";
import { validateFigurePlan } from "./figure-plan.ts";
import type { HajimiWorkflowState } from "./workflow-types.ts";

export async function requireOutput(cwd: string, path: string): Promise<void> {
  const root = await realpath(cwd);
  const full = await realpath(resolve(root, path));
  const local = relative(root, full).replaceAll("\\", "/");
  if (isAbsolute(path) || !local || local.startsWith("../") || isAbsolute(local)
      || /^(input|\.hajimi|reports)\//.test(local)) throw new Error(`Use a generated task-relative output: ${path}`);
  const info = await stat(full);
  if (!info.isFile() || !info.size) throw new Error(`Missing or empty output: ${path}`);
}

/** Reuse existing output refs and question packets; no new completion ledger. */
export async function checkStageCompletion(cwd: string, state: HajimiWorkflowState, stage: number, outputs: string[]) {
  if (stage === 0) {
    const manifest = JSON.parse(await readFile(resolve(cwd, ".hajimi/input-manifest.json"), "utf8"));
    if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("Inspect and freeze nonempty problem inputs before completing stage 0.");
    return;
  }
  if (!outputs.length) throw new Error(`Stage ${stage} requires actual output files; a summary alone is insufficient.`);
  await Promise.all(outputs.map(path => requireOutput(cwd, path)));
  if (stage === 4) {
    if (!state.questions.length) throw new Error("Define all problem questions before completing modeling.");
    const files = await captureStageFiles(cwd);
    for (const q of state.questions) {
      if (!q.selectedCandidateRef || !q.localValidationRefs.length || q.status === "blocked" || q.status === "stale"
          || q.microPlan.some(item => item.status !== "completed" && item.status !== "discarded")) throw new Error(`${q.questionId}: finish solving and local validation before completing stage 4.`);
      if (q.routeUncertainty === "material" && q.candidateRefs.length < 2) throw new Error(`${q.questionId}: compare at least two candidate methods.`);
      for (const ref of [...q.candidateRefs, ...q.localValidationRefs]) {
        if (!files.some(f => f.sha256 === ref.sha256 && f.sizeBytes)) throw new Error(`${q.questionId}: method/validation reference ${ref.id} has no matching actual file.`);
      }
      const results = q.microPlan.flatMap(item => item.outputs ?? []);
      if (!results.length) throw new Error(`${q.questionId}: save the actual solution outputs.`);
      await Promise.all(results.map(path => requireOutput(cwd, path)));
    }
  }
  if ([3, 5, 6].includes(stage)) {
    if (!outputs.some(path => /\.(py|r|m|jl|js|ts|ipynb|sh)$/i.test(path))
        || !outputs.some(path => /\.(json|csv|xlsx|txt|log)$/i.test(path))) throw new Error(`Stage ${stage}: include the computation/checking code and its saved results among the output files.`);
  }
  if (stage === 7 || stage === 8) {
    await validateFigurePlan(cwd, "FIGURE_PLAN.json");
    const plan = JSON.parse(await readFile(resolve(cwd, "FIGURE_PLAN.json"), "utf8"));
    const ids = state.questions.map(q => q.questionId).sort();
    if (!ids.length || JSON.stringify(plan.questions.map((q: { id: string }) => q.id).sort()) !== JSON.stringify(ids)) throw new Error("Figure plan must cover exactly the defined problem questions.");
  }
}
