import { lstat, realpath, writeFile, access, readFile, rename } from "node:fs/promises";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";
import { readHajimiTask } from "./task-state.ts";
import { withTaskLock } from "./workflow-store.ts";

export async function importProblemFiles(cwd: string, files: Array<{ name: string; data: Uint8Array }>) {
  return withTaskLock(cwd, async () => {
    const task = await readHajimiTask(cwd);
    if (!task) throw new Error("请先新建数模题目。");
    if (!files.length || files.length > 20 || files.some(f => !f.data.byteLength) || files.reduce((n, f) => n + f.data.byteLength, 0) > 50 * 1024 * 1024) {
      throw new Error("每批请上传 1—20 个非空文件，总大小不超过 50 MB。");
    }
    const root = await realpath(cwd);
    const input = join(root, "input");
    const info = await lstat(input);
    if (!info.isDirectory() || info.isSymbolicLink() || await realpath(input) !== input) throw new Error("Invalid input directory");
    let frozen = false;
    try { await access(join(root, ".hajimi", "input-manifest.json")); frozen = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (frozen && task.state.focus.stage === 0 && task.state.provenance.experiments.length === 0) {
      const manifestPath = join(root, ".hajimi", "input-manifest.json");
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (Array.isArray(manifest.files) && manifest.files.length === 0) {
        // Earlier releases froze an empty directory at session start. Keep that
        // manifest as a backup while allowing the first actual problem import.
        await rename(manifestPath, join(root, ".hajimi", `input-manifest.empty-legacy-${randomUUID()}.json`));
        frozen = false;
      }
    }
    // Additional material for an already frozen task belongs to a new input revision;
    // never silently mutate the immutable input set.
    if (frozen || task.state.focus.stage !== 0) throw new Error("题目材料已冻结。请先让助手处理材料变更，或新建数模题目上传新材料。");
    const imported: string[] = [];
    for (const file of files) {
      let name = basename(file.name.replaceAll("\\", "/")).replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").replace(/[. ]+$/g, "").slice(-160);
      if (!name || /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(name)) name = `file-${randomUUID()}`;
      let path = join(input, name);
      try { await writeFile(path, file.data, { flag: "wx" }); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        name = `${randomUUID().slice(0, 8)}-${name}`;
        path = join(input, name);
        await writeFile(path, file.data, { flag: "wx" });
      }
      imported.push(`input/${name}`);
    }
    return imported;
  });
}
