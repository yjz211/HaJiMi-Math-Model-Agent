// One opt-in A/B run using real model sessions and the product's managed tools.
import { cp, mkdir, writeFile, readFile, appendFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, createReadTool, createWriteTool, createEditTool, createBashTool } from '@earendil-works/pi-coding-agent';
import { InMemoryModelsStore } from '@earendil-works/pi-ai';
import { hajimiResourceLoaderOptions } from '../lib/hajimi/resources.ts';
import { hajimiCoreInlineExtension } from '../lib/hajimi/core-extension.ts';
import { WindowsWorkspaceBackend } from '../lib/hajimi/windows-workspace-backend.mjs';
import { reconcileProvenance } from '../lib/hajimi/workflow-service.ts';
import { prepareUpstreamPlot } from './prepare-upstream-plot.mjs';
import { closeOpenAICodexWebSocketSessions } from '../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js';

const mode = process.argv[2];
const resume = process.argv.includes('--resume');
const promptFile = process.argv.find(arg => arg.startsWith('--prompt-file='))?.slice('--prompt-file='.length);
const fullSet = process.argv.includes('--full-set');
const upstream = process.argv.includes('--upstream');
const designProfile = process.argv.find(arg => arg.startsWith('--design-profile='))?.split('=')[1];
if (designProfile && (!fullSet || mode !== 'hajimi' || !['expressive', 'restrained'].includes(designProfile))) throw new Error('design-profile requires HaJiMi full-set and expressive|restrained');
const runName = process.argv.find(arg => arg.startsWith('--run-name='))?.slice('--run-name='.length);
if (runName !== undefined && (!fullSet || !/^[a-z0-9][a-z0-9-]{0,70}$/.test(runName))) throw new Error('run-name requires --full-set and a simple lowercase directory name');
if (!['hajimi', 'legacy'].includes(mode) || !process.argv.includes('--run')) throw new Error('Usage: node scripts/compare-legacy-plot-live.mjs hajimi|legacy --run');
const productRoot = resolve('.');
const comparisonRoot = join(productRoot, 'docs/verification/plot-restoration-20260906', runName || (fullSet ? 'one-round-full-set' : 'one-round'));
const cwd = join(comparisonRoot, mode, '数学建模1');
const source = 'C:/hajimi-native-test-data-20260905/projects/数学建模1';
const agentDir = 'C:/hajimi-native-test-data-20260905/agent';
const originalSkill = 'C:/Users/hhhh/Desktop/MathModeling-AI-Lab/deliverables/legacy-skill-export/modeling-plot-suite-pre-native-20260904';
const frozen = join(productRoot, 'docs/verification/plot-comparison-20260906/data_snapshot');
let hashes = JSON.parse(await readFile(join(frozen, '../source_hashes.json'), 'utf8'));
await mkdir(cwd, { recursive: true });
if (upstream) {
  if (!fullSet || mode !== 'hajimi' || designProfile !== 'expressive') throw new Error('upstream requires HaJiMi expressive full-set');
  hashes = resume ? JSON.parse(await readFile(join(cwd,'UPSTREAM_SNAPSHOT.json'),'utf8')).sourceHashes : await prepareUpstreamPlot(source,cwd);
}
if (!resume) {
if (!upstream) {
await writeFile(join(cwd, 'one-round.lock'), mode, { flag: 'wx' });
for (const directory of ['.hajimi', 'input', 'data', 'work', 'reports', 'src', 'figures', 'paper', 'output']) {
  await cp(join(source, directory), join(cwd, directory), { recursive: true });
}
// The legacy helper anchors its seed at the closest CLAUDE.md. This isolated
}
// clone lives inside the development repo; do not inherit the repo's identity.
if (fullSet) await writeFile(join(cwd, 'CLAUDE.md'), '# 数学建模1\n\n本文件仅标记本次隔离项目根目录，不设置配色、字体或布局。\n');
if (designProfile) {
  const colors = designProfile === 'expressive'
    ? '#4ECDC4,#FF6B6B,#45B7D1,#F7A072,#A06CD5,#F79256,#7DCFB6'
    : '#0072B2,#D55E00,#009E73,#CC79A7,#F0E442,#56B4E9,#E69F00,#000000';
  await writeFile(join(cwd, 'CLAUDE.md'), `# 数学建模1\n\n用户选择绘图模式：${designProfile}。读取 HaJiMi 内置 modeling-plot-suite/1.0.0/profiles/${designProfile}.md 并执行。用户明确指定优先于自动抽签。\n<!-- MH_DATA_FIG_PALETTE=custom -->\n<!-- MH_DATA_FIG_COLORS=${colors} -->\n<!-- MH_DATA_FIG_STYLE=clean_open -->\n`);
}
}
for (const [name, hash] of Object.entries(hashes)) {
  const bytes = await readFile(join(upstream ? cwd : frozen, name));
  if (createHash('sha256').update(bytes).digest('hex') !== hash) throw new Error(`Frozen source drift: ${name}`);
  // Require the governed clone to already contain the same evidence, rather than rewriting a freeze.
  if (createHash('sha256').update(await readFile(join(cwd, name))).digest('hex') !== hash) throw new Error(`Active evidence differs from frozen comparison: ${name}`);
}
await reconcileProvenance(cwd);
let prompt = fullSet ? `这是用户授权的一轮整套绘图对比。请在本次会话中统一规划并完成以下六张新数据图，便于用户检查整套颜色、字体轻重、线条与版式风格的一致性。不修改论文、不重新求解、不结束整个阶段。
使用当前可用的 modeling-plot-suite，从其入口完整执行原始绘图流程。保留默认主题、字体与线条风格，不指定自定义配色或固定字体。具体配方与版式由你根据数据语义和原版指南选择。按整套图规划，所有新图最终引用宽度为 136 mm。
数据为当前第八阶段的冻结数据，直接读取 work/q1_results.json、q2_results.json、q3_results.json、q4_results.json、sensitivity_results.json，以及 data/derived 中的 q3_lines.csv、q3_direction_search.csv、bathymetry_grid.csv、q4_lines.csv、q4_coverage_grid.csv、q4_candidates.csv、q4_pareto.csv。不要重新求解或更改数据。
完整六图：
1. figures/fig_compare_q1：Q1 测线位置对应的水深、覆盖宽度与重叠率结果，保留真实负重叠及首项缺失的含义，不伪造数值。
2. figures/fig_compare_q2：Q2 航向角 beta_deg 与 distance_nm 对应的覆盖宽度 width_m 矩阵，保留原顺序与数值。
3. figures/fig_compare_q3：Q3 真实测区坐标下的选定测线设计，以及方向搜索的真实结果；保持测区几何比例，不伪造水深背景或覆盖带。
4. figures/fig_compare_q4：Q4 真实坐标下的水深和测线布局，以及同一评价网格覆盖次数；不得改变空间比例、几何背景或数据。
5. figures/fig_compare_q4_tradeoff：Q4 候选方案的漏测、超20%重叠累计长度和测线总长度权衡，呈现真实候选、已计算的 Pareto 数据与选定方案，不虚构优化可行域。
6. figures/fig_compare_sensitivity：总开角变化下固定线位的漏测率、超20%重叠累计长度，以及重新布线总长度；三个真实指标都保留，不虚构置信区间。
先写本次专用 PAPER_PLAN.md 和 FIGURE_MANIFEST，对整套六图统一规划，并按 skill 读取风格指南、批量预取配方后再逐图适配。已有旧图/旧生成器仅为治理副本，不读取它们来模仿，不覆盖它们。本次只生成上述新名称的 PDF、PNG 和独立生成器。
本次只评估第一次完整输出：语法/字段错误阻止生成时可修正运行，但任何图首次成功导出后都保留原版，不做审美调参或二次渲染。用户明确要求出完直接展示：不要打开图像检查，不运行出图后审计，不进行二次调图。
最后在 COMPARISON_RESULT.md 仅写实际读取的指南/配方、实际使用的配色与字体、输出路径。六图导出后立即结束，只运行这一轮。`
: `这是用户授权的一轮独立绘图对比，只完成以下三张新数据图，不修改论文、不重新求解、不结束整个阶段。
使用当前可用的 modeling-plot-suite，从其入口完整执行原始绘图流程。保留默认主题、字体与线条风格，不指定自定义配色或固定字体。
数据已经冻结，直接读取 work/q2_results.json、work/q4_results.json、work/sensitivity_results.json 和 data/derived/bathymetry_grid.csv、q4_lines.csv、q4_coverage_grid.csv。所有新图最终引用宽度为 136 mm。
1. figures/fig_compare_q2：航向角 beta_deg 与 distance_nm 对应的覆盖宽度 width_m 矩阵；保留原顺序与数值。
2. figures/fig_compare_q4：真实坐标下的水深和测线布局，以及同一评价网格覆盖次数；不得改变空间比例、几何背景或数据。
3. figures/fig_compare_sensitivity：总开角变化下固定线位的漏测率、超20%重叠累计长度，以及重新布线总长度；三个真实指标都保留，不虚构置信区间。
先写本次专用 PAPER_PLAN.md 和 FIGURE_MANIFEST，自主选择适合图型并按 skill 读取风格指南和对应配方。已有旧图/旧生成器仅为治理副本，不读取它们来模仿，不覆盖它们。本次只生成上述新名称的 PDF、PNG 和独立生成器。
本次只评估第一次完整输出：语法/字段错误阻止生成时可修正运行，但任何图首次成功导出后都保留原版，不做审美调参或二次渲染。实际打开三张图、按 136 mm 宽检查，记录发现的缺陷和应修原因即可，等待用户指示。不要将 WARNING 自动当作重画命令。
最后在 COMPARISON_RESULT.md 写实际读取的指南/配方、使用字体、最终尺寸审计、每图观感和未修缺陷。到此结束，只运行这一轮。`;
if (designProfile) {
  prompt = prompt.replace('保留默认主题、字体与线条风格，不指定自定义配色或固定字体。', '用户已指定设计模式与项目颜色/版式标记，优先按这些配置执行，不再按名字随机决定配色和版式；字体继续使用原版受管字体。');
  prompt += `\n本轮用户选择 ${designProfile} 绘图模式。先完整读取 ${join(productRoot, 'bundled/capabilities/modeling-plot-suite/1.0.0/profiles', designProfile + '.md')} 并落实到逐图规划，再执行原版配方工作流。CLAUDE.md 已设置本轮配色和版式。六图首次导出后立即结束，不打开图片审查，不自动修正。`;
}
if (upstream) prompt = (await readFile(join(productRoot,'scripts/upstream-plot-prompt.md'),'utf8')).replaceAll('__CAPABILITY__',join(productRoot,'bundled/capabilities/modeling-plot-suite/1.0.0'));
await writeFile(join(cwd, 'COMPARISON_PROMPT.txt'), prompt);
const runtime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), modelsStore: new InMemoryModelsStore(), allowModelNetwork: false });
const model = runtime.getModel('openai-codex', 'gpt-5.6-sol');
if (!model) throw new Error('Comparison model unavailable');
const baselineExtension = pi => {
  const backend = new WindowsWorkspaceBackend(cwd, { productRoot, toolkitRoot: join(productRoot, 'toolkit/src'),
    capabilitiesRoot: join(productRoot, 'bundled/capabilities'), readonlyRoots: [originalSkill] });
  pi.registerTool(createReadTool(cwd, { operations: backend.readOperations() }));
  pi.registerTool(createWriteTool(cwd, { operations: backend.writeOperations() }));
  pi.registerTool(createEditTool(cwd, { operations: backend.editOperations() }));
  pi.registerTool(createBashTool(cwd, { operations: backend.bashOperations(), exposeSessionEnvironment: false }));
};
const loaderOptions = mode === 'hajimi'
  ? hajimiResourceLoaderOptions({ cwd, agentDir, productRoot, extensionFactories: [hajimiCoreInlineExtension({ cwd, productRoot, getMode: () => 'full' })] })
  : { cwd, agentDir, noExtensions: true, noSkills: true, noContextFiles: true, additionalSkillPaths: [originalSkill], extensionFactories: [{ name: 'comparison-managed-tools', factory: baselineExtension }] };
