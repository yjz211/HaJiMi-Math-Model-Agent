import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp,mkdir,writeFile,rm,link } from 'node:fs/promises';
import { join,dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { allowedUrl,decodeRelease,isSupportedWindowsHost,MIN_WINDOWS_BUILD,sha256,verifyRuntimeTree,windowsBuildNumber } from './managed-runtime.mjs';
function fixture() {
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const paths=['python/python.exe','shell/usr/bin/bash.exe','texlive/bin/windows/xelatex.exe','support/health.py','support/sitecustomize.py','support/bash-env.sh','support/fonts.conf','fonts/NotoSansCJKsc-Regular.ttf','THIRD_PARTY_NOTICES.json'];
  const files=paths.map(path=>({path,size:4,sha256:sha256('test')}));
  const manifest={format:'hajimi.runtime.v1',abi:1,platform:'win32',arch:'x64',version:'1.0.0',tools:{python:paths[0],bash:paths[1],xelatex:paths[2]},capabilities:{baseline:true,pdfLayout:true},archive:{file:'fixture.tar.gz',size:123,sha256:sha256('fixture')},files};
  const payload=Buffer.from(JSON.stringify(manifest));
  const envelope={keyId:'ephemeral-test-key',payload:payload.toString('base64'),signature:sign(null,payload,privateKey).toString('base64')};
  const trust={keys:{'ephemeral-test-key':publicKey.export({type:'spki',format:'pem'})},downloadOrigins:[]};
  return {manifest,envelope,trust};
}
test('valid Ed25519 fixture is accepted; unknown key and modified payload are rejected',()=>{
  const f=fixture(); assert.equal(decodeRelease(f.envelope,f.trust).manifest.version,'1.0.0');
  assert.throws(()=>decodeRelease(f.envelope,{keys:{}}));
  const bad={...f.envelope,payload:Buffer.from(f.envelope.payload,'base64').toString('utf8').replace('1.0.0','2.0.0')}; bad.payload=Buffer.from(bad.payload).toString('base64');
  assert.throws(()=>decodeRelease(bad,f.trust),/signature/);
});
test('download trust rejects HTTP, credentials, foreign origins and fragments',()=>{
  const origins=['https://runtime.example.invalid'];
  assert.equal(allowedUrl('https://runtime.example.invalid/file',origins).pathname,'/file');
  for(const url of ['http://runtime.example.invalid/file','https://evil.example.invalid/file','https://user:pass@runtime.example.invalid/file','https://runtime.example.invalid/file#x','file:///runtime']) assert.throws(()=>allowedUrl(url,origins));
});
test('Windows runtime gate accepts Windows 11 x64 including the local 22622 host',()=>{
 assert.equal(MIN_WINDOWS_BUILD,22000);
 assert.equal(windowsBuildNumber('10.0.22622'),22622);
 assert.equal(windowsBuildNumber('10.0.26100'),26100);
 assert.equal(isSupportedWindowsHost('win32','x64','10.0.21999'),false);
 assert.equal(isSupportedWindowsHost('win32','x64','10.0.22000'),true);
 assert.equal(isSupportedWindowsHost('win32','x64','10.0.22622'),true);
 assert.equal(isSupportedWindowsHost('win32','x64','not-a-release'),false);
 assert.equal(isSupportedWindowsHost('win32','x64','10.0.26100'),true);
 assert.equal(isSupportedWindowsHost('win32','arm64','10.0.26100'),false);
 assert.equal(isSupportedWindowsHost('linux','x64','10.0.26100'),false);
});
async function tree(t){
 const f=fixture(); const root=await mkdtemp(join(tmpdir(),'hajimi-tree-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const rec of f.manifest.files){const path=join(root,rec.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,'test');}
 return {...f,root};
}
test('complete inventory verifies; changed/missing/extra files do not',async t=>{
 const f=await tree(t);await verifyRuntimeTree(f);
 await writeFile(join(f.root,'python/python.exe'),'evil');await assert.rejects(verifyRuntimeTree(f),/damaged/);
 await writeFile(join(f.root,'python/python.exe'),'test');await writeFile(join(f.root,'extra.dll'),'test');await assert.rejects(verifyRuntimeTree(f),/damaged/);
 await rm(join(f.root,'extra.dll'));await rm(join(f.root,'python/python.exe'));await assert.rejects(verifyRuntimeTree(f),/missing/i);
});
test('hard-linked runtime dependencies are rejected',async t=>{
 const f=await tree(t);await rm(join(f.root,'support/health.py'));await link(join(f.root,'support/sitecustomize.py'),join(f.root,'support/health.py'));await assert.rejects(verifyRuntimeTree(f),/damaged/);
});

test('verification cache is bounded across generations and forced checks detect damage',async t=>{
 const f=await tree(t);
 for(let i=0;i<20;i++) await verifyRuntimeTree({...f,generation:String(i),digest:'fixture'});
 assert.ok(globalThis.__hajimiRuntimeVerificationCache.size<=16);
 await writeFile(join(f.root,'python/python.exe'),'evil');
 await assert.rejects(verifyRuntimeTree({...f,generation:'19',digest:'fixture'},undefined,true),/damaged/);
});
