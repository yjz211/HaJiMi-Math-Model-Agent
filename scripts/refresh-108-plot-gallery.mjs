import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve('.'),out=join(root,'artifacts/plot108-20260910');
const catalog=JSON.parse(await readFile(join(out,'catalog.json'),'utf8'));
const adopted=new Map(process.argv.filter(x=>x.startsWith('--adopt=')).map(x=>x.slice(8).split(':')));
const states={};let refresh=Promise.resolve();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
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
await gallery();
