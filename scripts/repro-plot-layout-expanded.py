"""Read-only product reproduction; compare identical figures and trace layout mutation."""
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.figure import Figure
from matplotlib.text import Text
import importlib.util,json,sys
from pathlib import Path
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/('artifacts/layout-preservation-verified' if '--verify' in sys.argv else 'artifacts/layout-overwrite-expanded');OUT.mkdir(parents=True,exist_ok=True)
original_save=Figure.savefig
path=ROOT/'compatibility/v010/bundled/capabilities/modeling-plot-suite/1.0.0/resources/assets/shared-scripts/plot_utils.py'
spec=importlib.util.spec_from_file_location('pu',path);pu=importlib.util.module_from_spec(spec);spec.loader.exec_module(pu);pu.setup_style()

def build(kind):
 fig=plt.figure(figsize=(6,4.25),dpi=150)
 if kind=='heatmap':
  ax=fig.add_subplot(111);im=ax.imshow(np.arange(30).reshape(6,5),aspect='auto')
  ax.set_xticks(range(5),['准时率','成本','能耗','公平性','恢复时间'],fontsize=9)
  ax.set_yticks(range(6),['固定规则','滚动优化','稳健规划','分布协同','预测驱动','混合自适应'],fontsize=9)
  fig.subplots_adjust(left=.19,right=.77,bottom=.18,top=.91)
  cax=fig.add_axes([.82,.18,.022,.73]);fig.colorbar(im,cax=cax).set_label('相对表现',fontsize=9)
 elif kind=='residual':
  gs=fig.add_gridspec(2,1,height_ratios=[3,1]);ax=fig.add_subplot(gs[0]);other=fig.add_subplot(gs[1])
  x=np.arange(24);ax.plot(x,120+15*np.sin(x/4));other.plot(x,np.sin(x),marker='o',ms=3)
  ax.set_ylabel('流量（件/小时）',fontsize=10);other.set_ylabel('误差',fontsize=9);other.set_xlabel('时间（小时）',fontsize=10)
  fig.subplots_adjust(left=.20,right=.96,bottom=.19,top=.94,hspace=.35)
 elif kind in ['line','broken_labels']:
  ax=fig.add_subplot(111);ax.plot(np.arange(12),np.sin(np.arange(12)/3))
  ax.set_xlabel('时间（小时）');ax.set_ylabel('预测误差（单位）')
  fig.subplots_adjust(left=.18 if kind=='line' else .025,bottom=.18 if kind=='line' else .02,right=.95,top=.92)
 elif kind=='long_bar':
  ax=fig.add_subplot(111);ax.barh(range(5),[12,17,14,21,18]);ax.set_yticks(range(5),['固定周期调度方案','需求自适应调度方案','预测协同调度方案','分布式资源规划方案','稳健混合调度方案'],fontsize=9);ax.set_xlabel('总成本（万元）')
  fig.subplots_adjust(left=.34,bottom=.17,right=.95,top=.94)
 elif kind=='grid_2x2':
  for i in range(4):
   ax=fig.add_subplot(2,2,i+1);ax.plot(range(10),np.sin(np.arange(10)/3+i));ax.set_title('方案 '+str(i+1),fontsize=9);ax.tick_params(labelsize=8)
  fig.subplots_adjust(left=.13,right=.96,bottom=.15,top=.91,hspace=.55,wspace=.35)
 elif kind=='inset':
  ax=fig.add_subplot(111);x=np.arange(30);ax.plot(x,np.sin(x/5));ax.set_xlabel('时间');ax.set_ylabel('响应');fig.subplots_adjust(left=.17,bottom=.17,right=.95,top=.94)
  small=fig.add_axes([.60,.62,.26,.24]);small.plot(x[5:12],np.sin(x[5:12]/5));small.set_title('局部放大',fontsize=8);small.tick_params(labelsize=7)
 elif kind=='outside_legend':
  ax=fig.add_subplot(111)
  for i in range(3):ax.plot(range(12),np.sin(np.arange(12)/3+i),label='方法 '+str(i+1))
  ax.legend(loc='center left',bbox_to_anchor=(1.02,.5),fontsize=8);ax.set_xlabel('时间');ax.set_ylabel('响应');fig.subplots_adjust(left=.15,bottom=.17,right=.73,top=.94)
 elif kind=='surface3d':
  ax=fig.add_subplot(111,projection='3d');x,y=np.meshgrid(np.linspace(-2,2,20),np.linspace(-1,3,18));im=ax.plot_surface(x,y,x*x+y*y,cmap='viridis');ax.set_xlabel('参数 A');ax.set_ylabel('参数 B');ax.set_zlabel('成本');fig.colorbar(im,ax=ax,shrink=.55,pad=.12);fig.subplots_adjust(left=.06,bottom=.16,right=.90,top=.94)

 return fig

