import { randomUUID } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { loadCapabilityRegistry } from "./capability-router.ts";
import { assertSubmissionInputs } from "./submission-inputs.ts";
import { ensureHajimiTask, registerArtifact } from "./task-state.ts";
import { mutateWorkflowState, withTaskLock } from "./workflow-store.ts";
import { fileReadUrl } from "./stage-files.ts";
import type { WorkspaceBackend } from "./workspace-backend-factory.ts";

export type SubmissionAction = "ai_report" | "package" | "code_appendix";

/** Fixed bundled programs only: no caller command, executable, or output path. */
export async function runSubmissionAction(input: {
  cwd: string; productRoot: string; backend: WorkspaceBackend; expectedRevision: number;
  action: SubmissionAction; config: Record<string, unknown>; signal?: AbortSignal;
}) {
  const generated = await withTaskLock(input.cwd, async () => {
    const { state } = await ensureHajimiTask(input.cwd);
    if (state.revision !== input.expectedRevision) throw new Error("Revision changed; read task status again.");
    await assertSubmissionInputs(input.cwd, state);
    await loadCapabilityRegistry(input.productRoot);
    const cwd = await realpath(input.cwd);
    const deliveryRoot = join(cwd, "deliverables");
    await mkdir(deliveryRoot, { recursive: true });
    if ((await realpath(deliveryRoot)).toLowerCase() !== deliveryRoot.toLowerCase()) {
      throw new Error("Submission output root cannot be a symlink or junction.");
    }
    const output = join(deliveryRoot, `submission-${randomUUID()}`);
    await mkdir(output);
    const config = structuredClone(input.config);
    const sourcePath = (path: string) => relative(output, resolve(cwd, path)).replaceAll("\\", "/");
    if (input.action === "ai_report") {
      config.output_docx = "AI工具使用详情.docx";
      config.output_pdf = "AI工具使用详情.pdf";
    } else {
      const papers = config.papers as Record<string, unknown> | undefined;
      const body = typeof papers?.without_code === "string" ? resolve(cwd, papers.without_code) : "";
      const accepted = state.interaction!.acceptedSubmissionInputs!;
      if (!state.provenance.bindings.some(binding => accepted.bindingRefs.includes(binding.bindingId)
        && binding.artifactRef && resolve(cwd, binding.artifactRef.path) === body)) {
        throw new Error("Package body must be the human-accepted paper artifact.");
      }
      // Task-relative source paths remain portable across Windows and WSL.
      for (const key of ["with_code", "without_code"]) {
        if (typeof papers?.[key] === "string") papers[key] = sourcePath(papers[key] as string);
      }
      if (typeof config.ai_report_pdf === "string") config.ai_report_pdf = sourcePath(config.ai_report_pdf);
      for (const key of ["code_files", "extra_files"]) {
        if (config[key] !== undefined && !Array.isArray(config[key])) throw new Error(`${key} must be an array.`);
        for (const item of (config[key] ?? []) as Array<Record<string, unknown>>) {
          if (typeof item.source !== "string") throw new Error("Submission source path is required.");
          item.source = sourcePath(item.source);
        }
      }
      config.workspace_root = sourcePath(".");
      config.output_dir = ".";
      config.staging_name = "package";
      config.zip_name = "提交包.zip";
      config.replace = false;
    }
    const configPath = join(output, "generation-config.json");
    await writeFile(configPath, JSON.stringify(config, null, 2), { flag: "wx" });
    const script = input.action === "ai_report" ? "render_ai_usage_report.py"
      : input.action === "code_appendix" ? "build_code_appendix.py" : "build_submission_package.py";
    const exportPdf = input.action === "ai_report" && ["final", "提交版"].includes(String(config.document_status).trim().toLowerCase());
    const args = Buffer.from(JSON.stringify([relative(cwd, configPath).replaceAll("\\", "/"), script, exportPdf])).toString("base64");
    const code = `import base64,json,os,runpy,sys; a=json.loads(base64.b64decode("${args}")); p=os.path.join(os.environ["HAJIMI_CAPABILITIES_ROOT"],"modeling-submission-package","1.0.0","resources","scripts",a[1]); sys.argv=[p,a[0]]+(["--export-pdf"] if a[2] else []); runpy.run_path(p,run_name="__main__")`;
    const result = await input.backend.runShell(`PYTHONDONTWRITEBYTECODE=1 PYTHONUTF8=1 python3 -c '${code}'`, {
      cwd, signal: input.signal, timeoutSeconds: 300,
    });
    await assertSubmissionInputs(cwd, (await ensureHajimiTask(cwd)).state);
    const stdout = result.stdout.toString("utf8").trim();
    if (result.exitCode !== 0) throw new Error(result.stderr.toString("utf8") || stdout || "Submission generator failed.");
    const artifact = await registerArtifact(cwd, join(output, input.action === "ai_report" ? "AI工具使用详情.docx"
      : input.action === "code_appendix" ? "00_论文_含完整代码附录.pdf" : "提交包.zip"), "Stage 9 generated artifact.");
    const pdfArtifact = exportPdf ? await registerArtifact(cwd, join(output, "AI工具使用详情.pdf"), "Generated AI report PDF.") : undefined;
    return { output, artifact, pdfArtifact, generator: JSON.parse(stdout), status: "generated" };
  });
  if (input.action !== "package") return generated;
  const reportPath = `reports/stage-9-submission-${randomUUID()}.md`;
  const summary = "提交材料已生成并成功打包，ZIP 已登记；已验收正文与冻结证据保持不变。";
  await mkdir(join(input.cwd, "reports"), { recursive: true });
  await writeFile(join(input.cwd, reportPath), `# 第9阶段提交材料\n\n${summary}\n\n- [${generated.artifact.path}](${fileReadUrl(resolve(input.cwd, generated.artifact.path))})\n`, { flag: "wx" });
  const state = await mutateWorkflowState({ cwd: input.cwd, expectedRevision: input.expectedRevision,
    ensure: async () => (await ensureHajimiTask(input.cwd)).state,
    command: { kind: "complete_submission", evidenceRefs: [generated.artifact.id], reportPath, summary } });
  return { ...generated, status: "completed", reportPath, revision: state.revision };
}
