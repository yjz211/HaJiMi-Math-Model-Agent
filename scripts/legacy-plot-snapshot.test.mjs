import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import test from 'node:test';
import { patchLegacyPlotHelper, patchLegacyPlotBootstrap, originalSizePreflight, ORIGINAL_HELPER_SHA256 } from './patch-hajimi-legacy-plot.mjs';

test('legacy resources stay byte-exact except the explicit palette and bootstrap fixes', async () => {
  const original = 'toolkit/legacy-modeling-plot-suite';
  const shipped = 'bundled/capabilities/modeling-plot-suite/1.0.0/resources';
  async function files(root, dir = root) {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) result.push(...await files(root, path));
      else result.push(relative(root, path));
    }
    return result.sort();
  }
  const expected = await files(original);
  assert.deepEqual(await files(shipped), expected);
  for (const path of expected) {
    const source = await readFile(join(original, path));
    const normalized = path.replaceAll('\\', '/');
    const expectedBytes = normalized === 'assets/shared-scripts/plot_utils.py' ? Buffer.from(patchLegacyPlotHelper(source.toString('utf8')))
      : normalized === 'scripts/bootstrap.py' ? Buffer.from(patchLegacyPlotBootstrap(source.toString('utf8'))) : source;
    assert.deepEqual(await readFile(join(shipped, path)), expectedBytes, path);
  }
  const helper = await readFile(join(original, 'assets/shared-scripts/plot_utils.py'));
  assert.equal(createHash('sha256').update(helper).digest('hex'), ORIGINAL_HELPER_SHA256);
  const guide = await readFile(join(original, 'assets/shared-scripts/figure_style_guide.md'), 'utf8');
  assert.equal(await readFile('bundled/capabilities/modeling-plot-suite/1.0.0/fragments/original-size-preflight.md', 'utf8'), originalSizePreflight(guide));
  const workflow = await readFile(join(shipped, 'references/paper-figure.md'), 'utf8');
  assert.match(workflow, /Read the full style guide/);
  assert.match(workflow, /RECIPES_FOR_THIS_PAPER\.md/);
  assert.match(workflow, /INFO\/WARNING don't block/);
  const manifest = JSON.parse(await readFile('bundled/capabilities/modeling-plot-suite/1.0.0/manifest.json', 'utf8'));
  assert.equal(manifest.source.logicalPath, original);
});
