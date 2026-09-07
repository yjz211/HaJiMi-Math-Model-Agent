import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptsDir, "..");
const releaseDir = resolve(projectRoot, process.argv[2] ?? "release");

function hasStandaloneServer(path) {
  return existsSync(join(path, "server.js"));
}

function findPackagedOutput() {
  if (!existsSync(releaseDir)) return null;

  if (process.platform === "win32") {
    const outputDir = join(releaseDir, "win-unpacked");
    const standaloneDir = join(outputDir, "resources", "standalone");
    const productRoot = join(outputDir, "resources", "hajimi");
    const runtimeExecutable = join(outputDir, "HaJiMi.exe");
    return hasStandaloneServer(standaloneDir) && existsSync(runtimeExecutable)
      ? { standaloneDir, runtimeExecutable, productRoot }
      : null;
  }

  if (process.platform === "linux") {
    const outputDir = join(releaseDir, "linux-unpacked");
    const standaloneDir = join(outputDir, "resources", "standalone");
    const productRoot = join(outputDir, "resources", "hajimi");
    const runtimeExecutable = ["hajimi", "HaJiMi"]
      .map((name) => join(outputDir, name))
      .find((path) => existsSync(path));
    return hasStandaloneServer(standaloneDir) && runtimeExecutable
      ? { standaloneDir, runtimeExecutable, productRoot }
      : null;
  }

  if (process.platform === "darwin") {
    const macOutputs = readdirSync(releaseDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^mac(?:-(?:arm64|x64|universal))?$/.test(entry.name));
    for (const output of macOutputs) {
      const macDir = join(releaseDir, output.name);
      for (const entry of readdirSync(macDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.endsWith(".app")) continue;
        const appDir = join(macDir, entry.name, "Contents");
        const standaloneDir = join(appDir, "Resources", "standalone");
        const productRoot = join(appDir, "Resources", "hajimi");
        const runtimeExecutable = join(appDir, "MacOS", entry.name.slice(0, -4));
        if (hasStandaloneServer(standaloneDir) && existsSync(runtimeExecutable)) {
          return { standaloneDir, runtimeExecutable, productRoot };
        }
      }
    }
  }

  return null;
}

const packagedOutput = findPackagedOutput();
if (!packagedOutput) {
  console.error(`smoke-packaged-standalone: packaged output not found under ${releaseDir}`);
  process.exit(1);
}

const parity = spawnSync(
  process.execPath,
  [join(scriptsDir, "check-hajimi-resource-parity.mjs"), projectRoot, packagedOutput.productRoot],
  { cwd: projectRoot, stdio: "inherit", windowsHide: true },
);
if (parity.error || parity.status !== 0) {
  console.error(`smoke-packaged-standalone: resource parity failed${parity.error ? `: ${parity.error.message}` : ""}`);
  process.exit(1);
}

const result = spawnSync(
  process.execPath,
  [
    join(scriptsDir, "smoke-standalone-server.mjs"),
    packagedOutput.standaloneDir,
    packagedOutput.runtimeExecutable,
    packagedOutput.productRoot,
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
    windowsHide: true,
  }
);

if (result.error) {
  console.error(`smoke-packaged-standalone: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
