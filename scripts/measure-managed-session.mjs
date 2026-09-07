// Performance gate for an installed local-test runtime; does not use model credentials.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

if (!process.argv.includes('--isolated-local')) throw new Error('Explicit --isolated-local is required');
const productRoot = resolve(process.argv[2] ?? '.');
const moduleIndex = process.argv.indexOf('--backend-module');
const backendModule = moduleIndex < 0
  ? new URL('../lib/hajimi/windows-workspace-backend.mjs', import.meta.url)
  : pathToFileURL(resolve(process.argv[moduleIndex + 1]));
const { WindowsWorkspaceBackend } = await import(backendModule.href);
const scratch = await mkdtemp(join(tmpdir(), 'hajimi-session-speed-'));
try {
  await mkdir(join(scratch, 'input'));
  const backend = new WindowsWorkspaceBackend(scratch, {
    productRoot,
    toolkitRoot: join(productRoot, 'toolkit', 'src'),
    capabilitiesRoot: join(productRoot, 'bundled', 'capabilities'),
  });
  const measure = async operation => { const started = performance.now(); const value = await operation(); return { milliseconds: Math.round(performance.now() - started), value }; };
  const prepare = await measure(() => backend.prepare());
  const calls = [];
  for (let index = 0; index < 3; index++) {
    calls.push(await measure(async () => {
      const result = await backend.runShell(`printf 'speed-${index}\\n'`, { timeoutSeconds: 15 });
      assert.equal(result.exitCode, 0, result.stderr.toString());
      assert.equal(result.stdout.toString(), `speed-${index}\n`);
    }));
  }
  const report = { passed: prepare.milliseconds <= 20_000 && calls.every(call => call.milliseconds <= 2_000), prepareMilliseconds: prepare.milliseconds, bashMilliseconds: calls.map(call => call.milliseconds), thresholds: { prepare: 20_000, bash: 2_000 } };
  const secondRoot = join(scratch, 'second-task');
  await mkdir(secondRoot);
  const second = new WindowsWorkspaceBackend(secondRoot, backend.options);
  const secondPrepare = await measure(() => second.prepare());
  const health = await measure(() => second.health());
  const secondCall = await measure(async () => {
    const result = await second.runShell("printf 'second-task\\n'", { timeoutSeconds: 15 });
    assert.equal(result.exitCode, 0, result.stderr.toString());
    assert.equal(result.stdout.toString(), 'second-task\n');
  });
  report.secondTaskPrepareMilliseconds = secondPrepare.milliseconds;
  report.healthMilliseconds = health.milliseconds;
  report.secondTaskBashMilliseconds = secondCall.milliseconds;
  report.backendModule = backendModule.href;
  report.nodeVersion = process.version;
  report.passed &&= secondPrepare.milliseconds <= 20_000 && secondCall.milliseconds <= 2_000;
  console.log(JSON.stringify(report, null, 2));
  assert.ok(report.passed, 'Managed session performance gate failed');
} finally {
  await rm(scratch, { recursive: true, force: true });
}
