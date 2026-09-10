import { undoReviewGuidance } from './plot-review-guidance.mjs';
import { undoLayoutPreservation } from './plot-layout-preservation.mjs';
import { FIDELITY_HINT, undoFontGuidance, FONT_GUIDANCE } from './plot-fidelity-prompt.mjs';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');

export async function checkPlotRecipeRouting(root = process.cwd()) {
  const cap = join(root, 'bundled/capabilities/modeling-plot-suite/1.0.0');
  const shared = join(cap, 'resources/assets/shared-scripts');
  const routing = join(root, 'scripts/plot-recipe-routing');
  const registry = JSON.parse(await readFile(join(shared, 'recipe_registry.json'), 'utf8'));
  const migration = JSON.parse(await readFile(join(routing, 'reference_migrations.json'), 'utf8'));
  const baseline = JSON.parse(await readFile(join(root, 'docs/v013-plot-baseline.json'), 'utf8'));
  const ids = new Set(), aliases = new Set(), targets = new Set();
  for (const item of registry.recipes) {
    if (ids.has(item.id) || aliases.has(item.legacy) || targets.has(item.file + item.title)) throw new Error('Duplicate recipe identity');
    ids.add(item.id); aliases.add(item.legacy); targets.add(item.file + item.title);
    const text = (await readFile(join(shared, item.file), 'utf8')).replaceAll('\r\n', '\n');
    const headers = [...text.matchAll(/^## (\d+)\.\s+([^\n]+)$/gm)];
    const matches = headers.map((h, i) => ({ title: h[2], body: text.slice(h.index, headers[i + 1]?.index ?? text.length).trim() })).filter(h => h.title === item.title);
    if (matches.length !== 1 || hash(matches[0].body.replace(/^## \d+\.\s+/, '')) !== item.contentSha256) throw new Error(`Recipe body drift: ${item.id}`);
  }
  let count = 0;
  for (const file of new Set(registry.recipes.map(item => item.file))) {
    count += [...(await readFile(join(shared, file), 'utf8')).matchAll(/^## \d+\./gm)].length;
  }
  if (count !== ids.size || count !== 108) throw new Error('Recipe inventory changed');
  for (const name of ['get_recipe.py', 'recipe_registry.json']) {
    if (hash(await readFile(join(routing, name))) !== hash(await readFile(join(shared, name)))) throw new Error(`Routing asset not synced: ${name}`);
  }
  const changed = new Set(migration.changes.map(item => item.path));
  const infrastructure = new Set(['manifest.json', 'resources/scripts/bootstrap.py', 'resources/assets/shared-scripts/get_recipe.py']);
  for (const [path, expected] of Object.entries(baseline.files)) {
    if (infrastructure.has(path)) continue;
    let bytes = await readFile(join(cap, path));
    if (path.endsWith('.md')) bytes = Buffer.from(undoReviewGuidance(bytes.toString('utf8'), path));
    if (path === 'resources/assets/shared-scripts/plot_utils.py') bytes = Buffer.from(undoLayoutPreservation(bytes.toString('utf8')));
    if (FONT_GUIDANCE.some(patch => patch.path === path)) bytes = Buffer.from(undoFontGuidance(bytes.toString('utf8'), path));
    if (path === 'resources/workflows/paper-figure.md') {
      if (bytes.toString().split(FIDELITY_HINT).length !== 2) throw new Error('Missing or duplicated fidelity hint');
      bytes = Buffer.from(bytes.toString().replace(FIDELITY_HINT, ''));
    }
    if (changed.has(path)) {
      let text = bytes.toString('utf8');
      for (const change of migration.changes.filter(item => item.path === path).reverse()) {
        if (text.includes(change.after)) text = text.replaceAll(change.after, change.before);
        else if (!text.includes(change.before)) throw new Error(`Unrecognized prompt edit: ${path}`);
      }
      bytes = Buffer.from(text);
    }
    if (hash(bytes) !== expected) throw new Error(`Non-reference content changed: ${path}`);
  }
  async function checkReferences(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await checkReferences(path);
      else if (entry.name.endsWith('.md') && !entry.name.startsWith('figure_recipes_')) {
        const text = await readFile(path, 'utf8');
        for (const match of text.matchAll(/\brecipe:([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)\b/g)) {
          if (!ids.has(match[1])) throw new Error(`Unknown recipe reference ${match[1]} in ${path}`);
        }
        if (/\b(basic|advanced|academic|empirical|competition|comp)\s*#\s*\d+/.test(text)) throw new Error(`Unmigrated recipe reference: ${path}`);
      }
    }
  }
  await checkReferences(cap);
  return `${ids.size} recipes intact; references valid; all other prompt bytes match 0.1.2 after reversing authorized guidance changes`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await checkPlotRecipeRouting());
}
