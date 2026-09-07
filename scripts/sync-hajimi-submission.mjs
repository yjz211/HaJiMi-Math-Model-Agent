import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';

// Explicit source: never reads or mutates the ambient Codex skill directory.
const source = resolve(process.env.HAJIMI_SUBMISSION_SKILL_ROOT ?? 'C:/Users/hhhh/Desktop/MathModeling-AI-Lab/.codex/skills/modeling-submission-package');
const root = resolve('bundled/capabilities/modeling-submission-package/1.0.0');
const files = ['SKILL.md', 'references/package-contract.md', 'references/ai-usage-report.md',
  'assets/submission-config.example.json', 'assets/ai-usage-config.example.json',
  'scripts/build_submission_package.py', 'scripts/render_ai_usage_report.py'];
for (const file of files) {
  const destination = join(root, 'resources', file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(source, file), destination);
}
const entry = join(root, 'resources/SKILL.md');
await copyFile(resolve('scripts/submission/build_code_appendix.py'), join(root, 'resources/scripts/build_code_appendix.py'));
await copyFile(resolve('scripts/submission/export_ai_report_pdf.py'), join(root, 'resources/scripts/export_ai_report_pdf.py'));
await rm(join(root, 'resources/scripts/validate_submission.py'), { force: true });
let text = await readFile(entry, 'utf8');
text = text.replace('1. 读取当前题目的 `STATUS.md`、`TASKS.md`，确认正式论文、代码、官方提交规则及当前版本。',
  '1. 通过 hajimi_task_status 读取当前阶段、人工验收及活动冻结状态；读取本题阶段报告、论文配置、已验收的产物绑定、代码和实际运行记录，确认正式版本。HaJiMi 不要求不存在的 STATUS.md/TASKS.md，不手工改 .hajimi 状态。');
text = text.replace('2. 若需要创建或重新编译论文，调用 `modeling-paper-standard`；若需要创建或检查 PDF，调用 `pdf`。',
  '2. 不重新创建、编译或检查已在第8阶段验收的论文；第9阶段只生成提交材料并打包。');
text = text.replace('3. 直接核对当届官方规则。AI 报告名称、正文标注方式、代码附件、文件名和大小限制以官方要求为先；规则未知时，不声称“符合官方提交要求”。生成 AI 详情时使用文档工具创建可编辑 Word，并使用 PDF 工具检查最终导出版面。',
  '3. 使用题目中已有的官方规则信息确定文件名与附件；规则未知时不声称“符合官方提交要求”，也不访问外部提交网站。');
text = text.replace('6. **回归检查**：清理 Word 的作者、最后修改者、批注、修订记录和身份元数据，逐页渲染检查 AI 详情及论文 PDF；再验证 ZIP 可解压、哈希一致、无禁入文件，并确认包内论文哈希与当前最新版相同。\n7. **交付说明**：列出最终 PDF、ZIP、文件数、禁入检查和已知边界。用户人工验收前称为候选或提交包，不擅自声称官方已验收。',
  '6. **完成交付**：`package` 生成并登记 ZIP 后即完成第9阶段，不再追加包验证、PDF页面预览、逐页审查或包后一致性复核。');
text += '\n## HaJiMi 第9阶段衔接\n\n仅在第8阶段技术交付校验通过且用户人工验收后执行提交整理。论文正文继续在参考文献结束；本阶段从同一份已验收正文制作独立的含代码附录版，不回写正文、不放宽第8阶段页数/内容规则。附录增加的页数仅属于提交版本，不能把含附录版送回正文页数门规避审查。代码只复制必要文件，保留可运行原名和目录依赖；说明表提供中文用途与编号，不以重命名破坏复现。\n\n本题真实会话和产物是 AI 详情依据；助手执行的验证必须标明由AI/程序执行，不能写成人工复核。缺少人工操作证据如实写未确认；官方规则未知时仅称候选，不称官方合规。用户再次修改正文/数值/代码逻辑时返回受影响阶段重验，旧提交包失效，保留历史包。\n';
await writeFile(entry, text);
await writeFile(entry, text + '\n执行入口：使用 hajimi_generate_submission(action="code_appendix"|"ai_report"|"package", configJson=本skill配置JSON)，不要尝试 Bash 或普通写入。源文件路径相对本题根目录；程序自行分配新的 deliverables 版本目录并覆盖配置中的输出路径，禁止 replace。code_appendix 使用 papers.without_code 和 code_files（source、appendix、purpose），从已验收PDF追加代码页，同时确认正文内容未被改动，生成两版PDF和来源回执。原代码不改名不执行；仅支持UTF-8文本代码，其他编码或笔记本须先在前序阶段形成合适的可复现源码。ai_report 先生成可编辑 Word；document_status=final 或提交版且事实校验完整时，程序从该Word模板导出内容保真的重排PDF；草稿不导出PDF。package 成功并登记 ZIP 后第9阶段直接完成。\n');
// Keep executable adaptations reproducible when the upstream snapshot is synced.
const packageScript = join(root, 'resources/scripts/build_submission_package.py');
let packageCode = await readFile(packageScript, 'utf8');
function adapt(before, after) {
  if (!packageCode.includes(before)) throw new Error(`Submission source changed: ${before.slice(0, 80)}`);
  packageCode = packageCode.replace(before, after);
}
adapt('    target.parent.mkdir(parents=True, exist_ok=True)',
  '    if target.exists():\n        raise FileExistsError(f"提交目标冲突：{target.name}")\n    target.parent.mkdir(parents=True, exist_ok=True)');
