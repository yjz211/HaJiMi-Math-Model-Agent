// Local test signing only. No private material is printed or placed in products.
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const [directoryValue] = process.argv.slice(2);
if (!directoryValue || !isAbsolute(directoryValue)) throw new Error('Supply a NEW absolute directory outside the project');
const directory = resolve(directoryValue);
const rel = relative(process.cwd(), directory);
if (!isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + sep)) throw new Error('Signing keys must be outside the project');
await mkdir(directory, { recursive: false });
const { privateKey } = generateKeyPairSync('ed25519');
const keyPath = resolve(directory, 'local-test-ed25519.pem');
await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { flag: 'wx', mode: 0o600 });
console.log(`Local-test-only signing key created outside the product: ${keyPath}`);
