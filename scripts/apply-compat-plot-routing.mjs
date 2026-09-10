import { applyPlotFidelityHint } from './plot-fidelity-prompt.mjs';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export async function applyCompatPlotRouting(root = process.cwd()) {
  const cap = join(root, 'compatibility/v010/bundled/capabilities/modeling-plot-suite/1.0.0');
  await applyPlotFidelityHint(cap);
  const source = join(root, 'scripts/plot-recipe-routing');
  const migration = JSON.parse(await readFile(join(source, 'reference_migrations.json'), 'utf8'));
  for (const path of new Set(migration.changes.map(x => x.path))) {
    const target = join(cap, path);
    const original = await readFile(target, 'utf8');
    let patched = original;
    for (const change of migration.changes.filter(x => x.path === path)) {
      for (const newline of ['\r\n', '\n']) {
        const before = change.before.replaceAll('\n', newline);
        const after = change.after.replaceAll('\n', newline);
        patched = patched.replaceAll(before, after);
      }
      if (!patched.replaceAll('\r\n', '\n').includes(change.after)) throw new Error(`Recipe migration drift: ${path}`);
    }
    await writeFile(target, patched);
  }
  for (const name of ['get_recipe.py', 'recipe_registry.json'])
    await copyFile(join(source, name), join(cap, 'resources/assets/shared-scripts', name));
  // Reuse only the recognized-file routing refresh block, not the main prompt or bootstrap.
  const mainBootstrap = await readFile(join(root, 'bundled/capabilities/modeling-plot-suite/1.0.0/resources/scripts/bootstrap.py'), 'utf8');
  const start = mainBootstrap.indexOf('    # 0.1.3: refresh recognized routing files only;');
  const end = mainBootstrap.indexOf('    profile = detect_profile', start);
  if (start < 0 || end < 0) throw new Error('Missing routing refresh block');
  const bootstrap = join(cap, 'resources/scripts/bootstrap.py');
  const original = await readFile(bootstrap, 'utf8');
  if (!original.includes('routing_baseline =')) {
    const block = mainBootstrap.slice(start, end).replaceAll('\r\n', '\n');
    await writeFile(bootstrap, original.replace('    profile = detect_profile', (original.includes('\r\n') ? block.replaceAll('\n', '\r\n') : block) + '    profile = detect_profile'));
  }
  const path = join(cap, 'manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  const added = 'resources/assets/shared-scripts/recipe_registry.json';
  if (!manifest.files.some(x => x.path === added)) manifest.files.push({path: added});
  for (const entry of manifest.files) {
    const bytes = await readFile(join(cap, entry.path));
    entry.sizeBytes = bytes.length;
    entry.sha256 = createHash('sha256').update(bytes).digest('hex');
  }
  await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await applyCompatPlotRouting();
  console.log('Compatibility plotting references and registry synced; recipe bodies untouched.');
}
