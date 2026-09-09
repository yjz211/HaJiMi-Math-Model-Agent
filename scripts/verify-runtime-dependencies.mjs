import {loadManagedRuntime,verifyRuntimeTree} from '../lib/hajimi/managed-runtime.mjs';
import {executionEnvironment,checkedHelper,runInJob} from '../lib/hajimi/runtime-process.mjs';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const runtime=await loadManagedRuntime(process.cwd());const cwd=join(process.env.HAJIMI_RUNTIME_HOME,'cache','dependency-smoke');await mkdir(cwd,{recursive:true});
const env=await executionEnvironment(runtime,{cacheRoot:join(process.env.HAJIMI_RUNTIME_HOME,'cache'),cwd,productRoot:process.cwd()});
const python=join(runtime.root,'python/python.exe');const helper=await checkedHelper(process.cwd());
const makeWheel=String.raw`import zipfile; z=zipfile.ZipFile('hajimi_probe-1.0-py3-none-any.whl','w'); z.writestr('hajimi_probe.py','value=42'); z.writestr('hajimi_probe-1.0.dist-info/METADATA','Metadata-Version: 2.1\nName: hajimi-probe\nVersion: 1.0\n'); z.writestr('hajimi_probe-1.0.dist-info/WHEEL','Wheel-Version: 1.0\nGenerator: test\nRoot-Is-Purelib: true\nTag: py3-none-any\n'); z.writestr('hajimi_probe-1.0.dist-info/RECORD',''); z.close()`;
for(const args of [['-B','-c',makeWheel],['-B','-m','pip','install','--no-index','--no-deps','hajimi_probe-1.0-py3-none-any.whl'],['-B','-c',"import adjustText,hajimi_probe,matplotlib.pyplot as p; from pathlib import Path; import os; assert hajimi_probe.value==42; assert Path(hajimi_probe.__file__).resolve().is_relative_to(Path(os.environ['PIP_TARGET']).resolve()); f,a=p.subplots(); a.scatter([0,0],[0,0]); adjustText.adjust_text([a.text(0,0,'a'),a.text(0,0,'b')],ax=a); f.savefig('dependency-smoke.png'); print('adjustText:',adjustText.__file__);print('isolated package:',hajimi_probe.__file__)"]]){
const r=await runInJob(helper,python,args,{cwd,env,timeoutSeconds:180});if(r.exitCode!==0)throw new Error(r.stderr.toString());console.log(r.stdout.toString().slice(-1000));}
await verifyRuntimeTree(runtime,undefined,true);await writeFile(join(cwd,'verified.json'),JSON.stringify({version:runtime.manifest.version,passed:true,extraPackages:env.PIP_TARGET}));console.log('POST-EXECUTION INTEGRITY PASSED');


