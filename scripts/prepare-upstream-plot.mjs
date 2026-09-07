import { readFile, writeFile, mkdir, readdir, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
export async function prepareUpstreamPlot(source, cwd) {
  const name='000139-aacda755-c6c0-460c-aaaa-49d0b8f50d86.json';
  const cp=JSON.parse(await readFile(join(source,'.hajimi/checkpoints',name),'utf8'));
  if(cp.state.focus.stage!==7 || cp.state.provenance.bindings.length) throw new Error('Expected pre-stage-8 checkpoint');
  await mkdir(join(cwd,'.hajimi'),{recursive:true});
  await writeFile(join(cwd,'one-round.lock'),'upstream-expressive',{flag:'wx'});
  const records=(await readFile(join(source,'.hajimi/artifacts.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(r=>r.registeredAt<=cp.createdAt);
  const refs=new Map(records.map(r=>[r.path,r]));
  function walk(x){if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object'){if(x.path&&x.sha256&&x.frozenPath)refs.set(x.path,x);Object.values(x).forEach(walk);}}
  walk(cp.state.provenance);
  const hashes={};
  for(const [path,r] of refs){
    const bytes=await readFile(join(source,r.frozenPath));
    if(createHash('sha256').update(bytes).digest('hex')!==r.sha256)throw new Error(`Frozen mismatch ${path}`);
    for(const target of [join(cwd,path),join(cwd,r.frozenPath)]){await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);}
    hashes[path]=r.sha256;
  }
  await writeFile(join(cwd,'.hajimi/artifacts.jsonl'),records.map(r=>JSON.stringify(r)).join('\n')+'\n');
  await copyFile(join(source,'.hajimi/input-manifest.json'),join(cwd,'.hajimi/input-manifest.json'));
  await copyFile(join(source,'.hajimi/execution-backend.json'),join(cwd,'.hajimi/execution-backend.json'));
  await writeFile(join(cwd,'.hajimi/task.json'),JSON.stringify(cp.identity,null,2));
  const state=cp.state;state.focus={stage:8,questionId:null};
  state.currentObjective='用户授权从前七阶段证据重新规划完整鲜艳图集，首轮出图后停止';
  state.nextAction='读取上游规划规则和前七阶段材料，验证新的 FIGURE_PLAN.json，再出完整图集';
  delete state.interaction.pending;state.interaction.finalAccepted=false;
  await writeFile(join(cwd,'.hajimi/state.json'),JSON.stringify(state,null,2));
  await writeFile(join(cwd,'.hajimi/figure-plan-policy.json'),JSON.stringify({required:true,minimum:3}));
  await mkdir(join(cwd,'reports'),{recursive:true});
  for(const file of await readdir(join(source,'reports')))if(/^stage-[0-7]-revision-\d+\.md$/.test(file))await copyFile(join(source,'reports',file),join(cwd,'reports',file));
  for(const dir of ['figures','paper','output'])await mkdir(join(cwd,dir),{recursive:true});
  await writeFile(join(cwd,'UPSTREAM_SNAPSHOT.json'),JSON.stringify({checkpoint:name,createdAt:cp.createdAt,sourceStage:7,sourceHashes:hashes,note:'Pre-stage-8 CAS restored. Any source figures are stage-3–7 evidence; do not reuse their design or historical publication list.'},null,2));
  return hashes;
}
