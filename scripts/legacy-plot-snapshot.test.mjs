import { undoReviewGuidance } from './plot-review-guidance.mjs';
import { undoLayoutPreservation } from './plot-layout-preservation.mjs';
import { FIDELITY_HINT, undoFontGuidance, FONT_GUIDANCE } from './plot-fidelity-prompt.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('compatibility resources preserve the frozen baseline except explicit recipe routing migrations', async () => {
  const baseline = JSON.parse(await readFile('docs/v012-baseline.json', 'utf8'));
  const removal = JSON.parse(await readFile('docs/v012-scienceplots-removal.json', 'utf8')).changes;
  const prefix = 'bundled/capabilities/modeling-plot-suite/1.0.0/';
  const expected = Object.keys(baseline.v010Files).filter(path => path.startsWith(prefix)).sort();
  assert.ok(expected.length > 100);
  async function files(directory, relative = prefix) {
    const result = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === '__pycache__') continue;
      const path = relative + entry.name;
      if (entry.isDirectory()) result.push(...await files(join(directory, entry.name), path + '/'));
      else result.push(path);
    }
    return result.sort();
  }
  const migration = JSON.parse(await readFile('scripts/plot-recipe-routing/reference_migrations.json', 'utf8'));
  const registryPath = prefix + 'resources/assets/shared-scripts/recipe_registry.json';
  assert.deepEqual(await files('compatibility/v010/' + prefix), [...expected, registryPath].sort());
  for (const path of expected) {
    let bytes = await readFile('compatibility/v010/' + path);
    if (path.endsWith('.md')) bytes = Buffer.from(undoReviewGuidance(bytes.toString('utf8'), path.slice(prefix.length), true));
    if (path.slice(prefix.length) === 'resources/assets/shared-scripts/plot_utils.py') bytes = Buffer.from(undoLayoutPreservation(bytes.toString('utf8')));
    if (FONT_GUIDANCE.some(patch => patch.path === path.slice(prefix.length))) bytes = Buffer.from(undoFontGuidance(bytes.toString('utf8'), path.slice(prefix.length)));
    if (path === prefix + 'manifest.json') {
      for (const entry of JSON.parse(bytes).files) {
        const data = await readFile('compatibility/v010/' + prefix + entry.path);
        assert.equal(data.length, entry.sizeBytes);
        assert.equal(createHash('sha256').update(data).digest('hex'), entry.sha256);
      }
      continue;
    }
    if (path === prefix + 'resources/assets/shared-scripts/get_recipe.py') {
      assert.deepEqual(bytes, await readFile('scripts/plot-recipe-routing/get_recipe.py'));
      continue;
    }
    if (path.endsWith('/resources/workflows/paper-figure.md')) {
      assert.equal(bytes.toString().split(FIDELITY_HINT).length, 2);
      bytes = Buffer.from(bytes.toString().replace(FIDELITY_HINT, ''));
    }
    const changes = migration.changes.filter(x => prefix + x.path === path);
    if (changes.length) {
      let text = bytes.toString();
      for (const change of changes.reverse()) {
        for (const newline of ['\r\n', '\n']) text = text.replaceAll(change.after.replaceAll('\n', newline), change.before.replaceAll('\n', newline));
      }
      bytes = Buffer.from(text);
    }
    if (path.endsWith('/resources/scripts/bootstrap.py')) bytes = Buffer.from(bytes.toString().replace(/    # 0\.1\.3: refresh recognized routing files only;[\s\S]*?(?=    profile = detect_profile)/, ''));
    if (path.endsWith('/resources/scripts/bootstrap.py')) bytes = Buffer.from(bytes.toString().replace(/    # Refresh recognized pre-preservation helpers;[\s\S]*?(?=    profile = detect_profile)/, ''));
    const change = removal['compatibility/v010/' + path];
    if (change) assert.equal(change.before, baseline.v010Files[path], path + ' original baseline');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), change?.after ?? baseline.v010Files[path], path);
  }
});
