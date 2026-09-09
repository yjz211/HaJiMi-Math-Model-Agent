import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const baseline = JSON.parse(await readFile(join(root, 'docs/v012-baseline.json'), 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const stageBefore = JSON.parse(await readFile(join(root, 'docs/v012-plot-stage-before.json'), 'utf8'));
// Undo only the explicitly authorized scheduling edits before comparing the
// original snapshots. Every other byte in each touched file is still checked.
async function beforeStageMove(path) {
  const bytes = await readFile(join(root, path));
  if (!(path in stageBefore)) return bytes;
  let text = bytes.toString('utf8');
  if (/core-extension(?:-v011)?\.ts$/.test(path)) text = text
    .replace('if (stage === 8) allowed.add("hajimi_validate_figure_plan");', 'if (stage === 7 || stage === 8) allowed.add("hajimi_validate_figure_plan");')
    .replace('if ((await ensureHajimiTask(cwd)).state.focus.stage !== 8) throw new Error("Figure planning starts at stage 8."); ', '');
  if (path.endsWith('capability-router.ts')) text = text.replace('capability.manifest.allowedStages.includes(stage)\n    && (capability.manifest.id !== "modeling-plot-suite" || stage >= 8)', 'capability.manifest.allowedStages.includes(stage)');
  if (path.endsWith('completion-checks.ts')) text = text.replace('if (stage === 8) {', 'if (stage === 7 || stage === 8) {');
  if (path.endsWith('context-projector.ts')) text = text.replace('Stage 8 completes FIGURE_PLAN.json', 'Stage 7 completes FIGURE_PLAN.json');
  if (path.endsWith('stage-cards/7.md')) text = path.startsWith('compatibility/')
    ? text.replace('进入第8阶段后读取 modeling-plot-suite', '读取 modeling-plot-suite')
    : text.replace('整理已选模型、代码、计算结果', '整理已选模型、代码、计算结果与图表计划');
  assert.equal(text, stageBefore[path], `Unexpected change beyond stage scheduling: ${path}`);
  return Buffer.from(text);
}
for (const path of Object.keys(stageBefore)) await beforeStageMove(path);
let sourceFiles = 0, originalResources = 0, leanResources = 0;
for (const [path, hash] of Object.entries(baseline.v010Files)) {
  if (path.startsWith('lib/') && /\.test\./.test(path)) continue;
  const bytes = await beforeStageMove('compatibility/v010/' + path);
  if (!['lib/hajimi/core-extension.ts', 'lib/hajimi/stage8-phases.ts'].includes(path)) {
    assert.equal(digest(bytes), hash, `0.10 content changed: ${path}`);
  }
  if (path.startsWith('lib/')) sourceFiles++; else originalResources++;
}
// Reverse only the two availability conditions: the rest, including every
// tool description and prompt literal, must hash to the untouched baseline.
const core = (await beforeStageMove('compatibility/v010/lib/hajimi/core-extension.ts')).toString('utf8');
const restored = core.replace('stage >= 3 && stage <= 8', 'stage >= 3 && stage <= 7')
  .replace('if (stage === 7 || stage === 8) allowed.add("hajimi_freeze_evidence");', 'if (stage === 7) allowed.add("hajimi_freeze_evidence");');
const coreHash = baseline.v010Files['lib/hajimi/core-extension.ts'];
assert.ok([restored, restored.replace(/\r?\n/g, '\r\n')].some(text => digest(text) === coreHash), '0.10 core changed beyond repair-tool availability');
assert.deepEqual(await readFile(join(root, 'lib/hajimi/stage8-phases.ts')),
  await readFile(join(root, 'compatibility/v010/lib/hajimi/stage8-phases.ts')), 'Stage8 implementations differ');
assert.deepEqual(await beforeStageMove('lib/hajimi/core-extension-v011.ts'),
  await readFile(join(baseline.v011, 'lib/hajimi/core-extension.ts')), '0.11 original runtime changed');
async function files(directory, prefix = '') {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '__pycache__' || entry.name === '.pytest_cache') continue;
    const path = prefix + entry.name;
    if (entry.isDirectory()) result.push(...await files(join(directory, entry.name), path + '/'));
    else result.push(path);
  }
  return result.sort();
}
for (const directory of ['bundled', 'toolkit']) {
  const paths = await files(join(root, directory));
  assert.deepEqual(paths, await files(join(baseline.v011, directory)), `0.11 file inventory changed: ${directory}`);
  for (const path of paths) {
    assert.deepEqual(await beforeStageMove(`${directory}/${path}`), await readFile(join(baseline.v011, directory, path)), `0.11 resource changed: ${directory}/${path}`);
    leanResources++;
  }
}
const report = { passed: true, sourceFiles, originalResources, leanResources,
  stage8Shared: true, originalCorePromptsUnchanged: true, leanRuntimeUnchangedExceptStageScheduling: true,
  stageSchedulingOnly: true,
  verifiedAt: new Date().toISOString() };
await writeFile(join(root, 'docs/v012-preservation-result.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
