import { createHash, randomUUID, verify as verifySignature } from 'node:crypto';
import { release as osRelease } from 'node:os';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { safeArchivePath, validateFiles, LIMITS, extractRuntimeArchive } from './runtime-archive.mjs';
import { acquireInstallLock, checkedHelper, executionEnvironment, runInJob } from './runtime-process.mjs';

export const RUNTIME_ABI = 1;
// Windows 11 baseline. The helper uses Windows 10+ atomic Job assignment;
// requiring 24H2 excluded the locally tested 22622 host without an API reason.
export const MIN_WINDOWS_BUILD = 22000;
const states = globalThis.__hajimiRuntimeStates ??= new Map();
const installations = globalThis.__hajimiRuntimeInstallations ??= new Map();
const verificationCache = globalThis.__hajimiRuntimeVerificationCache ??= new Map();
export function cancelRuntimeInstallation(productRoot) {
  const controller = installations.get(runtimeConfig(productRoot).home);
  controller?.abort(); return Boolean(controller);
}
async function appendRuntimeLog(config, event) {
  const directory = join(config.home, 'logs'); await checkDirectoryPath(directory); await mkdir(directory, { recursive: true });
  const file = join(directory, 'runtime.jsonl');
  try { if ((await stat(file)).size >= 4 * 1024 * 1024) { await rm(file + '.1', { force: true }); await rename(file, file + '.1'); } }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const h = await open(file, 'a');
  try { await h.writeFile(JSON.stringify(event) + '\n'); } finally { await h.close(); }
}
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export async function hashFile(path) { const h = createHash('sha256'); for await (const b of createReadStream(path)) h.update(b); return h.digest('hex'); }
export function windowsBuildNumber(release = osRelease()) {
  const match = /^(?:\d+\.){2}(\d+)(?:$|\.)/.exec(String(release).trim());
  return match ? Number(match[1]) : Number.NaN;
}
export function isSupportedWindowsHost(platform = process.platform, arch = process.arch, release = osRelease()) {
  return platform === 'win32' && arch === 'x64' && windowsBuildNumber(release) >= MIN_WINDOWS_BUILD;
}
export function runtimeConfig(productRoot = process.env.HAJIMI_PRODUCT_ROOT ?? process.cwd()) {
  const home = process.env.HAJIMI_RUNTIME_HOME;
  if (!home || !isAbsolute(home)) throw Object.assign(new Error('Electron must configure HAJIMI_RUNTIME_HOME as an absolute, ASCII, local path'), { code: 'UNCONFIGURED' });
  if (/[^\x20-\x7e]/.test(home) || (process.platform === 'win32' && !/^[a-z]:[\\/]/i.test(home))) throw new Error('Runtime home must be an ASCII local-drive path (TeX Live requirement)');
  return { home: resolve(home), productRoot: resolve(productRoot), cache: join(resolve(home), 'cache') };
}
async function json(path, maxBytes = LIMITS.manifest) {
  const handle = await open(path, 'r');
  try { if ((await handle.stat()).size > maxBytes) throw new Error('Metadata size limit'); return JSON.parse(await handle.readFile('utf8')); }
  finally { await handle.close(); }
}
export function decodeRelease(envelope, trust) {
  if (!envelope || typeof envelope.payload !== 'string' || envelope.payload.length > LIMITS.manifest * 1.4 || typeof envelope.signature !== 'string') throw new Error('Invalid signed release envelope');
  const key = trust.keys?.[envelope.keyId]; if (!key) throw new Error('Runtime signing key is not trusted');
  const payload = Buffer.from(envelope.payload, 'base64'), signature = Buffer.from(envelope.signature, 'base64');
  if (signature.length !== 64 || !verifySignature(null, payload, key, signature)) throw new Error('Runtime signature verification failed');
  const manifest = JSON.parse(payload.toString('utf8'));
  if (manifest.format !== 'hajimi.runtime.v1' || manifest.abi !== RUNTIME_ABI || manifest.platform !== 'win32' || manifest.arch !== 'x64' || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-z0-9.-]+)?$/.test(manifest.version)) throw new Error('Unsupported runtime identity/ABI');
  const files = validateFiles(manifest.files);
  for (const name of ['python', 'bash', 'xelatex']) {
    const path = manifest.tools?.[name]; safeArchivePath(path);
    if (!files.has(path.toLowerCase()) || !path.toLowerCase().endsWith('.exe')) throw new Error(`Missing managed tool: ${name}`);
  }
  for (const [name, path] of Object.entries(manifest.tools)) {
    safeArchivePath(path); if (!files.has(path.toLowerCase())) throw new Error(`Unlisted tool: ${name}`);
  }
  for (const path of ['support/health.py', 'support/sitecustomize.py', 'support/bash-env.sh', 'support/fonts.conf', 'fonts/NotoSansCJKsc-Regular.ttf', 'THIRD_PARTY_NOTICES.json']) {
    if (!files.has(path.toLowerCase())) throw new Error(`Missing runtime support file: ${path}`);
  }
  const a = manifest.archive;
  if (!a || !/^[a-f0-9]{64}$/.test(a.sha256) || !Number.isSafeInteger(a.size) || a.size <= 0 || a.size > LIMITS.archive || !/^[a-zA-Z0-9._-]+\.tar\.gz$/.test(a.file)) throw new Error('Invalid runtime archive');
  if (a.url) allowedUrl(a.url, trust.downloadOrigins);
  if (manifest.capabilities?.baseline !== true || manifest.capabilities?.pdfLayout !== true) throw new Error('Baseline runtime cannot omit numerical or PDF layout validation');
  return { manifest, digest: sha256(payload), envelope };
}
export function allowedUrl(value, origins) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || !Array.isArray(origins) || !origins.includes(url.origin)) throw new Error('Runtime download origin is not allowed');
  return url;
}
/** Reject reparse/symlink ancestors before writes. Not a race-proof OS sandbox. */
export async function checkDirectoryPath(path) {
  let current = resolve(path); const chain = [];
  for (;;) { chain.push(current); const p = dirname(current); if (p === current) break; current = p; }
  for (const p of chain.reverse()) {
    try { const s = await lstat(p); if (!s.isDirectory() || s.isSymbolicLink()) throw new Error(`Unsafe runtime directory: ${p}`); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
}
async function atomicJson(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  const h = await open(temp, 'wx');
  try { await h.writeFile(JSON.stringify(value) + '\n'); await h.sync(); } finally { await h.close(); }
  try { await rename(temp, path); } finally { await rm(temp, { force: true }); }
}
function generationPath(config, value) {
  if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/.test(value)) throw new Error('Invalid runtime generation');
  return join(config.home, 'versions', value);
}
async function trustFor(config) { return json(join(config.productRoot, 'runtime', 'windows', 'trust.json')); }
async function loadGeneration(config, generation) {
  const directory = generationPath(config, generation); await checkDirectoryPath(directory);
  const release = decodeRelease(await json(join(directory, 'receipt.json')), await trustFor(config));
  return { ...release, generation, root: join(directory, 'payload') };
}
async function readActive(config) { const pointer = await json(join(config.home, 'active.json'), 4096); return loadGeneration(config, pointer.generation); }
async function readOptional(path, maxBytes = 4096) {
  try { return await json(path, maxBytes); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
export async function verifyRuntimeTree(runtime, signal, force = false) {
  return verifyRuntimeTreeWithMode(runtime, signal, force);
}
function verificationKey(runtime) { return `${resolve(runtime.root)}\0${runtime.generation}\0${runtime.digest}`; }
async function boundedMap(items, operation) {
  let next = 0;
  let failure;
  const results = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(8, items.length) }, async () => {
    while (!failure && next < items.length) {
      const index = next++;
      try { results[index] = await operation(items[index]); }
      catch (error) { failure ??= error; }
    }
  }));
  if (failure) throw failure;
  return results;
}
async function runtimeInventory(root, signal) {
  const entries = [];
  async function walk(dir, prefix = '') {
    signal?.throwIfAborted();
    const children = await readdir(dir, { withFileTypes: true });
    children.sort((left, right) => left.name.localeCompare(right.name));
    const stats = await boundedMap(children, async entry => {
      signal?.throwIfAborted();
      return lstat(join(dir, entry.name));
    });
    for (let index = 0; index < children.length; index++) {
      const entry = children[index];
      const path = join(dir, entry.name), rel = prefix + entry.name; const info = stats[index];
      const kind = info.isDirectory() ? 'd' : info.isFile() ? 'f' : info.isSymbolicLink() ? 'l' : 'o';
      entries.push([rel, kind, info.size, info.mtimeMs, info.ctimeMs, info.ino, info.dev, info.nlink]);
      if (info.isDirectory()) await walk(path, rel + '/');
    }
  }
  await walk(root);
  return entries;
}
async function verifyRuntimeTreeWithMode(runtime, signal, force) {
  const key = verificationKey(runtime);
  await checkDirectoryPath(runtime.root);
  const entries = await runtimeInventory(runtime.root, signal);
  const inventory = JSON.stringify(entries);
  const cached = verificationCache.get(key);
  if (!force && cached === inventory) return runtime;
  const expected = validateFiles(runtime.manifest.files); const seen = new Set();
  try {
    const files = entries.filter(([, kind]) => kind !== 'd');
    await boundedMap(files, async entry => {
      signal?.throwIfAborted();
      const [rel, kind, size, mtime, ctime, ino, dev, nlink] = entry;
      if (kind === 'l') throw new Error(`Runtime link rejected: ${rel}`);
      const record = expected.get(rel.toLowerCase());
      if (kind !== 'f' || nlink > 1 || !record || record.path !== rel || record.size !== size) throw new Error(`Runtime file damaged/unlisted: ${rel}`);
      const handle = await open(join(runtime.root, rel), 'r');
      const unchanged = info => info.isFile() && info.size === size && info.mtimeMs === mtime && info.ctimeMs === ctime && info.ino === ino && info.dev === dev && info.nlink === nlink;
      try {
        if (!unchanged(await handle.stat())) throw new Error(`Runtime file changed during verification: ${rel}`);
        const hash = createHash('sha256');
        // Bound memory to eight 1 MiB buffers even for large scientific libraries.
        const buffer = Buffer.allocUnsafe(Math.min(size, 1024 * 1024) || 1);
        for (;;) {
          signal?.throwIfAborted();
          const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
          if (!bytesRead) break;
          hash.update(buffer.subarray(0, bytesRead));
        }
        if (hash.digest('hex') !== record.sha256 || !unchanged(await handle.stat())) throw new Error(`Runtime file damaged/unlisted: ${rel}`);
      } finally { await handle.close(); }
      seen.add(rel.toLowerCase());
    });
    if (seen.size !== expected.size) throw new Error('Runtime files are missing');
    verificationCache.set(key, inventory);
    // Bound retained inventories across repaired/relocated generations.
    while (verificationCache.size > 16) verificationCache.delete(verificationCache.keys().next().value);
    return runtime;
  } catch (error) {
    verificationCache.delete(key);
    throw error;
  }
}
export function invalidateRuntimeVerification(runtime) { verificationCache.delete(verificationKey(runtime)); }
/** Pure read: no download, directory creation, task initialization or pointer repair. */
export async function runtimeStatus(productRoot, verifyFiles = false) {
  if (!isSupportedWindowsHost()) return { status: 'unsupported', required: `Windows 11 x64 build ${MIN_WINDOWS_BUILD}+`, abi: RUNTIME_ABI };
  let config;
  try {
    config = runtimeConfig(productRoot);
    const progress = states.get(config.home);
    if (progress && !['ready', 'error', 'cancelled'].includes(progress.status)) return progress;
    const runtime = await readActive(config);
    if (verifyFiles) await verifyRuntimeTree(runtime, undefined, true);
    return { status: verifyFiles ? 'ready' : 'installed', integrity: verifyFiles ? 'verified-now' : 'not-checked', version: runtime.manifest.version, manifestSha256: runtime.digest, generation: runtime.generation, capabilities: runtime.manifest.capabilities, lastOperation: progress ?? null };
  } catch (e) {
    return { status: e.code === 'UNCONFIGURED' ? 'unconfigured' : e.code === 'ENOENT' ? 'missing' : 'corrupt', error: String(e.message), lastOperation: config ? states.get(config.home) ?? null : null };
  }
}
export async function archiveSource(config, release, trust, signal) {
  const a = release.manifest.archive, cached = join(config.cache, a.sha256 + '.tar.gz');
  async function valid(path) { try { const s = await lstat(path); return s.isFile() && !s.isSymbolicLink() && s.size === a.size && await hashFile(path) === a.sha256; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
  if (await valid(cached)) return cached;
  const offline = join(config.productRoot, 'runtime', 'windows', 'payloads', a.file);
  if (await valid(offline)) return offline;
  // Compatibility workflows share the identical signed archive shipped by the product.
  if (basename(config.productRoot) === 'v010' && basename(dirname(config.productRoot)) === 'compatibility') {
    const shared = join(dirname(dirname(config.productRoot)), 'runtime', 'windows', 'payloads', a.file);
    if (await valid(shared)) return shared;
  }
  if (!a.url) throw new Error('No valid offline payload and no published download URL');
  let url = allowedUrl(a.url, trust.downloadOrigins); let response;
  for (let redirects = 0; redirects <= 4; redirects++) {
    response = await fetch(url, { redirect: 'manual', signal, headers: { 'accept-encoding': 'identity' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location'); await response.body?.cancel();
      if (!location || redirects === 4) throw new Error('Runtime redirect limit');
      url = allowedUrl(new URL(location, url).href, trust.downloadOrigins); continue;
    }
    break;
  }
  if (!response?.ok || !response.body) throw new Error(`Runtime download failed: HTTP ${response?.status}`);
  const length = response.headers.get('content-length'); if (length && Number(length) !== a.size) { await response.body.cancel(); throw new Error('Runtime download length mismatch'); }
  const temp = cached + '.' + randomUUID() + '.part'; const handle = await open(temp, 'wx'); const hash = createHash('sha256'); let total = 0;
  try {
    for await (const data of response.body) {
      signal?.throwIfAborted(); total += data.length;
      if (total > a.size) throw new Error('Runtime download exceeds declared size');
      hash.update(data); let offset = 0;
      while (offset < data.length) { const { bytesWritten } = await handle.write(data, offset, data.length - offset); if (!bytesWritten) throw new Error('Short download write'); offset += bytesWritten; }
    }
    await handle.sync();
    if (total !== a.size || hash.digest('hex') !== a.sha256) throw new Error('Runtime archive integrity failure');
  } catch (e) { await handle.close(); await rm(temp, { force: true }); throw e; }
  await handle.close();
  try { signal?.throwIfAborted(); await rename(temp, cached); return cached; }
  finally { await rm(temp, { force: true }); }
}
async function smoke(config, runtime, helper, signal) {
  const cwd = join(config.cache, 'smoke', randomUUID()); await mkdir(cwd, { recursive: true });
  try {
    const env = await executionEnvironment(runtime, { cacheRoot: config.cache, cwd, toolkitRoot: join(config.productRoot, 'toolkit', 'src'), capabilitiesRoot: join(config.productRoot, 'bundled', 'capabilities') });
    const result = await runInJob(helper, join(runtime.root, runtime.manifest.tools.python), ['-X', 'utf8', join(runtime.root, 'support', 'health.py'), '--smoke'], { cwd, env, signal, timeoutSeconds: 180 });
    if (result.exitCode !== 0) throw new Error(`Runtime smoke failed: ${result.stderr.toString('utf8')} ${result.stdout.toString('utf8')}`);
    return JSON.parse(result.stdout.toString('utf8'));
  } finally { await rm(cwd, { recursive: true, force: true }); }
}
/** Side-by-side generations: NEVER overwrite or garbage-collect a runtime used by a session. */
export async function ensureManagedRuntime(productRoot, options = {}) {
  if (!isSupportedWindowsHost()) throw new Error(`Native runtime supports Windows 11 x64 build ${MIN_WINDOWS_BUILD}+ only`);
  const config = runtimeConfig(productRoot); const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60 * 1000), ...(options.signal ? [options.signal] : [])]);
  signal.throwIfAborted(); await checkDirectoryPath(config.home);
  await mkdir(config.home, { recursive: true }); await mkdir(config.cache, { recursive: true });
  const helper = await checkedHelper(config.productRoot);
  const ownerCheck = await runInJob(helper, helper, ['--assert-owned', config.home], { cwd: config.home, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot }, timeoutSeconds: 10 });
  if (ownerCheck.exitCode !== 0) throw new Error('Runtime directory is not owned by this Windows user');
  const releaseLock = await acquireInstallLock(helper, join(config.home, 'install.lock'), signal);
  installations.set(config.home, controller);
  let staging; let logging = Promise.resolve();
  const update = (status, extra = {}) => {
    const event = { status, updatedAt: new Date().toISOString(), ...extra }; states.set(config.home, event);
    logging = logging.then(() => appendRuntimeLog(config, event)).catch(() => { event.logUnavailable = true; });
  };
  try {
    const trust = await trustFor(config); const envelope = await json(join(config.productRoot, 'runtime', 'windows', 'release.json'));
    const release = decodeRelease(envelope, trust);
    let previous; let previousHealthy = false;
    try { previous = await readActive(config); } catch (e) { if (e.code !== 'ENOENT' && !options.repair) throw e; }
    if (previous) { try { await verifyRuntimeTree(previous, signal); previousHealthy = true; } catch (e) { if (!options.repair) throw e; } }
    const rollbackHold = await readOptional(join(config.home, 'rollback-hold.json'));
    if (!options.repair && previous && rollbackHold?.activeGeneration === previous.generation && rollbackHold?.candidateDigest === release.digest) {
      update('ready', { rollbackHeld: true, version: previous.manifest.version, generation: previous.generation });
      return previous;
    }
    if (previous?.digest === release.digest && !options.repair) {
      update('ready'); return previous;
    }
    await mkdir(join(config.home, 'versions'), { recursive: true });
    // Reclaim only incomplete, never-activated generations after a crashed install.
    for (const entry of await readdir(join(config.home, 'versions'), { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/.test(entry.name) || entry.name === previous?.generation) continue;
      const orphan = generationPath(config, entry.name); await checkDirectoryPath(orphan);
      try { await stat(join(orphan, 'receipt.json')); } catch (e) { if (e.code !== 'ENOENT') throw e; await rm(orphan, { recursive: true, force: true }); }
    }
    const generation = randomUUID(); staging = generationPath(config, generation);
    await mkdir(staging); const root = join(staging, 'payload'); await mkdir(root);
    update('downloading'); const archive = await archiveSource(config, release, trust, signal);
    update('extracting'); await extractRuntimeArchive(archive, root, release.manifest.files, signal);
    const runtime = { ...release, root, generation };
    update('verifying'); await verifyRuntimeTree(runtime, signal);
    update('self-testing'); const health = await smoke(config, runtime, helper, signal);
    // A smoke test must not modify the signed tree through generated caches.
    await verifyRuntimeTree(runtime, signal, true);
    await atomicJson(join(staging, 'receipt.json'), envelope);
    await atomicJson(join(staging, 'health.json'), health);
    signal.throwIfAborted(); releaseLock.assertHeld();
    // Backup preserves the previous *pointer*, not a copy of a possibly-running installation.
    if (previousHealthy) await atomicJson(join(config.home, 'previous.json'), { generation: previous.generation });
    await atomicJson(join(config.home, 'active.json'), { generation });
    await rm(join(config.home, 'rollback-hold.json'), { force: true });
    staging = undefined; update('ready'); return runtime;
  } catch (e) {
    update(signal.aborted ? 'cancelled' : 'error', { error: String(e.message).slice(0, 2000), activePreserved: true }); throw e;
  } finally {
    try { if (staging) await rm(staging, { recursive: true, force: true }); await logging; }
    finally { if (installations.get(config.home) === controller) installations.delete(config.home); await releaseLock(); }
  }
}
export async function rollbackManagedRuntime(productRoot, signal) {
  if (!isSupportedWindowsHost()) throw new Error(`Native runtime supports Windows 11 x64 build ${MIN_WINDOWS_BUILD}+ only`);
  const config = runtimeConfig(productRoot); const helper = await checkedHelper(config.productRoot);
  const release = await acquireInstallLock(helper, join(config.home, 'install.lock'), signal);
  try {
    const active = await readActive(config); const prior = await json(join(config.home, 'previous.json'), 4096); const runtime = await loadGeneration(config, prior.generation);
    await verifyRuntimeTree(runtime, signal); await smoke(config, runtime, helper, signal);
    await verifyRuntimeTree(runtime, signal, true); signal?.throwIfAborted(); release.assertHeld();
    await atomicJson(join(config.home, 'rollback-hold.json'), { activeGeneration: runtime.generation, candidateDigest: active.digest, rolledBackAt: new Date().toISOString() });
    await atomicJson(join(config.home, 'active.json'), { generation: runtime.generation });
    return { version: runtime.manifest.version, generation: runtime.generation };
  } finally { await release(); }
}
export async function loadManagedRuntime(productRoot) {
  if (!isSupportedWindowsHost()) throw new Error(`Native runtime supports Windows 11 x64 build ${MIN_WINDOWS_BUILD}+ only`);
  return readActive(runtimeConfig(productRoot));
}

/** Host Git features use the same pinned, verified tool family, never developer PATH. */
export async function runManagedGit(cwd, args) {
  const config = runtimeConfig(); const runtime = await loadManagedRuntime(config.productRoot);
  await verifyRuntimeTree(runtime);
  if (!runtime.manifest.tools.git) throw new Error('Managed Git is unavailable in this runtime');
  const env = await executionEnvironment(runtime, { cacheRoot: config.cache, cwd });
  const result = await runInJob(await checkedHelper(config.productRoot), join(runtime.root, runtime.manifest.tools.git), args, { cwd, env, timeoutSeconds: 120, maxBytes: 1024 * 1024 });
  return { code: result.exitCode ?? 1, stdout: result.stdout.toString('utf8'), stderr: result.stderr.toString('utf8') };
}
