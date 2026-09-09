import { readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { decodeRelease, hashFile } from '../lib/hajimi/managed-runtime.mjs';
import { checkedHelper } from '../lib/hajimi/runtime-process.mjs';
if (process.platform !== 'win32' && !process.argv.includes('--force')) { console.log('Managed Windows runtime packaging check: non-Windows target not applicable'); process.exit(0); }
const index = process.argv.indexOf('--product-root');
const root = resolve(index >= 0 ? process.argv[index + 1] : process.cwd());
const base = join(root, 'runtime', 'windows');
const trust = JSON.parse(await readFile(join(base, 'trust.json'), 'utf8'));
const { manifest } = decodeRelease(JSON.parse(await readFile(join(base, 'release.json'), 'utf8')), trust);
await checkedHelper(root);
if (process.env.HAJIMI_OFFLINE_RUNTIME === '1' || !manifest.archive.url) {
  const path = join(base, 'payloads', manifest.archive.file);
  if ((await stat(path)).size !== manifest.archive.size || await hashFile(path) !== manifest.archive.sha256) throw new Error('Offline payload mismatch');
} else if (!manifest.archive.url) throw new Error('Online installer requires a published archive URL');
console.log(`Managed runtime package contract: ${manifest.version} / ${manifest.archive.sha256}`);
