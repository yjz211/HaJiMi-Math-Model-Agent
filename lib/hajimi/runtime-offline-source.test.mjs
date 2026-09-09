import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { archiveSource } from './managed-runtime.mjs';
import { archiveSource as originalArchiveSource } from '../../compatibility/v010/lib/hajimi/managed-runtime.mjs';

for (const [name, source] of [['current', archiveSource], ['original', originalArchiveSource]]) {
  test(`${name} workflow shares only a size-and-hash-verified product archive`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'hajimi-offline-'));
    try {
      const payload = Buffer.from('signed archive test fixture');
      const archive = { file: 'runtime.tar.gz', size: payload.length, sha256: createHash('sha256').update(payload).digest('hex') };
      const shared = join(root, 'runtime/windows/payloads', archive.file);
      await mkdir(join(root, 'runtime/windows/payloads'), { recursive: true });
      await writeFile(shared, payload);
      const config = { productRoot: join(root, 'compatibility/v010'), cache: join(root, 'cache') };
      assert.equal(await source(config, { manifest: { archive } }, {}), shared);
      await writeFile(shared, Buffer.alloc(payload.length));
      await assert.rejects(source(config, { manifest: { archive } }, {}), /No valid offline payload/);
      await writeFile(shared, payload);
      await assert.rejects(source({ ...config, productRoot: join(root, 'other/v010') }, { manifest: { archive } }, {}), /No valid offline payload/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}

test('installer omits the redundant compatibility archive', async () => {
  const config = await readFile(new URL('../../electron-builder.yml', import.meta.url), 'utf8');
  const compatibility = config.slice(config.indexOf('  - from: compatibility/v010'), config.indexOf('  - from: bundled'));
  assert.ok(compatibility.includes('"!runtime/windows/payloads/**/*"'));
  assert.ok(config.includes('"windows/payloads/*.tar.gz"'));
});
