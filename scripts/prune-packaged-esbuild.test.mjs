import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import prune from './prune-packaged-esbuild.mjs';

test('Windows x64 packaging retains native esbuild in both dependency layouts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'hajimi-esbuild-prune-'));
  try {
    const scopes = ['node_modules/@esbuild', '.next/node_modules/agent/node_modules/@esbuild'];
    for (const scope of scopes) for (const name of ['win32-x64', 'linux-x64', 'win32-arm64']) {
      const dir = join(root, 'resources/standalone', scope, name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name: `@esbuild/${name}` }));
      await writeFile(join(dir, 'esbuild.exe'), 'fixture');
    }
    const context = { appOutDir: root, electronPlatformName: 'win32', arch: 1 };
    await prune({ ...context, electronPlatformName: 'darwin' });
    await prune({ ...context, arch: 3 });
    assert.equal((await readdir(join(root, 'resources/standalone', scopes[0]))).length, 3);
    await prune(context);
    for (const scope of scopes) assert.deepEqual(await readdir(join(root, 'resources/standalone', scope)), ['win32-x64']);
    await prune(context);
  } finally {
    assert.ok(root.startsWith(join(tmpdir(), 'hajimi-esbuild-prune-')));
    await rm(root, { recursive: true, force: true });
  }
});
