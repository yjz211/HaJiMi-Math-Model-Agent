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
const cwd = join(productRoot, 'projects/five-review-20260909');
const trace = join(productRoot, 'artifacts/five-review-20260909');
const agentDir = 'C:/hajimi-native-test-data-20260905/agent';
const resume = process.argv.includes('--resume');
await mkdir(trace, { recursive: true });
for (const directory of ['input', 'work', 'figures', 'reports', 'src', 'sessions']) await mkdir(join(cwd, directory), { recursive: true });
const catalog = JSON.parse(await readFile(join(cwd, 'DATA_CATALOG.json'), 'utf8'));
for (const item of catalog.datasets) if (createHash('sha256').update(await readFile(join(cwd, item.path))).digest('hex') !== item.sha256) throw new Error(`Dataset changed: ${item.id}`);
if (!resume) {
  await writeFile(join(trace, 'run.lock'), 'five new synthetic datasets', { flag: 'wx' });
  await copyFile(join(productRoot, 'scripts/generate-five-review-datasets.py'), join(cwd, 'src/generate_data.py'));
  await copyFile(join(cwd, 'DATA_CATALOG.json'), join(cwd, 'input/DATA_CATALOG.json'));
  await mkdir(join(cwd, '.hajimi'), {recursive:true});
  await writeFile(join(cwd, '.hajimi/execution-backend.json'), JSON.stringify({format:'hajimi.backend.v1',kind:'windows-managed',abi:1}));
}
const skill = join(productRoot, 'compatibility/v010/bundled/capabilities/modeling-plot-suite/1.0.0/resources');
bindPlotRuntime(cwd, productRoot);
const prompt = `用户授权的五组合成数据绘图测试，全部是假数据，不能称作真实研究结论。
请读取 DATA_CATALOG.json 和五个 data 文件，由你使用内置 modeling-plot-suite 自主选图、提取配方、写生成器、运行、实际打开图片并修正问题。共且仅五张语义图，各有 PDF、PNG、可独立运行 Python 脚本；图名以 fig_f1 到 fig_f5 开头。第二组必须画三维响应曲面。
${catalog.datasets.map((item,i)=>`${i+1}. ${item.path}: ${item.question}`).join('\n')}
使用原有 expressive 绘图能力、默认配色字体和完整配方；不要简化为普通图或另造主题。以136mm宽度检查可读性。保持输入不变，不得凭空补统计结果。
本次是独立绘图测试，宿主加载绘图技能、当前阶段策略、expressive模式、尺寸/配色指导及真实 HaJiMi Windows 工作区工具，不加载整篇论文状态机。无需研究阶段验收、证据冻结、八图或路线图；技能的 full-paper 条款不适用本请求。保留选图规划、配方引用、图像检查与必要修正，写 PAPER_PLAN.md/FIGURE_MANIFEST 和 BACKEND_RESULT.md，记录错误及修正。不要改产品源码或启动论文写作。
技能原文路径：${skill}/SKILL.md。宿主没有提供配方答案或绘图代码。`;

const extras = [];
for (const relative of ['../stage8-policy.md','../profiles/expressive.md','../fragments/original-size-preflight.md','../fragments/original-color-usage.md']) { const path=join(skill,relative); extras.push({path,text:await readFile(path,'utf8')}); }
await writeFile(join(trace,'loaded-extra-context.json'),JSON.stringify(extras,null,2));
const extraText = extras.map(x => `\n\n当前产品指导原文：${x.path}\n${x.text}`).join('');
const actualPrompt = resume ? '继续本次五图测试，沿用已有输入和产物，完成看图修正及结果记录。' : prompt + extraText + '\n记录每张图各轮完整检查发现、集中修复和复查结论到 BACKEND_RESULT.md。执行上限以当前 stage8-policy.md 为准。';
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
    row = { type: event.type, usage: event.message.usage, stopReason: event.message.stopReason, errorMessage: event.message.errorMessage,
      text: event.message.content.filter(item => item.type === 'text').map(item => item.text).join('\n') };
    if (++turns >= 160) { reason = 'turn-bound'; void session.abort(); }
  }
  if (row) queue = queue.then(async () => { await appendFile(join(trace, 'events.jsonl'), JSON.stringify({ time: new Date().toISOString(), ...row }) + '\n'); if (event.type === 'tool_execution_end') await snapshot(event.toolName); });
});
const timeout = setTimeout(() => { reason = 'time-bound'; void session.abort(); }, 45 * 60 * 1000);
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
