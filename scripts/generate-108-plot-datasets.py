"""108 reproducible synthetic scenarios. Recipe coverage map stays outside model input."""
import json,hashlib,math,random
from pathlib import Path
import numpy as np
BASE=Path(__file__).resolve().parents[1]; ROOT=BASE/'projects/plot108-20260910'; OUT=BASE/'artifacts/plot108-20260910'
registry=json.loads((BASE/'scripts/plot-recipe-routing/recipe_registry.json').read_text(encoding='utf-8'))['recipes']
ROOT.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
coverage=[]; allitems=[]
def scenario(key,rng):
 n=90; x=rng.normal(size=n); y=2*x+rng.normal(0,.8,n)
 matrix=rng.normal(size=(90,6));matrix[:,1]=matrix[:,0]*.7+rng.normal(0,.5,90)
 groups=[dict(group=f'方案{i+1}',values=rng.normal(30+i*5,3+i,70+i*9).tolist()) for i in range(4)]
 methods=['方案甲','方案乙','方案丙','方案丁'];cats=[f'指标{i+1}' for i in range(6)]
 if key in ['survival']:
  rows=[]
  for g,scale in [('处理组',26),('对照组',18)]:
   for i in range(100):
    t=rng.exponential(scale);c=rng.uniform(12,40);rows.append(dict(group=g,time=min(t,c),event=int(t<=c)))
  return dict(rows=rows,time_unit='月'),'比较两组随访中的事件发生时间与删失，表达事件未发生概率及在险人数；统计量必须由记录计算。'
 if key in ['classification','calibration','roc']:
  truth=rng.binomial(1,.4,300);scores={m:np.clip(.15+.65*truth+rng.normal(0,s,300),.001,.999).tolist() for m,s in zip(methods,[.35,.25,.19,.3])}
  return dict(truth=truth.tolist(),probabilities=scores,positive_label=1),'比较多个模型的'+({'classification':'类别判别错误结构，使用0.5阈值，保留类别样本量','calibration':'概率可信程度、校准与预测概率分布，指标由逐样本概率和真值计算','roc':'区分阳性与阴性的能力以及阈值变化带来的权衡'}[key])+'。'
 if key in ['correlation','cluster_matrix','pca','pairs','embedding','cluster2','cluster3']:
  labels=np.repeat(np.arange(3),30);matrix+=labels[:,None]*rng.uniform(.5,2,(1,6))
  return dict(features=cats,rows=matrix.tolist(),synthetic_class=labels.tolist()),{'correlation':'分析六项测量之间的相关结构。','cluster_matrix':'识别样本和变量之间的相似群组，保留变量名与连续数值图例。','pca':'展示六维测量的主要变化方向及各变量贡献，解释方差需计算。','pairs':'查看六项测量的两两关系、边际分布及异常组合。','embedding':'探索高维样本在低维表示中的组间分离与组内结构，标签只用于对照。','cluster2':'依据六维测量聚类，展示样本结构及聚类质量，不能直接把给定类当聚类结果。','cluster3':'用三维表示探索群组空间结构，保留空间视角与类别区分。'}[key]
 if key in ['distribution','ridge','group_violin','errors']:
  if key=='errors':groups=[dict(group=m,values=rng.standard_t(5,100).tolist()) for m in methods]
  return dict(unit='模拟测量单位',groups=groups),{'distribution':'比较各方案分布形态、集中程度、离群值和原始观测。','ridge':'比较四个阶段的整体分布如何迁移，保留形态而不仅均值。','group_violin':'比较多组测量的中位水平、四分位及分布差异。','errors':'比较多模型预测误差的偏差、长尾和离群情况。'}[key]
 if key in ['paired','agreement','slope','dumbbell']:
  before=rng.normal(50,9,30);after=before+rng.normal(4,6,30)
  return dict(rows=[dict(id=f'对象{i+1}',before=float(a),after=float(b)) for i,(a,b) in enumerate(zip(before,after))],unit='分'),{'paired':'比较同一对象前后变化，保留配对关系及总体变化。','agreement':'比较两种测量方法的一致性、系统偏差与差异随量级变化，before/after表示方法A/B而非时间。','slope':'比较两个时期各对象的排序和数值变化。','dumbbell':'逐对象比较前后差异及变化幅度，识别退步对象。'}[key]
 if key in ['forest','subgroup','effects','quantile','stability','event','irf']:
  if key=='quantile':labels=[str(v) for v in [.1,.25,.5,.75,.9]]
  elif key in ['event','irf']:labels=[str(i) for i in range(-4,9)]
  else:labels=[f'设定{i+1}' for i in range(8)]
  vals=rng.normal(.3,.25,len(labels));se=rng.uniform(.06,.16,len(labels))
  return dict(rows=[dict(label=l,estimate=float(v),standard_error=float(s),lower95=float(v-1.96*s),upper95=float(v+1.96*s)) for l,v,s in zip(labels,vals,se)],interval_definition='合成估计量的已给定正态近似95%置信区间'),{'forest':'比较多个估计及不确定性相对零基线的关系。','subgroup':'比较不同子群效应及不确定性，不能把显著性差异等同于组间显著差异。','effects':'比较不同调节变量水平的边际效应及区间。','quantile':'比较不同分位点的回归效应与不确定性。','stability':'按逐步加入控制变量的顺序分析系数稳定性。','event':'展示事件前后各期效应和置信区间，零期为事件发生。','irf':'展示冲击前后各期响应及不确定性，负期为参考期。'}[key]
 if key in ['surface','contour','feasible','pareto3']:
  xx=np.linspace(-3,3,35);yy=np.linspace(-2,2,29);X,Y=np.meshgrid(xx,yy);Z=(X-.7)**2+.8*(Y+.3)**2+np.sin(X*2)*.8
  return dict(x=xx.tolist(),y=yy.tolist(),z=Z.tolist(),axis_order='z[y][x]',constraints=['x+y<=2','x>=-1','y>=-1'] if key=='feasible' else [],objectives=rng.uniform(1,10,(100,3)).tolist() if key=='pareto3' else None),{'surface':'展示两参数目标函数的三维地形、局部起伏与给定网格最小值。','contour':'展示二维参数搜索中高低值区域、等值关系和最优网格位置。','feasible':'依据给定线性约束展示可行区域、边界及可行网格内目标函数最小值。','pareto3':'比较给定100个候选的三个均需最小化目标，计算非支配集合并展示三维权衡；objectives是候选目标，网格仅为独立辅助测试数据。'}[key]
 if key in ['network','path','sankey','gantt','grid']:
  if key=='gantt':return dict(tasks=[dict(task=f'任务{i+1}',resource=f'设备{i%3+1}',start=i*2,duration=int(rng.integers(2,6))) for i in range(12)]),'展示任务起止时间、资源分配与资源冲突，不能隐藏重叠。'
  if key=='grid':return dict(states=rng.integers(0,4,(12,24)).tolist(),rows='12个设备',columns='24个时隙',legend={'0':'空闲','1':'生产','2':'等待','3':'维护'}),'展示设备随时隙的离散状态迁移，类别不表达连续数值。'
  nodes=[dict(id=i,x=math.cos(i*2*math.pi/10),y=math.sin(i*2*math.pi/10)) for i in range(10)];edges=[dict(source=i,target=(i+1)%10,weight=int(rng.integers(2,20))) for i in range(10)]+[dict(source=i,target=i+3,weight=int(rng.integers(2,20))) for i in range(6)]
  if key=='sankey':
   flows=[dict(source=a,target=b,value=int(rng.integers(10,70))) for a in ['来源甲','来源乙','来源丙'] for b in ['用途一','用途二','用途三']];return dict(flows=flows),'展示三个来源向三个用途的分配量及流向，总量按输入求和。'
  return dict(nodes=nodes,edges=edges,directed=False,start=0,end=6),('展示关系网络的边权、节点连接与群组结构。' if key=='network' else '计算并展示节点0到6的最短加权路径，同时保留其余网络背景。')
 if key in ['spatial','bivariate','moran','lisa','migration','space_time']:
  cells=[dict(id=f'区域{r}-{c}',row=r,col=c,x=c,y=r,value=float(20+3*c+2*r+rng.normal(0,2)),second=float(rng.uniform(10,80))) for r in range(6) for c in range(7)]
  if key=='migration':return dict(rows=[dict(year=2010+i,x=110+i*.3+rng.normal(0,.1),y=30+i*.15+rng.normal(0,.1),weight=100+i*8) for i in range(12)]),'展示模拟重心历年位置及迁移方向，坐标为模拟经纬度，不代表真实地域统计。'
  if key=='space_time':return dict(locations=[f'区域{i+1}' for i in range(12)],times=list(range(36)),values=(rng.normal(size=(12,36))+np.sin(np.arange(36)/5)).tolist(),axis_order='values[location][time]'),'展示多区域随时间的测量变化、空间差异与异常时段。'
  return dict(cells=cells,geometry='每个区域为[row,row+1]×[col,col+1]单元格，queen邻接包含共边或共顶点',synthetic_geography=True),{'spatial':'展示合成格网区域的数值空间分布，不能冒充真实中国省份。','bivariate':'同时展示合成区域的value与second两个变量的联合空间分布及图例。','moran':'依据给定Queen邻接计算value的空间自相关并展示关联关系，统计量由数据计算。','lisa':'依据给定Queen邻接识别局部空间关联，高低聚集与显著性需计算，不得编造真实行政区地图。'}[key]
 if key in ['prediction','fan','decay','training','convergence','series','area','calendar','learning','stacked','stream','variance','bump','dual']:
  if key=='calendar':return dict(rows=[dict(date=f'2025-{m:02}-{d:02}',value=float(rng.gamma(3,8))) for m in range(1,13) for d in range(1,29)]),'展示一年逐日活动量的周期、月份差异与缺测日期；每月29日及以后未提供，不得当作零。'
  if key=='convergence':return dict(iterations=list(range(101)),runs=[dict(method=m,run=j,values=(5+i*3+(100+rng.normal(0,5))*np.exp(-np.arange(101)*(.025+i*.008))+rng.uniform(0,.5,101)).tolist()) for i,m in enumerate(methods) for j in range(12)]),'比较多算法重复运行的收敛速度、最终损失和运行间差异。'
  if key=='learning':return dict(step=list(range(101)),schedules={'warmup_cosine':[.001*(t/10 if t<10 else .5*(1+math.cos(math.pi*(t-10)/90))) for t in range(101)],'step':[.001*.3**(t//30) for t in range(101)]}),'比较两种学习率调度随训练步骤变化的机制。'
  t=np.arange(48);actual=50+.4*t+5*np.sin(t/4)+rng.normal(0,1,48);pred=50+.4*t+5*np.sin(t/4)
  if key in ['prediction','fan']:return dict(time=t.tolist(),actual=actual.tolist(),prediction=pred.tolist(),split_index=32,forecast_draws=(pred[32:]+rng.normal(0,2,(300,16))).tolist(),draws_semantics='合成预测分布300次抽样，列对应32到47期'),'展示历史与预测阶段、真实值和预测分布的不确定性，分位区间由抽样计算。'
  if key=='decay':return dict(horizons=list(range(1,13)),errors=[dict(model=m,rmse=(1+np.arange(12)*(.2+i*.1)+rng.uniform(0,.3,12)).tolist()) for i,m in enumerate(methods)]),'比较模型随预测步长增加的误差退化。'
  if key=='training':return dict(epoch=list(range(60)),train_loss=(2*np.exp(-np.arange(60)/15)+.1).tolist(),validation_loss=(2*np.exp(-np.arange(60)/15)+.14+np.maximum(np.arange(60)-35,0)*.009).tolist(),accuracy=(.5+.45*(1-np.exp(-np.arange(60)/20))).tolist()),'展示训练损失、验证损失及准确率的演变，识别泛化差距。'
  values=np.maximum(1,rng.normal(20,4,(4,48))+np.arange(48)[None,:]*rng.uniform(.1,.4,(4,1)))
  return dict(time=t.tolist(),categories=methods,values=values.tolist(),axis_order='values[category][time]',units=['数量']*4),{'series':'展示多组时间趋势及异常变化。','area':'展示总量随时间变化及各类别贡献。','stacked':'比较时间段的总量和内部构成变化。','stream':'展示多类别随时间的兴衰与相对贡献。','variance':'以各类别数值占同一期总和的份额展示贡献结构随时间变化。','bump':'根据每期数值计算各组排名，展示名次随时间变化。','dual':'比较两个序列的同步变化与量级差异，相关性从数据计算。'}[key]
 if key in ['shap','importance','ice','attention','triptych','latent','trace']:
  if key=='trace':return dict(chains=[(rng.normal(.8,.2,500)+np.exp(-np.arange(500)/30)*i).tolist() for i in range(4)],warmup=100),'查看多链参数抽样轨迹、稳态分布与收敛诊断，统计量自行计算。'
  if key=='ice':return dict(feature_grid=np.linspace(0,10,40).tolist(),responses=[(np.sin(np.linspace(0,10,40)/3)+i*.02+rng.normal(0,.03,40)).tolist() for i in range(45)]),'展示特征变化对不同样本预测响应的异质性与平均趋势。'
  if key=='attention':
   a=rng.uniform(0,1,(12,12));a/=a.sum(axis=1,keepdims=True);return dict(tokens=[f'词{i+1}' for i in range(12)],weights=a.tolist(),axis_order='query,key'),'展示序列位置间注意力权重，明确查询与键的方向。'
  if key in ['triptych','latent']:
   a=rng.normal(size=(20,20));b=(a+np.roll(a,1,0)+np.roll(a,1,1))/3
   return dict(input=a.tolist(),intermediate=b.tolist(),output=(b>.2).astype(int).tolist(),interpolation=[((1-t)*a+t*b).tolist() for t in np.linspace(0,1,6)]),'展示同一模拟场的输入、中间处理及输出对应关系；如展示插值则按给定顺序保留演变。'
  return dict(features=cats,feature_values=matrix.tolist(),contributions=(matrix*rng.uniform(.1,2,(1,6))).tolist(),semantics='已给定合成逐样本特征贡献，不是通过真实模型计算的SHAP'),('展示各特征贡献大小、方向和对应特征值关系。' if key=='shap' else '按合成逐样本贡献绝对值均值排序比较特征重要性，保留不确定性或样本差异。')
 if key in ['placebo','volcano','funnel','balance','residual','pareto']:
  if key=='placebo':return dict(null_effects=rng.normal(0,.12,1000).tolist(),observed_effect=.38),'比较置换零分布与给定观测效应，经验p值由样本计算。'
  if key=='volcano':return dict(rows=[dict(name=f'基因{i+1}',log2_fold_change=float(rng.normal(0,1.3)),p_value=float(rng.uniform(.00001,1)**3)) for i in range(220)]),'同时展示合成基因效应大小与检验显著性，多重检验处理须说明。'
  if key=='funnel':return dict(studies=[dict(id=f'研究{i+1}',effect=float(rng.normal(.3,.15)),se=float(rng.uniform(.03,.2))) for i in range(30)]),'比较合成研究效应与估计精度，并考察小样本偏差；不可直接声称存在发表偏倚。'
  if key=='balance':return dict(rows=[dict(covariate=c,before=float(rng.uniform(-.6,.6)),after=float(rng.uniform(-.08,.08))) for c in cats],metric='标准化均值差'),'比较调整前后协变量平衡程度与0.1绝对差参考。'
  if key=='pareto':return dict(candidates=[dict(id=i,cost=float(rng.uniform(20,80)),delay=float(rng.uniform(5,30))) for i in range(90)],directions={'cost':'min','delay':'min'}),'计算双目标非支配方案并展示成本与延迟的权衡。'
  return dict(actual=y.tolist(),prediction=(2*x).tolist(),feature=x.tolist()),'检查预测残差的偏差、异方差、分布和异常观测；所有残差由输入计算。'
 # Semantic category comparisons, with full raw repeats for uncertainty if desired.
 values=rng.uniform(30,95,(4,6));repeats=rng.normal(values[:,:,None],2,(4,6,12))
 if key=='waterfall':return dict(start=120,changes=[dict(name=c,value=float(v)) for c,v in zip(cats,rng.uniform(-25,30,6))]),'解释起始总量经正负因素变化后的最终值，保持累加关系。'
 if key=='donut':return dict(categories=cats,current=rng.integers(10,80,6).tolist(),previous=rng.integers(10,80,6).tolist()),'比较当前总量的组成及各类别相对上期变化。'
 if key=='pareto_counts':return dict(categories=cats,counts=rng.integers(10,200,6).tolist()),'识别少数主要故障原因贡献的累计比例与80%分界。'
 if key=='ablation':return dict(configurations=['完整方案','去掉模块A','去掉模块B','去掉模块C'],datasets=cats,scores=values.tolist(),runs=repeats.tolist()),'比较完整方案与去掉模块后的性能，展示模块贡献及重复试验差异。'
 return dict(methods=methods,metrics=cats,values=values.tolist(),runs=repeats.tolist(),axis_order='method,metric,run',directions=['higher','higher','lower','higher','lower','higher']),{'ranking':'比较各对象数值排名及中位参考。','performance':'比较多算法跨问题求解成本的相对最佳比率；全部指标在本场景按越低越好解释。','parallel':'比较多方案在不同优劣方向指标上的权衡，注明归一化方法。','radar':'比较多方案的多维能力与短板，优劣方向须统一。','benchmark':'比较多方法在多个数据集的测试成绩与重复试验波动。','back':'逐指标对照两个群体的水平及差值。','diverging':'展示各对象相对同一指标平均水平的正负偏离。','multipanel':'比较同一组多指标结果的总体表现、差异和稳定性，按语义决定是否组合面板。','error_analysis':'比较各类别错误水平、主要弱项及重复运行波动。'}.get(key,'比较多方案在多指标上的表现与重复试验波动，保留原始单位和优劣方向。')
keys='grouped stacked series scatter correlation donut distribution area pareto_counts dual group_violin multipanel ranking dumbbell slope bump sankey waterfall shap agreement survival volcano calibration funnel forest cluster_matrix network benchmark parallel pca prediction diverging back paired ridge group_violin performance ice fan calendar space_time pairs triptych trace stream bivariate forest series event placebo correlation distribution dual residual effects subgroup quantile balance prediction benchmark errors decay moran lisa stability variance irf ablation training embedding attention radar surface classification importance learning latent benchmark error_analysis convergence effects pareto prediction radar surface spatial residual importance classification roc correlation migration contour gantt path decay space_time pareto3 waterfall scatter scatter cluster2 scatter scatter scatter cluster3 feasible grid'.split()
assert len(keys)==108,len(keys)
for i,(recipe,key) in enumerate(zip(registry,keys),1):
 rng=np.random.default_rng(2026091000+i)
 if key=='scatter':
  x=rng.normal(50,12,220);payload=dict(rows=[dict(x=float(a),y=float(.7*a+rng.normal(0,8)),size=float(rng.uniform(5,60)),group=f'组{j%3+1}') for j,a in enumerate(x)],x_unit='投入',y_unit='产出',size_unit='规模');question='分析投入与产出关系、群体差异、规模及密度分布，拟合与相关指标从记录计算。'
 else:payload,question=scenario(key,rng)
 id=f'd{i:03}';batch=(i-1)//6+1;work=ROOT/f'batch-{batch:02}';(work/'data').mkdir(parents=True,exist_ok=True)
 p=work/'data'/f'{id}.json';obj=dict(synthetic=True,seed=2026091000+i,scenario=f'模拟场景{i:03}',**payload)
 encoded=json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
 if p.exists() and p.read_text(encoding='utf-8')!=encoded:raise RuntimeError('Refuse overwrite different inputs '+str(p))
 p.write_text(encoded,encoding='utf-8');item=dict(id=id,path=f'data/{id}.json',question=question,sha256=hashlib.sha256(p.read_bytes()).hexdigest());allitems.append(dict(batch=batch,**item));coverage.append(dict(id=id,source_recipe=recipe['id'],scenario_family=key))
for batch in range(1,19):
 items=[{k:v for k,v in x.items() if k!='batch'} for x in allitems if x['batch']==batch];(ROOT/f'batch-{batch:02}'/'DATA_CATALOG.json').write_text(json.dumps(dict(synthetic=True,datasets=items),ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'coverage-private.json').write_text(json.dumps(coverage,ensure_ascii=False,indent=2),encoding='utf-8');(OUT/'catalog.json').write_text(json.dumps(allitems,ensure_ascii=False,indent=2),encoding='utf-8');print('108 datasets, 18 batches, immutable seeds and hashes ready')
