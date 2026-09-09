import { join } from "node:path";
import type { DefaultResourceLoader, InlineExtension } from "@earendil-works/pi-coding-agent";

type HajimiResourceLoaderOptions = ConstructorParameters<typeof DefaultResourceLoader>[0];

export function hajimiResourceLoaderOptions(input: {
  cwd: string;
  agentDir: string;
  productRoot: string;
  extensionFactories: InlineExtension[];
}): HajimiResourceLoaderOptions {
  return {
    cwd: input.cwd,
    agentDir: input.agentDir,
    noExtensions: true,
    noSkills: true,
    noContextFiles: true,
    additionalSkillPaths: [
      join(input.productRoot, "bundled", "skills", "modeling-workflow-core"),
      join(input.productRoot, "bundled", "capabilities", "modeling-paper-standard", "1.0.0", "resources"),
      join(input.productRoot, "bundled", "capabilities", "modeling-plot-suite", "1.0.0", "resources"),
      join(input.productRoot, "bundled", "capabilities", "modeling-submission-package", "1.0.0", "resources"),
    ],
    extensionFactories: input.extensionFactories,
  };
}
