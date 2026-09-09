import { constants } from 'node:fs';
import { access, lstat, mkdir, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { checkedHelper, executionEnvironment, runInJob } from './runtime-process.mjs';
import { ensureManagedRuntime, loadManagedRuntime, runtimeConfig, verifyRuntimeTree } from './managed-runtime.mjs';

const within = (candidate, root) => candidate.toLowerCase() === root.toLowerCase() || candidate.toLowerCase().startsWith(root.toLowerCase() + sep);
const mime = { '.gif': 'image/gif', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
export class WindowsWorkspaceBackend {
  constructor(hostRoot, options) {
    this.hostRoot = resolve(hostRoot); this.options = options;
    this.readonlyRoots = (options.readonlyRoots ?? []).map(p => resolve(p));
    this.pinned = null; this.pinnedVerified = false;
  }
  describe() { return { kind: 'windows-managed', workspace: '/workspace', shell: 'PortableGit Bash (current Windows user; not a sandbox)' }; }
  async prepare(signal) {
    this.pinned = await ensureManagedRuntime(this.options.productRoot, { signal });
    // ensureManagedRuntime verifies the exact pinned generation. Rechecking all
    // 64k files before every tool made one session unusably slow.
    this.pinnedVerified = true;
    const path = join(this.hostRoot, '.hajimi', 'execution-backend.json');
    await mkdir(dirname(path), { recursive: true });
    try { await writeFile(path, JSON.stringify({ format: 'hajimi.backend.v1', kind: 'windows-managed', abi: 1 }) + '\n', { flag: 'wx' }); }
    catch (e) { if (e.code !== 'EEXIST') throw e; const value = JSON.parse(await readFile(path, 'utf8')); if (value.kind !== 'windows-managed') throw new Error('Workspace backend selection changed'); }
  }
  async runtime(signal) {
    this.pinned ??= await loadManagedRuntime(this.options.productRoot);
    // Direct consumers that bypass prepare still verify once. A session keeps
    // that immutable generation pinned; explicit status/repair paths force full checks.
    if (!this.pinnedVerified) { await verifyRuntimeTree(this.pinned, signal); this.pinnedVerified = true; }
    return this.pinned;
  }
  async program(tool, args, options = {}) {
    const runtime = await this.runtime(options.signal); const config = runtimeConfig(this.options.productRoot);
    const cwd = await this.authorize(options.cwd ?? this.hostRoot, 'read');
    const env = await executionEnvironment(runtime, { cacheRoot: config.cache, cwd, toolkitRoot: this.options.toolkitRoot, capabilitiesRoot: this.options.capabilitiesRoot, productRoot: this.options.productRoot });
    return runInJob(await checkedHelper(this.options.productRoot), join(runtime.root, runtime.manifest.tools[tool]), args, { ...options, cwd, env });
  }
  async health() {
    const runtime = await this.runtime();
    const result = await this.program('python', ['-X', 'utf8', join(runtime.root, 'support', 'health.py')], { timeoutSeconds: 45 });
    this.success(result);
    return { ...this.describe(), ...JSON.parse(result.stdout.toString('utf8')), runtimeVersion: runtime.manifest.version, runtimeManifestSha256: runtime.digest, runtimeGeneration: runtime.generation, capabilities: runtime.manifest.capabilities };
  }
  readOperations() { return { readFile: p => this.readFile(p), access: p => this.access(p, 'read'), detectImageMimeType: async p => mime[extname(p).toLowerCase()] ?? null }; }
  writeOperations() { return { writeFile: (p, s) => this.writeFile(p, s), mkdir: p => this.mkdir(p) }; }
  editOperations() { return { readFile: p => this.readFile(p), access: p => this.access(p, 'write'), writeFile: (p, s) => this.writeFile(p, s) }; }
  bashOperations() { return { exec: async (command, cwd, options) => { const r = await this.runShell(command, { cwd, signal: options.signal, timeoutSeconds: options.timeout, onData: options.onData }); return { exitCode: r.exitCode }; } }; }
  resolveHostPath(input) {
    if (typeof input !== 'string' || input.includes('\0')) throw new Error('Invalid workspace path');
    const stripped = input.startsWith('@') ? input.slice(1) : input;
    const p = resolve(this.hostRoot, stripped);
    if (![this.hostRoot, ...this.readonlyRoots].some(root => within(p, root))) throw new Error('Path escapes the task workspace');
    return p;
  }
  displayPath(path) {
    const p = resolve(path), ro = this.readonlyRoots.find(root => within(p, root));
    return (ro ? '/hajimi-guidance' : '/workspace') + (relative(ro ?? this.hostRoot, p) ? '/' + relative(ro ?? this.hostRoot, p).replaceAll('\\', '/') : '');
  }
  async authorize(path, mode) {
    if (typeof path !== 'string' || path.includes('\0')) throw new Error('Invalid workspace path');
    const p = resolve(path); const roots = mode === 'read' ? [this.hostRoot, ...this.readonlyRoots] : [this.hostRoot];
    const root = roots.find(r => within(p, r)); if (!root) throw new Error('Path escapes the task workspace');
    const segments = relative(root, p).split(/[\\/]/).filter(Boolean);
    if (process.platform === 'win32' && segments.some(s => /[:<>"|?*]|[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))) throw new Error('Unsafe Windows path');
    if (root === this.hostRoot && segments.some(s => s.toLowerCase() === '.hajimi')) throw new Error('.hajimi is managed by HaJiMi');
    if (mode === 'write' && segments[0]?.toLowerCase() === 'input') throw new Error('input/ is frozen and read-only');
    const rootStat = await lstat(root); if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Workspace root cannot be a link');
    const canonical = await realpath(root); let current = root;
    for (const segment of segments) {
      current = join(current, segment);
      try {
        const info = await lstat(current);
        if (info.isSymbolicLink() || (info.isFile() && info.nlink > 1)) throw new Error('Links and hard-linked files are not allowed');
        if (!within(await realpath(current), canonical)) throw new Error('Resolved path escapes workspace');
      } catch (e) { if (e.code === 'ENOENT') break; throw e; }
    }
    return p;
  }
  async readFile(path) {
    const p = await this.authorize(path, 'read'); const h = await open(p, 'r');
    try {
      const before = await h.stat();
      if (!before.isFile() || before.size > 64 * 1024 * 1024 || before.nlink > 1) throw new Error('Not a regular file, or file exceeds 64 MiB read-tool limit');
      const buffer = await h.readFile(); const after = await h.stat();
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ino !== after.ino) throw new Error('File changed during read');
      await this.authorize(p, 'read'); return buffer;
    } finally { await h.close(); }
  }
  async writeFile(path, content) {
    const p = await this.authorize(path, 'write'); await this.mkdir(dirname(p));
    const temp = join(dirname(p), `.hajimi-write-${randomUUID()}.tmp`); const h = await open(temp, 'wx');
    try { await h.writeFile(content, 'utf8'); await h.sync(); } finally { await h.close(); }
    try { await this.authorize(p, 'write'); await rename(temp, p); } finally { await rm(temp, { force: true }); }
  }
  async mkdir(path) { const p = await this.authorize(path, 'write'); await mkdir(p, { recursive: true }); await this.authorize(p, 'write'); }
  async access(path, mode) { const p = await this.authorize(path, mode); await access(p, mode === 'read' ? constants.R_OK : constants.R_OK | constants.W_OK); }
  async list(path, limit = 500) {
    const p = await this.authorize(path, 'read'); const output = [];
    for (const e of await readdir(p, { withFileTypes: true })) {
      if (e.name.toLowerCase() === '.hajimi' || e.isSymbolicLink()) continue;
      try { await this.authorize(join(p, e.name), 'read'); output.push(e.name + (e.isDirectory() ? '/' : '')); } catch { /* Reject unsafe children, don't follow them. */ }
    }
    return output.sort((a, b) => Number(!a.endsWith('/')) - Number(!b.endsWith('/')) || a.localeCompare(b)).slice(0, Math.max(1, Math.min(limit, 5000)));
  }
  async query(kind, path, spec) {
    const p = await this.authorize(path, 'read'); const runtime = await this.runtime();
    const result = await this.program('python', ['-X', 'utf8', join(runtime.root, 'support', 'workspace_query.py'), kind, p, JSON.stringify(spec)], { timeoutSeconds: 60 });
    this.success(result); return result.stdout.toString('utf8').trim();
  }
  async find(path, pattern, limit = 1000) { return JSON.parse(await this.query('find', path, { pattern, limit: Math.max(1, Math.min(limit, 5000)) })); }
  async grep(input) { return await this.query('grep', input.hostPath, { ...input, limit: Math.max(1, Math.min(input.limit ?? 100, 2000)), context: Math.max(0, Math.min(input.context ?? 0, 20)) }) || 'No matches found'; }
  async runShell(command, options = {}) {
    if (typeof command !== 'string' || command.includes('\0') || Buffer.byteLength(command) > 512 * 1024) throw new Error('Invalid/oversized Bash command');
    options.signal?.throwIfAborted(); const config = runtimeConfig(this.options.productRoot);
    const temp = join(config.cache, 'commands'); await mkdir(temp, { recursive: true });
    const script = join(temp, randomUUID() + '.sh');
    await writeFile(script, 'set -o pipefail\n' + command + '\n', { encoding: 'utf8', flag: 'wx' });
    try { return await this.program('bash', ['--noprofile', '--norc', script.replaceAll('\\', '/')], options); }
    finally { await rm(script, { force: true }); }
  }
  success(result) { if (result.exitCode !== 0) throw new Error(result.stderr.toString('utf8').trim() || `Managed command failed: ${result.exitCode}`); }
}
