import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateFigurePlan } from "./figure-plan.ts";
import { captureStageFiles } from "./stage-files.ts";
import { createWorkspaceBackend, type WorkspaceBackend } from "./workspace-backend-factory.ts";

declare global {
  var __hajimiPaperQualityCache: Map<string, { fingerprint: string; output: string; exitCode: number | null }> | undefined;
}
const cache = globalThis.__hajimiPaperQualityCache ??= new Map();

/** Runs automatically on completion in BOTH policies; no audit/freeze tool round trips. */
export async function checkPaperQuality(cwd: string,
  runtime?: { backend: WorkspaceBackend; productRoot: string; signal?: AbortSignal }) {
  await validateFigurePlan(cwd, "FIGURE_PLAN.json");
  const productRoot = runtime?.productRoot ?? process.cwd();
  const phase = JSON.parse(await readFile(join(cwd, ".hajimi/stage8-phases.json"), "utf8"));
  if (!["review", "ready"].includes(phase.phase) || phase.severeIssues?.length) throw new Error("Review the actual PDF pages and resolve outstanding defects before completing delivery.");
  const fingerprint = createHash("sha256").update(JSON.stringify({ files: await captureStageFiles(cwd),
    questions: JSON.parse(await readFile(join(cwd, ".hajimi/state.json"), "utf8")).questions,
    checker: await readFile(join(productRoot, "toolkit/src/hajimi_toolkit/paper_quality.py"), "utf8") })).digest("hex");
  let result = cache.get(cwd);
  if (result?.fingerprint !== fingerprint) {
    const backend = runtime?.backend ?? createWorkspaceBackend(cwd, { productRoot, toolkitRoot: join(productRoot, "toolkit/src"), capabilitiesRoot: join(productRoot, "bundled/capabilities") });
    const execution = await backend.runShell("PYTHONDONTWRITEBYTECODE=1 PYTHONUTF8=1 python3 -m hajimi_toolkit check-paper .", {
      cwd, signal: runtime?.signal, timeoutSeconds: 300,
    });
    result = { fingerprint, output: execution.stdout.toString("utf8"), exitCode: execution.exitCode };
    if (!result.output.trim()) result.output = execution.stderr.toString("utf8").slice(-2000);
    cache.set(cwd, result);
  }
  let report: { passed: boolean; pages: number; issues: unknown[] };
  try { report = JSON.parse(result.output); }
  catch { throw new Error(`Paper completion checker failed: ${result.output.slice(-2000)}`); }
  if (result.exitCode !== 0 || !report.passed) throw new Error(`Paper completion checks failed. Fix these issues; existing files remain available:\n${JSON.stringify(report.issues)}`);
}
