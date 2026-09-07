import { createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { decodeRelease, hashFile } from '../lib/hajimi/managed-runtime.mjs';

// Signing keys must remain OUTSIDE the project, build artifacts and delivered ZIP.
// node scripts/seal-windows-runtime.mjs BUILD_DIR PRODUCT_ROOT KEY_ID PRIVATE_PEM [HTTPS_ARCHIVE_URL]
const [buildValue, productValue, keyId, privatePath, url] = process.argv.slice(2);
if (!buildValue || !productValue || !keyId || !privatePath) throw new Error('Expected BUILD_DIR PRODUCT_ROOT KEY_ID PRIVATE_PEM [HTTPS_ARCHIVE_URL]');
const build = resolve(buildValue), product = resolve(productValue);
for (const root of [product, build]) {
  const rel = relative(root, resolve(privatePath));
  if (rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep))) throw new Error('Keep signing keys outside both the product and build output');
}
const manifest = JSON.parse(await readFile(join(build, 'manifest.unsigned.json'), 'utf8'));
if (url) { const u = new URL(url); if (u.protocol !== 'https:' || u.username || u.password || u.hash) throw new Error('Invalid release URL'); manifest.archive.url = u.href; }
if (await hashFile(join(build, manifest.archive.file)) !== manifest.archive.sha256) throw new Error('Archive changed since build');
const key = createPrivateKey(await readFile(privatePath)); if (key.asymmetricKeyType !== 'ed25519') throw new Error('Use an Ed25519 signing key');
const publicPem = createPublicKey(key).export({ type: 'spki', format: 'pem' });
const directory = join(product, 'runtime', 'windows'); await mkdir(directory, { recursive: true });
let trust = { format: 'hajimi.runtime-trust.v1', keys: {}, downloadOrigins: [] };
try { trust = JSON.parse(await readFile(join(directory, 'trust.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
if (trust.keys[keyId] && trust.keys[keyId] !== publicPem) throw new Error('Key ID cannot be reused for a different public key');
trust.keys[keyId] = publicPem;
if (url && !trust.downloadOrigins.includes(new URL(url).origin)) trust.downloadOrigins.push(new URL(url).origin);
const payload = Buffer.from(JSON.stringify(manifest));
const envelope = { keyId, payload: payload.toString('base64'), signature: sign(null, payload, key).toString('base64') };
decodeRelease(envelope, trust);
await writeFile(join(directory, 'trust.json'), JSON.stringify(trust, null, 2) + '\n');
await writeFile(join(directory, 'release.json'), JSON.stringify(envelope) + '\n');
if (process.env.HAJIMI_OFFLINE_RUNTIME === '1') {
  await mkdir(join(directory, 'payloads'), { recursive: true });
  await copyFile(join(build, manifest.archive.file), join(directory, 'payloads', manifest.archive.file));
}
console.log(`Sealed runtime ${manifest.version}; exact archive must now be published at the approved URL or included offline. No URL is tested by this signing step.`);