const resourceLoader = new DefaultResourceLoader(loaderOptions);
await resourceLoader.reload();
const sessionDirectory = join(cwd, 'comparison-session');
const manager = resume
  ? SessionManager.open(join(sessionDirectory, (await readdir(sessionDirectory)).filter(name => name.endsWith('.jsonl')).sort().at(-1)))
  : SessionManager.create(cwd, sessionDirectory);
const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model,
  thinkingLevel: 'medium', resourceLoader, sessionManager: manager });
const runInfo = { mode, cwd, fullSet, designProfile, model: model.id, thinkingLevel: 'medium', sourceHashes: hashes, skillSource: mode === 'hajimi' ? 'product-bundled-legacy' : originalSkill,
  invocation: mode === 'hajimi' ? 'real HaJiMi resource loader, core extension and Windows managed backend' : 'original skill with same model and managed backend; no HaJiMi workflow context' };
await writeFile(join(cwd, 'run-info.json'), JSON.stringify(runInfo, null, 2));
let writes = Promise.resolve();
let turns = 0;
let reason = 'completed';
session.subscribe(event => {
  let row;
  if (event.type === 'tool_execution_start') row = { type: event.type, tool: event.toolName, args: event.args };
  if (event.type === 'tool_execution_end') row = { type: event.type, tool: event.toolName, isError: event.isError };
  if (event.type === 'message_end' && event.message.role === 'assistant') {
    row = { type: event.type, usage: event.message.usage, stopReason: event.message.stopReason,
      text: event.message.content.filter(item => item.type === 'text').map(item => item.text).join('\n') };
    if (++turns >= 90) { reason = 'turn-bound'; void session.abort(); }
  }
  if (row) writes = writes.then(() => appendFile(join(cwd, 'events.jsonl'), JSON.stringify({ time: new Date().toISOString(), ...row }) + '\n'));
});
const timeout = setTimeout(() => { reason = 'time-bound'; void session.abort(); }, (upstream ? 45 : 25) * 60 * 1000);
console.log(JSON.stringify({ started: true, ...runInfo, sourceHashes: undefined }));
try {
  await session.bindExtensions({ onError: error => console.error('extension error', error.message) });
  await session.prompt(promptFile ? await readFile(resolve(promptFile), 'utf8') : resume ? upstream ? '继续当前同一轮图集。宿主已补回 windows-managed 后端配置，现在使用 HaJiMi Windows 受管 Python 和工具，不再使用 WSL 系统 Python。既有 FIGURE_PLAN.json 和脚本全部保留，不重新规划。必要时按当前后端重新 bootstrap/确认运行路径；只解决导入和执行环境阻塞。只运行尚未成功导出的图，已有 PDF/PNG 不重绘；完成计划全部16图后写RESULT.md并立即停止。不审图、不调参、不写论文。' : '受管运行时已从已签名原始归档恢复损坏缓存。继续本轮绘图，从未完成的 bootstrap 开始。仍只保留首次完整输出，不开启第二轮，不审美调参、不改论文。' : prompt);
  await writes;
  const result = { finished: true, reason, turns, upstream, outputs: (await readdir(join(cwd, 'figures'))).filter(name => upstream ? /\.(pdf|png)$/.test(name) : name.startsWith('fig_compare')) };
  await writeFile(join(cwd, 'run-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(timeout); await writes; session.dispose(); closeOpenAICodexWebSocketSessions(manager.getSessionId());
}
