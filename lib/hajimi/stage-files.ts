import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import type { HajimiStageFileSnapshot } from "./workflow-types.ts";

const SKIP = new Set([".hajimi", ".git", "node_modules", "__pycache__", ".venv", "input", "reports", "comparison-session", "events.jsonl", "run-info.json", "run-result.json", "COMPARISON_PROMPT.txt", "one-round.lock"]);

export async function captureStageFiles(cwd: string, includeInputs = false): Promise<HajimiStageFileSnapshot[]> {
  const files: HajimiStageFileSnapshot[] = [];
  async function walk(dir: string): Promise<void> {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      if (item.isSymbolicLink() || (SKIP.has(item.name) && !(includeInputs && item.name === "input"))) continue;
      const absolute = join(dir, item.name);
      if (item.isDirectory()) await walk(absolute);
      else if (item.isFile()) {
        const content = await readFile(absolute);
        files.push({
          path: relative(cwd, absolute).replaceAll("\\", "/"),
          sha256: createHash("sha256").update(content).digest("hex"),
          sizeBytes: content.length,
        });
      }
    }
  }
  await walk(cwd);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

export function fileReadUrl(absolutePath: string): string {
  const normalized = absolutePath.replaceAll("\\", "/");
  const encoded = normalized.split("/").map(encodeURIComponent).join("/");
  return `/api/files/${encoded}?type=raw`;
}
