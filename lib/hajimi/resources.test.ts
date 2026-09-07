import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DefaultResourceLoader,
  type InlineExtension,
} from "@earendil-works/pi-coding-agent";
import { hajimiResourceLoaderOptions } from "./resources.ts";

test("resource loader excludes ambient resources and loads only bundled HaJiMi resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "hajimi-resources-"));
  const cwd = join(root, "task");
  const agentDir = join(root, "agent");
  const productRoot = join(root, "product");
  const bundledSkill = join(productRoot, "bundled", "skills", "modeling-workflow-core");
  const ambientSkill = join(agentDir, "skills", "ambient");
  const capabilities = ["modeling-paper-standard", "modeling-plot-suite", "modeling-submission-package"];

  try {
    await Promise.all([
      mkdir(join(cwd, ".pi", "extensions"), { recursive: true }),
      mkdir(ambientSkill, { recursive: true }),
      mkdir(bundledSkill, { recursive: true }),
    ]);
    await writeFile(join(cwd, "AGENTS.md"), "ambient context must not load", "utf8");
    await writeFile(
      join(ambientSkill, "SKILL.md"),
      "---\nname: ambient\ndescription: must not load\n---\nambient\n",
      "utf8",
    );
    await writeFile(
      join(bundledSkill, "SKILL.md"),
      "---\nname: modeling-workflow-core\ndescription: built in\n---\nHaJiMi\n",
      "utf8",
    );
    for (const name of capabilities) {
      const resourceRoot = join(productRoot, "bundled", "capabilities", name, "1.0.0", "resources");
      await mkdir(resourceRoot, { recursive: true });
      await writeFile(join(resourceRoot, "SKILL.md"), `---\nname: ${name}\ndescription: bundled capability\n---\nRead the selected workflow relative to this directory.\n`);
    }

    const extension: InlineExtension = {
      name: "hajimi-core",
      factory: () => undefined,
    };
    const loader = new DefaultResourceLoader(
      hajimiResourceLoaderOptions({
        cwd,
        agentDir,
        productRoot,
        extensionFactories: [extension],
      }),
    );
    await loader.reload();

    assert.deepEqual(loader.getSkills().skills.map((skill) => skill.name).sort(), [
      "modeling-workflow-core",
      ...capabilities,
    ].sort());
    for (const name of capabilities) {
      const skill = loader.getSkills().skills.find((item) => item.name === name);
      assert.equal(skill?.filePath, join(productRoot, "bundled", "capabilities", name, "1.0.0", "resources", "SKILL.md"));
    }
    assert.deepEqual(loader.getExtensions().extensions.map((item) => item.path), [
      "<inline:hajimi-core>",
    ]);
    assert.deepEqual(loader.getAgentsFiles().agentsFiles, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real bundled skill entrypoints are discoverable by the production Pi loader", async () => {
  const root = await mkdtemp(join(tmpdir(), "hajimi-real-skills-"));
  try {
    const loader = new DefaultResourceLoader(hajimiResourceLoaderOptions({
      cwd: root, agentDir: join(root, "agent"), productRoot: process.cwd(), extensionFactories: [],
    }));
    await loader.reload();
    const skills = loader.getSkills().skills;
    assert.deepEqual(skills.map((item) => item.name).sort(), [
      "modeling-paper-standard", "modeling-plot-suite", "modeling-submission-package", "modeling-workflow-core",
    ]);
    for (const skill of skills) {
      assert.ok(skill.description.length > 0);
      assert.ok(skill.filePath.startsWith(join(process.cwd(), "bundled")));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
