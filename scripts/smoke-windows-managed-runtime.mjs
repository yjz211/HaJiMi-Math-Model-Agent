/** Run ONLY in a disposable Windows acceptance VM / isolated build. Never takes an existing task cwd. */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { ensureManagedRuntime, loadManagedRuntime, runtimeConfig, runtimeStatus, verifyRuntimeTree } from '../lib/hajimi/managed-runtime.mjs';
import { WindowsWorkspaceBackend } from '../lib/hajimi/windows-workspace-backend.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Run on Windows x64');
const isolatedLocal = process.argv.includes('--isolated-local');
const keepArtifacts = process.argv.includes('--keep-artifacts');
if (process.env.HAJIMI_ACCEPTANCE_VM !== '1' && !isolatedLocal) throw new Error('Use a disposable acceptance VM or explicitly select --isolated-local with a dedicated HAJIMI_RUNTIME_HOME');
const productRoot = resolve(process.argv[2] ?? process.env.HAJIMI_PRODUCT_ROOT ?? '.');
const acceptanceScripts = fileURLToPath(new URL('.', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'HaJiMi-acceptance-'));
const cwd = join(scratch, '中文 项目 with spaces'); await mkdir(cwd);
try {
  const runtime = process.argv.includes('--installed') ? await loadManagedRuntime(productRoot) : await ensureManagedRuntime(productRoot);
  const backend = new WindowsWorkspaceBackend(cwd, { productRoot, toolkitRoot: join(productRoot, 'toolkit', 'src'), capabilitiesRoot: join(productRoot, 'bundled', 'capabilities') });
  backend.pinned = runtime;
  await mkdir(join(cwd, 'input'));
  await backend.writeFile(join(cwd, '数据 文件.txt'), '数学建模\nspace and 中文');
  assert.equal((await backend.readFile(join(cwd, '数据 文件.txt'))).toString('utf8'), '数学建模\nspace and 中文');
  await assert.rejects(backend.writeFile(join(cwd, 'input', 'forbidden.txt'), 'no'));
  await assert.rejects(backend.writeFile(join(cwd, '.hajimi', 'forbidden.txt'), 'no'));
  // Poison the caller environment. The child must not inherit any of these values.
  const previous = { PATH: process.env.PATH, PYTHONPATH: process.env.PYTHONPATH, OPENAI_API_KEY: process.env.OPENAI_API_KEY };
  Object.assign(process.env, { PATH: 'Z:\\nonexistent', PYTHONPATH: 'Z:\\host-python', OPENAI_API_KEY: 'synthetic-never-real' });
  try {
    const shell = await backend.runShell("python3 -c 'import os,sys; assert os.environ.get(\"OPENAI_API_KEY\") is None; print(sys.executable)'", { timeoutSeconds: 60 });
    assert.equal(shell.exitCode, 0, shell.stderr.toString());
    assert.match(shell.stdout.toString(), /python\.exe/i);
    const smoke = await backend.program('python', [join(runtime.root, 'support', 'health.py'), '--smoke'], { timeoutSeconds: 240 });
    assert.equal(smoke.exitCode, 0, smoke.stderr.toString());
    const report = JSON.parse(smoke.stdout.toString());
    assert.ok(Object.values(report.smoke).every(Boolean));
    const skillWorkspace = join(cwd, 'global-skill-acceptance');
    for (const args of [
      [join(acceptanceScripts, 'native-plot-acceptance.py'), '--workspace', skillWorkspace],
      [join(acceptanceScripts, 'native-figure-page-acceptance.py'), '--figures', join(skillWorkspace, 'figures')],
    ]) {
      const checked = await backend.program('python', args, { timeoutSeconds: 360 });
      assert.equal(checked.exitCode, 0, checked.stderr.toString() + checked.stdout.toString());
      console.log(checked.stdout.toString());
    }
    // Catch native Unicode/argv and portable Bash handling, not only Node-side read/write.
    const query = await backend.grep({ hostPath: cwd, pattern: '数学建模', literal: true, glob: '*.txt' });
    assert.match(query, /数据 文件\.txt/);
    const controller = new AbortController();
    let startup = '';
    const task = backend.runShell("python -u -c 'import time; print(\"HAJIMI_CHILD_STARTED\", flush=True); time.sleep(300)'", {
      signal: controller.signal, timeoutSeconds: 60,
      onData: bytes => { startup += bytes.toString(); if (startup.includes('HAJIMI_CHILD_STARTED')) controller.abort(); },
    });
    await assert.rejects(task, e => e.code === 'ABORTED');
    assert.match(startup, /HAJIMI_CHILD_STARTED/, 'Cancellation must happen after process startup');
    const limited = backend.runShell("python -c 'import sys; sys.stdout.write(\"x\" * 10000000)'", { timeoutSeconds: 60 });
    await assert.rejects(limited, e => e.code === 'OUTPUT_LIMIT');
    // At no point mutate the signed runtime to test damage: copy it for that separate test.
    await verifyRuntimeTree(runtime);
    const status = await runtimeStatus(productRoot, true); assert.equal(status.status, 'ready');
    console.log(JSON.stringify({ passed: true, environment: isolatedLocal ? 'isolated-local-not-clean-vm' : 'acceptance-vm', artifacts: keepArtifacts ? cwd : null, cwdContainsCjkAndSpaces: true, runtime: runtime.manifest.version, smoke: report.smoke, cancellation: true, outputLimit: true, environmentPoison: true, cache: runtimeConfig(productRoot).cache }, null, 2));
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
} finally {
  if (keepArtifacts) console.log(`Acceptance artifacts retained: ${scratch}`);
  else { await delay(100); await rm(scratch, { recursive: true, force: true, maxRetries: 3 }); }
}
