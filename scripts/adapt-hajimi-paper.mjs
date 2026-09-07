import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const readingRoute = `## 第八阶段执行策略

先读取 ../stage8-policy.md。figures完成后才进入正式writing；writing继续遵循以下标准与模板。review只做一次轻量整体浏览，旧四遍审查和微排版返工不是强制步骤；重大缺失、不可读、核心公式/证据错误才局部修复。以下历史契约中有关反复审查的执行强度以该策略为准，写作内容与模板标准不变。

## 按当前任务加载契约

先区分写作准备、正文生产、局部内容修改、排版修正和交付审查。所有质量标准保持有效，规则在适用动作之前加载；局部任务不自动扩大为全文重写或整篇论文验收。

- 只做骨架、章节规划和输入准备：读取 structure-contract.md、layout-contract.md；按实际小问题型读取优化或数据分支，确定需要哪些输入和信息动作。只引用既有证据与来源，不生成正文时无需提前加载全部语言课程和终审细则。写正文之前再进入下一步，不能拿准备阶段的精简读取范围直接写全文。
- 新写或全文重构的正文生产：先完整读取 plain-competition-language.md 和 language-contract.md。对当前板块读取 writing-patterns.md、direct-competition-language.md、video-language-playbook.md 的对应完整章节及共同总则，再读取适用题型分支；准备时已读的结构和版式直接复用。首次使用某条规则前必须读到其完整规定，按章节推进而非一次灌入八份文件。不要只读标题或以自行概括替代原文。章节输入表记录当前章节已经覆盖哪些来源和段落，后续写到其他板块时补齐其适用原文。
- 局部内容修改：读取本段及必要的上下文、plain-competition-language.md、language-contract.md 和 writing-patterns.md 对应板块；涉及结构时加读 structure-contract.md，涉及优化或数据方法时加读相应题型分支。保持未修改的公式、数字、标签和结论范围，按 review-contract.md 第 4 节确定回归范围。
- 仅修字体、标题样式、间距、图表摆放：读取 layout-contract.md 和 review-contract.md 第 3.3、3.4、4 节；改变可见编号或章节顺序时再读取 structure-contract.md。先修共享 LaTeX 设置并编译受影响内容；全局格式变化检查全部页面。无需为字体修改重读写作课程或重写正文。
- 交付整篇候选：读取 review-contract.md，按其四个独立维度核对同一候选；未读过的适用契约在对应维度补齐。汇总问题后集中修订，完整交付仍保留全部内容门和最终逐页视觉审查。
- 仅维护本 Skill 或检查器：先检查被修改规则、调用者和相关测试。用骨架或针对性样例验证具体改动，实际论文回归用于验证改造效果，不作为开始修改 Skill 的前置条件，也不自动扩展成修完样例论文。

新写论文先运行资源目录内的 scripts/create_paper_skeleton.py，按 --paper-type 选择 standard 或 data-analysis，填写 sections/；固定字号和编号由骨架提供。已有论文对照骨架定点修正，不覆盖。脚本只创建不存在的输出目录。实际格式用 scripts/check_pdf_typography.py 验证；骨架通过不能替代内容与完整论文验收。

完整契约目录（按上述任务路由读取）：
`;

