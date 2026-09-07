// Read-only timing/equivalence probe; no signature or integrity acceptance claim.
import assert from 'node:assert/strict';
import { lstat, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = resolve(process.argv[2]);
async function inventory(batchSize) {
  const entries = [];
  async function walk(dir, prefix = '') {
    const children = await readdir(dir, { withFileTypes: true });
    children.sort((a,b)=>a.name.localeCompare(b.name));
    for(let start=0;start<children.length;start+=batchSize) {
      const batch=children.slice(start,start+batchSize);
      const stats=await Promise.all(batch.map(entry=>lstat(join(dir,entry.name))));
      for(let i=0;i<batch.length;i++) {
        const entry=batch[i],info=stats[i],rel=prefix+entry.name;
        entries.push([rel,info.isDirectory()?'d':info.isFile()?'f':info.isSymbolicLink()?'l':'o',info.size,info.mtimeMs,info.ctimeMs,info.ino,info.dev,info.nlink]);
        if(info.isDirectory())await walk(join(dir,entry.name),rel+'/');
      }
    }
  }
  await walk(root);
  return JSON.stringify(entries);
}
let reference;
for(const batchSize of [1,32,1]) {
  const start=performance.now(),value=await inventory(batchSize);
  if(reference)assert.equal(value,reference,'Inventory changed during probe');
  reference=value;
  console.log(JSON.stringify({batchSize,milliseconds:Math.round(performance.now()-start)}));
}
