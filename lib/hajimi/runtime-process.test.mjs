import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp,writeFile,rm,chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { runInJob,acquireInstallLock,executionEnvironment } from './runtime-process.mjs';
const native=process.env.HAJIMI_TEST_JOB_HOST;
async function helper(t){
 if(process.platform==='win32'){if(!native||!existsSync(native)){t.skip('Build job-host.exe and set HAJIMI_TEST_JOB_HOST');return null;}return native;}
 const dir=await mkdtemp(join(tmpdir(),'hajimi-runner-shim-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'helper');await writeFile(path,'#!/bin/sh\nshift\nexec "$@"\n');await chmod(path,0o755);return path;
}
const env=()=>({...process.env});
test('managed Python preserves normal script imports but excludes ambient paths and user site',{skip:process.platform!=='win32'},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'hajimi-env-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const saved=process.env.PYTHONPATH;process.env.PYTHONPATH='C:\\untrusted-python';
 try {
  const root=join(dir,'runtime'), toolkitRoot=join(dir,'toolkit'), capabilitiesRoot=join(dir,'capabilities');
  const actual=await executionEnvironment({root,manifest:{tools:{python:'python/python.exe',xelatex:'tex/bin/xelatex.exe'}}},{cacheRoot:join(dir,'cache'),cwd:dir,toolkitRoot,capabilitiesRoot});
  const packages=join(dir,'cache','python-packages','default');
  assert.deepEqual(actual.PYTHONPATH.split(';'),[join(root,'support'),packages,toolkitRoot,join(capabilitiesRoot,'modeling-plot-suite','1.0.0','resources','scripts')]);
  assert.equal(actual.PIP_TARGET,packages.replaceAll('\\','/'));
  assert.equal(actual.PYTHONDONTWRITEBYTECODE,'1');
  assert.equal(actual.PYTHONSAFEPATH,undefined);assert.equal(actual.PYTHONNOUSERSITE,'1');
  assert.equal(actual.XE_FONTCONFIG_PATH,join(root,'support').replaceAll('\\','/'));
  assert.equal(actual.XE_FC_CACHEDIR,join(dir,'cache','fontconfig').replaceAll('\\','/'));
  assert.equal(actual.NODE_OPTIONS,undefined);assert.equal(actual.OPENAI_API_KEY,undefined);
 } finally {if(saved===undefined)delete process.env.PYTHONPATH;else process.env.PYTHONPATH=saved;}
});
test('runner preserves exit code and complete UTF-8 output (portable shim is NOT a Windows Job test)',async t=>{
 const h=await helper(t);if(!h)return;const r=await runInJob(h,process.execPath,['-e','process.stdout.write("中文输出");process.exitCode=7'],{env:env(),timeoutSeconds:5});assert.equal(r.exitCode,7);assert.equal(r.stdout.toString(),'中文输出');
});
test('runner rejects pre-cancel without spawning',async()=>{
 const c=new AbortController();c.abort();await assert.rejects(runInJob('nonexistent','nonexistent',[],{signal:c.signal,timeoutSeconds:1}),e=>e.code==='ABORTED');
});
test('runner bounds output and marks overflow as failure, not success',async t=>{
 const h=await helper(t);if(!h)return;await assert.rejects(runInJob(h,process.execPath,['-e','process.stdout.write("x".repeat(100000));setInterval(()=>{},1000)'],{env:env(),maxBytes:1024,timeoutSeconds:5}),e=>e.code==='OUTPUT_LIMIT'&&e.result.stdout.length+e.result.stderr.length<=1024);
});
test('runner timeout and cancellation settle',async t=>{
 const h=await helper(t);if(!h)return;await assert.rejects(runInJob(h,process.execPath,['-e','setInterval(()=>{},1000)'],{env:env(),timeoutSeconds:0.1}),e=>e.code==='TIMEOUT');
 const c=new AbortController();setTimeout(()=>c.abort(),100);await assert.rejects(runInJob(h,process.execPath,['-e','setInterval(()=>{},1000)'],{env:env(),signal:c.signal,timeoutSeconds:5}),e=>e.code==='ABORTED');
});
test('Windows argv quoting preserves spaces, Unicode, quotes and trailing slashes',{skip:process.platform!=='win32'},async t=>{
 const h=await helper(t);if(!h)return;const args=['中文 空格','a"b','tail\\','a&b|%PATH%!'];const r=await runInJob(h,process.execPath,['-e','console.log(JSON.stringify(process.argv.slice(1)))',...args],{env:env()});assert.deepEqual(JSON.parse(r.stdout.toString()),args);
});
test('Windows install locks exclude a concurrent holder and release after close',{skip:process.platform!=='win32'},async t=>{
 const h=await helper(t);if(!h)return;const dir=await mkdtemp(join(tmpdir(),'hajimi-lock-'));t.after(()=>rm(dir,{recursive:true,force:true}));const path=join(dir,'install.lock');const first=await acquireInstallLock(h,path);
 try{await assert.rejects(acquireInstallLock(h,path),e=>e.code==='BUSY');}finally{await first();}const second=await acquireInstallLock(h,path);await second();
});
test('Windows Job cancellation kills descendants',{skip:process.platform!=='win32'},async t=>{
 const h=await helper(t);if(!h)return;let pid;const c=new AbortController();
 const code='const {spawn}=require("node:child_process"); const c=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore",detached:true});console.log(c.pid);setInterval(()=>{},1000);';
 await assert.rejects(runInJob(h,process.execPath,['-e',code],{env:env(),signal:c.signal,onData:b=>{const n=Number(b.toString().trim());if(n){pid=n;c.abort();}},timeoutSeconds:5}));
 assert.ok(pid);await new Promise(r=>setTimeout(r,250));assert.throws(()=>process.kill(pid,0));
});

test('bundled Draw.io is discoverable without ambient tools', {skip:process.platform!=='win32'}, async t=>{
 const dir=await mkdtemp(join(tmpdir(),'hajimi-drawio-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const {mkdir}=await import('node:fs/promises');
 const productRoot=join(dir,'product with spaces');
 const drawio=join(productRoot,'runtime','windows','drawio','draw.io.exe');
 await mkdir(join(productRoot,'runtime','windows','drawio'),{recursive:true});await writeFile(drawio,'fixture');
 const actual=await executionEnvironment({root:join(dir,'runtime'),manifest:{tools:{python:'python/python.exe',xelatex:'tex/bin/xelatex.exe'}}},{cacheRoot:join(dir,'cache'),cwd:dir,productRoot});
 assert.equal(actual.DRAWIO_PATH,drawio.replaceAll('\\','/'));
 assert.equal(JSON.parse(actual.HAJIMI_RUNTIME_TOOLS).drawio,drawio);
 assert.ok(actual.PATH.startsWith(join(productRoot,'runtime','windows','drawio')+';'));
 assert.equal(actual.ELECTRON_RUN_AS_NODE,undefined);
});