const draftingWorkflow = `
## HaJiMi 首稿与增量审查

论文结束于参考文献，不生成附录；复现程序、完整数据和审查记录保存在论文外的支撑文件中。

写作前一次性准备章节输入表（保存在 work/paper-section-inputs.md）：每章列出题目对象、要回答的问题、引用的冻结公式及标签、结果文件与字段、单位精度、已验证边界、拟用图表、应完成的信息动作。优化小问同时引用约束覆盖矩阵。缺失证据先补齐，禁止用占位答案或教学例句填满正文。已有资料直接引用路径和稳定标签，不再抄写整份技术底稿。

先创建固定章节和编号的 LaTeX 骨架，按各问输入表生产完整章节；保持共享符号表、公式环境和图表标签唯一。先写模型与求解、结果解释，再据实际内容完成分析、检验、评价和逐问摘要。写前分配合理篇幅，模型段是重心；不以事后补页替代完整推导。每个章节只加载其适用套路和题型分支，但所有通用语言、结构、证据和版面约束仍须满足。

同一会话已经完整读取且内容未变的契约无需每章重读；压缩或恢复后只补读无法可靠恢复的规则与当前章节相关原文。章节输入表记录适用契约的路径与版本摘要，不能用简短摘要取代首次完整读取。

首次合并后冻结同一候选，独立检查数学与证据、写作与图表、源码版面、实际 PDF 页面四个维度，将问题汇总到一份 QA 记录再集中修订。四维审查不等于重写四遍，也不要求四个代理。每项记录位置、违反的规则、具体修法和受影响范围；没有问题的章节直接保留。

集中修订后重编译并按 review-contract.md 的影响范围回归。局部文字或单图修改需比较新旧分页，检查受影响页及相邻页；分页发生传播时扩大检查范围。全局字体、版式或符号改变仍检查全文；最终交付候选仍须全尺寸逐页审阅。公式漂移、数字来源、22--30 页、30% 章节平衡及所有原有质量门槛不降低。QA 仅记发现、修复和验证证据，不反复复制全文或契约。
`;

const ruleRouting = `## 完整约束与执行分工

完整规则保存在 references/requirements-contract.md，详细解释仍在原契约中。这里调整加载顺序，不删除、降级或豁免任何约束。全文首次写作按前述目录读取，局部任务按实际影响读取；整篇交付前完整核对 requirements-contract.md 和 review-contract.md。同一会话中已读且未变的原文无需再次返回工具输出。

| 规则范围 | 写作时的直接来源 | 确定性保证及仍需判断的内容 |
| --- | --- | --- |
| 固定板块、编号、摘要、逐问结构 | structure-contract.md；writing-patterns.md 相应板块 | 骨架提供结构；结构检查核对实际正文，标题齐全不代表内容完整 |
| 语言、主题词、问题—动作—结果、边界 | plain-competition-language.md、language-contract.md；direct-competition-language.md、video-language-playbook.md 相应板块 | 语言检查发现风险，逐段语义审查保留 |
| 优化完整性、约束覆盖、求解与方案解释 | optimization-paper-route.md | 保留覆盖矩阵和 constraintMin；Step 4 简短不限制前三步或结果 |
| 数据公共章、逐问口径、方法后紧邻结果、混合题 | data-analysis-paper-route.md | 按需启用；不强制逐问数据准备标题或流程图 |
| 字号、字体、边距、图表、页数与阅读重心 | layout-contract.md | 骨架及 PDF/结构/章节平衡检查；实际页面与图文解释仍需审阅 |
| 公式、数字、证据、版本、四维审查和修改范围 | review-contract.md | 使用活动冻结 Claim/Evidence，公式复用、数字绑定和交付校验；用户验收前不称 final |

固定边界：LaTeX；论文结束于参考文献、无目录和附录；摘要逐问分段且无公式、不超过一页，重点黑体加粗，关键词仅空格分隔；完整正文 22—30 页，检验与评价叙述量合计不超过模型建立与求解的 30%；禁止凑页、独占页大图表和省略本题化推导；公式、数字、单位与结论范围保持证据支持。所有原有例外、题型分支和人工审查要求以完整契约为准。

`;

