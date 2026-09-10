import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root=resolve('.'), trace=join(root,'artifacts/seven-synthetic-20260909'), cwd=join(root,'projects/seven-synthetic-20260909');
const rows=(await readFile(join(trace,'events.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
const tools=new Map(), errors=[], messages=[];
for(let index=0;index<rows.length;index++) {
  const row=rows[index];
  if(row.type==='tool_execution_start')tools.set(row.id,row);
  if(row.type==='message_end')messages.push(row);
  if(row.isError)errors.push({line:index+1,time:row.time,tool:row.tool,args:tools.get(row.id)?.args,
    message:row.result?.filter(item=>item.type==='text').map(item=>item.text).join('\n')});
}
const catalog=JSON.parse(await readFile(join(cwd,'DATA_CATALOG.json'),'utf8'));
const hashes=await Promise.all(catalog.datasets.map(async item=>({id:item.id,unchanged:createHash('sha256').update(await readFile(join(cwd,item.path))).digest('hex')===item.sha256})));
const metadata=JSON.parse(await readFile(join(cwd,'.codex-plot-runtime.json'),'utf8'));
const files=await Promise.all((await readdir(join(cwd,'figures'))).filter(name=>/\.(pdf|png|py)$/.test(name)).map(async name=>({name,bytes:(await stat(join(cwd,'figures',name))).size})));
const summary={started:rows[0].time,latest:rows.at(-1).time,assistantTurns:messages.length,toolCalls:tools.size,
  totalTokens:messages.reduce((sum,row)=>sum+(row.usage?.totalTokens||0),0),errors,dataIntegrity:hashes,
  actualRuntimeSkill:metadata.runtime_skill,hasStableRegistry:await stat(join(metadata.runtime_skill,'assets/shared-scripts/recipe_registry.json')).then(()=>true,()=>false),files};
await writeFile(join(trace,'observer-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify({assistantTurns:summary.assistantTurns,toolCalls:summary.toolCalls,errorCount:errors.length,files:files.length,dataUnchanged:hashes.every(x=>x.unchanged)}));
