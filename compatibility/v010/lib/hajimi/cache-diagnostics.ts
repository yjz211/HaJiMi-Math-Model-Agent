import { createHash } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex");

/** Metadata only: never return prompt text, headers, cache keys or arbitrary payload fields. */
export function fingerprintRequest(payload: unknown) {
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const input = Array.isArray(body.input) ? body.input : Array.isArray(body.messages) ? body.messages : [];
  return {
    instructionsHash: hash(body.instructions), toolsHash: hash(body.tools), modelHash: hash(body.model),
    cacheKeyHash: hash(body.prompt_cache_key),
    optionsHash: hash([body.reasoning, body.text, body.temperature, body.tool_choice, body.parallel_tool_calls,
      body.prompt_cache_retention, body.prompt_cache_options]),
    items: input.map(item => ({ hash: hash(item), bytes: Buffer.byteLength(JSON.stringify(item) ?? "null"),
      role: ["user", "assistant", "system", "developer", "tool"].includes(item?.role) ? item.role as string : null })),
  };
}

export function installCacheDiagnostics(pi: ExtensionAPI, cwd: string) {
  let previous: ReturnType<typeof fingerprintRequest> | undefined;
  let sequence = 0;
  let started = 0;
  const directory = join(cwd, ".hajimi");
  const record = async (value: unknown) => {
    await mkdir(directory, { recursive: true });
    await appendFile(join(directory, "cache-diagnostics.jsonl"), `${JSON.stringify(value)}\n`, "utf8");
  };
  pi.on("before_provider_request", async event => {
    const current = fingerprintRequest(event.payload);
    let commonItems = 0;
    while (previous && commonItems < Math.min(previous.items.length, current.items.length)
      && previous.items[commonItems].hash === current.items[commonItems].hash) commonItems++;
    started = Date.now();
    await record({ type: "request", sequence: ++sequence, timestamp: started, ...current,
      commonItems, previousInputIsPrefix: previous ? commonItems === previous.items.length : null,
      sameInstructions: previous ? current.instructionsHash === previous.instructionsHash : null,
      sameTools: previous ? current.toolsHash === previous.toolsHash : null,
      sameCacheKey: previous ? current.cacheKeyHash === previous.cacheKeyHash : null });
    previous = current;
  });
  pi.on("turn_end", async event => {
    if (event.message.role !== "assistant") return;
    const usage = event.message.usage;
    await record({ type: "usage", sequence, durationMs: started ? Date.now() - started : null,
      input: usage.input, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, output: usage.output });
  });
}
