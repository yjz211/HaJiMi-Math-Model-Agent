import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Workflow unit tests exercise tool routing, not WSL or Python execution. */
export function markWorkflowTestWorkspace(cwd: string) {
  mkdirSync(join(cwd, ".hajimi"), { recursive: true });
  writeFileSync(join(cwd, ".hajimi/execution-backend.json"), JSON.stringify({ format: "hajimi.backend.v1", kind: "windows-managed", abi: 1 }));
}
