import { readdir, realpath, readFile, stat, rm } from 'node:fs/promises';
import { join, relative, isAbsolute, basename } from 'node:path';

// Only trim the assembled Windows x64 app; never change development dependencies.
export default async function prunePackagedEsbuild(context) {
  if (context.electronPlatformName !== 'win32' || context.arch !== 1) return; // electron-builder Arch.x64 = 1
  const root = await realpath(join(context.appOutDir, 'resources', 'standalone'));
  const scopes = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name);
      if (entry.name === '@esbuild' && basename(directory) === 'node_modules') scopes.push(path);
      else await walk(path);
    }
  }
  await walk(root);
  const removals = [];
  for (const scope of scopes) {
    if (!(await stat(join(scope, 'win32-x64', 'esbuild.exe'))).isFile()) throw new Error(`Missing Windows x64 esbuild: ${scope}`);
    for (const entry of await readdir(scope, { withFileTypes: true })) {
      if (entry.name === 'win32-x64') continue;
      const target = await realpath(join(scope, entry.name));
      const rel = relative(root, target);
      if (!entry.isDirectory() || !rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Unsafe esbuild package: ${target}`);
      const manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
      if (manifest.name !== `@esbuild/${entry.name}`) throw new Error(`Unexpected esbuild package: ${target}`);
      removals.push(target);
    }
  }
  for (const target of removals) await rm(target, { recursive: true });
  console.log(`Packaged esbuild: kept Windows x64 in ${scopes.length} locations; removed ${removals.length} other-platform packages.`);
}