// User-authorized HaJiMi adaptation; never mutate the upstream personal skill.
export async function adaptHajimiPaper(root) {
  const resources = join(root, 'resources');
  await writeFile(join(resources, 'scripts/create_paper_skeleton.py'),
    await readFile(new URL('./create-hajimi-paper-skeleton.py', import.meta.url)));
  await writeFile(join(resources, 'scripts/check_pdf_typography.py'),
    await readFile(new URL('./check-hajimi-paper-typography.py', import.meta.url)));
  await writeFile(join(resources, 'scripts/check_section_balance.py'),
    await readFile(new URL('./check-hajimi-section-balance.py', import.meta.url)));
  const paths = ['SKILL.md', ...(await readdir(join(resources, 'references')))
    .filter(p => p.endsWith('.md')).map(p => `references/${p}`)];
  for (const path of paths) {
    const file = join(resources, path);
    let text = await readFile(file, 'utf8');
    if (path === 'SKILL.md') {
      text = text.replace(/## 必读契约\r?\n\r?\n开始任何论文工作前，完整读取：\r?\n/, readingRoute);
      text = text.replace(/^## 按当前任务加载契约\r?\n[\s\S]*?(?=^1\. `references\/structure-contract\.md`)/m, readingRoute + '\n');
    }
    text = text.replace(/^\d+\. `附录`[^\r\n]*\r?\n/gm, '')
      .replace(/^## 附录\r?\n[\s\S]*?(?=^## |$(?![\s\S]))/gm, '')
      .replace(/^- 附录[^\r\n]*\r?\n/gm, '')
      .replace(/^附录放[^\r\n]*$/gm, '可复现代码、完整结果表、补充图表和过长推导保存在论文外的支撑文件中；关键答案、核心公式和必要解释保留在正文。')
      .replaceAll('references, appendices,', 'references,')
      .replaceAll('附录不计入', '论文结束于参考文献')
      .replaceAll('附录置于正文之后，页数不计入该范围', '论文结束于参考文献，支撑文件独立交付')
      .replaceAll('参考文献与附录', '参考文献')
      .replaceAll('参考文献、附录和', '参考文献和')
      .replaceAll('参考文献、附录位置', '参考文献位置')
      .replaceAll('参考文献和附录的环境', '参考文献的环境')
      .replaceAll('和附录边界', '结束位置')
      .replaceAll('或附录层级错误', '或标题层级错误')
      .replaceAll('和附录起始页', '和论文结束位置')
      .replaceAll('位于正文之后、附录之前', '位于论文末尾，作为最后一个板块')
      .replaceAll('代码附录', '独立代码文件')
      .replaceAll('移入附录或审查记录', '移入论文外的支撑文件或审查记录')
      .replaceAll('移入附录或复现说明', '移入论文外的复现说明')
      .replaceAll('移入附录', '移入论文外的支撑文件')
      .replaceAll('模型、检验或附录', '模型、检验或论文外的支撑文件');
    if (path === 'SKILL.md' && !text.includes('## HaJiMi 首稿与增量审查')) {
      text += draftingWorkflow;
    }
    if (path === 'SKILL.md' && !text.includes('## 逐节公式复用检查')) {
      text += '\n## 逐节公式复用检查\n\n正文生产和局部改文同样执行 review-contract.md 第 2、3.1 节，不等到整篇终审。每节引用章节输入表中的冻结技术底稿，直接复用已有公式环境和原 label。写完该节运行 `scripts/check_latex_equation_drift.py BASELINE_SECTION CURRENT_SECTION --require-all --exact-labels`，失败只修受影响项；部分稿的底稿范围限定为该节，不能为了通过而从底稿删除应复用公式。底稿在修改前从冻结来源原样提取并记录来源路径、范围及哈希，不能从改后稿反向生成。无既有公式的章节记录不适用理由；新增推导仍需证据验证。整篇审查使用完整技术底稿，不能以局部通过代替全篇检查。\n';
    }
    if (path === 'SKILL.md' && !text.includes('equationBaselineArtifactIds')) {
      text += '\n完整交付的 paper/hajimi-paper-config.json 使用 equationBaselineArtifactIds 列出技术公式底稿的已有产物 ID。底稿须为成功受管实验的输出、属于已接受且活动冻结的 Evidence；复用现有记录，不因改文重跑有效求解。底稿包含应复用的完整核心公式及稳定标签，预先展开 input/include 成自包含文件，并在写作前经现有记录与冻结工具保存；不得将改后论文注册为其自身基线。hajimi_validate_delivery 自动核验该引用的冻结归属及文件哈希，并对完整 mainTex 执行精确标签和公式漂移检查。数学变更仍回到受影响技术验证与重新冻结，不能改基线迎合改稿。自动检查不代替核心公式覆盖、无标签公式及新增推导的数学审查。\n';
    }
    if (path === 'SKILL.md' && !text.includes('scripts/create_paper_skeleton.py')) {
      text += '\n新写论文时先运行 `python scripts/create_paper_skeleton.py OUTPUT --title "本题标题" --questions N --paper-type standard`，数据类改为 `data-analysis`；脚本只创建不存在的目录，生成固定字号、章节顺序和空章节文件，无教学答案。正文内容填入 sections/，关键词与摘要重点使用 paperkey 宏。已有论文仅对照骨架纠正实际版式差异，不覆盖已有源码。\n';
    }
    if (path === 'SKILL.md' && !text.includes('scripts/check_pdf_typography.py')) {
      text += '\n交付候选另须运行 `python scripts/check_pdf_typography.py PAPER.pdf` 核对实际题目、摘要与各级标题的字号和宋体/黑体映射；默认 maketitle 和 abstract 环境经常不符合指定字号，不得只看源码文档类选项判断。自动检查之外仍须核对摘要重点确实是黑体加粗、完整正文格式与实际页面。\n';
    }
    if (path === 'references/review-contract.md') {
      const reviewNote = '四个维度针对同一候选分别判断，汇总问题后集中修订，不为每个维度重写全文。';
      text = text.replace('## 3. 四遍独立审查', '## 3. 四个维度的独立审查')
        .replaceAll(reviewNote, '')
        .replace('审查对象必须是冻结的 `candidate`。', reviewNote + '审查对象必须是冻结的 `candidate`。');
    }
    text = text.replace('依次完成数学与证据、写作与图表、LaTeX 源码版面、最终 PDF 版面四遍独立审查', '完成数学与证据、写作与图表、LaTeX 源码版面、最终 PDF 版面四个维度的独立审查，汇总问题后集中修订');
    if (path === 'SKILL.md') {
      // Preserve every existing requirement verbatim; the entrypoint only routes it.
      const requirements = text.match(/^## 强制流程\r?\n[\s\S]*?(?=^## HaJiMi 首稿与增量审查)/m);
      if (requirements) {
        await writeFile(join(resources, 'references/requirements-contract.md'), '# HaJiMi 完整规则核对表\n\n以下为原入口的完整流程、固定原则与验收门槛。维护来源：用户要求仅改 HaJiMi、保持全部限制、减少重复加载与重写；详细契约与适用分支继续生效。\n\n' + requirements[0].trimEnd() + '\n');
        text = text.replace(requirements[0], ruleRouting);
      }
      text = text.replace('仅在修改本 Skill 时再读取 `references/evolution-protocol.md`。', '维护规则时对照 references/requirements-contract.md 与对应原契约；上游个人 Skill 和参考资产不写入修改。');
    }
    await writeFile(file, text);
  }
  const fragment = join(root, 'fragments/stage-8-core.md');
  const fragmentText = await readFile(fragment, 'utf8');
  await writeFile(fragment, fragmentText.replace(
    'Before drafting, read the applicable detailed contracts in `resources/references/`: always structure, writing patterns, plain/direct language, layout, and review; additionally read the data-analysis or optimization route when its tag applies. Run the bundled deterministic checkers with `python3`, then inspect the actual PDF page by page.',
    'Follow the bundled SKILL.md task-specific reading route. Reuse unchanged rules already read; load section-specific instructions when working on that section. For new papers use resources/scripts/create_paper_skeleton.py with the real question count, paper type and optimization questions. Keep active frozen evidence, per-question inputs, paper/hajimi-paper-config.json, claim bindings and hajimi_validate_delivery in the same governed stage-8 workflow. Before whole-paper delivery verify references/requirements-contract.md and all review-contract.md gates; include actual PDF typography and page review. Local corrections do not restart whole-paper drafting.'
  ));
  const structure = join(resources, 'scripts/check_latex_structure.py');
  const drift = join(resources, 'scripts/check_latex_equation_drift.py');
  let driftSource = await readFile(drift, 'utf8');
  if (!driftSource.includes('--exact-labels')) {
    driftSource = driftSource.replace('    args = parser.parse_args()',
      '    parser.add_argument("--exact-labels", action="store_true", help="Require original stable labels, without canonical alias matching.")\n    args = parser.parse_args()');
    driftSource = driftSource.replace('    base_index, base_dups = indexed(baseline)',
      '    if args.exact_labels:\n        baseline = [Equation(eq.label, eq.label, eq.body, eq.source) for eq in baseline]\n        current = [Equation(eq.label, eq.label, eq.body, eq.source) for eq in current]\n    base_index, base_dups = indexed(baseline)');
    driftSource = driftSource.replace('    common = sorted(set(base_index) & set(current_index))',
      '    if args.exact_labels and (base_dups or current_dups):\n        failures.append("Duplicate stable equation labels prevent verification")\n\n    common = sorted(set(base_index) & set(current_index))');
  }
  if (!driftSource.includes('Technical baseline has no labeled equations')) {
    driftSource = driftSource.replace('    failures: list[str] = []',
      '    failures: list[str] = []\n    if args.exact_labels and args.require_all and not base_index:\n        failures.append("Technical baseline has no labeled equations")');
  }
  await writeFile(drift, driftSource);
  let structureSource = (await readFile(structure, 'utf8')).replace(/^    "附录",\r?\n/gm, '');
  if (!structureSource.includes('from check_latex_layout_risks import expand_inputs')) {
    structureSource = structureSource.replace('from pathlib import Path', 'from pathlib import Path\nfrom check_latex_layout_risks import expand_inputs');
  }
  structureSource = structureSource.replace('strip_comments(args.tex.read_text(encoding="utf-8"))', 'strip_comments(expand_inputs(args.tex))');
  structureSource = structureSource.replace('return bool(re.search(textbf, source) or re.search(bfseries, source))',
    'paperkey = rf"\\\\paperkey\\{{[^{{}}]*{escaped}[^{{}}]*\\}}"\n    defined_key = r"\\\\newcommand\\{\\\\paperkey\\}\\[1\\]\\{\\{\\\\heiti\\\\bfseries\\s*#1\\}\\}"\n    return bool(re.search(textbf, source) or re.search(bfseries, source) or (re.search(defined_key, source) and re.search(paperkey, source)))');
  await writeFile(structure, structureSource);
  const gate = join(resources, 'scripts/check_pdf_page_gate.py');
  let text = await readFile(gate, 'utf8');
  text = text.replace('附录不计入。', '论文结束于参考文献。')
    .replace('main_pages = (appendix_page - 1) if appendix_page else len(reader.pages)', 'main_pages = len(reader.pages)')
    .replace(/^    passed = lower_ok and main_pages <= args.max_pages[^\r\n]*/m, '    passed = lower_ok and main_pages <= args.max_pages and appendix_page is None')
    .replace('f"，附录从第 {appendix_page} 页开始" if appendix_page else "，未检测到附录"', 'f"，第 {appendix_page} 页存在附录；论文应结束于参考文献" if appendix_page else ""');
  await writeFile(gate, text);
  // pypdf misdecodes Chinese text in the managed XeLaTeX output. Use the same
  // verified extractor as the existing visual-area checker.
  for (const name of ['check_pdf_page_gate.py', 'check_pdf_page_flow.py']) {
    const file = join(resources, 'scripts', name);
    const source = (await readFile(file, 'utf8'))
      .replaceAll('from pypdf import PdfReader', 'import pymupdf as fitz')
      .replaceAll('PdfReader(str(args.pdf))', 'fitz.open(str(args.pdf))')
      .replaceAll('reader.pages', 'reader')
      .replaceAll('page.extract_text()', 'page.get_text("text")')
      .replaceAll('缺少 pypdf；请先安装 pypdf', '缺少 PyMuPDF；请先安装 pymupdf')
      .replaceAll('合理图表页、附录页或', '合理图表页或');
    await writeFile(file, source);
  }
}