adapt('    output_dir.mkdir(parents=True, exist_ok=True)',
  '    workspace = resolve(base, config.get("workspace_root", "."))\n    delivery_root = (workspace / "deliverables").resolve()\n    if output_dir != delivery_root and delivery_root not in output_dir.parents:\n        raise ValueError("输出必须位于本题 deliverables 下")\n    output_dir.mkdir(parents=True, exist_ok=True)');
adapt('    if stage.exists():',
  '    if replace:\n        raise ValueError("HaJiMi 保留历史提交包；请使用新的版本目录，不允许 replace")\n    if stage == zip_path or stage in zip_path.parents or zip_path in stage.parents:\n        raise ValueError("ZIP 与暂存目录不能重叠")\n    if stage.exists():');
adapt('    excluded = list(config.get("excluded_patterns", []))',
  '    excluded = [".env", ".env.*", "*.pem", "*.key", "*.aux", "*.log", "*.out", "*.toc", "*.synctex.gz", "*.fls", "*.fdb_latexmk", "*.pyc", ".git/*", "*/.git/*", ".hajimi/*", "*/.hajimi/*", "*__pycache__*", "*.mat"] + list(config.get("excluded_patterns", []))');
adapt('original_rows.append([str(row["source"]), rel,',
  'original_rows.append([os.path.relpath(row["source"], workspace).replace("\\\\", "/"), rel,');
adapt('        names = archive.namelist()',
  '        names = archive.namelist()\n        expected = {p.relative_to(stage).as_posix(): p for p in all_files}\n        if len(names) != len(set(names)) or set(names) != set(expected):\n            raise RuntimeError("ZIP 文件清单不完整或重复")\n        for name, path in expected.items():\n            if hashlib.sha256(archive.read(name)).hexdigest().upper() != sha256(path):\n                raise RuntimeError(f"ZIP 文件哈希不一致：{name}")');
// Confine every declared source before creating any output or copying any file.
adapt('    output_dir = resolve(base, config["output_dir"])',
  '    workspace_check = resolve(base, config.get("workspace_root", "."))\n    sources = list(config.get("papers", {}).values()) + [config.get("ai_report_pdf")]\n    sources += [item["source"] for key in ("code_files", "extra_files") for item in config.get(key, [])]\n    for raw in filter(None, sources):\n        source_check = resolve(base, raw)\n        if workspace_check not in source_check.parents:\n            raise ValueError("提交源文件必须位于本题工作区内")\n    output_dir = resolve(base, config["output_dir"])');
