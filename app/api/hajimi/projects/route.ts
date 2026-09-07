import { NextResponse } from "next/server";
import { markNewWindowsWorkspace } from "@/lib/hajimi/workspace-backend-factory";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { createModelingDirectory, MODELING_START_PROMPT } from "@/lib/hajimi/modeling-project";
import { ensureHajimiTask, updateHajimiState } from "@/lib/hajimi/task-state";
import { startRpcSession } from "@/lib/rpc-manager";
import { cacheSessionPath } from "@/lib/session-reader";

// No GET initializer: opening/reopening the app cannot allocate a modeling project.
export async function POST() {
  try {
    const { name, cwd } = await createModelingDirectory();
    await markNewWindowsWorkspace(cwd);
    const task = await ensureHajimiTask(cwd);
    await updateHajimiState(cwd, task.state.revision, {
      currentObjective: "核对题目和数据附件，明确需要解决的问题。",
      nextAction: "请在聊天框上传题目文件与附件；我会读取并检查材料是否齐全。",
      microPlan: task.state.microPlan,
    });
    const manager = SessionManager.create(cwd);
    manager.appendSessionInfo(name);
    // Persist the explicit create even without credentials or a successful model response.
    // This is a built-in welcome, not a billed/model-generated answer.
    manager.appendMessage({
      role: "assistant", content: [{ type: "text", text: `${name}已创建。欢迎使用 HaJiMi，我们从第 0 阶段「材料就绪」开始。请在下方上传题目文件和数据附件。` }],
      api: "openai-responses", provider: "hajimi", model: "built-in-welcome",
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason: "stop", timestamp: Date.now(),
    });
    const id = manager.getSessionId();
    const path = manager.getSessionFile()!;
    cacheSessionPath(id, path);
    globalThis.__piAllowedRootsCache?.roots.add(cwd);
    let startupError: string | undefined;
    try {
      const { session } = await startRpcSession(id, path, cwd);
      await session.send({ type: "prompt", message: MODELING_START_PROMPT });
    } catch (error) {
      startupError = error instanceof Error ? error.message : String(error);
    }
    return NextResponse.json({ session: { id, path, cwd, name,
      created: new Date().toISOString(), modified: new Date().toISOString(),
      messageCount: 1, firstMessage: "" }, startupError });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
