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
OUT=ROOT/'artifacts/layout-overwrite-minimal';OUT.mkdir(parents=True,exist_ok=True)
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
 else:
  gs=fig.add_gridspec(2,1,height_ratios=[3,1]);ax=fig.add_subplot(gs[0]);other=fig.add_subplot(gs[1])
  x=np.arange(24);ax.plot(x,120+15*np.sin(x/4));other.plot(x,np.sin(x),marker='o',ms=3)
  ax.set_ylabel('流量（件/小时）',fontsize=10);other.set_ylabel('误差',fontsize=9);other.set_xlabel('时间（小时）',fontsize=10)
  fig.subplots_adjust(left=.20,right=.96,bottom=.19,top=.94,hspace=.35)
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
for kind in ['heatmap','residual']:
 for mode in ['native','guard-only','hook','hajimi']:
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
