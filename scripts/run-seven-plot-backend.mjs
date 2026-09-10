// Real HaJiMi resource loader/core extension/backend; no external drawing code.
import { mkdir, readFile, writeFile, appendFile, copyFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createAgentSession, DefaultResourceLoader, ModelRuntime, SessionManager } from '@earendil-works/pi-coding-agent';
import { InMemoryModelsStore } from '@earendil-works/pi-ai';
import { hajimiResourceLoaderOptions } from '../lib/hajimi/resources.ts';
import { hajimiCoreInlineExtension, originalWorkflowForTask } from '../lib/hajimi/core-extension.ts';
import { ensureHajimiTask } from '../lib/hajimi/task-state.ts';
import { recordManagedExperiment, recordEvidence, recordClaim, freezeSelectedEvidence } from '../lib/hajimi/workflow-service.ts';
import { closeOpenAICodexWebSocketSessions } from '../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js';

if (!process.argv.includes('--run')) throw new Error('Explicit --run required');
if (!process.env.HAJIMI_RUNTIME_HOME) throw new Error('Set the desktop managed-runtime path before invoking the live backend');
const productRoot = resolve('.');
const cwd = join(productRoot, 'projects/seven-synthetic-20260909');
const trace = join(productRoot, 'artifacts/seven-synthetic-20260909');
const agentDir = 'C:/hajimi-native-test-data-20260905/agent';
const resume = process.argv.includes('--resume');
await mkdir(trace, { recursive: true });
for (const directory of ['input', 'work', 'figures', 'reports', 'src', 'sessions']) await mkdir(join(cwd, directory), { recursive: true });
const catalog = JSON.parse(await readFile(join(cwd, 'DATA_CATALOG.json'), 'utf8'));
for (const item of catalog.datasets) if (createHash('sha256').update(await readFile(join(cwd, item.path))).digest('hex') !== item.sha256) throw new Error(`Dataset changed: ${item.id}`);
if (!resume) {
  await writeFile(join(trace, 'run.lock'), 'seven synthetic datasets', { flag: 'wx' });
  await copyFile(join(productRoot, 'scripts/generate-seven-plot-datasets.py'), join(cwd, 'src/generate_data.py'));
  await copyFile(join(cwd, 'DATA_CATALOG.json'), join(cwd, 'input/DATA_CATALOG.json'));
  let { state } = await ensureHajimiTask(cwd, '七组合成数据绘图实践');
  // Explicit test fixture, not a claim that seven research stages were performed.
  state.focus = { stage: 7, questionId: null };
  state.currentObjective = '用户授权的独立合成数据绘图验收；不代表完成了前七阶段研究。';
  state.nextAction = '只画指定七组数据并记录过程，不写论文、不结束整个阶段。';
  state.interaction = { mode: 'supervised', executionPolicy: 'strict', pending: null, reports: [], reviewedStages: [], finalAccepted: false, stageBaseline: [], stageStartedAt: new Date().toISOString() };
  state.problemTags = ['data', 'statistics', 'simulation', 'optimization'];
  await writeFile(join(cwd, '.hajimi/state.json'), JSON.stringify(state, null, 2));
  await writeFile(join(cwd, '.hajimi/execution-backend.json'), JSON.stringify({ format: 'hajimi.backend.v1', kind: 'windows-managed', abi: 1 }));
  const now = new Date().toISOString();
  const record = await recordManagedExperiment(cwd, state.revision, {
    title: '用户授权构造七组合成数据，仅用于绘图测试', command: 'python scripts/generate-seven-plot-datasets.py <isolated-workspace>',
    codePaths: ['src/generate_data.py'], inputPaths: [], parameterPaths: ['DATA_CATALOG.json'], outputPaths: catalog.datasets.map(item => item.path),
    environment: { generator: 'NumPy default_rng', purpose: 'synthetic visualization fixture' }, seed: 20260909,
    exitCode: 0, startedAt: now, completedAt: now, status: 'succeeded', trust: 'attested',
  });
  const evidence = await recordEvidence(cwd, record.state.revision, { experimentRefs: [record.experiment.experimentId], artifactRefs: record.experiment.outputRefs.map(item => item.id),
    validationMethod: '七个 JSON 均可解析、无 NaN，文件 SHA256 与生成目录一致；只验证合成数据完整性。', status: 'verified', domainValidationStatus: 'accepted', limitations: ['全部为合成数据，不是实际观测或科学结论。'] });
  const claim = await recordClaim(cwd, evidence.state.revision, { text: '本测试输入是七组已生成并校验文件哈希的合成数据。', kind: 'qualitative', evidenceRefs: [evidence.evidence.evidenceId], status: 'supported' });
  state = await freezeSelectedEvidence(cwd, claim.state.revision, [evidence.evidence.evidenceId], [claim.claim.claimId]);
  state.focus = { stage: 8, questionId: null };
  await writeFile(join(cwd, '.hajimi/state.json'), JSON.stringify(state, null, 2));
}

