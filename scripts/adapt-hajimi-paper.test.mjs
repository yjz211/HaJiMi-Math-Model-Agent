import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { adaptHajimiPaper } from './adapt-hajimi-paper.mjs';

test('paper routing retains every full requirement and detailed contract across fresh sync and repeat adaptation', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'hajimi-paper-adapt-'));
  const source = 'bundled/capabilities/modeling-paper-standard/1.0.0';
  try {
    await cp(source, scratch, { recursive: true });
    const resource = join(scratch, 'resources');
    const archived = await readFile(join(resource, 'references/requirements-contract.md'), 'utf8');
    const requirements = archived.slice(archived.indexOf('## 强制流程')).trim();
    assert.ok(requirements.includes('22--30'));
    const entry = await readFile(join(resource, 'SKILL.md'), 'utf8');
    const frontmatter = entry.slice(0, entry.indexOf('\n---', 3) + 4);
    await writeFile(join(resource, 'SKILL.md'), `${frontmatter}\n\n# 数学建模论文统一规范\n\n${requirements}\n\n## HaJiMi 首稿与增量审查\n`);
    await adaptHajimiPaper(scratch);
    const preserved = await readFile(join(resource, 'references/requirements-contract.md'), 'utf8');
    assert.equal(preserved.slice(preserved.indexOf('## 强制流程')).trim(), requirements);
    const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
    const contracts = manifest.files.filter(f => f.path.startsWith('resources/references/') && !f.path.endsWith('requirements-contract.md'));
    for (const file of contracts) {
      assert.deepEqual(await readFile(join(scratch, file.path)), await readFile(join(source, file.path)), file.path);
    }
    const before = await Promise.all(manifest.files.map(f => readFile(join(scratch, f.path))));
    await adaptHajimiPaper(scratch);
    for (let i = 0; i < manifest.files.length; i++) {
      assert.deepEqual(await readFile(join(scratch, manifest.files[i].path)), before[i], manifest.files[i].path);
    }
  } finally { await rm(scratch, { recursive: true, force: true }); }
});
