import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { moveStage8, readStage8, assertStage8 } from './stage8-phases.ts';

test('stage8 orders work, preserves figures, and permits prerequisite repair',async()=>{
 const root=await mkdtemp(join(tmpdir(),'hajimi-stage8-'));
 try{
  for(const dir of ['.hajimi','figures','paper'])await mkdir(join(root,dir));
  await writeFile(join(root,'figures/a.pdf'),'original-a');await writeFile(join(root,'figures/b.pdf'),'original-b');
  await writeFile(join(root,'FIGURE_PLAN.json'),JSON.stringify({figures:[{outputs:['figures/a.pdf','figures/b.pdf']}]}));
  assert.equal((await readStage8(root)).phase,'figures');
  await assert.rejects(moveStage8(root,'review','skip'),/skip/);
  await moveStage8(root,'writing','图集完成；一次集中处理重叠');
  await assert.rejects(assertStage8(root,['review']),/requires/);
  await writeFile(join(root,'figures/a.pdf'),'unexpected-change');
  await assert.rejects(moveStage8(root,'review','draft'),/Stable artifact changed/);
  await moveStage8(root,'figures','补齐门禁凭证');
  await assert.rejects(moveStage8(root,'writing','unrepaired artifact'),/Stable artifact changed/);
  await moveStage8(root,'figures','严重标签遮挡',['figures/a.pdf'],['关键标签不可读'],['figures/a.pdf']);
  await writeFile(join(root,'figures/b.pdf'),'unrelated-redraw');
  await assert.rejects(moveStage8(root,'writing','fixed'),/Stable artifact changed/);
  await writeFile(join(root,'figures/b.pdf'),'original-b');
  await moveStage8(root,'writing','仅修a');
  await writeFile(join(root,'paper/main.tex'),'standard template content');await writeFile(join(root,'paper/main.pdf'),'candidate');
  await writeFile(join(root,'paper/hajimi-paper-config.json'),JSON.stringify({mainTex:'paper/main.tex',finalPdf:'paper/main.pdf'}));
  await moveStage8(root,'review','已按写作标准完成编译');await assertStage8(root,['review']);
  await assert.rejects(moveStage8(root,'ready','still severe',undefined,['missing section']),/Resolve severe/);
  await writeFile(join(root,'paper/main.pdf'),'changed after review');
  await assert.rejects(assertStage8(root,['review']),/Stable artifact changed/);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('review can reopen writing and figures to repair missing prerequisites, then finish in order', async () => {
 const root=await mkdtemp(join(tmpdir(),'hajimi-stage8-repair-'));
 try {
  for(const dir of ['.hajimi','figures','paper'])await mkdir(join(root,dir));
  await writeFile(join(root,'figures/a.pdf'),'a');
  await writeFile(join(root,'FIGURE_PLAN.json'),JSON.stringify({figures:[{outputs:['figures/a.pdf']}]}));
  await writeFile(join(root,'paper/hajimi-paper-config.json'),'{}');
  await writeFile(join(root,'paper/main.tex'),'tex');await writeFile(join(root,'paper/main.pdf'),'pdf');
  await moveStage8(root,'writing','figures complete');await moveStage8(root,'review','draft complete');
  await assert.rejects(moveStage8(root,'ready','missing audit'));
  await rm(join(root,'paper/main.tex'));
  await moveStage8(root,'writing','补齐缺少的公式凭证');
  await assertStage8(root,['writing']);
  await assert.rejects(moveStage8(root,'review','not repaired'));
  await writeFile(join(root,'paper/main.tex'),'repaired tex');
  await moveStage8(root,'review','paper repaired');
  await rm(join(root,'figures/a.pdf'));
  await moveStage8(root,'figures','补齐缺失产物',undefined,[],['figures/a.pdf','figures/new.pdf']);
  await assertStage8(root,['figures']);
  await assert.rejects(moveStage8(root,'review','skip writing'),/skip/);
  await writeFile(join(root,'figures/a.pdf'),'a repaired');await writeFile(join(root,'figures/new.pdf'),'new');
  await writeFile(join(root,'FIGURE_PLAN.json'),JSON.stringify({figures:[{outputs:['figures/a.pdf','figures/new.pdf']}]}));
  await moveStage8(root,'writing','prerequisites repaired');await moveStage8(root,'review','recompiled');
  await writeFile(join(root,'.hajimi/validation.json'),JSON.stringify({passed:true,strict:true}));
  await moveStage8(root,'ready','audit passed');
  await moveStage8(root,'review','补齐审查凭证');
  await assertStage8(root,['review']);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('phase policy preserves template and balances expressive fusion and composite design',async()=>{
 const card=await readFile('compatibility/v010/bundled/workflows/modeling-core/1.0.0/stage-cards/8.md','utf8');
 assert.match(card,/物理工程图保留当前配色/);assert.match(card,/批注方框统一白底/);
 assert.match(card,/完全不处理论文里的浮动位置/);assert.match(card,/一次轻量|整体浏览.*一次/);
 assert.match(card,/单个图表占页较大本身允许通过/);assert.match(card,/结构性空白指/);
 const profile=await readFile('compatibility/v010/bundled/capabilities/modeling-plot-suite/1.0.0/profiles/expressive.md','utf8');
 assert.match(profile,/不能只换鲜艳颜色/);assert.match(profile,/融合图/);assert.match(profile,/一套坐标轴/);assert.match(profile,/多面板组合图仍值得鼓励/);assert.match(profile,/不默认多面板优先/);
 const rules=await readFile('compatibility/v010/bundled/capabilities/modeling-paper-standard/1.0.0/resources/references/requirements-contract.md','utf8');
 assert.match(rules,/22--30|22—30/);
});
