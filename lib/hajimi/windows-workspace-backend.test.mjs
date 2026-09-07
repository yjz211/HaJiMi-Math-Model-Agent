import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,mkdir,writeFile,readFile,rm,symlink,link,truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WindowsWorkspaceBackend } from './windows-workspace-backend.mjs';
async function setup(t){const base=await mkdtemp(join(tmpdir(),'hajimi-files-'));t.after(()=>rm(base,{recursive:true,force:true}));const root=join(base,'中文 空格 任务');const readonly=join(base,'guidance');await mkdir(root);await mkdir(readonly);return {base,root,readonly,b:new WindowsWorkspaceBackend(root,{productRoot:base,readonlyRoots:[readonly]})};}
test('native file operations preserve Chinese/space paths and UTF-8',async t=>{
 const {root,b}=await setup(t);await b.writeFile(join(root,'结果 目录','计算.txt'),'中文 α = 3\n');assert.equal((await b.readFile(join(root,'结果 目录','计算.txt'))).toString(),'中文 α = 3\n');assert.deepEqual(await b.list(root),['结果 目录/']);
 await b.writeFile(join(root,'结果 目录','计算.txt'),'替换');assert.equal(await readFile(join(root,'结果 目录','计算.txt'),'utf8'),'替换');
});
test('frozen inputs and metadata are protected case-insensitively',async t=>{
 const {root,b}=await setup(t);await mkdir(join(root,'input'));await writeFile(join(root,'input','problem.txt'),'input');assert.equal((await b.readFile(join(root,'input','problem.txt'))).toString(),'input');
 for(const dir of ['input','Input','.hajimi','.HAJIMI'])await assert.rejects(b.writeFile(join(root,dir,'bad.txt'),'bad'));
 await assert.rejects(b.readFile(join(root,'.hajimi','state.json')));
});
test('guidance is read-only and paths outside both roots are rejected',async t=>{
 const {base,root,readonly,b}=await setup(t);await writeFile(join(readonly,'guide.txt'),'guide');assert.equal((await b.readFile(join(readonly,'guide.txt'))).toString(),'guide');await assert.rejects(b.writeFile(join(readonly,'guide.txt'),'bad'));assert.throws(()=>b.resolveHostPath('../outside'));await assert.rejects(b.writeFile(join(base,'outside'),'bad'));
});
test('symlink/junction escapes and hard links are rejected',async t=>{
 const {base,root,b}=await setup(t);const external=join(base,'external');await mkdir(external);await writeFile(join(external,'data'),'protected');
 try{await symlink(external,join(root,'linked'),process.platform==='win32'?'junction':'dir');}catch(e){if(e.code==='EPERM'){t.skip('Link privilege unavailable');return;}throw e;}
 await assert.rejects(b.readFile(join(root,'linked','data')));await assert.rejects(b.writeFile(join(root,'linked','data'),'bad'));await link(join(external,'data'),join(root,'hard'));await assert.rejects(b.writeFile(join(root,'hard'),'bad'));assert.equal(await readFile(join(external,'data'),'utf8'),'protected');
});
test('oversized reads fail rather than silently truncating',async t=>{
 const {root,b}=await setup(t);const path=join(root,'large');await writeFile(path,'');await truncate(path,64*1024*1024+1);await assert.rejects(b.readFile(path),/64 MiB/);
});
