// Real HaJiMi resource loader/core extension/backend; no external drawing code.
import { mkdir, readFile, writeFile, appendFile, copyFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager, createReadTool, createWriteTool, createEditTool, createBashTool } from '@earendil-works/pi-coding-agent';
import { InMemoryModelsStore } from '@earendil-works/pi-ai';
import { bindPlotRuntime } from '../lib/hajimi/plot-runtime-binding.ts';
import { createWorkspaceBackend } from '../lib/hajimi/workspace-backend-factory.ts';
import { closeOpenAICodexWebSocketSessions } from '../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js';

if (!process.argv.includes('--run')) throw new Error('Explicit --run required');
if (!process.env.HAJIMI_RUNTIME_HOME) throw new Error('Set the desktop managed-runtime path before invoking the live backend');
const productRoot = resolve('.');
const batch = process.argv.find(x => x.startsWith('--batch='))?.split('=')[1];
if (!/^(0[1-9]|1[0-8])$/.test(batch ?? '')) throw new Error('Expected --batch=01..18');
const cwd = join(productRoot, `projects/plot108-20260910/batch-${batch}`);
const trace = join(productRoot, `artifacts/plot108-20260910/batch-${batch}`);
const agentDir = 'C:/hajimi-native-test-data-20260905/agent';
const resume = process.argv.includes('--resume');
await mkdir(trace, { recursive: true });
for (const directory of ['input', 'work', 'figures', 'reports', 'src', 'sessions']) await mkdir(join(cwd, directory), { recursive: true });
const catalog = JSON.parse(await readFile(join(cwd, 'DATA_CATALOG.json'), 'utf8'));
for (const item of catalog.datasets) if (createHash('sha256').update(await readFile(join(cwd, item.path))).digest('hex') !== item.sha256) throw new Error(`Dataset changed: ${item.id}`);
if (!resume) {
  await writeFile(join(trace, 'run.lock'), 'five new synthetic datasets', { flag: 'wx' });
  await copyFile(join(productRoot, 'scripts/generate-108-plot-datasets.py'), join(cwd, 'src/generate_data.py'));
  await copyFile(join(cwd, 'DATA_CATALOG.json'), join(cwd, 'input/DATA_CATALOG.json'));
  await mkdir(join(cwd, '.hajimi'), {recursive:true});
  await writeFile(join(cwd, '.hajimi/execution-backend.json'), JSON.stringify({format:'hajimi.backend.v1',kind:'windows-managed',abi:1}));
}
const skill = join(productRoot, 'compatibility/v010/bundled/capabilities/modeling-plot-suite/1.0.0/resources');
bindPlotRuntime(cwd, productRoot);
const prompt = `用户授权的108组可复现合成数据绘图实验，本次批次${batch}，包含${catalog.datasets.length}组，全部是假数据。输入数据不代表真实研究结论。
逐项读DATA_CATALOG.json与data文件，自主判断适合的图型、选择内置配方、保真适配并绘制，每组交付一张语义图（可按语义组合面板）、PNG/PDF与独立Python生成器。文件固定为figures/fig_<数据id>.png、figures/fig_<数据id>.pdf、figures/gen_<数据id>.py。不要为了覆盖配方硬选图，不推测隐藏的配方答案。
${catalog.datasets.map(x=>`${x.id}: ${x.path}：${x.question}`).join('\n')}
选择expressive风格，完整加载适用指南和配方；按样本量、重复值及数据语义在生成前选型，模板中的无依据数值和统计层不得照搬。正文宽136mm，图的最终引用比例按原版长宽比指导决定，明确记录最终图宽与缩放比，不能把正文宽当最终图宽。当前stage8-policy规定逐张完整检查、汇总问题后集中修复，每图最多三轮，最后仍须看图，仍有缺陷如实记录，不自动第四轮。
宿主是独立绘图实验：使用真实HaJiMi Windows工具及完整当前绘图技能/阶段策略/模式提示，不加载整篇论文状态机。无需证据冻结、阶段推进、八图或路线图，不进入写作，full-paper条款不适用。技能路径：${skill}/SKILL.md。工作区Windows绝对路径为${cwd}；bootstrap传此路径以免Git Bash的$PWD被Windows误解。
先规划后生成。为每图记录配方、选型原因、首轮问题、逐轮修改、最终未解决问题到BACKEND_RESULT.md，并写RESULTS.json，结构为{"figures":[{"id":"d001","recipeIds":["..."],"status":"pass或unresolved或failed","repairRounds":0,"issues":[],"summary":"..."}]}，id使用本批实际数据id。保留所有输入。遇到不适用或依赖失败，选择数据语义正确的可运行替代并说明；不编造不存在的产物。不要改产品源码。`;


