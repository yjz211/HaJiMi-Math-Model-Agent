import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve('.'), out=join(root,'artifacts/plot108-20260910');
await mkdir(out,{recursive:true});
const pidPath=join(out,'controller.pid');
try {const pid=Number(await readFile(pidPath,'utf8'));try{if(pid>0){process.kill(pid,0);throw new Error(`Controller ${pid} already active`);}}catch(e){if(e.code!=='ESRCH')throw e;}}catch(e){if(e.code!=='ENOENT')throw e;}
await writeFile(pidPath,String(process.pid));
const catalog=JSON.parse(await readFile(join(out,'catalog.json'),'utf8'));
async function readJSON(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch{return fallback;}}
async function gallery(){
 let count=0; const rows=[];let index='# 108组合成数据绘图图册\n\n全部为合成数据；图形由HaJiMi自行选择。模型自报通过不等于独立视觉验收。每图保留首图/最终图、生成器、修复记录和事件轨迹。\n\n';
 for(let b=1;b<=18;b++){
  const tag=String(b).padStart(2,'0'), cwd=join(root,`projects/plot108-20260910/batch-${tag}`), trace=join(out,`batch-${tag}`);
  const result=await readJSON(join(cwd,'RESULTS.json'),{});const run=await readJSON(join(trace,'run-result.json'),{});
  const files=await readdir(join(cwd,'figures')).catch(()=>[]);
  const snapshots=(await readFile(join(trace,'snapshots.jsonl'),'utf8').catch(()=>'')).split('\n').filter(Boolean).map(l=>{try{return JSON.parse(l)}catch{return null}}).filter(Boolean);
  let page=`# 第${b}批\n\n[后端记录](${join(cwd,'BACKEND_RESULT.md').replaceAll('\\','/')})\n\n`;
  let batchCount=0;
  for(const item of catalog.filter(x=>x.batch===b)){
   const png=`fig_${item.id}.png`;const present=files.includes(png)&&files.includes(`fig_${item.id}.pdf`)&&files.includes(`gen_${item.id}.py`);if(present){count++;batchCount++;}
   const rec=result.figures?.find(x=>x.id===item.id);const versions=snapshots.filter(x=>x.file===`figures/${png}`);
   rows.push({id:item.id,batch:b,outputsComplete:present,modelStatus:rec?.status??'pending',reportedRepairRounds:rec?.repairRounds??null,pngVersions:versions.length,recipeIds:rec?.recipeIds??[],issues:rec?.issues??[]});
   page+=`## ${item.id}\n\n${item.question}\n\n状态：${rec?.status??(present?'待记录':'待生成')}；模型记录修复：${rec?.repairRounds??'—'}轮；PNG版本：${versions.length}。\n\n`;
   if(files.includes(png))page+=`最终图：\n\n![${item.id}](${join(cwd,'figures',png).replaceAll('\\','/')})\n\n[PDF](${join(cwd,'figures',`fig_${item.id}.pdf`).replaceAll('\\','/')}) · [生成器](${join(cwd,'figures',`gen_${item.id}.py`).replaceAll('\\','/')})\n\n`;
   if(versions.length>1)page+=`首轮图：\n\n![${item.id}首轮](${join(trace,versions[0].snapshot).replaceAll('\\','/')})\n\n`;
   if(rec?.summary)page+=rec.summary+'\n\n';if(rec?.issues?.length)page+='未解决项：'+rec.issues.join('；')+'\n\n';
  }
  await writeFile(join(out,`gallery-${tag}.md`),page);
  index+=`- [第${b}批：${batchCount}/6套产物](${join(out,`gallery-${tag}.md`).replaceAll('\\','/')})；后端状态：${run.reason??'未完成'}\n`;
 }
 index+=`\n已保存完整产物 **${count}/108**。更新时间：${new Date().toISOString()}\n`;
 await writeFile(join(out,'GALLERY.md'),index);await writeFile(join(out,'progress.json'),JSON.stringify({updatedAt:new Date().toISOString(),completeOutputs:count,total:108,figures:rows},null,2));return count;
}
try {
 for(let b=1;b<=18;b++){
  const tag=String(b).padStart(2,'0'), cwd=join(root,`projects/plot108-20260910/batch-${tag}`), trace=join(out,`batch-${tag}`);
  await mkdir(trace,{recursive:true});
  const prior=await readJSON(join(trace,'run-result.json'),{});if(prior.reason==='completed'){console.log('skip completed batch',tag);await gallery();continue;}
  const resume=(await readdir(join(cwd,'sessions')).catch(()=>[])).some(x=>x.endsWith('.jsonl'));
  console.log(new Date().toISOString(),'START',tag,resume?'resume':'new');await writeFile(join(out,'controller-status.json'),JSON.stringify({pid:process.pid,batch:b,status:'running',updatedAt:new Date().toISOString()}));
  const args=['scripts/run-108-plot-batch.mjs','--run',`--batch=${tag}`,...(resume?['--resume']:[])];
  const child=spawn(process.execPath,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe'],windowsHide:true});
  let log='';for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{const s=b.toString();log+=s;process.stdout.write(s);});
  const timer=setInterval(()=>{gallery().catch(e=>console.error('gallery',e.message))},60000);
  const code=await new Promise((ok,bad)=>{child.on('error',bad);child.on('close',ok)});clearInterval(timer);
  await writeFile(join(trace,'controller-child.log'),log);await gallery();console.log('END',tag,code);
  if(code!==0){await writeFile(join(out,'controller-status.json'),JSON.stringify({pid:process.pid,batch:b,status:'needs-attention',exitCode:code}));throw new Error(`Batch ${tag} failed; resume after investigating`);}
 }
 const complete=await gallery();await writeFile(join(out,'controller-status.json'),JSON.stringify({status:'finished',completeOutputs:complete,total:108,finishedAt:new Date().toISOString()}));
} finally {await writeFile(pidPath,'0');}