const prompt = `这是用户授权的七组合成数据绘图实践测试。所有输入都明确为合成数据，只用于看真实绘图效果，不能称为真实实验结论。请由你使用 HaJiMi 实际内置 modeling-plot-suite，独立完成选图、提取配方、适配代码、运行出图、实际看图与检查；宿主不会替你写绘图代码。
读取 DATA_CATALOG.json 和 data/ 下七个数据文件。每组交付一张语义完整的图，共且仅七张，ID 依次为 fig_g1_distributions、fig_g2_forecast、fig_g3_methods、fig_g4_response、fig_g5_sensitivity、fig_g6_contributions、fig_g7_correlations。保留每张 PDF、PNG 和可独立运行的 Python 生成器。绘图目标如下：
${catalog.datasets.map((item, i) => `${i + 1}. ${item.path}：${item.question}`).join('\n')}
本次使用产品内置 expressive 模式；具体图型由你根据数据与内置指南自主选择，不提供指定配方答案。保留原版默认配色与字体，不另外发明自定义主题。以136mm最终显示宽度检查可读性。原始合成输入不可改写，不另造统计结果，数据未提供的不确定性不能凭空补充。
先写本次 PAPER_PLAN.md 与 FIGURE_MANIFEST，列明每图的数据字段、论点、选择图型和实际配方引用，再按产品流程执行。此请求是七组独立绘图测试，不是整篇论文：不增加第八张数据图，不添加路线图，不写论文，不推进到 writing 或交付整个阶段。
按当前内置流程实际查看图片、检查和必要修正，不禁止正常迭代。记录遇到的错误、采取的修正和仍未解决的问题到 BACKEND_RESULT.md；如判断需要改图说明原因。对无法运行的脚本自行排查，不能把失败写成成功。七图完成并检查后结束本次请求。`;
const actualPrompt = resume ? '宿主已补齐桌面程序的 HAJIMI_RUNTIME_HOME 环境配置。继续同一会话的七组合成数据绘图测试，沿用既有数据、计划和成功产物，解决阻塞并完成剩余绘图与检查。不要重新开始或加图，不改产品源码。' : prompt;
await writeFile(join(trace, resume ? 'resume-prompt.txt' : 'prompt.txt'), actualPrompt);
const runtime = await ModelRuntime.create({ authPath: join(agentDir, 'auth.json'), modelsPath: join(agentDir, 'models.json'), modelsStore: new InMemoryModelsStore(), allowModelNetwork: false });
const model = runtime.getModel('openai-codex', 'gpt-5.6-sol');
if (!model) throw new Error('Configured live-test model unavailable');
const loader = new DefaultResourceLoader(hajimiResourceLoaderOptions({ cwd, agentDir, productRoot,
  extensionFactories: [hajimiCoreInlineExtension({ cwd, productRoot, getMode: () => 'full' })] }));
await loader.reload();
const manager = resume ? SessionManager.open(join(cwd, 'sessions', (await readdir(join(cwd, 'sessions'))).filter(name => name.endsWith('.jsonl')).sort().at(-1))) : SessionManager.create(cwd, join(cwd, 'sessions'));
const { session } = await createAgentSession({ cwd, agentDir, modelRuntime: runtime, model, thinkingLevel: 'medium', resourceLoader: loader, sessionManager: manager });
const info = { cwd, productRoot, model: model.id, thinkingLevel: 'medium', invocation: 'HaJiMi DefaultResourceLoader + routed core extension + Windows managed backend',
  originalWorkflow: originalWorkflowForTask(cwd), runtimeHome: process.env.HAJIMI_RUNTIME_HOME, skills: loader.getSkills().skills.map(s => ({ name: s.name, filePath: s.filePath })), startedAt: new Date().toISOString() };
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
