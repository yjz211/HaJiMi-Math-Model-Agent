import json,re,shutil,subprocess,sys
from pathlib import Path
base=Path.cwd();out=base/'artifacts/plot108-20260910/template-sample';out.mkdir(parents=True,exist_ok=True);(out/'figures').mkdir(exist_ok=True)
shared=base/'compatibility/v010/bundled/capabilities/modeling-plot-suite/1.0.0/resources/assets/shared-scripts';shutil.copytree(shared,out/'_utils',dirs_exist_ok=True)
registry={x['id']:x for x in json.loads((shared/'recipe_registry.json').read_text(encoding='utf-8'))['recipes']};records=[]
for n in [7,19,23,26,35,40,43,52,69,73,91,98]:
 b=(n-1)//6+1;w=base/f'projects/plot108-20260910/batch-{b:02}';item=next(x for x in json.loads((w/'RESULTS.json').read_text(encoding='utf-8'))['figures'] if x['id']==f'd{n:03}');id=item['recipeIds'][0];entry=registry[id];s=(shared/entry['file']).read_text(encoding='utf-8');hs=list(re.finditer(r'^## \d+\.\s+(.+)$',s,re.M));idx=next(i for i,h in enumerate(hs) if h[1]==entry['title']);body=s[hs[idx].start():hs[idx+1].start() if idx+1<len(hs) else len(s)];name=id.replace('.','_');(out/(name+'.md')).write_text(body,encoding='utf-8');code=re.search(r'```python\n(.*?)\n```',body,re.S).group(1)
 script=out/(name+'.py');script.write_text(code+f"\nfig.savefig('figures/{name}.png',dpi=130,facecolor='white')\n",encoding='utf-8')
 if True:
  try:
   result=subprocess.run([sys.executable,'-X','utf8','-B',str(script)],cwd=out,capture_output=True,text=True,encoding='utf-8',timeout=35);(out/(name+'.log')).write_text(result.stdout+'\n'+result.stderr,encoding='utf-8');print(id,result.returncode,result.stderr[-200:] if result.returncode else '',flush=True)
  except subprocess.TimeoutExpired:print(id,'TIMEOUT',flush=True)
 records.append(dict(id=f'd{n:03}',batch=b,recipe=id,template=str(out/'figures'/(name+'.png')),actual=str(w/f'figures/fig_d{n:03}.png')))
(out/'sample.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
