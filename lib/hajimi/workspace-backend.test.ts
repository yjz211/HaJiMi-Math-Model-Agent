import assert from "node:assert/strict";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { windowsPathToWsl, WslWorkspaceBackend } from "./workspace-backend.ts";

test("windowsPathToWsl maps drive paths to /mnt", () => {
  assert.equal(windowsPathToWsl("C:\\Users\\Example\\Task"), "/mnt/c/Users/Example/Task");
});

test("WSL backend rejects a junction that redirects outside the task root", { skip: process.platform !== "win32" }, async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-link-root-"));
  const outside = mkdtempSync(join(tmpdir(), "hajimi-link-outside-"));
  try {
    writeFileSync(join(outside, "canary.txt"), "host canary", "utf8");
    const link = join(cwd, "work-link");
    try {
      symlinkSync(outside, link, "junction");
    } catch (error) {
      t.skip(`junction creation unavailable: ${(error as Error).message}`);
      return;
    }
    const backend = new WslWorkspaceBackend(cwd);
    await assert.rejects(
      backend.readFile(join(link, "canary.txt")),
      /Symbolic links and junctions are not allowed/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("WSL backend routes file, search, and shell operations into the task root", { skip: process.platform !== "win32" }, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-wsl-"));
  try {
    const backend = new WslWorkspaceBackend(cwd);
    await backend.mkdir(join(cwd, "work"));
    await backend.writeFile(join(cwd, "work", "sample.txt"), "alpha\nbeta\n");
    assert.equal((await backend.readFile(join(cwd, "work", "sample.txt"))).toString("utf8"), "alpha\nbeta\n");
    assert.deepEqual(await backend.list(join(cwd, "work")), ["sample.txt"]);
    assert.deepEqual(await backend.find(cwd, "*.txt"), ["work/sample.txt"]);
    assert.match(await backend.grep({ hostPath: cwd, pattern: "beta" }), /work\/sample\.txt:2: beta/);

    const streamed: Buffer[] = [];
    const execution = await backend.runShell("python3 -c 'print(6 * 7)'", {
      cwd,
      onData: (chunk) => streamed.push(chunk),
    });
    assert.equal(execution.exitCode, 0, Buffer.concat(streamed).toString("utf8"));
    assert.match(Buffer.concat(streamed).toString("utf8"), /42/);
    await assert.rejects(() => backend.readFile(join(cwd, "..", "outside.txt")), /escapes/);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("WSL backend exposes configured first-party guidance as read-only", { skip: process.platform !== "win32" }, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-guidance-root-"));
  const guidance = mkdtempSync(join(tmpdir(), "hajimi-guidance-source-"));
  try {
    const guide = join(guidance, "SKILL.md");
    writeFileSync(guide, "trusted guidance", "utf8");
    const backend = new WslWorkspaceBackend(cwd, { readonlyRoots: [guidance] });
    assert.equal((await backend.readFile(guide)).toString("utf8"), "trusted guidance");
    await assert.rejects(
      backend.writeFile(guide, "tampered"),
      /escapes the HaJiMi task workspace/,
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(guidance, { recursive: true, force: true });
  }
});

test("WSL shell exposes the packaged capability root without depending on global Codex skills", { skip: process.platform !== "win32" }, async () => {
  const cwd = mkdtempSync(join(tmpdir(), "hajimi-capability-env-"));
  const capabilities = mkdtempSync(join(tmpdir(), "hajimi-capabilities-"));
  try {
    const backend = new WslWorkspaceBackend(cwd, { capabilitiesRoot: capabilities, readonlyRoots: [capabilities] });
    const result = await backend.runShell("printf '%s' \"$HAJIMI_CAPABILITIES_ROOT\"", { cwd });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.toString("utf8"), windowsPathToWsl(capabilities));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(capabilities, { recursive: true, force: true });
  }
});
