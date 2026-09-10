"""User-authorized synthetic fixtures, not observations or research evidence."""
import hashlib
import json
from pathlib import Path
import sys
import numpy as np

root = Path(sys.argv[1])
data = root / 'data'
data.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20260909)
catalog = []

def save(name, content, question, challenge):
    content = {'synthetic': True, 'seed': 20260909, **content}
    path = data / f'{name}.json'
    path.write_text(json.dumps(content, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    catalog.append(dict(id=name, path=f'data/{name}.json', question=question, challenge=challenge,
                        sha256=hashlib.sha256(path.read_bytes()).hexdigest()))

groups = [rng.normal(73, 5, 18), 64+rng.lognormal(2.3,.4,40),
          np.r_[rng.normal(72,2.5,35),rng.normal(87,3,35)],np.r_[rng.normal(82,4,117),58,60,105]]
save('g1_distributions', {'unit':'分','groups':[{'name':name,'values':np.round(values,3).tolist()} for name,values in zip(
    ['基准调度','保守稳健调度','双模式自适应调度','高吞吐动态调度'],groups)]},
    '比较四组方案的得分分布、离散程度与异常值，不能只比较均值。','不等样本量、偏态、双峰、异常值和较长中文组名')
t=np.arange(120);actual=50+.14*t+8*np.sin(t/8)+rng.normal(0,1.4,120)
pred=50+.14*t+8*np.sin(t/8)+np.where(t>=80,.08*(t-80),0)
sigma=np.where(t<80,1.8,2.2+.06*(t-80))
save('g2_forecast',{'unit':'千件/日','split_index':80,'interval_definition':'预先构造的合成90%预测区间：prediction ± 1.645*sigma；不是由实际实验估计的CI。',
    'rows':[{'day':int(i),'actual':round(float(a),3),'prediction':round(float(p),3),'lower':round(float(p-1.645*s),3),'upper':round(float(p+1.645*s),3)} for i,a,p,s in zip(t,actual,pred,sigma)]},
    '展示预测与实际的时间变化、训练/预测分界、给定区间及预测段误差。','预测区间与置信区间不能混叫；后段存在偏差，误差指标须按预测段计算')
metrics=[('准确率','%', 'higher'),('召回率','%', 'higher'),('延迟','ms','lower'),('能耗','J/次','lower'),('内存','MB','lower'),('稳定性','分','higher')]
values=[[88,84,35,4.8,180,76],[91,88,48,6.1,256,84],[93,90,67,7.3,384,88],[89,85,22,3.0,128,72],
        [95,92,105,9.4,512,92],[92,91,43,5.0,220,90],[90,86,30,4.2,160,80],[94,93,56,5.9,288,94]]
save('g3_methods',{'metrics':[dict(name=a,unit=b,direction=c) for a,b,c in metrics],
    'methods':[dict(name=name,values=row) for name,row in zip(['轻量基线','随机森林','梯度提升','边缘快速模型','深层集成模型','稳健蒸馏模型','稀疏融合模型','自适应混合模型'],values)]},
    '比较八种方案在六项指标上的取舍，保留指标单位和优劣方向。','混合单位、量级和方向；不能未经说明把原值放入统一尺度')
x=np.linspace(-3,3,31);y=np.linspace(-2,4,31)
save('g4_response',{'x_label':'控制参数 α','y_label':'反馈参数 β','z_label':'目标代价','x':x.tolist(),'y':y.tolist(),
    'z':[[round(float((a-.6)**2+.7*(b-1.2)**2+1.4*np.sin(2*a)*np.cos(1.4*b)+6),5) for a in x] for b in y],
    'axis_order':'z[y_index][x_index]'},'呈现两个控制参数与目标代价的响应关系及网格内最优位置。','非方形坐标范围、矩阵轴顺序、3D标注与色条布局')
save('g5_sensitivity',{'baseline':100.0,'unit':'万元','perturbation':'各参数分别相对基准降低10%或提高10%，其他参数固定。',
    'rows':[dict(parameter=n,low_setting_result=a,high_setting_result=b) for n,a,b in [
    ('需求增长率',82,124),('单位采购成本',88,116),('平均服务时长',91,113),('设备故障概率',95,112),
    ('库存安全系数',104,109),('人员调配效率',108,94),('运输距离折算系数',96,106),('峰值负载上限',98,103),('反馈更新频率',101,99)]]},
    '比较各参数扰动对总成本的影响范围，同时区分参数降低和提高后的结果。','某参数两次扰动都高于基准，不能强行画成一负一正；参数方向与成本方向不同')
save('g6_contributions',{'unit':'万元','initial':240,'steps':[dict(name=n,delta=v) for n,v in [
    ('采购批次合并节省',-35),('高峰期临时用工增加',22),('运输路线优化节省',-18),('设备维护预算增加',10),('库存周转改善节省',-26)]], 'final':193},
    '展示成本由初始值经过五项增减变化后到最终值的累积过程。','有正有负且存在初始/最终总量，不能用普通柱形代替累积结构')
latent=rng.normal(size=(160,3));matrix=np.column_stack([latent[:,0]+rng.normal(0,.25,160),.8*latent[:,0]+rng.normal(0,.4,160),
    -.7*latent[:,0]+rng.normal(0,.4,160),latent[:,1]+rng.normal(0,.2,160),.9*latent[:,1]+rng.normal(0,.3,160),
    latent[:,2],.6*latent[:,2]+rng.normal(0,.5,160),rng.normal(size=160),.4*latent[:,0]-.5*latent[:,1]+rng.normal(0,.3,160)])
missing=rng.random(matrix.shape)<.04
save('g7_correlations',{'variables':['设备利用率','平均吞吐量','单位处理成本','需求波动幅度','应急资源占比','队列等待时长','延迟超标比例','环境扰动指数','综合运行压力'],
    'rows':[[None if missing[i,j] else round(float(matrix[i,j]),5) for j in range(9)] for i in range(160)],
    'missing_value':None},'识别九个变量的正负相关及成组关系，说明缺失值处理。','相关系数需由原始样本计算；缺失值不能默认为0；长标签与树状图布局')
(root/'DATA_CATALOG.json').write_text(json.dumps({'synthetic':True,'datasets':catalog},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'CLAUDE.md').write_text('# 七组合成数据绘图实践\n\n这是用户授权的独立绘图测试，全部数据为模拟数据，不代表任何真实实验或研究结论。只完成七组绘图，不撰写论文或推进完整研究流程。\n',encoding='utf-8')
print(json.dumps({'datasets':len(catalog),'workspace':str(root)},ensure_ascii=False))