await writeFile(packageScript, packageCode);
const reportScript = join(root, 'resources/scripts/render_ai_usage_report.py');
const reportReference = join(root, 'resources/references/ai-usage-report.md');
await writeFile(reportReference, (await readFile(reportReference, 'utf8')).replace(
  '以可编辑 Word 为主文件，固定命名为 `AI工具使用详情.docx`；信息完整并通过检查后再导出 `AI工具使用详情.pdf`。使用 [生成器](../scripts/render_ai_usage_report.py) 与 [配置示例](../assets/ai-usage-config.example.json) 时，先生成 Word，再用文档/PDF 工具逐页渲染检查最终文件。',
  '以可编辑 Word 为主文件，固定命名为 `AI工具使用详情.docx`；信息完整时由受管生成器同时导出 `AI工具使用详情.pdf`，无需另建页面审查流程。'
));
await writeFile(entry, (await readFile(entry, 'utf8')) + '\n真实使用记录：调用 hajimi_task_status(section="session",offset=0,limit=5)，沿nextOffset读取当前题目会话分支的用户提示、模型切换、可见回答和工具结果；也读取experiments/evidence/bindings等权威记录。session返回的是内部证据，不直接复制进提交包；不输出任务ID、内部路径、账号或密钥，不读取其他任务会话。被截断或缺失的信息不能反推，需结合相应实际产物核对；无法确认事实时保留草稿。\n');
await writeFile(entry, (await readFile(entry, 'utf8')) + '\n收尾：所有材料生成后调用 `hajimi_generate_submission(action="package")`。生成器正常退出且 ZIP 成功登记后流程自动完成；不要调用额外验证工具、生成页面预览或建立审查回执。\n');
let reportCode = await readFile(reportScript, 'utf8');
const reportEdits = [
  ['        export_pdf(output_docx, output_pdf, find_soffice(args.libreoffice))', '        sys.path.insert(0, str(Path(__file__).resolve().parent))\n        from export_ai_report_pdf import export_generated_report\n        export_generated_report(output_docx, output_pdf)'],
  ['help="用 LibreOffice 从 Word 导出 PDF"', 'help="用受管PDF运行库从生成的Word模板导出PDF（内容保真重排）"'],
  ['return PLACEHOLDER in text or bool(re.search', 'return bool(re.search(r"【待补充[^】]*】", text)) or bool(re.search'],
  ['"pdf": str(output_pdf) if output_pdf.is_file() else None,', '"pdf": str(output_pdf) if args.export_pdf and final and output_pdf.is_file() else None,'],
  ['    checks = [', '    doc.add_paragraph("以下为提交前待逐项确认的检查项，不表示本报告生成时已完成这些动作；实际核验人员、方法和结果以各条真实记录为准。")\n    checks = ['],
  ['建模、数据、代码和结果用途均有可复核的人工核验', '核验动作、结果及执行者有记录可查，AI或程序验证不写成人工核验'],
  ['Word元数据已清理，最终PDF已逐页检查', '确认Word元数据清理结果和最终PDF已成功生成'],
];
for (const [before, after] of reportEdits) {
  if (!reportCode.includes(before)) throw new Error(`AI report source changed: ${before}`);
  reportCode = reportCode.replace(before, after);
}
await writeFile(reportScript, reportCode);
const fragment = { id: 'submission-stage-9-core', path: 'fragments/stage-9-core.md', priority: 100, stages: [9] };
await mkdir(join(root, 'fragments'), { recursive: true });
await writeFile(join(root, fragment.path), '# Stage 9 submission package\nRead resources/SKILL.md and both submission contracts. Consume the human-accepted stage-8 body and active frozen evidence. Produce separate body-only and code-appendix PDFs, necessary reproducible code copies, anonymous evidence-based AI usage Word/PDF, SHA-256 inventory and ZIP. Never alter accepted mathematics or claim invented human review. Preserve draft-only status when facts or official rules are missing. A successful package action completes stage 9; do not create validation, page-preview, or review chains.\n');
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
async function inventory(dir) {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) result.push(...await inventory(path));
    else if (item.isFile() && item.name !== 'manifest.json') {
      const bytes = await readFile(path);
      result.push({ path: relative(root, path).replaceAll('\\', '/'), sizeBytes: bytes.length, sha256: digest(bytes) });
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
const manifest = {
  schemaVersion: 'hajimi.capability-manifest.v1', id: 'modeling-submission-package', version: '1.0.0',
  source: { kind: 'user-authorized-local-codex-skill', logicalPath: 'MathModeling-AI-Lab/.codex/skills/modeling-submission-package',
    entrypointSha256: digest(await readFile(join(source, 'SKILL.md'))), licenseStatus: 'not-declared-in-source-snapshot', redistributionScope: 'User-authorized HaJiMi local and packaged builds' },
  allowedStages: [9], requiredInputs: ['active_evidence_freeze', 'human_accepted_paper'],
  toolScopes: ['hajimi_task_status', 'hajimi_generate_submission'],
  contextFragments: [fragment], fragments: [fragment],
  activation: { stages: [9], requiresActiveEvidenceFreeze: true, persistRoute: true },
  commands: ['python3 {capabilityRoot}/resources/scripts/build_submission_package.py', 'python3 {capabilityRoot}/resources/scripts/render_ai_usage_report.py'],
  files: await inventory(root), omitted: ['agents/openai.yaml'],
};
await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${manifest.id}: ${manifest.files.length} hashed files; stage 9 only`);
