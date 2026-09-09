import { readFileSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import type { ExtensionAPI, InlineExtension } from "@earendil-works/pi-coding-agent";
import * as lean from "./core-extension-v011.ts";
import * as original from "../../compatibility/v010/lib/hajimi/core-extension.ts";
import { usesOriginalWorkflow } from "./execution-policy.ts";
import { alignPolicyDefinition } from "./policy-definition.ts";
import { bindPlotRuntime } from "./plot-runtime-binding.ts";

export * from "./core-extension-v011.ts";

export { usesOriginalWorkflow } from "./execution-policy.ts";

export function originalWorkflowForTask(cwd: string): boolean {
  try { return usesOriginalWorkflow(JSON.parse(readFileSync(join(cwd, ".hajimi/state.json"), "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

// Preserve both implementations; select at every event/tool boundary so stage
// transitions and policy selection also work inside an existing session.
export function createHajimiCoreFactory(options: lean.HajimiCoreOptions) {
  return (pi: ExtensionAPI) => {
    type Tool = Parameters<ExtensionAPI["registerTool"]>[0];
    type Handler = (...args: unknown[]) => unknown;
    const variants = [
      { tools: new Map<string, Tool>(), events: new Map<string, Handler[]>() },
      { tools: new Map<string, Tool>(), events: new Map<string, Handler[]>() },
    ];
    const selected = () => Number(originalWorkflowForTask(options.cwd));
    let executionTail: Promise<unknown> = Promise.resolve();
    const registered: Tool[] = [];
    let installed = selected();
    const refreshSelection = () => {
      const next = selected();
      if (next !== installed) {
        installed = next;
        for (const tool of registered) pi.registerTool(tool);
      }
    };
    for (const [index, factory] of [lean.createHajimiCoreFactory, original.createHajimiCoreFactory].entries()) {
      const capture = {
        ...pi,
        registerTool(tool: Tool) { variants[index].tools.set(tool.name, tool); },
        on(name: string, handler: Handler) {
          const list = variants[index].events.get(name) ?? [];
          list.push(handler); variants[index].events.set(name, list);
        },
      } as ExtensionAPI;
      if (typeof pi.setActiveTools === "function") capture.setActiveTools = names => pi.setActiveTools(
        names.filter(name => !name.startsWith("hajimi_") || variants[index].tools.has(name)));
      factory({ ...options, productRoot: index ? join(options.productRoot, "compatibility/v010") : options.productRoot })(capture);
    }
    for (const name of new Set(variants.flatMap(v => [...v.tools.keys()]))) {
      const fallback = variants[0].tools.get(name) ?? variants[1].tools.get(name)!;
      const tool = () => variants[selected()].tools.get(name);
      const routed: Tool = {
        ...fallback,
        get description() { return (tool() ?? fallback).description; },
        get parameters() { return (tool() ?? fallback).parameters; },
        get promptSnippet() { return (tool() ?? fallback).promptSnippet; },
        async execute(...args) {
          const run = executionTail.then(async () => {
          await alignPolicyDefinition(options.cwd);
          refreshSelection();
          const current = tool();
          if (!current) throw new Error(`Tool ${name} is unavailable in the current workflow.`);
          if (selected() && ["read", "ls", "find", "grep", "bash"].includes(name)) {
            const rewrite = bindPlotRuntime(options.cwd, options.productRoot);
            const input = args[1] as { path?: string; command?: string };
            args[1] = { ...input, ...(input.path ? { path: rewrite(input.path) } : {}),
              ...(input.command ? { command: rewrite(input.command) } : {}) };
          }
          // A skill may have been loaded before the session changed policy.
          // Resolve its original bundled path to the selected immutable copy.
          if (selected() && ["read", "ls", "find", "grep"].includes(name)) {
            const input = args[1] as { path?: string };
            if (input.path) {
              const path = relative(resolve(options.productRoot, "bundled"), resolve(input.path));
              if (path && !path.startsWith("..") && !/^[A-Za-z]:/.test(path))
                args[1] = { ...input, path: join(options.productRoot, "compatibility/v010/bundled", path) };
            }
          }
          if (selected() && name === "bash") {
            const input = args[1] as { command: string };
            let command = input.command;
            for (const directory of ["bundled", "toolkit"]) {
              const from = resolve(options.productRoot, directory);
              const to = resolve(options.productRoot, "compatibility/v010", directory);
              command = command.replaceAll(from, to).replaceAll(from.replaceAll("\\", "/"), to.replaceAll("\\", "/"));
            }
            args[1] = { ...input, command };
          }
          return current.execute(...args);
          });
          executionTail = run.catch(() => undefined);
          return run;
        },
      };
      registered.push(routed);
      pi.registerTool(routed);
    }
    for (const name of new Set(variants.flatMap(v => [...v.events.keys()]))) {
      const on = pi.on as unknown as (name: string, handler: Handler) => void;
      on(name, (...args) => {
        refreshSelection();
        const event = args[0] as { text?: string; source?: string };
        // Keep the existing two mode questions and explicit mode switching.
        const choice = name === "input" && event.source !== "extension"
          && /^(?:(?:选择|使用|切换到|切换为|切换)\s*)?(?:全自动(?:模式)?|半自动(?:模式)?|严格清单门禁型|严格清单|严谨|清爽快速运行型|清爽快速|快速)[。！!]*$/.test(event.text?.trim() ?? "");
        const handlers = variants[choice ? 0 : selected()].events.get(name) ?? [];
        if (name === "input" || name === "before_agent_start" || name === "turn_end") return (async () => {
          await alignPolicyDefinition(options.cwd);
          if (name === "before_agent_start" && selected()) bindPlotRuntime(options.cwd, options.productRoot);
          let result: unknown;
          for (const handler of handlers) result = (await handler(...args)) ?? result;
          if (choice) await alignPolicyDefinition(options.cwd);
          refreshSelection();
          return result;
        })();
        if (handlers.length === 1) return handlers[0](...args);
        return handlers.reduce<Promise<unknown>>(async (previous, handler) => {
          const result = await previous;
          return (await handler(...args)) ?? result;
        }, Promise.resolve(undefined));
      });
    }
  };
}

export function hajimiCoreInlineExtension(options: lean.HajimiCoreOptions): InlineExtension {
  return { name: "hajimi-core", factory: createHajimiCoreFactory(options) };
}
