"""Synthetic plotting fixtures, user-authorized; no real observations."""
import json, hashlib, sys
from pathlib import Path
import numpy as np
root=Path(sys.argv[1]); (root/'data').mkdir(parents=True,exist_ok=True)
rng=np.random.default_rng(20260910); catalog=[]
def save(id, payload, question):
 p=root/'data'/f'{id}.json'; p.write_text(json.dumps(dict(synthetic=True,seed=20260910,**payload),ensure_ascii=False,indent=2,allow_nan=False),encoding='utf-8')
 catalog.append(dict(id=id,path=f'data/{id}.json',question=question,sha256=hashlib.sha256(p.read_bytes()).hexdigest()))
save('f1_distribution',dict(unit='分钟',groups=[dict(name=n,values=np.round(v,3).tolist()) for n,v in zip(['固定周期调度','需求自适应调度','预测协同调度'],[rng.gamma(5,3,45),rng.gamma(7,1.5,75),np.r_[rng.normal(7,1.2,75),rng.normal(15,1.3,15)]])]),'比较三种方案的等待时间分布、尾部风险及多峰结构，保留样本分布信息。')
x=np.linspace(0,1,37);y=np.linspace(10,90,29)
z=np.array([[40+60*(a-.68)**2+.009*(b-57)**2+4*np.sin(7*a)*np.cos(b/16) for a in x] for b in y])
save('f2_surface3d',dict(x_label='资源分配比例',y_label='控制周期（秒）',z_label='综合运行成本',x=x.tolist(),y=y.tolist(),z=np.round(z,5).tolist(),axis_order='z[y_index][x_index]'), '必须绘制三维响应曲面，展示两个参数与成本的关系，并定位给定网格的最低点；保留地形起伏。')
t=np.arange(72);actual=110+.35*t+12*np.sin(t/5)+rng.normal(0,2,72);pred=110+.35*t+12*np.sin(t/5)+np.where(t>=48,.12*(t-48),0)
save('f3_forecast',dict(split_index=48,unit='件/小时',interval_definition='合成90%预测区间，不是置信区间',rows=[dict(hour=int(i),actual=round(float(a),3),prediction=round(float(p),3),lower=round(float(p-5-.06*i),3),upper=round(float(p+5+.06*i),3)) for i,a,p in zip(t,actual,pred)]),'展示实际与预测的时间变化、预测段分界、给定90%预测区间，以及仅在预测段计算的误差。')
save('f4_tradeoffs',dict(metrics=[dict(name=n,unit=u,direction=d) for n,u,d in [('准时率','%','higher'),('成本','万元','lower'),('能耗','kWh','lower'),('公平性','分','higher'),('故障恢复时间','分钟','lower')]],methods=[dict(name=n,values=v) for n,v in zip(['固定规则','滚动优化','稳健规划','分布式协同','预测驱动','混合自适应'],[[87,120,340,71,22],[93,135,310,78,18],[91,148,350,92,11],[92,125,270,85,16],[96,141,295,80,14],[95,133,280,91,12]])]),'展示六种方案在不同单位及优劣方向指标上的取舍，必须能读到实际指标值。')
save('f5_sensitivity',dict(baseline=150,unit='万元',perturbation='逐项参数降低或提高15%，其他参数固定',rows=[dict(parameter=n,low_setting_result=a,high_setting_result=b) for n,a,b in [('高峰需求强度',123,184),('采购单价',132,170),('服务处理效率',166,138),('安全库存系数',155,162),('运输时延',143,159),('备用设备比例',157,145),('预测窗口长度',152,154)]]),'比较参数扰动引起的成本变化，明确区分参数降低与提高；两次扰动同高于基准的因素也要如实表达。')
(root/'DATA_CATALOG.json').write_text(json.dumps(dict(synthetic=True,datasets=catalog),ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(dict(workspace=str(root),datasets=len(catalog)),ensure_ascii=False))
