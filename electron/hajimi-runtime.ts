import path from "path";
import { createHash } from "node:crypto";

export interface HajimiRuntimePathsInput {
  appPath: string;
  userDataPath: string;
  resourcesPath: string;
  isPackaged: boolean;
  env?: Record<string, string | undefined>;
}

export interface HajimiRuntimePaths {
  agentDir: string;
  productRoot: string;
  runtimeHome: string;
}

export function resolveHajimiRuntimePaths(input: HajimiRuntimePathsInput): HajimiRuntimePaths {
  const configuredAgentDir = input.env?.HAJIMI_AGENT_DIR?.trim();
  const configuredRuntimeHome = input.env?.HAJIMI_RUNTIME_HOME?.trim();
  if (configuredRuntimeHome && (!/^[a-z]:[\\/]/i.test(configuredRuntimeHome) || /[^\x20-\x7e]/.test(configuredRuntimeHome))) {
    throw new Error("HAJIMI_RUNTIME_HOME must be an absolute ASCII local-drive path");
  }
  const profileId = createHash("sha256").update(input.userDataPath.toLowerCase()).digest("hex").slice(0, 20);
  return {
    agentDir: configuredAgentDir || path.join(input.userDataPath, "agent"),
    runtimeHome: configuredRuntimeHome
      ? path.win32.normalize(configuredRuntimeHome)
      : path.win32.join(input.env?.ProgramData ?? "C:\\ProgramData", "HaJiMi", "runtime-users", profileId),
    productRoot: input.isPackaged
      ? path.join(input.resourcesPath, "hajimi")
      : input.appPath,
  };
}
