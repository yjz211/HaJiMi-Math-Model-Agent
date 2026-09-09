import { join } from "node:path";
import type { DefaultResourceLoader, InlineExtension } from "@earendil-works/pi-coding-agent";
import { originalWorkflowForTask } from "./core-extension.ts";

type HajimiResourceLoaderOptions = ConstructorParameters<typeof DefaultResourceLoader>[0];

export function hajimiResourceLoaderOptions(input: {
  cwd: string;
  agentDir: string;
  productRoot: string;
  extensionFactories: InlineExtension[];
}): HajimiResourceLoaderOptions {
  const productRoot = originalWorkflowForTask(input.cwd) ? join(input.productRoot, "compatibility/v010") : input.productRoot;
  return {
    cwd: input.cwd,
    agentDir: input.agentDir,
    noExtensions: true,
    noSkills: true,
    noContextFiles: true,
    additionalSkillPaths: [
      join(productRoot, "bundled", "skills", "modeling-workflow-core"),
      join(productRoot, "bundled", "capabilities", "modeling-paper-standard", "1.0.0", "resources"),
      join(productRoot, "bundled", "capabilities", "modeling-plot-suite", "1.0.0", "resources"),
      join(productRoot, "bundled", "capabilities", "modeling-submission-package", "1.0.0", "resources"),
    ],
    extensionFactories: input.extensionFactories,
  };
}
