import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindPlotRuntime } from "./plot-runtime-binding.ts";

test("resumed workspace replaces stale assets and literal paths, then rebinds after moving product", () => {
  const temp = mkdtempSync(join(tmpdir(), "hajimi-binding-"));
  const cwd = join(temp, "project");
  const old = String.raw`C:\old install\resources\hajimi\bundled\capabilities\modeling-plot-suite\1.0.0\resources`;
  try {
    mkdirSync(join(cwd, "figures"), { recursive: true });
    mkdirSync(join(cwd, "_utils"));
    writeFileSync(join(cwd, "_utils/helper.py"), "stale");
    writeFileSync(join(cwd, "figures/render.py"), `EXPORT=r'${old}\\scripts\\export_drawio.py'`);
    writeFileSync(join(cwd, "figures/result.pdf"), "existing output");
    for (const name of ["first", "moved"]) {
      const product = join(temp, name);
      const skill = join(product, "compatibility/v010/bundled/capabilities/modeling-plot-suite/1.0.0/resources");
      for (const directory of ["shared-scripts", "html-templates", "tools"]) {
        mkdirSync(join(skill, "assets", directory), { recursive: true });
        writeFileSync(join(skill, "assets", directory, "helper.py"), name);
      }
      const rewrite = bindPlotRuntime(cwd, product);
      assert.equal(readFileSync(join(cwd, "_utils/helper.py"), "utf8"), name);
      assert.ok(readFileSync(join(cwd, "figures/render.py"), "utf8").includes(skill));
      assert.equal(rewrite(old), skill);
      assert.equal(rewrite(old.replaceAll("\\", "/")), skill.replaceAll("\\", "/"));
      assert.equal(JSON.parse(readFileSync(join(cwd, ".codex-plot-runtime.json"), "utf8")).workspace, cwd);
      assert.equal(readFileSync(join(cwd, "figures/result.pdf"), "utf8"), "existing output");
      // A subsequent bootstrap or restored workspace cannot retain old bytes.
      writeFileSync(join(cwd, "_utils/helper.py"), "stale again");
      bindPlotRuntime(cwd, product);
      assert.equal(readFileSync(join(cwd, "_utils/helper.py"), "utf8"), name);
    }
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
