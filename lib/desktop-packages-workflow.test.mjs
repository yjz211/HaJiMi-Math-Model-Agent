import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(
  join(root, ".github/workflows/desktop-packages.yml"),
  "utf8",
).replace(/\r\n/g, "\n");

test("desktop package workflow releases Windows and retains manual cross-platform builds", () => {
  assert.match(workflow, /^name: Desktop packages/m);
  assert.match(workflow, /tags:\n\s+- "v\*"/);
  assert.match(workflow, /workflow_dispatch:/);
  const matrix = workflow.match(/fromJSON\(github.event_name == 'push' && '([^']+)' \|\| '([^']+)'\)/);
  assert.ok(matrix);
  assert.deepEqual(JSON.parse(matrix[1]), [{ pack_id: "windows", runner: "windows-latest", dist_script: "dist" }]);
  assert.deepEqual(JSON.parse(matrix[2]).map(item => item.pack_id), ["windows", "linux", "macos"]);
  assert.match(workflow, /npm run \$\{\{ matrix\.dist_script \}\}/);
  assert.doesNotMatch(workflow, /npm run release/);
  assert.match(workflow, /CSC_IDENTITY_AUTO_DISCOVERY: "false"/);
  assert.match(workflow, /sudo apt-get install -y fakeroot dpkg/);
});

test("desktop package workflow uploads GitHub Release assets only on tags", () => {
  assert.match(workflow, /if: startsWith\(github\.ref, 'refs\/tags\/v'\)/);
  assert.match(workflow, /gh release upload/);
  assert.match(workflow, /pattern: desktop-windows/);
  assert.match(workflow, /expected 3 Windows release assets/);
  assert.match(workflow, /permissions:\n\s+contents: write/);
  assert.match(workflow, /latest-linux\.yml/);
  assert.match(workflow, /latest-mac\.yml/);
  assert.match(workflow, /mac-universal\.dmg/);
  assert.doesNotMatch(workflow, /electron-builder --publish always/);
});
