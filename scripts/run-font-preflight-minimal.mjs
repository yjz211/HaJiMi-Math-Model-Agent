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
const variant = process.argv.includes('--full') ? 'full' : 'skill-only';
const cwd = join(productRoot, 'projects/font-preflight-minimal-' + variant);
const trace = join(productRoot, 'artifacts/font-preflight-minimal/' + variant);
const agentDir = 'C:/hajimi-native-test-data-20260905/agent';
const resume = process.argv.includes('--resume');
await mkdir(trace, { recursive: true });
for (const directory of ['input', 'work', 'figures', 'reports', 'src', 'sessions']) await mkdir(join(cwd, directory), { recursive: true });
await mkdir(join(cwd, '.hajimi'), {recursive:true});
await writeFile(join(cwd, '.hajimi/execution-backend.json'), JSON.stringify({format:'hajimi.backend.v1',kind:'windows-managed',abi:1}));
const data = {synthetic:true, unit:'分钟', methods:[{name:'固定调度',values:[12,16,14,20,11,18,15,13,19,10]},{name:'自适应调度',values:[9,11,8,13,10,7,12,9,11,8]},{name:'预测协同',values:[6,8,7,10,5,9,7,6,8,7]}]};
await writeFile(join(cwd, 'data.json'), JSON.stringify(data,null,2));
await writeFile(join(trace, 'run.lock'), variant, {flag:'wx'});
const skill = join(productRoot, 'compatibility/v010/bundled/capabilities/modeling-plot-suite/1.0.0/resources');
bindPlotRuntime(cwd, productRoot);
const basePrompt = `单图最小测试：使用内置 modeling-plot-suite expressive 能力，为 data.json 的三组模拟等待时间选择合适的分布比较图。最终显示宽度为136毫米，沿用内置默认字体、配色及模板，尽量保真适配。仅交付简短 PLAN.md 和一个可运行的 figures/gen_test.py，不运行生成器、不渲染、不做出图后检查或修图，写完立即结束。所有数据为模拟数据。此任务不是整篇论文，无需路线图、数量门槛、研究阶段推进或证据冻结；不提供状态机工具。允许读取原有技能与配方。技能路径：${skill}/SKILL.md。不要改产品源码。`;
const extraPaths = variant === 'full' ? [join(skill,'../stage8-policy.md'),join(skill,'../profiles/expressive.md')] : [];
const extras=[];
for (const path of extraPaths) extras.push({path,text:await readFile(path,'utf8')});
await writeFile(join(trace,'loaded-extra-context.json'),JSON.stringify(extras,null,2));
const actualPrompt = basePrompt + extras.map(x=>`\n\n以下为产品现有指导原文（仅执行与本次单图请求相关部分）：${x.path}\n${x.text}`).join('');

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
const info = { cwd, productRoot, model: model.id, thinkingLevel: 'medium', invocation: 'HaJiMi SDK + unchanged compatibility plotting skill + production Windows backend tools; no workflow state tools',
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
    if (++turns >= 30) { reason = 'turn-bound'; void session.abort(); }
  }
  if (row) queue = queue.then(async () => { await appendFile(join(trace, 'events.jsonl'), JSON.stringify({ time: new Date().toISOString(), ...row }) + '\n'); if (event.type === 'tool_execution_end') await snapshot(event.toolName); });
});
const timeout = setTimeout(() => { reason = 'time-bound'; void session.abort(); }, 8 * 60 * 1000);
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