const extras = [];
for (const relative of ['../stage8-policy.md','../profiles/expressive.md','../fragments/original-size-preflight.md','../fragments/original-color-usage.md']) { const path=join(skill,relative); extras.push({path,text:await readFile(path,'utf8')}); }
await writeFile(join(trace,'loaded-extra-context.json'),JSON.stringify(extras,null,2));
const extraText = extras.map(x => `\n\n当前产品指导原文：${x.path}\n${x.text}`).join('');
const resumeVersions = new Map();
if (resume) {
 const saved = await readFile(join(trace,'snapshots.jsonl'),'utf8').catch(()=>'');
 for (const line of saved.split('\n').filter(Boolean)) { const row=JSON.parse(line); if (/^figures\/fig_d\d+\.png$/.test(row.file)) resumeVersions.set(row.file,(resumeVersions.get(row.file)??0)+1); }
}
const resumeLedger = [...resumeVersions].map(([file,count])=>`${file}: 已保存${count}个图像版本，首图后已有${Math.max(0,count-1)}次变更，最多剩余${Math.max(0,4-count)}轮修复`).join('\n');
const actualPrompt = resume ? '继续当前批次，先读已有计划、结果和图件，沿用输入与有效产物，已有修复轮数不重置；补齐未完成项。不要重新生成整套图。已经达到三轮的图只看图并记录未解决项，不得再改。PNG内容变更次数是宿主快照记录，请结合会话核对，不得遗漏已执行轮次。\n' + resumeLedger + '\n补齐BACKEND_RESULT.md和RESULTS.json（figures数组每项包含id、recipeIds、status、repairRounds、issues、summary；轮次包含中断前），完成后停止。' + extraText : prompt + extraText + '\n记录每张图各轮完整检查发现、集中修复和复查结论到 BACKEND_RESULT.md。执行上限以当前 stage8-policy.md 为准。';
await writeFile(join(trace, resume ? 'resume-prompt.txt' : 'prompt.txt'), actualPrompt);
const runtime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), modelsStore: new InMemoryModelsStore(), allowModelNetwork: false });
const model = runtime.getModel('openai-codex', 'gpt-5.6-sol');
if (!model) throw new Error('Configured live-test model unavailable');
const backend = createWorkspaceBackend(cwd, {productRoot, toolkitRoot:join(productRoot,'toolkit/src'), capabilitiesRoot:join(productRoot,'compatibility/v010/bundled/capabilities'), readonlyRoots:[skill]});
const loader = new DefaultResourceLoader({cwd,agentDir,noExtensions:true,noSkills:true,noContextFiles:true,
  additionalSkillPaths:[skill],extensionFactories:[pi=>{
    for (const tool of [createReadTool(cwd,{operations:backend.readOperations()}),createWriteTool(cwd,{operations:backend.writeOperations()}),createEditTool(cwd,{operations:backend.editOperations()}),createBashTool(cwd,{operations:backend.bashOperations(),exposeSessionEnvironment:false})]) pi.registerTool(tool);
  }]});
await loader.reload();
const manager = resume ? SessionManager.open(join(cwd, 'sessions', (await readdir(join(cwd, 'sessions'))).filter(name => name.endsWith('.jsonl')).sort().at(-1))) : SessionManager.create(cwd, join(cwd, 'sessions'));
const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model, thinkingLevel: 'medium', resourceLoader: loader, sessionManager: manager });
const info = { cwd, productRoot, model: model.id, thinkingLevel: 'medium', invocation: 'HaJiMi SDK + current compatibility plotting skill and explicit stage/profile/size/color guidance + production Windows backend tools; no workflow state tools',
  standalonePlotting: true, runtimeHome: process.env.HAJIMI_RUNTIME_HOME, skills: loader.getSkills().skills.map(s => ({ name: s.name, filePath: s.filePath })), startedAt: new Date().toISOString() };
