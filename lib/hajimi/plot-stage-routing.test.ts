import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createHajimiCoreFactory, hajimiToolsForStage } from "./core-extension.ts";
import { hajimiToolsForStage as strictTools } from "../../compatibility/v010/lib/hajimi/core-extension.ts";
import { routeCapabilities } from "./capability-router.ts";
import { routeCapabilities as strictRoute } from "../../compatibility/v010/lib/hajimi/capability-router.ts";
import { ensureHajimiTask } from "./task-state.ts";
import { interactionFor } from "./interaction.ts";
import { writeWorkflowStateAtomic } from "./workflow-store.ts";
import { checkStageCompletion } from "./completion-checks.ts";

for (const policy of ["lean", "strict"] as const) test(`${policy}: plotting is deferred until stage8 without changing the planning tool`, async () => {
 const cwd=await mkdtemp(join(tmpdir(),'hajimi-plot-stage-'));
 const tools=new Map<string,{execute(id:string,args:unknown):Promise<unknown>}>();
 const pi={registerTool(tool:{name:string;execute(id:string,args:unknown):Promise<unknown>}){tools.set(tool.name,tool);},on(){}} as unknown as ExtensionAPI;
 try {
  const state=(await ensureHajimiTask(cwd)).state;
  state.focus.stage=7;state.interaction={...interactionFor(state),mode:'supervised',executionPolicy:policy};
  await writeWorkflowStateAtomic(cwd,state);
  const route=policy==='strict'?strictRoute:routeCapabilities;
  const productRoot=policy==='strict'?join(process.cwd(),'compatibility/v010'):process.cwd();
  const available=policy==='strict'?strictTools:hajimiToolsForStage;
  const before=await route({state,productRoot,stage:7});
  assert.ok(!before.decisions.some(item=>item.capabilityId==='modeling-plot-suite'));
  assert.ok(!before.fragments.some(item=>item.capabilityId==='modeling-plot-suite'));
  assert.ok(!available(7).includes('hajimi_validate_figure_plan'));
  createHajimiCoreFactory({cwd,productRoot:process.cwd()})(pi);
  const plan=tools.get('hajimi_validate_figure_plan')!;
  await assert.rejects(plan.execute('too-early',{action:'begin'}),/starts at stage 8/);
  await assert.rejects(readFile(join(cwd,'.hajimi/figure-plan-policy.json')), {code:'ENOENT'});
  // Existing unfinished plan files do not force planning back into stage7.
  await writeFile(join(cwd,'work/results.md'),'Verified modeling results');
  await writeFile(join(cwd,'FIGURE_PLAN.json'),'unfinished old plan');
  if(policy==='lean')await checkStageCompletion(cwd,state,7,['work/results.md']);
  state.focus.stage=8;await writeWorkflowStateAtomic(cwd,state);
  const after=await route({state,productRoot,stage:8});
  assert.ok(after.decisions.some(item=>item.capabilityId==='modeling-plot-suite'));
  assert.ok(after.fragments.some(item=>item.capabilityId==='modeling-plot-suite'));
  assert.ok(available(8).includes('hajimi_validate_figure_plan'));
  await plan.execute('begin-after-style-selection',{action:'begin'});
  const planning=JSON.parse(await readFile(join(cwd,'.hajimi/figure-plan-policy.json'),'utf8'));
  assert.equal(planning.required,true);assert.equal(planning.planHash,undefined);
  await assert.rejects(plan.execute('incomplete-plan',{action:'validate'}));
  assert.equal(await readFile(join(cwd,'FIGURE_PLAN.json'),'utf8'),'unfinished old plan');
 }finally{await rm(cwd,{recursive:true,force:true});}
});
