"""User-authorized synthetic fixtures; no real research observations."""
import json, hashlib, random, math, sys
from pathlib import Path
root=Path(sys.argv[1]);(root/'data').mkdir(parents=True,exist_ok=True)
rng=random.Random(20260912);catalog=[]
def save(id,payload,question):
 p=root/'data'/f'{id}.json';p.write_text(json.dumps(dict(synthetic=True,seed=20260912,**payload),ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8');catalog.append(dict(id=id,path=f'data/{id}.json',question=question,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
steps=list(range(0,201,5));runs=[]
for name,rate,floor in [('粒子群',.026,18),('差分进化',.038,13),('混合搜索',.052,10)]:
 for run in range(8):
  best=150.;values=[]
  for t in steps:
   best=min(best,max(floor*.8,floor+(140-floor)*math.exp(-rate*t)+rng.gauss(0,2.2)));values.append(round(best,3))
  runs.append(dict(method=name,run=run+1,values=values))
save('f1_convergence',dict(iterations=steps,runs=runs,objective='综合损失（越低越好）'),'比较三种算法各8次运行的收敛速度、最终损失和运行间波动；区间含义由真实重复运行计算，不把波动带称作置信区间。')
x=[15+i*2 for i in range(26)];y=[.2+i*.025 for i in range(25)];z=[[18+.016*(a-43)**2+48*(b-.58)**2+2.3*math.sin(a/8)*math.cos(b*9) for a in x] for b in y]
save('f2_energy3d',dict(x=x,y=y,z=z,axis_order='z[y_index][x_index]',x_label='供水温度（℃）',y_label='设备负载率',z_label='单位能耗（kWh）'),'绘制三维能耗响应曲面，保留连续色条、地形起伏和给定网格最低点，最低点须能在视角下辨认。')
pairs=[]
for i in range(18):
 a=round(rng.uniform(25,65),2);b=round(a-rng.uniform(3,16) if i not in [4,11,16] else a+rng.uniform(2,8),2);pairs.append(dict(site=f'站点{i+1:02}',before=a,after=b))
save('f3_paired',dict(unit='分钟',pairs=pairs),'展示18个站点改造前后平均处理时间的配对变化，既呈现总体改善，也保留退步站点，不能用无配对的两组均值替代。')
rows=[]
for name,power in [('原始模型',1.6),('校准模型',1.03)]:
 for i in range(10):
  p=.05+.1*i;n=rng.randint(35,180);positive=sum(rng.random()<p**power for _ in range(n));rows.append(dict(model=name,predicted_probability=round(p,2),sample_count=n,positive_count=positive))
save('f4_calibration',dict(bins=rows),'比较两模型的概率校准程度，按阳性数/样本数计算观测频率，保留理想校准参考及各区间样本量；不可编造逐样本Brier分数。')
names=['中心仓','北部','东部','南部','西部','港区','产业园'];matrix=[[0 if i==j else (0 if rng.random()<.18 else rng.randint(12,240)) for j in range(7)] for i in range(7)]
save('f5_flows',dict(regions=names,matrix=matrix,axis_order='matrix[origin][destination]',unit='吨/日'),'展示七区域非对称运输流量及主要流向，明确出发与到达、零流量和实际数值，保留连续数值颜色图例，不能画成对称相关矩阵。')
(root/'DATA_CATALOG.json').write_text(json.dumps(dict(synthetic=True,datasets=catalog),ensure_ascii=False,indent=2),encoding='utf-8')
print(root)
