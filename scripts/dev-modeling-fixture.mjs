// Isolated local UI fixture. No user credentials, sessions, or external model calls.
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const root = process.argv[2] ?? await mkdtemp(join(tmpdir(), "hajimi-workbench-fixture-"));
const agentDir = join(root, "agent");
await mkdir(agentDir, { recursive: true });
const requests = [];
const mock = createServer(async (req, res) => {
  if (req.url === "/requests") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(requests)); return; }
  let raw = "";
  for await (const part of req) raw += part;
  const body = JSON.parse(raw || "{}");
  requests.push({ model: body.model, effort: body.reasoning_effort, messages: body.messages?.length });
  if (process.env.HAJIMI_AUTOMATIC_FIXTURE === "1") {
    const controlPath = join(root, "automatic-control.json");
    const control = JSON.parse(await readFile(controlPath, "utf8").catch(() => '{"remainingStops":0}'));
    const request = requests.at(-1);
    request.at = new Date().toISOString();
    request.result = control.remainingStops > 0 ? "normal-stop" : "terminal-error";
    await writeFile(join(root, "automatic-requests.json"), JSON.stringify(requests, null, 2));
    if (control.remainingStops <= 0) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "AUTOMATIC_FIXTURE_TERMINAL_ERROR: deliberate bounded software test", type: "invalid_request_error" } }));
      return;
    }
    control.remainingStops--;
    await writeFile(controlPath, JSON.stringify(control));
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (delta, finish_reason = null) => res.write(`data: ${JSON.stringify({ id: "auto-fixture", object: "chat.completion.chunk", model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: "assistant", reasoning_content: "AUTO_HIDDEN_REASONING_20260906：这是受控测试思考，不应显示。" });
    await new Promise(resolve => setTimeout(resolve, Math.min(Math.max(control.delayMs ?? 1000, 0), 45000)));
    chunk({ content: "软件控制测试：本次模型正常结束，没有完成论文或通过质量门。" });
    chunk({}, "stop");
    res.end("data: [DONE]\n\n");
    return;
  }
  if (process.env.HAJIMI_INTERACTION_FIXTURE === "1") {
    const projects = await readdir(join(root, "projects")).catch(() => []);
    const project = projects.at(-1);
    const state = project ? JSON.parse(await readFile(join(root, "projects", project, ".hajimi", "state.json"), "utf8")) : null;
    let calls = [];
    if (state && !state.interaction?.pending) {
      const stage = state.focus.stage;
      const unmet = state.milestones[stage].requirements.find(r => r.status !== "satisfied");
      if (unmet) calls = [{ name: "hajimi_set_requirement", arguments: { expectedRevision: state.revision, stage, requirementId: unmet.id, status: "satisfied", evidenceRefs: ["fixture-review"] } }];
      else if (state.milestones[stage].status !== "satisfied") calls = [
        { name: "hajimi_set_milestone", arguments: { expectedRevision: state.revision, stage, status: "satisfied", summary: "隔离测试阶段完成，文件可审查。", files: [] } },
        { name: "write", arguments: { path: "output/SHOULD_NOT_EXIST.txt", content: "illegal write after stage stop" } },
      ];
      else if (stage < 2) calls = [{ name: "hajimi_set_focus", arguments: { expectedRevision: state.revision, stage: stage + 1 } }];
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    const delta = calls.length ? { role: "assistant", tool_calls: calls.map((c,index) => ({ index, id: "fixture-"+Date.now()+"-"+index, type: "function", function: { name:c.name, arguments:JSON.stringify(c.arguments) } })) } : { role: "assistant", reasoning_content:"隐藏的测试思考内容", content:"测试回复：可以在聊天中讨论报告，等待明确继续或返工意见。" };
    res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",model:body.model,choices:[{index:0,delta,finish_reason:null}]})}\n\n`);
    res.write(`data: ${JSON.stringify({id:"fixture",object:"chat.completion.chunk",model:body.model,choices:[{index:0,delta:{},finish_reason:calls.length?"tool_calls":"stop"}]})}\n\n`);
    res.end("data: [DONE]\n\n");
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream" });
  const content = "我是 HaJiMi 数学建模助手。第 0 阶段是材料就绪：请直接在聊天框上传题目 PDF、Word、图片和数据附件。我会核对材料并说明缺失项，等待你确认材料齐全。";
  res.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", model: body.model, choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }] })}\n\n`);
  res.write(`data: ${JSON.stringify({ id: "fixture", object: "chat.completion.chunk", model: body.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 } })}\n\n`);
  res.end("data: [DONE]\n\n");
});
await new Promise(resolve => mock.listen(0, "127.0.0.1", resolve));
const mockPort = mock.address().port;
await writeFile(join(agentDir, "models.json"), JSON.stringify({ providers: {
  fixture: { baseUrl: `http://127.0.0.1:${mockPort}/v1`, api: "openai-completions", apiKey: "local-fixture-only",
    models: ["model-a", "model-b"].map(id => ({ id, name: id === "model-a" ? "建模测试 A" : "建模测试 B", reasoning: true,
      input: ["text"], contextWindow: 128000, maxTokens: 4096, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })) }
} }));
await writeFile(join(agentDir, "settings.json"), JSON.stringify({ defaultProvider: "fixture", defaultModel: "model-a", defaultThinkingLevel: "medium" }));
console.log(JSON.stringify({ root, agentDir, mockPort, url: "http://localhost:30143" }));
const packaged = process.env.HAJIMI_FIXTURE_PACKAGE ? resolve(process.env.HAJIMI_FIXTURE_PACKAGE) : null;
const standalone = packaged ? join(packaged, 'resources/standalone') : process.cwd();
const child = spawn(packaged ? join(packaged, 'HaJiMi.exe') : process.execPath,
  packaged ? [join(standalone, 'server.js')] : ["node_modules/next/dist/bin/next", "dev", "-p", "30143"], {
  cwd: standalone, env: { ...process.env, PI_CODING_AGENT_DIR: agentDir, HAJIMI_AGENT_DIR: agentDir, HAJIMI_PROJECTS_ROOT: join(root, "projects"),
    ...(packaged ? { ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production', HOSTNAME: '127.0.0.1', PORT: '30143', HAJIMI_PRODUCT_ROOT: join(packaged, 'resources/hajimi') } : {}),
  }, stdio: "inherit", windowsHide: true,
});
function stop() { child.kill(); mock.close(); }
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", () => { mock.close(); process.exit(0); });
