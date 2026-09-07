import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const projectRoot = resolve(import.meta.dirname, "..");
const checker = join(projectRoot, "scripts", "check-hajimi-resource-parity.mjs");
const trees = [
  "bundled/workflows/modeling-core/1.0.0",
  "bundled/capabilities/modeling-paper-standard/1.0.0",
  "bundled/capabilities/modeling-plot-suite/1.0.0",
  "bundled/capabilities/modeling-submission-package/1.0.0",
];

test("resource parity checker covers workflow stage cards and routed capability snapshots", () => {
  const root = mkdtempSync(join(tmpdir(), "hajimi-resource-parity-"));
  const expected = join(root, "expected");
  const actual = join(root, "actual");
  try {
    for (const tree of trees) {
      cpSync(join(projectRoot, ...tree.split("/")), join(expected, ...tree.split("/")), { recursive: true });
      cpSync(join(projectRoot, ...tree.split("/")), join(actual, ...tree.split("/")), { recursive: true });
    }
    const matching = spawnSync(process.execPath, [checker, expected, actual], { encoding: "utf8" });
    assert.equal(matching.status, 0, matching.stderr);
    assert.match(matching.stdout, /route hash [a-f0-9]{64}/);

    appendFileSync(join(actual, "bundled", "workflows", "modeling-core", "1.0.0", "stage-cards", "8.md"), "drift\n");
    const drifted = spawnSync(process.execPath, [checker, expected, actual], { encoding: "utf8" });
    assert.equal(drifted.status, 1);
    assert.match(drifted.stderr, /stage-cards\/8\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
