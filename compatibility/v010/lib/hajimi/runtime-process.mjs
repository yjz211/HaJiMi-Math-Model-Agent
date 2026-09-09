import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export class RuntimeProcessError extends Error {
  constructor(code, message, result) { super(message); this.name = 'RuntimeProcessError'; this.code = code; this.result = result; }
}
export async function checkedHelper(productRoot) {
  const base = join(productRoot, 'runtime', 'windows', 'bootstrap');
  const path = join(base, 'job-host.exe');
  const info = JSON.parse(await readFile(join(base, 'bootstrap.json'), 'utf8'));
  const hash = createHash('sha256').update(await readFile(path)).digest('hex');
  if (info.format !== 'hajimi.bootstrap.v1' || hash !== info.sha256) throw new Error('Bootstrap integrity failure');
  return path;
}
/** Not an OS sandbox. Only this explicit environment is inherited by the Job process tree. */
export async function executionEnvironment(runtime, { cacheRoot, cwd, toolkitRoot, capabilitiesRoot, productRoot }) {
  const work = join(cacheRoot, 'execution'); await mkdir(work, { recursive: true });
  const systemRoot = process.env.SystemRoot;
  if (!systemRoot || !/^[A-Za-z]:\\/.test(systemRoot)) throw new Error('Missing absolute Windows SystemRoot');
  const tools = Object.fromEntries(Object.entries(runtime.manifest.tools).map(([k, v]) => [k, join(runtime.root, ...v.split('/'))]));
  const drawio = productRoot && join(productRoot, 'runtime', 'windows', 'drawio', 'draw.io.exe');
  if (drawio && existsSync(drawio)) tools.drawio = drawio;
  const native = p => p.replaceAll('\\', '/');
  const home = join(cacheRoot, 'home'); const texvar = join(cacheRoot, 'tex-var'); const fonts = join(runtime.root, 'fonts');
  const extraPackages = join(cacheRoot, 'python-packages', runtime.digest || 'default');
  for (const p of [home, texvar, extraPackages, join(cacheRoot, 'matplotlib'), join(cacheRoot, 'fontconfig')]) await mkdir(p, { recursive: true });
  return {
    SystemRoot: systemRoot, WINDIR: systemRoot,
    COMSPEC: join(systemRoot, 'System32', 'cmd.exe'),
    PATHEXT: '.COM;.EXE;.BAT;.CMD',
    PATH: [...(tools.drawio ? [dirname(tools.drawio)] : []), join(runtime.root, 'bin'), dirname(tools.python), dirname(tools.xelatex), join(runtime.root, 'shell', 'mingw64', 'bin'), join(runtime.root, 'shell', 'usr', 'bin'), join(systemRoot, 'System32')].join(';'),
    HOME: native(home), USERPROFILE: home, APPDATA: home, LOCALAPPDATA: home,
    TEMP: work, TMP: work, XDG_CACHE_HOME: cacheRoot, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8',
    // Preserve Python's normal script-directory imports for native skill helpers.
    // Ambient PYTHONPATH and user site packages remain excluded below.
    PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8', PYTHONNOUSERSITE: '1', PYTHONDONTWRITEBYTECODE: '1',
    PIP_TARGET: native(extraPackages), PIP_DISABLE_PIP_VERSION_CHECK: '1',
    PYTHONPATH: [join(runtime.root, 'support'), extraPackages, toolkitRoot,
      capabilitiesRoot && join(capabilitiesRoot, 'modeling-plot-suite', '1.0.0', 'resources', 'scripts'),
    ].filter(Boolean).join(';'),
    MPLBACKEND: 'Agg', MPLCONFIGDIR: join(cacheRoot, 'matplotlib'),
    HAJIMI_MANAGED_RUNTIME: '1', HAJIMI_RUNTIME_ROOT: native(runtime.root),
    HAJIMI_RUNTIME_TOOLS: JSON.stringify(tools), HAJIMI_FONTS_ROOT: native(fonts),
    HAJIMI_CAPABILITIES_ROOT: native(capabilitiesRoot || ''), HAJIMI_WORKSPACE: native(cwd),
    HAJIMI_PYTHON: native(tools.python),
    ...(tools.drawio ? { DRAWIO_PATH: native(tools.drawio) } : {}),
    MH_PYTHON: native(tools.python),
    TEXMFVAR: native(texvar), TEXMFCONFIG: native(join(runtime.root, 'tex-config')),
    TEXMFHOME: native(join(runtime.root, 'tex-home')),
    TEXMFCACHE: native(texvar),
    FONTCONFIG_FILE: native(join(runtime.root, 'support', 'fonts.conf')),
    FONTCONFIG_PATH: native(join(runtime.root, 'support')),
    // Windows XeTeX uses its own kpathsea variables ahead of generic Fontconfig.
    XE_FONTCONFIG_PATH: native(join(runtime.root, 'support')),
    XE_FC_CACHEDIR: native(join(cacheRoot, 'fontconfig')),
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: native(join(runtime.root, 'support', 'empty-gitconfig')),
    BASH_ENV: native(join(runtime.root, 'support', 'bash-env.sh')),
    MSYS2_ENV_CONV_EXCL: 'DRAWIO_PATH;HAJIMI_RUNTIME_TOOLS;HAJIMI_CAPABILITIES_ROOT;HAJIMI_RUNTIME_ROOT;HAJIMI_WORKSPACE;PYTHONPATH',
    MSYS2_ARG_CONV_EXCL: '*',
    PIP_NO_INDEX: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1',
    // No API keys, NODE_OPTIONS, inherited PATH, user PYTHONPATH or shell profiles.
  };
}
export function runInJob(helper, executable, args, options = {}) {
  const { cwd, env, signal, timeoutSeconds = 120, maxBytes = 8 * 1024 * 1024, onData } = options;
  if (signal?.aborted) return Promise.reject(new RuntimeProcessError('ABORTED', 'Execution cancelled before spawn'));
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0 || timeoutSeconds > 86400) return Promise.reject(new Error('Invalid execution timeout'));
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return Promise.reject(new Error('Invalid output limit'));
  return new Promise((resolve, reject) => {
    const child = spawn(helper, ['--run', executable, ...args], { cwd, env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let captured = 0; let failure; let settled = false;
    const stdout = [], stderr = [];
    function stop(code, message) {
      failure ||= new RuntimeProcessError(code, message);
      // The supervisor owns a KILL_ON_JOB_CLOSE handle. Its death also kills grandchildren.
      child.stdin.end(); child.kill();
    }
    const timer = setTimeout(() => stop('TIMEOUT', `Execution exceeded ${timeoutSeconds}s`), timeoutSeconds * 1000);
    const abort = () => stop('ABORTED', 'Execution cancelled');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const collect = (parts, data) => {
      const piece = data.subarray(0, Math.max(0, maxBytes - captured));
      if (piece.length) { parts.push(piece); captured += piece.length; try { onData?.(piece); } catch (e) { stop('CALLBACK', String(e)); } }
      if (piece.length !== data.length) stop('OUTPUT_LIMIT', `Execution exceeded ${maxBytes} captured bytes`);
    };
    child.stdout.on('data', data => collect(stdout, data)); child.stderr.on('data', data => collect(stderr, data));
    child.stdin.on('error', () => {});
    function finish(error, exitCode) {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      const result = { exitCode: exitCode ?? null, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
      if (error || failure) { const reason = failure || new RuntimeProcessError('SPAWN', String(error)); reason.result = result; reject(reason); }
      else resolve(result);
    }
    child.once('error', error => finish(error)); child.once('close', code => finish(null, code));
    // Keep stdin open: EOF tells the supervisor that its parent is gone.
  });
}
export function acquireInstallLock(helper, path, signal) {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(helper, ['--lock', path], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.SystemRoot } });
    let ready = false; let text = ''; let errors = '';
    const abort = () => { child.stdin.end(); child.kill(); };
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 10000);
    const closed = new Promise(done => child.once('close', done));
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    child.stdin.on('error', () => {});
    child.stderr.on('data', b => { errors = (errors + b.toString()).slice(-2000); });
    child.stdout.on('data', b => {
      text = (text + b.toString()).slice(-2000);
      if (!ready && text.includes('LOCKED\n')) {
        ready = true; cleanup();
        const release = async () => { child.stdin.end(); await closed; };
        release.assertHeld = () => { if (child.exitCode !== null || child.signalCode !== null) throw new Error('Runtime installation lock was lost'); };
        resolve(release);
      }
    });
    child.once('error', e => { cleanup(); reject(e); });
    child.once('close', code => { cleanup(); if (!ready) reject(Object.assign(new Error(code === 73 ? 'Another runtime installation is in progress' : `Cannot acquire runtime lock: ${errors}`), { code: code === 73 ? 'BUSY' : 'LOCK_FAILED' })); });
    if (signal?.aborted) abort();
  });
}
