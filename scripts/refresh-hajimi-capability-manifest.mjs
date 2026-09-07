import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { join, relative } from 'node:path';

// Refresh only bundled-file inventory; retain the original source fingerprint.
const id = process.argv[2] || 'modeling-paper-standard';
if (!['modeling-paper-standard', 'modeling-plot-suite', 'modeling-submission-package'].includes(id)) throw new Error(`Unknown capability: ${id}`);
const root = `bundled/capabilities/${id}/1.0.0`;
const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else if (entry.isFile() && !['manifest.json', 'manifest.json.tmp'].includes(entry.name)) files.push(path);
  }
  return files;
}
manifest.files = await Promise.all((await walk(root)).sort().map(async path => {
  const bytes = await readFile(path);
  return { path: relative(root, path).replaceAll('\\', '/'), sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') };
}));
await writeFile(join(root, 'manifest.json.tmp'), JSON.stringify(manifest, null, 2) + '\n');
await rename(join(root, 'manifest.json.tmp'), join(root, 'manifest.json'));
console.log(`${manifest.id}: ${manifest.files.length} file hashes refreshed`);
