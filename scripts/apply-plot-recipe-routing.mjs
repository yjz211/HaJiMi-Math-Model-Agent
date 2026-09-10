import { applyPlotFidelityHint } from './plot-fidelity-prompt.mjs';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = join(dirname(fileURLToPath(import.meta.url)), 'plot-recipe-routing');

export function applyReplacements(text, changes, label) {
  for (const { before, after } of changes) {
    const count = text.split(before).length - 1;
    if (count >= 1) text = text.replaceAll(before, after);
    else if (count === 0 && text.includes(after)) continue;
    else throw new Error(`Recipe reference source drift: ${label}: ${before.slice(0, 90)}`);
  }
  return text;
}

export async function applyPlotRecipeRouting(root) {
  await applyPlotFidelityHint(root);
  const migration = JSON.parse(await readFile(join(source, 'reference_migrations.json'), 'utf8'));
  const inherited = JSON.parse(await readFile(join(source, 'v012-inherited-paper-patches.json'), 'utf8'));
  const paper = join(root, 'resources/references/paper-figure.md');
  await writeFile(paper, applyReplacements(await readFile(paper, 'utf8'), inherited, paper));
  for (const path of new Set(migration.changes.map(item => item.path))) {
    const target = join(root, path);
    await writeFile(target, applyReplacements(await readFile(target, 'utf8'), migration.changes.filter(item => item.path === path), path));
  }
  for (const name of ['get_recipe.py', 'recipe_registry.json']) {
    await copyFile(join(source, name), join(root, 'resources/assets/shared-scripts', name));
  }
  // Refresh only identified 0.1.2 routing assets in existing workspaces.
  // No recipe body, user-edited helper, style, or rendering utility is overwritten.
  const baseline = JSON.parse(await readFile(join(source, '../../docs/v013-plot-baseline.json'), 'utf8'));
  const refresh = Object.keys(baseline.files).filter(path => path === 'resources/assets/shared-scripts/get_recipe.py'
    || migration.changes.some(item => item.path === path) && path.startsWith('resources/assets/shared-scripts/'));
  const hashes = Object.fromEntries(refresh.map(path => [path.split('/').at(-1), baseline.files[path]]));
  const bootstrap = join(root, 'resources/scripts/bootstrap.py');
  const marker = '    profile = detect_profile(workspace) if args.profile == "auto" else args.profile';
  const addition = `    # 0.1.3: refresh recognized routing files only; preserve all user modifications.\n    routing_baseline = ${JSON.stringify(hashes)}\n    for folder in (workspace / "_utils", workspace / "skills/shared-scripts"):\n        for filename, expected in routing_baseline.items():\n            existing = folder / filename\n            if existing.is_file() and sha256(existing) == expected:\n                shutil.copy2(assets / "shared-scripts" / filename, existing)\n`;
  let text = await readFile(bootstrap, 'utf8');
  if (!text.includes('routing_baseline =')) text = text.replace(marker, addition.replaceAll('\n', text.includes('\r\n') ? '\r\n' : '\n') + marker);
  await writeFile(bootstrap, text);
}
