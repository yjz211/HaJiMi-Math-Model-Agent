import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import { extractRuntimeArchive, safeArchivePath, validateFiles } from './runtime-archive.mjs';
const hash = b => createHash('sha256').update(b).digest('hex');
function tar(entries) {
  const output = [];
  for (const { name, bytes = Buffer.from('data'), type = '0' } of entries) {
    const header = Buffer.alloc(512);
    header.write(name, 0, 100, 'utf8'); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(bytes.length.toString(8).padStart(11, '0')+'\0', 124); header.write('00000000000\0', 136); header.fill(32, 148, 156);
    header.write(type, 156); header.write('ustar\0', 257); header.write('00', 263);
    const sum = header.reduce((a,b)=>a+b,0); header.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
    output.push(header, bytes, Buffer.alloc((512-bytes.length%512)%512));
  }
  return Buffer.concat([...output, Buffer.alloc(1024)]);
}
async function fixture(t, entries, files) {
  const root = await mkdtemp(join(tmpdir(), 'hajimi-tar-')); t.after(()=>rm(root,{recursive:true,force:true}));
  const archive=join(root,'payload.tar.gz'), destination=join(root,'destination'); await mkdir(destination);
  await writeFile(archive, gzipSync(tar(entries)));
  const records=files ?? entries.map(e=>({path:e.name,size:(e.bytes??Buffer.from('data')).length,sha256:hash(e.bytes??Buffer.from('data'))}));
  return { archive,destination,records };
}
for (const value of ['../escape','/absolute','C:/absolute','a\\..\\b','a:stream','a/./b','a//b','NUL.txt','a/COM1','a/LPT9.log','foo.','a/space ','a\0b','a?b']) {
  test(`archive rejects Windows/path escape ${JSON.stringify(value)}`,()=>assert.throws(()=>safeArchivePath(value)));
}
test('case collisions and file/directory collisions are rejected',()=>{
  const rec=path=>({path,size:1,sha256:hash('x')});
  assert.throws(()=>validateFiles([rec('A'),rec('a')])); assert.throws(()=>validateFiles([rec('a'),rec('a/b')]));
});
test('extract exact regular files including Unicode and spaces',async t=>{
  const f=await fixture(t,[{name:'support/中文 文件.txt',bytes:Buffer.from('数学建模')},{name:'empty',bytes:Buffer.alloc(0)}]);
  await extractRuntimeArchive(f.archive,f.destination,f.records);
  assert.equal(await readFile(join(f.destination,'support','中文 文件.txt'),'utf8'),'数学建模');
});
for (const type of ['1','2','3','4','5','6','x','g','L']) test(`tar entry type ${type} is rejected`,async t=>{
  const f=await fixture(t,[{name:'file',type}]); await assert.rejects(extractRuntimeArchive(f.archive,f.destination,f.records));
});
test('archive hash mismatch is rejected before activation',async t=>{
  const f=await fixture(t,[{name:'file'}]); f.records[0].sha256=hash('other'); await assert.rejects(extractRuntimeArchive(f.archive,f.destination,f.records),/hash mismatch/);
});
test('unlisted and duplicate archive entries are rejected',async t=>{
  const f=await fixture(t,[{name:'file'},{name:'file'}],[{path:'file',size:4,sha256:hash('data')}]); await assert.rejects(extractRuntimeArchive(f.archive,f.destination,f.records),/Unexpected/);
});
test('missing entries and truncated gzip are rejected',async t=>{
  const f=await fixture(t,[{name:'file'}]); f.records.push({path:'missing',size:1,sha256:hash('x')}); await assert.rejects(extractRuntimeArchive(f.archive,f.destination,f.records),/Missing/);
  const g=await fixture(t,[{name:'file'}]); const bytes=await readFile(g.archive); await writeFile(g.archive,bytes.subarray(0,bytes.length-8)); await assert.rejects(extractRuntimeArchive(g.archive,g.destination,g.records));
});
test('pre-cancelled extraction creates no files',async t=>{
  const f=await fixture(t,[{name:'file'}]); const controller=new AbortController(); controller.abort();
  await assert.rejects(extractRuntimeArchive(f.archive,f.destination,f.records,controller.signal));
  await assert.rejects(readFile(join(f.destination,'file')),{code:'ENOENT'});
});
