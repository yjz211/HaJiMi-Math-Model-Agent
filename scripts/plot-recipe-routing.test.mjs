import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { checkPlotRecipeRouting } from './check-plot-recipe-routing.mjs';

test('all original plotting content is preserved outside explicit reference migrations', async () => {
  assert.match(await checkPlotRecipeRouting(), /108 recipes intact/);
});

test('recipe extraction, legacy compatibility, prefetch and bootstrap regression', () => {
  const result = spawnSync(process.env.HAJIMI_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-B', 'scripts/plot-recipe-routing.test.py'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
});

test('actual compatibility entry extracts all original recipes and supports prefetch', () => {
  const result = spawnSync(process.env.HAJIMI_TEST_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'), ['-B', 'scripts/plot-recipe-routing.test.py'], { encoding: 'utf8', env: {...process.env, HAJIMI_TEST_CAP_PREFIX: 'compatibility/v010'} });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
});

test('production runtime binding deploys the corrected compatibility extractor', async () => {
  const { bindPlotRuntime } = await import('../lib/hajimi/plot-runtime-binding.ts');
  const { figurePlanErrors } = await import('../compatibility/v010/lib/hajimi/figure-plan.ts');
  const { mkdtemp, readFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cwd = await mkdtemp(join(tmpdir(), 'hajimi-routing-'));
  bindPlotRuntime(cwd, process.cwd());
  const registry = JSON.parse(await readFile(join(cwd, '_utils/recipe_registry.json'), 'utf8'));
  assert.equal(registry.recipes.length, 108);
  for (const legacy of ['basic #7', 'empirical #13']) {
    const entry = registry.recipes.find(x => x.legacy === legacy);
    assert.ok(entry);
    const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-X', 'utf8', '-B', join(cwd, '_utils/get_recipe.py'), '--id', entry.id], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(entry.title));
    assert.ok(!figurePlanErrors({questions: [], figures: [{id:'fig_test',recipe:'recipe:' + entry.id}]}).some(x => x.includes('recipe must')));
  }
});
