import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Bind generated helpers to the selected product, including resumed workspaces.
// Vendored prompts and renderers are copied verbatim, never patched.
export function bindPlotRuntime(cwd: string, productRoot: string) {
  const root = resolve(productRoot, "compatibility/v010");
  const skill = join(root, "bundled/capabilities/modeling-plot-suite/1.0.0/resources");
  const metaPath = join(cwd, ".codex-plot-runtime.json");
  const aliasesPath = join(cwd, ".hajimi/plot-runtime-aliases.json");
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
  const aliases: string[] = existsSync(aliasesPath) ? JSON.parse(readFileSync(aliasesPath, "utf8")) : [];
  if (typeof meta.runtime_skill === "string" && meta.runtime_skill !== skill && !aliases.includes(meta.runtime_skill))
    aliases.push(meta.runtime_skill);
  const figures = join(cwd, "figures");
  if (existsSync(figures)) for (const entry of readdirSync(figures, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(py|js|mjs|sh|ps1)$/.test(entry.name)) continue;
    const text = readFileSync(join(figures, entry.name), "utf8");
    for (const match of text.matchAll(/[A-Za-z]:[\\/][^'"\r\n]*?[\\/]bundled[\\/]capabilities[\\/]modeling-plot-suite[\\/]1\.0\.0[\\/]resources/g))
      if (match[0] !== skill && !aliases.includes(match[0])) aliases.push(match[0]);
  }
  const mappings: [string, string][] = aliases.map(old => [old, skill]);
  for (const old of aliases) {
    const split = old.replaceAll("\\", "/").lastIndexOf("/bundled/");
    if (split < 0) continue;
    const oldRoot = old.slice(0, split);
    for (const directory of ["bundled", "toolkit"])
      mappings.push([join(oldRoot, directory), join(root, directory)]);
  }
  for (const directory of ["bundled", "toolkit"])
    mappings.push([resolve(productRoot, directory), join(root, directory)]);
  const rewrite = (text: string) => {
    for (const [from, to] of mappings) {
      text = text.split(from).join(to);
      text = text.split(from.replaceAll("\\", "/")).join(to.replaceAll("\\", "/"));
      text = text.split(from.replaceAll("\\", "\\\\")).join(to.replaceAll("\\", "\\\\"));
    }
    return text;
  };
  const save = (path: string, bytes: Buffer) => {
    if (existsSync(path) && readFileSync(path).equals(bytes)) return;
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, bytes);
  };
  const copy = (source: string, target: string) => {
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      if (entry.name === "__pycache__") continue;
      if (entry.isDirectory()) copy(join(source, entry.name), join(target, entry.name));
      else save(join(target, entry.name), readFileSync(join(source, entry.name)));
    }
  };
  for (const [source, target] of [["shared-scripts", "skills/shared-scripts"], ["shared-scripts", "_utils"],
    ["html-templates", "_templates"], ["tools", "tools"], ["tools", "_utils"]])
    copy(join(skill, "assets", source), join(cwd, target));
  // Existing generated scripts can contain literal paths from the old session.
  if (existsSync(figures)) for (const entry of readdirSync(figures, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(py|js|mjs|sh|ps1)$/.test(entry.name)) continue;
    const path = join(figures, entry.name);
    save(path, Buffer.from(rewrite(readFileSync(path, "utf8"))));
  }
  meta.workspace = resolve(cwd);
  meta.runtime_skill = skill;
  meta.paths = { ...meta.paths, shared_scripts: join(cwd, "skills/shared-scripts"),
    utils: join(cwd, "_utils"), templates: join(cwd, "_templates"), tools: join(cwd, "tools") };
  const drawio = join(root, "runtime/windows/drawio/draw.io.exe");
  if (existsSync(drawio)) meta.paths.drawio = drawio;
  save(metaPath, Buffer.from(JSON.stringify(meta, null, 2) + "\n"));
  save(aliasesPath, Buffer.from(JSON.stringify(aliases, null, 2) + "\n"));
  return rewrite;
}
