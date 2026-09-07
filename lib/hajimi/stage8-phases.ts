import { readFile, writeFile, rename, realpath } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { withTaskLock } from './workflow-store.ts';

export type Stage8Phase = 'figures' | 'writing' | 'review' | 'ready';
interface PhaseState { phase: Stage8Phase; figureHashes?: Record<string,string>; paperHashes?: Record<string,string>; repairPaths?: string[]; history: Array<{phase:Stage8Phase;note:string;at:string}> }
const file = (cwd:string) => join(cwd,'.hajimi/stage8-phases.json');
export async function readStage8(cwd:string):Promise<PhaseState> {
 try { const s=JSON.parse(await readFile(file(cwd),'utf8')); if(!['figures','writing','review','ready'].includes(s.phase)||!Array.isArray(s.history))throw new Error('Invalid stage8 phase state');return s; }
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {phase:'figures',history:[]};throw e;}
}
async function hashes(cwd:string,paths:string[]) {
 const out:Record<string,string>={};const root=await realpath(cwd);
 for(const name of paths){const p=await realpath(resolve(cwd,name));const r=relative(root,p);if(!r||r.startsWith('..')||isAbsolute(r))throw new Error('Artifact must stay inside workspace');const bytes=await readFile(p);if(!bytes.length)throw new Error(`Empty artifact ${name}`);out[name]=createHash('sha256').update(bytes).digest('hex');}
 return out;
}
async function unchanged(cwd:string,expected:Record<string,string>={},except:string[]=[]){
 const names=Object.keys(expected).filter(p=>!except.includes(p)),actual=await hashes(cwd,names);
 for(const name of names)if(actual[name]!==expected[name])throw new Error(`Stable artifact changed: ${name}. Return only the affected work to its phase with a specific severe issue; do not silently redraw.`);
}
export async function assertStage8(cwd:string,allowed:Stage8Phase[]){const s=await readStage8(cwd);if(!allowed.includes(s.phase))throw new Error(`Stage 8 is ${s.phase}; requires ${allowed.join('/')}. Use hajimi_stage8_phase in order.`);if(s.phase!=='figures')await unchanged(cwd,s.figureHashes);if(s.phase==='review'||s.phase==='ready')await unchanged(cwd,s.paperHashes);}
export async function moveStage8(cwd:string,next:Stage8Phase,note:string,figurePaths?:string[],severeIssues:string[]=[],repairPaths:string[]=[]){
 return withTaskLock(cwd,async()=>{
  const s=await readStage8(cwd);if(!note.trim())throw new Error('A short factual phase note is required');
  const order:Stage8Phase[]=['figures','writing','review','ready'];const a=order.indexOf(s.phase),b=order.indexOf(next);
  if(b<a){
   if(!severeIssues.some(x=>x.trim()))throw new Error('Rollback only for a concrete severe issue; record minor issues for human review');
   if(next==='figures'){
    if(!repairPaths.length||repairPaths.some(p=>!s.figureHashes?.[p]))throw new Error('Specify only affected captured figure paths');
    await unchanged(cwd,s.figureHashes,repairPaths);s.repairPaths=repairPaths;
   }else if(next==='writing')await unchanged(cwd,s.figureHashes);
   else throw new Error('Return severe issues to figures or writing');
  }else if(b===a){return s;}
  else if(b!==a+1)throw new Error('Do not skip stage-8 phases');
  else if(next==='writing'){
   let paths=figurePaths;
   try{const plan=JSON.parse(await readFile(join(cwd,'FIGURE_PLAN.json'),'utf8'));const planned=plan.figures.flatMap((f:any)=>f.outputs);paths=[...new Set<string>([...(paths??[]),...planned])];}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   if(!paths?.length)throw new Error('Provide the completed figure set before writing');
   await unchanged(cwd,s.figureHashes,s.repairPaths);s.figureHashes=await hashes(cwd,paths);delete s.repairPaths;
  }else if(next==='review'){
   await unchanged(cwd,s.figureHashes);
   const config=JSON.parse(await readFile(join(cwd,'paper/hajimi-paper-config.json'),'utf8'));
   const paths=[config.mainTex??'paper/main.tex',config.finalPdf??'paper/main.pdf'];s.paperHashes=await hashes(cwd,paths);
  }else{
   if(severeIssues.some(x=>x.trim()))throw new Error('Resolve severe issues before delivery');
   await unchanged(cwd,s.figureHashes);await unchanged(cwd,s.paperHashes);
   const report=JSON.parse(await readFile(join(cwd,'.hajimi/validation.json'),'utf8'));
   if(!report.passed||!report.strict)throw new Error('Run delivery validation in review before marking ready');
  }
  s.phase=next;s.history.push({phase:next,note,severeIssues,at:new Date().toISOString()} as any);
  await writeFile(file(cwd)+'.tmp',JSON.stringify(s,null,2));await rename(file(cwd)+'.tmp',file(cwd));return s;
 });
}
