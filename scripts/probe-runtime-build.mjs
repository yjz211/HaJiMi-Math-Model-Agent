// Pre-sealing diagnostics only; not signed-payload acceptance or a clean-VM claim.
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { checkedHelper, executionEnvironment, runInJob } from '../lib/hajimi/runtime-process.mjs';
const [buildValue] = process.argv.slice(2);
if (!buildValue) throw new Error('Expected explicit generated build directory');
const productRoot = process.cwd();
const root = join(resolve(buildValue), 'payload');
const scratch = await mkdtemp(join(resolve(buildValue), 'probe-'));
const runtime = { root, manifest: { tools: {
  python: 'python/python.exe', bash: 'shell/usr/bin/bash.exe', git: 'shell/cmd/git.exe',
  xelatex: 'texlive/bin/windows/xelatex.exe',
} } };
const env = await executionEnvironment(runtime, { cwd: scratch, cacheRoot: join(scratch, 'cache'),
  toolkitRoot: join(productRoot, 'toolkit/src'), capabilitiesRoot: join(productRoot, 'bundled/capabilities') });
const helper = await checkedHelper(productRoot);
for (const args of [
  [join(root, 'support/health.py'), '--smoke'],
  [join(productRoot, 'scripts/native-plot-acceptance.py'), '--workspace', join(scratch, '绘图 中文 test')],
  [join(productRoot, 'scripts/native-figure-page-acceptance.py'), '--figures', join(scratch, '绘图 中文 test', 'figures')],
]) {
  const started = performance.now();
  const result = await runInJob(helper, join(root, runtime.manifest.tools.python), args,
    { cwd: scratch, env, timeoutSeconds: 600, onData: bytes => process.stdout.write(bytes) });
  assert.equal(result.exitCode, 0, result.stderr.toString());
  if (args[0].endsWith('health.py')) assert.ok(Object.values(JSON.parse(result.stdout.toString()).smoke).every(Boolean));
  console.log(`Probe step completed in ${Math.round(performance.now() - started)} ms`);
}
console.log(JSON.stringify({ passed: true, scope: 'unsealed-build-diagnostics-only', artifacts: scratch }));
