import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WslWorkspaceBackend, type WslBackendOptions } from "./workspace-backend.ts";
import { WindowsWorkspaceBackend } from "./windows-workspace-backend.mjs";

type Operations = "readOperations" | "writeOperations" | "editOperations" | "bashOperations" | "health" | "readFile" | "writeFile" | "mkdir" | "access" | "list" | "find" | "grep" | "runShell" | "resolveHostPath" | "displayPath";
export type WorkspaceBackend = Pick<WslWorkspaceBackend, Operations> & {
  describe(): { kind: string; workspace: string; distribution?: string };
  prepare?(signal?: AbortSignal): Promise<void>;
};
export function createWorkspaceBackend(cwd: string, options: WslBackendOptions & { productRoot: string }): WorkspaceBackend {
  const marker = join(cwd, ".hajimi", "execution-backend.json");
  let kind: string;
  if (existsSync(marker)) {
    const value = JSON.parse(readFileSync(marker, "utf8"));
    if (value.format !== "hajimi.backend.v1" || !["windows-managed", "wsl2"].includes(value.kind)) throw new Error("Invalid workspace execution backend marker");
    kind = value.kind;
  } else {
    // Do not silently reinterpret old WSL tasks as Windows tasks.
    kind = existsSync(join(cwd, ".hajimi", "state.json")) ? "wsl2" : "windows-managed";
  }
  if (kind === "wsl2") return new WslWorkspaceBackend(cwd, options);
  return new WindowsWorkspaceBackend(cwd, options);
}
/** Only call from the explicit NEW-project allocation path, before task state is created. */
export async function markNewWindowsWorkspace(cwd: string): Promise<void> {
  if (process.platform !== "win32") return;
  if (existsSync(join(cwd, ".hajimi", "state.json"))) throw new Error("Refusing to relabel an existing task");
  await mkdir(join(cwd, ".hajimi"), { recursive: true });
  await writeFile(join(cwd, ".hajimi", "execution-backend.json"), JSON.stringify({ format: "hajimi.backend.v1", kind: "windows-managed", abi: 1 }) + "\n", { flag: "wx" });
}