await writeFile(join(trace, resume ? 'resume-info.json' : 'run-info.json'), JSON.stringify(info, null, 2));
console.log(JSON.stringify(info));
let queue = Promise.resolve(), turns = 0, reason = 'completed', sequence = 0;
const seen = new Map();
if (resume) {
  const previous = await readFile(join(trace, 'snapshots.jsonl'), 'utf8').catch(() => '');
  for (const line of previous.trim().split('\n').filter(Boolean)) {
    const row = JSON.parse(line); seen.set(row.file, row.hash); sequence++;
  }
  await appendFile(join(trace, 'events.jsonl'), JSON.stringify({ time: new Date().toISOString(), type: 'host_resume', reason: 'Harness supplied the existing desktop HAJIMI_RUNTIME_HOME; no product prompt or renderer changes.' }) + '\n');
}
async function snapshot(cause) {
  const files = (await readdir(cwd)).filter(name => /PLAN|MANIFEST|RESULT/.test(name) && /\.(md|json)$/.test(name)).map(name => [name, join(cwd, name)]);
  for (const name of await readdir(join(cwd, 'figures'))) if (/\.(py|pdf|png)$/.test(name)) files.push(['figures/' + name, join(cwd, 'figures', name)]);
  for (const [name, path] of files) {
    const bytes = await readFile(path), hash = createHash('sha256').update(bytes).digest('hex');
    if (seen.get(name) === hash) continue;
    seen.set(name, hash);
    const target = `snapshots/${String(++sequence).padStart(4, '0')}-${name.replaceAll('/', '_')}`;
    await mkdir(join(trace, 'snapshots'), { recursive: true });
    await writeFile(join(trace, target), bytes);
    await appendFile(join(trace, 'snapshots.jsonl'), JSON.stringify({ time: new Date().toISOString(), cause, file: name, hash, size: bytes.length, snapshot: target }) + '\n');
  }
}
session.subscribe(event => {
  let row;
  if (event.type === 'tool_execution_start') row = { type: event.type, id: event.toolCallId, tool: event.toolName, args: event.args };
  if (event.type === 'tool_execution_end') row = { type: event.type, id: event.toolCallId, tool: event.toolName, isError: event.isError,
    result: event.result?.content?.map(item => item.type === 'text' ? { type: 'text', text: item.text } : { type: item.type, mimeType: item.mimeType }) };
  if (event.type === 'message_end' && event.message.role === 'assistant') {
    if (event.message.errorMessage || event.message.stopReason === 'error') reason = 'provider-error';
    row = { type: event.type, usage: event.message.usage, stopReason: event.message.stopReason, errorMessage: event.message.errorMessage,
      text: event.message.content.filter(item => item.type === 'text').map(item => item.text).join('\n') };
    if (++turns >= 160) { reason = 'turn-bound'; void session.abort(); }
  }
  if (row) queue = queue.then(async () => { await appendFile(join(trace, 'events.jsonl'), JSON.stringify({ time: new Date().toISOString(), ...row }) + '\n'); if (event.type === 'tool_execution_end') await snapshot(event.toolName); });
});
const timeout = setTimeout(() => { reason = 'time-bound'; void session.abort(); }, 65 * 60 * 1000);
try {
  await session.bindExtensions({ onError: error => console.error('extension error', JSON.stringify(error)) });
  await session.prompt(actualPrompt);
  await queue; await snapshot('end');
  const result = { reason, turns, finishedAt: new Date().toISOString(), outputs: await readdir(join(cwd, 'figures')) };
  await writeFile(join(trace, 'run-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(timeout); await queue; session.dispose(); closeOpenAICodexWebSocketSessions(manager.getSessionId());
}
