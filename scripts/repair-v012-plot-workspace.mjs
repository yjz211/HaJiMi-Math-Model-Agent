import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { bindPlotRuntime } from '../lib/hajimi/plot-runtime-binding.ts';
const root = process.cwd();
const skill = join(root, 'compatibility/v010/bundled/capabilities/modeling-plot-suite/1.0.0/resources');
for (const cwd of process.argv.slice(2)) {
  bindPlotRuntime(cwd, root);
  let checked = 0;
  function verify(source, target) {
    for (const entry of readdirSync(source, {withFileTypes:true})) {
      if (entry.name === '__pycache__') continue;
      if (entry.isDirectory()) verify(join(source,entry.name),join(target,entry.name));
      else { assert.deepEqual(readFileSync(join(target,entry.name)),readFileSync(join(source,entry.name))); checked++; }
    }
  }
  for (const [source,target] of [['shared-scripts','skills/shared-scripts'],['shared-scripts','_utils'],['html-templates','_templates'],['tools','tools'],['tools','_utils']])
    verify(join(skill,'assets',source),join(cwd,target));
  const metadata = JSON.parse(readFileSync(join(cwd,'.codex-plot-runtime.json'),'utf8'));
  assert.equal(metadata.runtime_skill, skill);
  for (const entry of readdirSync(join(cwd,'figures'))) if (entry.endsWith('.py'))
    assert.ok(!readFileSync(join(cwd,'figures',entry),'utf8').includes('新建文件夹 (2)'),entry);
  console.log(JSON.stringify({cwd,checked,byteExact:true}));
}
