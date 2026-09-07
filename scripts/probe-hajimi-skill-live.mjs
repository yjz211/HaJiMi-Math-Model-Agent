// Opt-in real-model acceptance through HaJiMi's actual extension and managed tools.
import { cp, mkdir, writeFile, appendFile, readdir, readFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent';
import { InMemoryModelsStore } from '@earendil-works/pi-ai';
import { hajimiResourceLoaderOptions } from '../lib/hajimi/resources.ts';
import { hajimiCoreInlineExtension } from '../lib/hajimi/core-extension.ts';
import { closeOpenAICodexWebSocketSessions } from '../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js';

if (!process.argv.includes('--run')) throw new Error('Explicit --run required; uses the isolated test account.');
const productRoot = resolve('.');
const source = 'C:/hajimi-native-test-data-20260905/projects/数学建模1';
const agentDir = 'C:/hajimi-native-test-data-20260905/agent';
const run = randomUUID();
const resumeIndex = process.argv.indexOf('--resume');
const cwd = resumeIndex >= 0 ? resolve(process.argv[resumeIndex + 1]) : resolve('docs/verification/native-20260905/live-skill', run);
const testRoot = resolve('docs/verification/native-20260905/live-skill');
if (!cwd.startsWith(testRoot + sep)) throw new Error('Probe must stay inside live-skill test directory');
await mkdir(cwd, { recursive: true });
// Snapshot the existing evidence and governance, never edit the original task.
if (resumeIndex < 0) {
for (const directory of ['.hajimi', 'input', 'data', 'work', 'reports', 'src', 'figures', 'paper', 'output']) {
  await cp(join(source, directory), join(cwd, directory), { recursive: true });
}
await mkdir(join(cwd, 'figures'), { recursive: true });
await writeFile(join(cwd, 'figures/figure_style.json'), JSON.stringify({ palette: 'journal', style: 'clean_open' }));
}
const log = join(cwd, 'probe-events.jsonl');
const runtime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'),
  modelsStore: new InMemoryModelsStore(), allowModelNetwork: false });
const model = runtime.getModel('openai-codex', 'gpt-5.6-sol');
if (!model) throw new Error('Expected test model unavailable.');
const resourceLoader = new DefaultResourceLoader(hajimiResourceLoaderOptions({ cwd, agentDir, productRoot,
  extensionFactories: [hajimiCoreInlineExtension({ cwd, productRoot, getMode: () => 'full' })] }));
await resourceLoader.reload();
const sessionDir = join(cwd, 'probe-sessions');
const manager = resumeIndex >= 0
  ? SessionManager.open(join(sessionDir, (await readdir(sessionDir)).filter(p => p.endsWith('.jsonl')).sort().at(-1)))
  : SessionManager.create(cwd, sessionDir);
const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model,
  thinkingLevel: 'medium', resourceLoader, sessionManager: manager });
let turns = 0;
let terminationReason = 'completed';
let writes = Promise.resolve();
session.subscribe(event => {
  let row;
  if (event.type === 'tool_execution_start') row = { type: event.type, tool: event.toolName, args: event.args };
  if (event.type === 'tool_execution_end') row = { type: event.type, tool: event.toolName, isError: event.isError };
  if (event.type === 'message_end' && event.message.role === 'assistant') {
    row = { type: event.type, usage: event.message.usage, stopReason: event.message.stopReason,
      text: event.message.content.filter(item => item.type === 'text').map(item => item.text).join('\n') };
    if (++turns >= 55) { terminationReason = 'probe-turn-bound'; void session.abort(); }
  }
  if (row) writes = writes.then(() => appendFile(log, JSON.stringify({ time: new Date().toISOString(), ...row })+'\n'));
});
console.log(JSON.stringify({ cwd, model: model.id, skills: resourceLoader.getSkills().skills.map(s => s.name) }));
const timeout = setTimeout(() => { terminationReason = 'probe-time-bound'; void session.abort(); }, 15 * 60 * 1000);
try {
  await session.bindExtensions({ onError: error => { console.error('extension error', error.message); } });
  const promptIndex = process.argv.indexOf('--prompt-file');
  await session.prompt(promptIndex >= 0 ? await readFile(resolve(process.argv[promptIndex + 1]), 'utf8') : '这是独立绘图能力验收副本，已有活动冻结证据。请用内置 modeling-plot-suite 将问题四现有结果制作成正式质量的图，表达测线布局、原网格覆盖情况及候选方案的权衡；数据使用 work/q4_results.json、data/derived/bathymetry_grid.csv、q4_lines.csv、q4_coverage_grid.csv、q4_pareto.csv，不重新求解。已有 figures/figure_style.json 是本次指定风格，请沿用。自行选择清晰布局，保留可编辑生成器、PDF 和 PNG，实际读取渲染图并修正问题，检查 160 mm 宽时的字号。只完成这项图稿与简短验收记录，不写整篇论文、不结束整个阶段，不改其他建模结果。');
  await writes;
  console.log(JSON.stringify({ finished: true, turns, cwd, terminationReason }));
} finally {
  clearTimeout(timeout);
  await writes;
  session.dispose();
  closeOpenAICodexWebSocketSessions(manager.getSessionId());
}