def state(fig):
 fig.canvas.draw();rend=fig.canvas.get_renderer();w,h=fig.canvas.get_width_height();clipped=[]
 for ax in fig.axes:
  for t in [ax.xaxis.label,ax.yaxis.label,ax.title,*pu._onscreen_tick_labels(ax)]:
   if not t.get_visible() or not t.get_text():continue
   bb=t.get_window_extent(rend)
   if bb.x0<-.5 or bb.y0<-.5 or bb.x1>w+.5 or bb.y1>h+.5:clipped.append(t.get_text())
 return dict(axes=[list(ax.get_position().bounds) for ax in fig.axes],size=list(fig.get_size_inches()),clipped=clipped)

results=[];calls=[]
for name in ['_guard_subplot_size','_auto_shrink_figsize_if_sparse','_auto_fix_overlaps','_ensure_ticklabels_visible']:
 fn=getattr(pu,name)
 def traced(fig,*a,_fn=fn,_name=name,**kw):
  before=state(fig);v=_fn(fig,*a,**kw);after=state(fig)
  if before!=after:calls.append(dict(function=_name,before=before,after=after))
  return v
 setattr(pu,name,traced)
for kind in ['heatmap','residual','line','broken_labels','long_bar','grid_2x2','inset','outside_legend','surface3d']:
 for mode in ['native','hajimi']:
  fig=build(kind);before=state(fig);calls.clear();output=OUT/f'{kind}-{mode}.png'
  if mode=='native':original_save(fig,output,dpi=150,bbox_inches=None)
  elif mode=='guard-only':
   pu._guard_subplot_size(fig);original_save(fig,output,dpi=150,bbox_inches=None)
  elif mode=='hook':fig.savefig(output,dpi=150,bbox_inches=None)
  else:pu.save_fig(fig,str(output))
  after=state(fig)
  # A common-resolution preview of the resulting layout, bypassing hooks.
  original_save(fig,OUT/f'{kind}-{mode}-preview.png',dpi=150,bbox_inches=None)
  results.append(dict(case=kind,mode=mode,before=before,after=after,mutations=list(calls)))
  plt.close(fig)
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
for x in results:print(x['case'],x['mode'],'changed',x['before']['axes']!=x['after']['axes'],'clipped',x['before']['clipped'],'->',x['after']['clipped'],'mutations',[m['function'] for m in x['mutations']])

if '--verify' in sys.argv:
 from PIL import Image
 for row in results:
  assert row['before'] == row['after'], (row['case'],row['mode'],row['before'],row['after'])
 for kind in sorted({x['case'] for x in results}):
  a=np.asarray(Image.open(OUT/f'{kind}-native-preview.png'))
  b=np.asarray(Image.open(OUT/f'{kind}-hajimi-preview.png'))
  assert np.array_equal(a,b), f'Pixel mismatch: {kind}'
 print('PASS: nine layouts preserved; native and HaJiMi previews pixel-identical')
