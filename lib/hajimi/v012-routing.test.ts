import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHajimiCoreFactory, usesOriginalWorkflow } from "./core-extension.ts";
import { ensureHajimiTask } from "./task-state.ts";
import { interactionFor } from "./interaction.ts";
import { writeWorkflowStateAtomic } from "./workflow-store.ts";
import { HAJIMI_IDENTITY_KERNEL as originalIdentity } from "../../compatibility/v010/lib/hajimi/context-projector.ts";
import { HAJIMI_IDENTITY_KERNEL as leanIdentity } from "./context-projector.ts";
import { hajimiToolsForStage } from "../../compatibility/v010/lib/hajimi/core-extension.ts";
import { readStage8 } from "./stage8-phases.ts";
import { hajimiResourceLoaderOptions } from "./resources.ts";
import { markNewWindowsWorkspace } from "./workspace-backend-factory.ts";

test("runtime selects intact 0.10 for strict and for both stage eights, in the same session", async () => {
 const cwd=await mkdtemp(join(tmpdir(),'hajimi-v012-route-'));
 const handlers=new Map<string,(...args: unknown[])=>unknown>();
 const tools=new Map<string,{description:string;execute(id:string,args:unknown):Promise<unknown>}>();
 const pi={registerTool(tool: {name:string;description:string;execute(id:string,args:unknown):Promise<unknown>}){tools.set(tool.name,tool);},
  on(name:string,handler:(...args:unknown[])=>unknown){handlers.set(name,handler);},sendMessage(){}} as unknown as ExtensionAPI;
 try {
  await markNewWindowsWorkspace(cwd);
  let state=(await ensureHajimiTask(cwd)).state;
  state.interaction={...interactionFor(state),mode:'supervised',executionPolicy:'lean'};
  state.focus.stage=2;await writeWorkflowStateAtomic(cwd,state);
  createHajimiCoreFactory({cwd,productRoot:process.cwd()})(pi);
  const prompt=async()=>await handlers.get('before_agent_start')!({systemPrompt:'Base'}) as {systemPrompt:string};
  assert.ok((await prompt()).systemPrompt.includes(leanIdentity));
  assert.match(tools.get('hajimi_set_milestone')!.description,/actual output/);
  await handlers.get('input')!({source:'rpc',text:'严格清单门禁型'});
  state=(await ensureHajimiTask(cwd)).state;
  assert.equal(state.interaction?.executionPolicy,'strict');
  assert.ok((await prompt()).systemPrompt.includes(originalIdentity));
  assert.equal(tools.get('hajimi_set_milestone')!.description,'Update one 0-9 milestone without flattening the dynamic micro-plan.');
  state=(await ensureHajimiTask(cwd)).state;
  await assert.rejects(tools.get('hajimi_set_requirement')!.execute('no-evidence',{
   expectedRevision:state.revision,stage:2,requirementId:'data_and_sources',status:'satisfied',evidenceRefs:[]}),/must cite evidence/);
  await handlers.get('input')!({source:'rpc',text:'清爽快速运行型'});
  assert.ok((await prompt()).systemPrompt.includes(leanIdentity));
  state=(await ensureHajimiTask(cwd)).state;state.focus.stage=8;
  await writeWorkflowStateAtomic(cwd,state);
  assert.ok((await prompt()).systemPrompt.includes(originalIdentity));
  const resources=hajimiResourceLoaderOptions({cwd,agentDir:cwd,productRoot:process.cwd(),extensionFactories:[]});
  assert.ok(resources.additionalSkillPaths?.every(path=>path.includes(join('compatibility','v010'))));
  const originalReference=join(process.cwd(),'compatibility/v010/bundled/capabilities/modeling-plot-suite/1.0.0/resources/references/paper-figure.md');
  const oldSkillPath=join(process.cwd(),'bundled/capabilities/modeling-plot-suite/1.0.0/resources/references/paper-figure.md');
  const read=await tools.get('read')!.execute('cached-path',{path:oldSkillPath,limit:4}) as {content:Array<{text:string}>};
  assert.ok(read.content[0].text.includes((await readFile(originalReference,'utf8')).split('\n')[1]));
  await assert.rejects(tools.get('hajimi_set_milestone')!.execute('premature',{
   expectedRevision:state.revision,stage:8,status:'satisfied'}),/requires ready/);
  for(const name of ['hajimi_record_experiment','hajimi_record_evidence','hajimi_record_claim','hajimi_freeze_evidence'])
   assert.ok(hajimiToolsForStage(8).includes(name));
 } finally {await rm(cwd,{recursive:true,force:true});}
});

for(const policy of ['lean','strict'] as const)test(`${policy} stage8 tool reopens review for missing prerequisites and cannot skip forward`,async()=>{
 const cwd=await mkdtemp(join(tmpdir(),'hajimi-v012-repair-'));
 const tools=new Map<string,{execute(id:string,args:unknown):Promise<unknown>}>();
 const pi={registerTool(tool:{name:string;execute(id:string,args:unknown):Promise<unknown>}){tools.set(tool.name,tool);},on(){}} as unknown as ExtensionAPI;
 try {
  const state=(await ensureHajimiTask(cwd)).state;state.focus.stage=8;
  state.interaction={...interactionFor(state),mode:'supervised',executionPolicy:policy};
  await writeWorkflowStateAtomic(cwd,state);
  await mkdir(join(cwd,'figures'),{recursive:true});
  await writeFile(join(cwd,'figures/a.pdf'),'unchanged figure');
  await writeFile(join(cwd,'paper/main.tex'),'draft');await writeFile(join(cwd,'paper/main.pdf'),'draft pdf');
  await writeFile(join(cwd,'paper/hajimi-paper-config.json'),'{}');
  await writeFile(join(cwd,'FIGURE_PLAN.json'),JSON.stringify({figures:[{outputs:['figures/a.pdf']}]}));
  createHajimiCoreFactory({cwd,productRoot:process.cwd()})(pi);
  const phase=(phase:string,note:string)=>tools.get('hajimi_stage8_phase')!.execute('phase',{phase,note});
  await phase('writing','figures complete');await phase('review','draft complete');
  await rm(join(cwd,'paper/main.tex'));
  await phase('writing','补齐公式凭证');
  assert.equal((await readStage8(cwd)).phase,'writing');
  await assert.rejects(phase('ready','skip review'),/skip/);
  await assert.rejects(phase('review','still missing'));
  await writeFile(join(cwd,'paper/main.tex'),'formulas repaired');
  await phase('review','recompiled');
  assert.equal((await readStage8(cwd)).phase,'review');
  assert.equal(await readFile(join(cwd,'figures/a.pdf'),'utf8'),'unchanged figure');
  await assert.rejects(phase('ready','missing delivery validation'));
 } finally {await rm(cwd,{recursive:true,force:true});}
});

test('only strict policy and stage8 select the original runtime',()=>{
 for(const executionPolicy of ['lean','strict'] as const)for(let stage=0;stage<=9;stage++) {
  assert.equal(usesOriginalWorkflow({focus:{stage:stage as 0,questionId:null},interaction:{mode:'supervised',executionPolicy} as never}),executionPolicy==='strict'||stage===8);
 }
});
