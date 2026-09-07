/* eslint-disable @typescript-eslint/no-explicit-any -- compact malformed-plan fixtures */
import test from 'node:test';
import assert from 'node:assert/strict';
import { figurePlanErrors } from './figure-plan.ts';
import { beginFigurePlan, validateFigurePlan, requireFigurePlan } from './figure-plan.ts';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('full-set plan distinguishes unique figures, required sources and reasoning/spatial triggers', () => {
 const base = { chartType:'折线图',recipe:'basic #3',reason:'r',message:'m',section:'s',question:'q1',layout:'single',finalWidthMm:136,sources:['work/result.json'] };
 const figures:any[] = Array.from({length:8},(_,i)=>({...base,chartType:["折线图","散点图","柱状图"][i%3],id:`fig_${i}`,class:'DATA',outputs:[`figures/fig_${i}.pdf`]}));
 figures.push({...base,id:'fig_roadmap',class:'DRAWIO',purpose:'roadmap',recipe:'custom',outputs:['figures/fig_roadmap.pdf']});
 const plan={questions:[{id:'q1',kind:'data'}],figures};
 assert.deepEqual(figurePlanErrors(plan),[]);
 assert.ok(figurePlanErrors({...plan,figures:figures.filter(f=>f.id!=='fig_7')},3).some(x=>x.includes('at least 8')));
 assert.ok(figurePlanErrors(plan,10).some(x=>x.includes('at least 10')));
 assert.ok(figurePlanErrors({...plan,questions:[{id:'q1',kind:'reasoning',spatial:true}]}).some(x=>x.includes('derivation')));
 assert.ok(figurePlanErrors({...plan,figures:[...figures,{...figures[0]}]}).some(x=>x.includes('duplicate')));
 assert.ok(figurePlanErrors({...plan,figures:figures.slice(0,2)}).some(x=>x.includes('at least 8')));
});
test('optional plan validation does not lock commands when missing or changed', async () => {
 const cwd=await mkdtemp(join(tmpdir(),'hajimi-figure-plan-'));
 try {
  await mkdir(join(cwd,'.hajimi'));await writeFile(join(cwd,'source.json'),'{}');
  await assert.rejects(beginFigurePlan(cwd,7),/>=8/);
  await beginFigurePlan(cwd);await requireFigurePlan(cwd);
  const figures=Array.from({length:9},(_,i)=>({id:`fig_${i}`,class:i===8?'DRAWIO':'DATA',purpose:i===8?'roadmap':'result',question:'q1',chartType:["折线图","散点图","柱状图"][i%3],recipe:'basic #3',reason:'real',message:'result',section:'results',layout:'single',sources:['source.json'],outputs:[`figures/fig_${i}.pdf`],finalWidthMm:136}));
  const plan={questions:[{id:'q1',kind:'data'}],figures};
  await writeFile(join(cwd,'FIGURE_PLAN.json'),JSON.stringify(plan));
  await validateFigurePlan(cwd,'FIGURE_PLAN.json');await requireFigurePlan(cwd);
  await writeFile(join(cwd,'FIGURE_PLAN.json'),JSON.stringify({...plan,note:'changed'}));
  await requireFigurePlan(cwd);
 } finally {await rm(cwd,{recursive:true,force:true});}
});
