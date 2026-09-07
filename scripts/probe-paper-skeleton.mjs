import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { WindowsWorkspaceBackend } from '../lib/hajimi/windows-workspace-backend.mjs';
const productRoot = resolve('.');
const cwd = resolve('docs/verification/native-20260905', 'skeleton-' + randomUUID());
await mkdir(cwd, { recursive: true });
const backend = new WindowsWorkspaceBackend(cwd, { productRoot,
  toolkitRoot: join(productRoot, 'toolkit/src'), capabilitiesRoot: join(productRoot, 'bundled/capabilities') });
for (const route of ['standard', 'data-analysis']) {
  const created = await backend.program('python', [join(productRoot, 'scripts/create-hajimi-paper-skeleton.py'), route,
    '--title', '数学建模论文规范验证', '--questions', '4', '--paper-type', route]);
  assert.equal(created.exitCode, 0, created.stderr.toString());
  const compiled = await backend.runShell(`cd ${route} && xelatex -interaction=nonstopmode -halt-on-error main.tex > build.log 2>&1`, { timeoutSeconds: 180 });
  assert.equal(compiled.exitCode, 0, compiled.stderr.toString());
  const checked = await backend.program('python', [join(productRoot, 'scripts/check-hajimi-paper-typography.py'), `${route}/main.pdf`]);
  assert.equal(checked.exitCode, 0, checked.stdout.toString() + checked.stderr.toString());
  console.log(route, checked.stdout.toString().trim());
}
console.log(JSON.stringify({ cwd, note: 'Empty skeleton compilation and typography only; content and page gates intentionally remain for authorship.' }));
