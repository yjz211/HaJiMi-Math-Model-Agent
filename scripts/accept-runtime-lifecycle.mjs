// Real payload lifecycle checks, only against the explicitly configured test home.
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { ensureManagedRuntime, rollbackManagedRuntime, verifyRuntimeTree, runtimeConfig } from '../lib/hajimi/managed-runtime.mjs';
import { checkedHelper, executionEnvironment, runInJob } from '../lib/hajimi/runtime-process.mjs';

if (process.platform !== 'win32' || !process.argv.includes('--isolated-local')) throw new Error('Requires explicit Windows isolated-local acceptance');
const productRoot = resolve(process.argv[2]);
const config = runtimeConfig(productRoot);
const first = await ensureManagedRuntime(productRoot);
const second = await ensureManagedRuntime(productRoot, { repair: true });
assert.notEqual(first.generation, second.generation);
await verifyRuntimeTree(first, undefined, true); // Repair must preserve pinned sessions.
const rolledBack = await rollbackManagedRuntime(productRoot);
assert.equal(rolledBack.generation, first.generation);
const restart = spawnSync(process.execPath, ['--input-type=module', '-e',
  'import {ensureManagedRuntime} from "./lib/hajimi/managed-runtime.mjs"; console.log((await ensureManagedRuntime(process.cwd())).generation);'],
{ cwd: productRoot, env: process.env, encoding: 'utf8', timeout: 300000, windowsHide: true });
assert.equal(restart.status, 0, restart.stderr);
assert.equal(restart.stdout.trim(), first.generation, 'Rollback must survive a fresh process');

const scratch = await mkdtemp(join(config.home, 'relocation-'));
const relocated = { ...first, root: join(scratch, 'payload relocated') };
await cp(first.root, relocated.root, { recursive: true, errorOnExist: true, force: false });
await verifyRuntimeTree(relocated, undefined, true);
const cwd = join(scratch, '中文 项目');
await mkdir(cwd);
const env = await executionEnvironment(relocated, { cacheRoot: join(scratch, 'cache'), cwd,
  toolkitRoot: join(productRoot, 'toolkit/src'), capabilitiesRoot: join(productRoot, 'bundled/capabilities') });
const health = await runInJob(await checkedHelper(productRoot), join(relocated.root, relocated.manifest.tools.python),
  [join(relocated.root, 'support/health.py'), '--smoke'], { cwd, env, timeoutSeconds: 300 });
assert.equal(health.exitCode, 0, health.stderr.toString() + health.stdout.toString());
const report = JSON.parse(health.stdout.toString());
assert.ok(Object.values(report.smoke).every(Boolean));

// Damage only the disposable relocated copy, never the signed active generation.
const victim = join(relocated.root, 'support/empty-gitconfig');
const original = await readFile(victim);
await writeFile(victim, 'acceptance corruption');
await assert.rejects(verifyRuntimeTree(relocated, undefined, true), /damaged/);
await writeFile(victim, original);
await verifyRuntimeTree(relocated, undefined, true);
await verifyRuntimeTree(first, undefined, true);
console.log(JSON.stringify({ passed: true, environment: 'isolated-local-not-clean-vm', repair: true,
  pinnedGenerationPreserved: true, rollbackSurvivesRestart: true, relocation: report.smoke,
  corruptionDetected: true, activeGeneration: first.generation, artifacts: scratch }, null, 2));
