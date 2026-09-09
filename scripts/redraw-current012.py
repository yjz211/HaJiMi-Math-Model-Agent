import json, os, subprocess, sys, time, shutil
from pathlib import Path
root=Path(sys.argv[1]); product=Path(r'C:\Users\hhhh\Desktop\HaJiMi-v0.1.2')
meta=json.loads((root/'.codex-plot-runtime.json').read_text(encoding='utf-8')); skill=Path(meta['runtime_skill'])
env=os.environ.copy(); env['MPLBACKEND']='Agg'; env['DRAWIO_PATH']=meta['paths']['drawio']; env['PYTHONDONTWRITEBYTECODE']='1'
plan=json.loads((root/'FIGURE_PLAN.json').read_text(encoding='utf-8-sig'))
backup=root/'archive'/('before_current012_redraw_'+time.strftime('%Y%m%d_%H%M%S')); backup.mkdir(parents=True)
for fig in plan['figures']:
 for output in fig.get('outputs',[]):
  p=root/output
  if p.exists(): shutil.copy2(p,backup/p.name)
log=(root/'work/current012_redraw.log').open('w',encoding='utf-8')
def run(args,cwd=root):
 print('RUN',args,flush=True); result=subprocess.run([str(x) for x in args],cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT)
 log.flush()
 if result.returncode: raise RuntimeError('Failed: '+str(args)+'; see '+str(log.name))
if 'restrained' in root.name:
 run([sys.executable,root/'figures/restrained_src/render_restrained_data.py'])
 run([sys.executable,root/'figures/restrained_src/gen_restrained_roadmap.py'])
else:
 for p in sorted((root/'figures').glob('gen_fig_v012_*.py')): run([sys.executable,p])
for fig in plan['figures']:
 outputs=fig.get('outputs',[])
 for output in outputs:
  p=root/output
  if p.suffix=='.drawio':
   for fmt in ['pdf','png']: run([sys.executable,skill/'scripts/export_drawio.py',p,'--output',p.with_suffix('.'+fmt),'--format',fmt,'--timeout','120'])
  if p.suffix=='.tex': run([meta['paths']['xelatex'],'-interaction=nonstopmode','-halt-on-error',p.name],cwd=p.parent)
import fitz
from PIL import Image,ImageDraw
thumbs=[]
for fig in plan['figures']:
 pdf=next((root/p for p in fig['outputs'] if p.endswith('.pdf')),None)
 if pdf is None: continue
 doc=fitz.open(pdf); pix=doc[0].get_pixmap(matrix=fitz.Matrix(1.6,1.6)); png=pdf.with_suffix('.png'); pix.save(png); doc.close()
 im=Image.open(png).convert('RGB'); im.thumbnail((580,390)); tile=Image.new('RGB',(620,430),'white');tile.paste(im,((620-im.width)//2,25));ImageDraw.Draw(tile).text((15,410),pdf.stem,fill='black');thumbs.append(tile)
 for output in fig['outputs']:
  assert (root/output).is_file(),output
sheets=[]
for start in range(0,len(thumbs),6):
 subset=thumbs[start:start+6]; sheet=Image.new('RGB',(1240,430*((len(subset)+1)//2)), '#eeeeee')
 for i,tile in enumerate(subset): sheet.paste(tile,((i%2)*620,(i//2)*430))
 dest=root/'figures'/f'current012_overview_{start//6+1}.jpg';sheet.save(dest,quality=90);sheets.append(str(dest))
(root/'work/current012_redraw_result.json').write_text(json.dumps({'figures':len(thumbs),'runtime':str(skill),'overviews':sheets,'completed':time.strftime('%Y-%m-%d %H:%M:%S')},ensure_ascii=False,indent=2),encoding='utf-8')
print('COMPLETE',len(thumbs),flush=True)
