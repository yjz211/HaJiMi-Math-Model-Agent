# 科研图表风格指南

Claude 画图时参考此文件，提升图表的学术美观度。所有图表必须达到 SCI/Nature 发表水准。

## 按图表类型的配色策略（⛔ 必须遵循）

<figure_selection_guide>
## Data → Figure Type Decision Table

Before choosing a figure type, analyze the data characteristics, then match using this table. Read the full code from the corresponding recipes file.

<selection_priority>
### Selection priority: match data shape, not visual novelty

Choose the figure type that best communicates your data, not the fanciest one available. The decision order is:

1. **First check the "By data shape" table below** — match your data characteristics to the recommended figure type
2. **If multiple options fit**, prefer the one your target audience (competition judges, reviewers) will instantly understand
3. **Use advanced recipes** (Lollipop, Dumbbell, Waterfall, SHAP, etc.) when they genuinely add information that basic charts cannot show — e.g., Waterfall shows incremental contribution, SHAP shows feature direction
4. **Use basic recipes** (grouped bar, line, scatter) when they are the clearest way to present the data — a well-made grouped bar chart is better than a confusing Bump chart

A paper needs visual variety — mix basic and advanced charts. A paper with ALL advanced charts looks like it's trying too hard. A paper with ALL bar charts looks monotonous. Balance is key.

**Hard rule**: do not use the same chart type more than 3 times in one paper. If you already have 3 bar charts, use an alternative for the next comparison. Same applies to lollipop charts or any other type.
</selection_priority>

### By data shape

| Data characteristic | Best figure type | Recipes file | Avoid |
|---|---|---|---|
| ≤3 methods × 1-2 metrics | Three-line table | — | Any chart — too few data points for a meaningful figure |
| 4+ methods × 1 metric | Lollipop Chart or Grouped Bar | advanced #1, basic #1 | — |
| A vs B (2 methods, multiple metrics) | Dumbbell Chart | advanced #2 | heatmap — 2 rows looks like a traffic light |
| A vs B vs C (3-5 methods, multiple metrics) | Grouped Bar Chart or Radar chart | basic #1, competition #5 | — |
| Methods × Metrics matrix (≤5×5) | Method Comparison Heatmap or Grouped Bar | advanced #16, basic #1 | — |
| Methods × Metrics (show trends across metrics) | Parallel Coordinates | advanced #17 | multiple separate charts |
| Methods × Metrics matrix (>5×5) | Heatmap with values | basic #5 | — |
| Methods × Datasets ranking | Bump Chart or Grouped Bar | advanced #4, basic #1 | — |
| Before/after comparison | Dumbbell Chart or Grouped Bar | advanced #2, basic #1 | — |
| Before/after (paired samples) | Paired Dot Plot | advanced #22 | grouped bar (hides individual variation) |
| Relative to baseline (±%) | Diverging Bar Chart | advanced #20 | grouped bar (doesn't show direction clearly) |
| Two-group mirror comparison | Back-to-Back Bar Chart | advanced #21 | — |
| Multi-model statistical comparison | Taylor Diagram | advanced #19 | separate RMSE/R²/StdDev bar charts |
| Distribution comparison (5-15 groups) | Ridgeline Plot | advanced #23 | multiple histograms (wastes space) |
| Distribution comparison (2-4 groups × categories) | Grouped Violin Plot | advanced #24 | box plot (hides distribution shape) |
| Module contribution (ablation) | Waterfall Chart | advanced #6 | bar chart |
| Time series (1-3 lines) | Line plot with CI band | basic #3 | — |
| Time series (4+ lines) | Small multiples (subplot grid) | basic #12 | spaghetti plot |
| Distribution (1 group) | Violin + strip | basic #11 | histogram |
| Distribution (2-5 groups) | Rain Cloud Plot | academic #4 | box plot |
| Proportion/composition | Donut Chart or Stacked Area | basic #6, #8 | pie chart |
| Correlation matrix | Heatmap + dendrogram | advanced #14 | plain heatmap |
| 2D scatter + relationship | Scatter + regression + R² | basic #4 | — |
| 2D joint distribution (large N) | Hexbin + marginal histograms | competition #24 | plain scatter (overplotting) |
| 2D joint distribution (small N, clusters) | KDE contour + marginal density | competition #25 | plain scatter |
| 2D relationship + distribution | Scatter + regression + marginal density | competition #26 | scatter without marginals |
| High-dim features | t-SNE/UMAP scatter | academic #2 | — |
| 3D clustering results (3 features) | 3D scatter + centroids | competition #27 | 2D scatter (loses dimension) |
| Multi-criteria evaluation | Radar chart | competition #5 | — |
| Feature importance | SHAP Summary Plot | advanced #7 | horizontal bar |
| Classification result | Confusion matrix | competition #10 | — |
| Binary classifier comparison | ROC + AUC | competition #11 | — |
| Probability reliability | Calibration Plot | advanced #11 | — |
| Sensitivity (single-param sweep, rank drivers) | Tornado Chart (barh sorted by range) | competition #2 | grouped bar (loses ranking) |
| Throughput/flow loss per stage | Sankey Diagram | advanced #5 | stacked bar (hides chain) |
| Two-factor response / error propagation | 3D Surface + projected contour | competition #6 | heatmap (loses magnitude) |

### By problem domain (competition)

| Problem type | Recommended figures | Recipes |
|---|---|---|
| Optimization (GA/PSO/SA) | Convergence curve + 3D surface + Pareto front | comp #1, #6, #3 |
| Scheduling/routing | Gantt chart + Network path | comp #15, #16 |
| Classification/clustering | Confusion matrix + ROC + 3D cluster scatter | comp #10, #11, #13 |
| Regression/prediction | Prediction vs Actual with CI band + Error Rain Cloud + Multi-step decay + Model accuracy heatmap | empirical #12, #14, #16, #13 |
| Sensitivity analysis | Tornado chart + Contour + 3D surface | comp #2, #14, #6 |
| Spatial data | China province choropleth + Spatiotemporal matrix | comp #7, #18 |
| Multi-objective | 2D Pareto + 3D Pareto surface | comp #3, #19 |
| Factor decomposition | Waterfall chart | comp #20, advanced #6 |

### By problem domain (academic/empirical)

| Paper type | Recommended figures | Recipes |
|---|---|---|
| DID/causal inference | Parallel trends + Event study + Placebo | empirical #2, #3, #4 |
| Regression analysis | Forest plot + Heterogeneity forest + Marginal effects | empirical #1, #10, #15 |
| Prediction/forecasting | Prediction with CI band + Error Rain Cloud + Multi-step decay + Model heatmap | empirical #12, #14, #16, #13 |
| Deep learning | Training curves + Attention map + t-SNE | academic #3, #6, #2 |
| Model comparison | Grouped Bar + Method Comparison Heatmap + Radar | basic #1, advanced #16, comp #5 |
| Hyperparameter tuning | Sensitivity grid + 3D loss landscape | academic #7, #8 |
| Meta-analysis | Forest plot + Funnel plot | empirical #1, advanced #12 |
| Survival analysis | Kaplan-Meier curve | advanced #9 |
| Genomics/omics | Volcano plot + Cluster heatmap | advanced #10, #14 |
| Method agreement | Bland-Altman plot | advanced #8 |

### Anti-patterns (check before generating — but use judgment)

Not every "upgrade" is appropriate. Check this table, but choose based on clarity for your audience.

| ❌ If you were going to use... | ✅ Consider this instead | Why | When to upgrade |
|---|---|---|---|
| Single-metric bar chart for ranking | Lollipop Chart | Less visual noise for pure ranking | When showing 5+ items ranked by one metric |
| Horizontal bar for feature importance | SHAP Summary Plot | Shows direction + magnitude | When you have SHAP values available |
| Bar chart for ablation | Waterfall Chart | Shows incremental contribution | Always — waterfall is strictly better for ablation |
| Bar chart for before/after (2 groups) | Dumbbell Chart | Shows direction and magnitude of change | When comparing exactly 2 conditions |
| Plain box plot | Rain Cloud Plot | Distribution shape + box stats + raw data | When sample size > 20 and distribution shape matters |
| Pie chart | Donut Chart | More modern, less visual distortion | Always |
| Plain heatmap | Heatmap + dendrogram | Adds clustering structure | When row/column ordering matters |
| Stacked bar (non-temporal) | Sankey Diagram | Shows flow direction | When data represents flow/routing |
| RdYlGn colormap | coolwarm or YlOrRd | Red-yellow-green = traffic light | Always |

**Keep using grouped bar chart when:**
- Comparing 3-5 methods across 2-5 metrics (this is what grouped bar charts are designed for)
- Your audience is competition judges or non-specialist reviewers who expect familiar chart types
- The data has clear, discrete categories on the x-axis
- You already have too many advanced charts in the paper and need visual variety

**Keep using line chart when:**
- Showing trends over time or continuous x-axis
- Comparing convergence curves or training progress
</figure_selection_guide>

<bar_chart_alternatives>
### 柱状图使用指南

柱状图是最通用、最易读的图表类型之一。不要回避使用它。

**适合用柱状图的场景（直接用，不需要替代）：**
- 3-5 个方法在 2-5 个指标上的对比 → 分组柱状图
- 类别数据的频次/计数对比 → 普通柱状图
- 需要评委/读者一眼看懂的核心结果 → 分组柱状图
- 论文中已经有多个高级图表，需要平衡 → 柱状图

**适合用替代方案的场景：**

| 场景 | 替代方案 | 原因 |
|------|---------|------|
| 单指标排名（5+项） | Lollipop Chart | 纯排名场景，棒棒糖更简洁 |
| 消融实验 | Waterfall Chart | 展示增量贡献，柱状图做不到 |
| 前后两组对比 | Dumbbell Chart | 展示变化方向和幅度 |
| 特征重要性（有SHAP值） | SHAP Summary Plot | 同时展示重要性和方向 |
| 多数据集排名变化 | Bump Chart | 展示排名交叉 |

**全篇图表多样性规则：** 同一种图表类型不要超过 3 次。如果已经有 3 个柱状图，下一个对比用棒棒糖或雷达图。反过来也一样——如果已经有 3 个棒棒糖图，下一个用柱状图。
</bar_chart_alternatives>

不同图表类型有不同的最佳配色策略，不能一刀切：

### ⛔ 颜色使用通用规则

**数据颜色**（柱子、线条、散点等）：必须用 `PALETTE[i]` 或 `PALETTE_LIGHT[i]`，不要硬编码 hex 颜色。
**语义颜色**（上升/下降/中性等）：用 `COLORS['up']`、`COLORS['down']`、`COLORS['neutral']`，不要硬编码 `#27ae60` 或 `#e74c3c`。
**装饰颜色**（网格线/文字/标注框）：用 `COLORS['grid']`、`COLORS['text']`、`COLORS['bg_box']`。
**渐变起点**：用 `_lighten(PALETTE[0], 0.6)` 而不是硬编码 `#b0c4de`。

这样切换配色方案（journal/soft/npg/colorblind）时，所有颜色自动跟随。

配方代码中的硬编码颜色是历史遗留，写新代码时用上述变量替代。

### ★★ 图表质量跃升清单（想让图"专业耐看"，先过这 6 条——建议而非强制）

同一套 `setup_style()` 下，图的档次差别几乎全来自下面 6 条，而**不是**图内文字多少。经对 94 张真实竞赛图的逐图核对，高分图与平庸图的差距集中在这里。**按题目实际需要挑用，不要为凑指标硬加**：

1. **多 panel 并陈，别一图一事**：相关的几件事放进同一张图的 2-4 个 panel（如"分布 + 与上限对照"、"主结果 + 残差诊断"、"处理前 ‖ 处理后"）。读者一眼看到关联，比分成 3 张孤图强得多。用 `plt.subplots(2,2)` 或 `GridSpec`（要不等宽/不等高时用后者）。**平庸图的典型特征就是每张都单 panel。**
2. **判据可视化——把"该不该越界"画出来**：有阈值/上限/约束/合格线时，画一条 `axhline`/`axvline`（虚线 + 线旁短标签），让读者直接看到"实测离限还有多远"。这是"有判据"和"只有一堆曲线"的分水岭。
3. **表达不确定性**：有多次重复/置信区间/误差范围时，用 `fill_between` 画置信带或 `errorbar` 画误差棒，不要只画一条均值线。一条光溜的线读者无法判断可信度。
4. **图型跟着数据形态走，别一律折线柱状**：三维响应面用 `plot_surface`、分布形态用小提琴/Rain Cloud、密集散点用 `hexbin`、流向用桑基、排序驱动因子用 Tornado（见上方决策表）。**只会 plot/bar/scatter 是平庸图最明显的信号。**
5. **色彩层次用派生色**：同族深浅用 `_lighten(PALETTE[i], 0.5)` 做填充/次要元素，主色留给主体。比"每条线换一个色相"更高级、更像期刊图。
6. **图层次序 `zorder`**：网格/参考带在底（`zorder=0-1`）、数据在中（`2-3`）、标注在顶（`4+`）。不设 zorder 时数据可能被网格线或填充压住。

**配套的两条工程习惯**（能明显减少返工）：
- **共用引导模块**：图多于 5 张时，建一个 `figures/_figbase.py` 放公共内容——JSON 载入、指标口径函数（如 `rel_err`/`acc90`，**与建模阶段口径一致**避免各图各算导致论文数字打架）、`log_floor(vals)` 函数（对数轴零值地板：真值为 0 时用它占位并单独标注，**禁止静默丢点**；⛔ 地板要**按各图真实数据下界现算**、贴着最小值下方半个数量级，**别写死 `1e-18` 这类极小常量**——会把对数轴撑到 6+ 个数量级、图边一大片空白，详见技法 11）、中文缺字替换（雅黑缺 `⛔✔⚠ν̈` 等字符，PDF 里会渲染成空白方框，统一过一个 `cn()` 函数替换）。各 `gen_fig_*.py` 统一 `from _figbase import ...`，避免几十份脚本重复样板。
- **每个脚本写文件级 docstring**：开头用三引号写明「本图讲什么 + 每个 panel 是什么 + 数据来源哪个 JSON + 关键数值」。这不是形式主义——写的过程会迫使你先想清楚"这张图要让读者看到什么"，是"先想再画"和"边画边凑"的分界。有余力时连版式一起写（如"原生宽 8.2in，正文按 0.98\textwidth 引用 → 缩放约 0.75，最小字号上页 ≥6pt"），能提前避免"缩到页面上字看不清"。

⛔⛔ **和下面「图内文字最小化」的关系（别搞反）**：本清单要求的是**信息密度高**，文字最小化要求的是**文字载体少**——两者不矛盾。减的是"文字"这个载体，不是"信息"。信息应该由 **panel 布局、判据线、置信带、图注(caption)** 承载。**绝不要为了"图内少写字"就把多 panel、置信带、判据线一起砍掉——那是把好图做成贫乏图，比遮挡更糟。**

### ⛔ 工程卫生（保证"图是可信的工程产物"）
- **数值/常数从真实来源读**：坐标、阈值、统计量、每个 bar 的高度应来自计算结果或数据文件（如 `results.json`、`df`），不要在绘图脚本里凭空写死来路不明的数字。图里的每个数字都要对得上正文。
- **连续 colormap 优先走 PALETTE 派生**：需要连续色阶时（热力图、3D surface、密度图），优先 `LinearSegmentedColormap.from_list(..., [_lighten(PALETTE[0],0.7), PALETTE[0]])`；少用硬编码 `cmap='viridis'/'YlOrRd'`（与随机配色不同步），`jet` 有感知误导不要用。
- **异量纲隔离，别强行同轴**：单位/量级差异大的量（如"时间 s"和"百分比 %"）不要塞进同一个 Y 轴。用双轴 `ax.twinx()`（各自标注单位）或拆成上下 panel。同轴混画不同量纲会让读者误判相对大小。
- **图能独立复现**：脚本从数据到 `save_fig` 一条龙跑通，不依赖手动改数或某次交互状态；交付前顺手清掉调试残留（`plt.show()`、被注释掉的整段旧画法）。

### 柱状图（Bar Chart）
- **2 组对比**：用同色系深浅（如 `PALETTE[0]` + `PALETTE_LIGHT[0]`），不要用两种完全不同的颜色
- **3-5 组对比**：用 PALETTE 前 3-5 色，饱和度统一
- **单组多类别**：用同一色系的渐变（如从 `PALETTE[0]` 到 `PALETTE_LIGHT[0]` 的 n 个梯度），不要每根柱子一个颜色
- **⛔ 禁止**：plt.cm 渐变色、matplotlib 默认蓝色、超过 6 种不同颜色

### 折线图（Line Chart）
- **2-3 条线**：用高对比色（如 PALETTE[0] 实线 + PALETTE[1] 虚线），线宽 2pt，加标记点
- **4+ 条线**：用 PALETTE 前 n 色，不同线型（实线/虚线/点线/点划线）区分
- **带 CI 带**：主线用 PALETTE[0]，CI 带用同色 alpha=0.15
- **⛔ 禁止**：所有线同色、线宽 <1.5pt、无标记点

### 饼图（Pie Chart）
- 用 PALETTE 前 n 色 + `wedgeprops={'edgecolor':'white', 'linewidth':2}`
- 最大扇区用 PALETTE[0]，其余按大小排序用后续色
- 小于 5% 的扇区合并为"其他"
- **⛔ 禁止**：超过 7 个扇区、无白色分隔线、3D 效果

### 热力图（Heatmap）
- 相关性矩阵（正负对比）：`cmap='coolwarm'`，`center=0`，下三角 mask。**⛔ 不要用 `RdBu_r`**——深红深蓝太沉重，`coolwarm` 更柔和
- 方法对比热力图（归一化性能）：`cmap='YlGnBu'` 或 `cmap='coolwarm'`，浅色背景+深色高亮，配合白色数值标注
- 频率/计数：`cmap='YlOrRd'` 或 `cmap='Blues'`
- **⛔ 禁止**：`jet` colormap、`RdBu_r`（太深沉）、无数值标注、全矩阵（不 mask）
- **⛔ 反模式**：≤5 行的方法对比不要用深色热力图，改用 Radar chart 或 Dumbbell chart

### 散点图（Scatter）
- 单组：PALETTE[0]，`alpha=0.6`，`s=20-40`
- 多组：PALETTE 前 n 色，不同标记形状（o/s/^/D）
- 加回归线：`color=PALETTE[1]`，虚线

### 箱线图/小提琴图
- 用 PALETTE_LIGHT 填充 + PALETTE 边框
- 中位线用深色加粗

## 配色方案

### ★ 默认：裸调 `setup_style()`，不要传 palette 参数

```python
setup_style()   # ← 就这样，不带参数
```

**为什么不传参数：** `setup_style()` 不带参数时进入「自动去指纹随机模式」——它按**当前工作区**的确定性种子，从内置的 29 套精选配色库里自动挑一套，并同步随机版式风格（边框/刻度/网格/线宽）和中文字体。效果是：

- **同一篇论文内所有图表配色/风格统一**（同种子）；
- **不同论文各不相同**（种子按工作区变）；
- **重跑结果不变**（确定性，可复现，绝不用时间戳）。

这正是防「不同队伍/不同论文图表撞脸」的核心机制。**⛔ 除非下面列出的特殊情况，否则一律裸调 `setup_style()`，不要自己指定 `palette='soft'`/`'npg'` 之类——那样会关掉自动随机，让所有论文退回同一套固定配色（同质化）。**

### 什么时候才显式传 palette（例外）

只有这几种情况才传具体配色名：

1. **用户在前端手动指定了配色**：此时工作区 `CLAUDE.md` 会带 `MH_DATA_FIG_PALETTE=xxx` 标记，`setup_style()`（仍裸调）会自动读取并锁定该配色——**你不需要在代码里写 palette 参数**，读标记是库内部做的。
2. **用户要求色盲无障碍**：`setup_style(palette='colorblind')`。
3. **调试/复现某套特定配色**：临时传名字，正式出图前改回裸调。

可用的配色名（供例外情况参考，正常出图无需关心）：`soft`（柔蓝珊瑚薄荷）、`journal`（低饱和莫兰迪，SCI 顶刊感）、`tableau`（10 色高区分度）、`npg`（自然科学鲜明对比）、`nejm`（统计/医学柔和）、`science`（IEEE/工程经典）、`colorblind`（无障碍）。传列表也行：`setup_style(palette=['#5B9BD5','#ED7D7D',...])`。

### 用色规范（不管哪套配色都适用）

- 代码里用色一律引用 `PALETTE[0]`、`PALETTE[1]`… 和 `COLORS['primary']` 等**语义变量**，它们会随 `setup_style()` 选中的配色自动变化。**⛔ 绝不硬编码十六进制色值**（如 `color='#5B9BD5'`），硬编码会绕过随机、造成跨论文撞色。
- **⛔ 绝不用 matplotlib 默认色** `#1f77b4`（那种"默认蓝"是最明显的"没调过样式"信号）。
- **渐变色（热力图/填充）**：用 `cmap='coolwarm'`（红蓝对比柔和版）或 `cmap='YlOrRd'`（暖色渐变），不要用 `jet` 或 `RdBu_r`（太深沉）。

## 字体与排版

```python
plt.rcParams.update({
    'font.size': 11,                    # 正文字号
    'axes.labelsize': 12,               # 坐标轴标签稍大
    'axes.titlesize': 13,               # 标题再大一号
    'xtick.labelsize': 10,
    'ytick.labelsize': 10,
    'legend.fontsize': 10,
    'font.family': 'sans-serif',
    'mathtext.fontset': 'stix',         # 数学字体用 STIX（接近 Times）
})
```

## 让图表更高级的技巧

### 1. 去掉顶部和右侧边框（已在 plot_utils 中默认）
```python
ax.spines['top'].set_visible(False)
ax.spines['right'].set_visible(False)
```

### 2. 柱状图加数值标注
```python
for bar in bars:
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.5,
            f'{bar.get_height():.1f}', ha='center', va='bottom', fontsize=9)
```

### 3. 折线图加标记点 + 置信带
```python
ax.plot(x, y, 'o-', markersize=5, linewidth=1.5, color=NATURE[0])
ax.fill_between(x, y_low, y_high, alpha=0.15, color=NATURE[0])
```

### 4. 热力图用 mask 只显示下三角
```python
mask = np.triu(np.ones_like(corr, dtype=bool), k=1)
sns.heatmap(corr, mask=mask, annot=True, fmt='.2f', cmap='coolwarm', center=0)
```

### 5. 回归系数森林图（实证论文核心图）
```python
ax.errorbar(coefs, y_pos, xerr=[coefs-ci_low, ci_high-coefs],
            fmt='o', color=NATURE[3], ecolor='#95A5A6', capsize=4, markersize=6)
ax.axvline(x=0, color=NATURE[0], linestyle='--', linewidth=0.8, alpha=0.7)
```

### 6. 分组柱状图加误差棒
```python
bars = ax.bar(x + offset, vals, width, yerr=errs, capsize=3,
              color=NATURE[i], edgecolor='white', linewidth=0.5)
```

### 7. 多面板子图对齐
```python
fig, axes = plt.subplots(2, 2, figsize=(5.0, 4.9))   # ⛔ 2×2 属「近方图」→ 只给 5.0in（见下「硬规则」分档表）
fig.tight_layout(pad=0.5)
# 每个子图加 (a) (b) (c) (d) 标签 — 用 set_title 紧贴子图顶部
for i, ax in enumerate(axes.flat):
    ax.set_title(f'({chr(97+i)})', fontsize=11, fontweight='bold', loc='left', pad=3)
```

> **⛔ tight_layout 的 pad 值必须 ≤ 0.5。**
> `pad=2.0` 在 SciencePlots 样式下会导致子图被压缩到极小（因为 SciencePlots 设置了紧凑的 subplot margins，
> 大 pad 值会进一步挤压子图空间）。推荐值：`pad=0.5`（默认）、`pad=0.3`（紧凑多面板）。
> 如果需要子图间距更大，用 `hspace`/`wspace` 参数而不是增大 pad。

> **⛔ 子图标注必须用 `ax.set_title()` 而不是 `ax.text(transAxes)`。**
> 原因：`ax.text(-0.08, 1.05, ..., transform=ax.transAxes)` 的坐标是相对于 axes 逻辑区域的，
> 但 `set_aspect('equal')` 或 `constrained_layout` 会让实际绘图区域在分配空间内缩小，
> 导致 `y=1.05` 看起来离图很远。`set_title(loc='left', pad=3)` 会自动贴着实际渲染出的
> axes 边框上方，不受 aspect ratio 影响。

### 8. 保存时确保高质量
```python
save_fig(fig, 'figures/fig_xxx.pdf')
```

### 9. 分布图用 `stairs` 阶梯轮廓，别用 `bar` 堆砖块（最省力的"高级感"）
画分布/直方图时，`ax.bar` 画出来是一排砖块、边框粗重；`ax.stairs` 是连续阶梯轮廓 + 填充，
期刊感强得多，而且相邻 bin 之间没有多余竖线干扰。**同样的数据，观感差一档**：

```python
counts, edges = np.histogram(vals, bins=np.arange(3.5, 22.5, 1.0))
ax.stairs(counts, edges, fill=True,
          color=_lighten(PALETTE[0], 0.50),   # 浅色填充
          edgecolor=PALETTE[0], lw=1.5, zorder=4)
```
需要上下对镜像对照（如"真实分布 vs 预测分布"）时，把一侧取负即可，比并排双色柱更直观：
```python
ax.stairs(share_true * 100, edges, fill=True, color=_lighten(PALETTE[2], 0.48), edgecolor=PALETTE[2])
ax.stairs(-share_pred * 100, edges, fill=True, color=_lighten(PALETTE[0], 0.48), edgecolor=PALETTE[0])
ax.axhline(0, lw=1.2, color=COLORS['text'])          # 镜像轴
# 负半轴标成正数（读者看的是"占比"不是负值）；⛔ 必须先 set_yticks 再 set_yticklabels，
# 否则 matplotlib 会报 FixedFormatter 警告、且换版本后标签可能对不上刻度
_yt = ax.get_yticks()
ax.set_yticks(_yt)
ax.set_yticklabels([f'{abs(t):.0f}' for t in _yt])
```

### 10. 量化两个值的差距：用双向箭头，不要写文字框
要说明"A 比 B 高多少"时，**别写一句话塞进图内**——在两点之间画双向箭头 + 一个短标签，
读者一眼看到"差在哪、差多少"，且几乎不占地方（这也是「图内文字最小化」的正解）：

```python
ax.annotate('', xy=(q_high, y), xytext=(q_low, y),
            arrowprops=dict(arrowstyle='<->', color=PALETTE[4], lw=1.5))
ax.text((q_low + q_high) / 2, y - 0.05, f'差 {(q_high - q_low) * 100:.1f} pp',
        ha='center', va='top', fontsize=8.5, fontweight='bold', color=PALETTE[4])
```
适用：两条 ECDF 在某分位处的差距、改进前后的提升量、上限与实测的余量、两方案的间隔。

### 11. 对数轴的零值地板：`0` 会被静默丢掉，必须显式处理 —— 但**地板要贴近数据，不能"远低于"**
`set_yscale('log')` / `set_xscale('log')` 时，值为 `0` 的点会被 matplotlib **无声丢弃**——
图上少了点却没有任何提示，这是很隐蔽的数据不诚实。所以要用地板值占位 + 单独标注。

⛔⛔ **但地板值必须【贴近真实数据下界】，绝不能设成"远低于数据量级"的极小值。**
（实测翻车：某 ECDF 图真实数据主体在 $10^1\sim10^2$ nm、1% 分位才 3.7nm，地板却设 `1e-3` →
对数轴被撑到 **6.1 个数量级**，左边约 **40% 的图宽是纯空白**，曲线在那段只是一条平线，
图看着"左边空一大片"。地板改到 0.5nm 后轴跨降到 3.5 个数量级，空白基本消失。）

**定地板的方法（三步）**：
```python
nz = vals[vals > 0]
# ⛔ 相交/重合等情形会产出 1e-15 量级的浮点残差，那不是真实数据，要和 0 一起归为"零"
EPS = 1e-6
real = nz[nz > EPS]
LOG_FLOOR = 10 ** (np.floor(np.log10(real.min())) - 0.5)   # ① 贴着真实最小值下方半个数量级
plot_v = np.where(vals > EPS, vals, LOG_FLOOR)
ax.set_yscale('log')
ax.set_ylim(LOG_FLOOR * 0.7, real.max() * 1.3)             # ② 轴界贴着地板给，别再往下留空
ax.scatter(x, plot_v, color=PALETTE[0])
n_zero = int((vals <= EPS).sum())
if n_zero:                                                 # ③ 地板并了多少点，必须写出来
    ax.scatter(x[vals <= EPS], np.full(n_zero, LOG_FLOOR),
               marker='v', color=COLORS['down'], zorder=6)
    ax.text(LOG_FLOOR * 0.8, ax.get_ylim()[1], f'← {n_zero} 个 = 0 并入左端',
            fontsize=7.2, ha='left', va='top')
```
**自检**：算一下 `log10(轴上界/轴下界)`。**超过 4 个数量级就要警觉**——除非数据真的横跨那么多量级，
否则就是地板设太低。真实数据只跨 2 个量级时，别让轴跨 6 个。

#### ⛔⛔ 更上位的原则：**轴只覆盖「有数据的区间」，别为极少数极端点留一大段空轴**

上面的地板技巧治的是"地板设太低"，但**真正的病根常常是"为了把某个东西画进轴内，让轴覆盖了没有数据的一大段"**。
调地板治不了这种（实测踩过完整一轮，三版数据在此）：

| 做法 | 轴跨 | 曲线真正在变化的横向占比 |
|---|---|---|
| 地板 `1e-3`、左界 8e-4 | 6.10 | 11% / 21% / 20% |
| 地板抬到 `0.5`、左界 0.35（"贴近数据下界"） | 3.46 | 12% / 31% / 29% |
| **左界直接设 10（砍掉无数据段）** | **2.00** | **12% / 44% / 36%** |

那张 ECDF 图：判据线 δ=1.8nm 想画进轴内，但 90.8% 的点在 100nm 以上、0.5–13nm 只有 **1.24%** 的点，
δ 处的纵截距几乎全由 d=0 的相交对贡献 —— **δ 附近本来就没数据**。于是：
- 左界拉到 0.35 → 左边 64% 图宽是平线；抬到 10nm 仍有 43%
- 连**断轴双 panel 也没用**：左 panel 曲线只上升 0.016–0.038、有变化占比仅 1–19%，还是平线

**⛔⛔ 第 0 步（比下面所有事都靠前）：定轴范围前，先打印数据真实 min/max。**
不是"心里大概有数"，是**真的打印出来看一眼**。实测踩过的坑：主胞边长常量 `L = 10000`，
而数据坐标系其实以原点为中心（`[-L/2, +L/2]`），脚本却写了 `set_xlim(0, L)` ——
负坐标那一半（实测 46%~79% 的点）被静默裁到轴外，图上只剩挤在角落的一小撮。
matplotlib 不报错、静态检查也扫不出来，就这么进了成品 PDF。

```python
A = np.vstack([P, Q])            # 或任何即将画上去的数组
for k, nm in enumerate('xyz'[:A.shape[1]]):
    print(f'{nm}: {A[:, k].min():.1f} .. {A[:, k].max():.1f}')
```

**常量名会骗人**：`L` / `SIZE` / `LENGTH` 到底是「边长」还是「坐标上界」？去常量定义处
确认，别猜——本例 `code/params.py` 里写得很清楚：`HALF = L / 2  # 半边长，坐标上下界`。
`save_fig` 里有运行时兜底闸（>20% 的点落在轴外就打警告），但那是最后一道网，别指望它。

**然后才是：先问「这段轴上有数据吗」，再谈地板怎么设。**
1. 看分位数/直方计数定出"数据真正密集的起点"，**轴界就设在那里**（如 `set_xlim(10, 1000)`）；
2. 落在轴外的极少数点、以及关键判据值，**用图例标签或一行注记承载数值**，不要为它们留一段空轴。
   例：`label=f"{组名}（{n} 对；δ 处 {frac:.2%}）"` —— 图例既标识曲线又给关键数值，比图内再塞
   一个文字框干净；再补一行"`d<10nm` 的点占 1.24%（其中 187 对已相交），贡献已计入曲线左端起始高度"。
3. ⛔ 但**必须写明轴外还有多少点、去哪了**，否则是数据不诚实。

**ECDF 尤其不需要地板**：`F(x)=P(X≤x)` 已把 `d=0` 的点算进任意 `x>0` 处的高度，
用全量算 ECDF、只在显示上裁 x 范围即可，`d=0` 体现为"曲线左端的起始高度"，零信息损失。

### 12. 同一物理量两种口径并列：加第二坐标轴（`twiny`/`twinx`）做换算刻度
当一个量有两种等价表述（时长↔效率、原值↔百分比、绝对量↔归一化），不要画两张图、也不要
只标一种让读者自己换算——在**同一根轴的对面**加换算刻度，一张图读两种口径：

```python
ax.set_xlabel(r'PPDU 时长 $T$ (ms)')
axt = ax.twiny()                       # 上方第二 x 轴
axt.set_xlim(ax.get_xlim())            # ⛔ 必须同步范围，否则刻度对不上
ticks = np.array([1.0, 2.0, 3.0, 4.5])
axt.set_xticks(ticks)
axt.set_xticklabels([f'{t / (t + 0.144):.3f}' for t in ticks])   # 换算成占空效率
axt.set_xlabel(r'对应占空效率 $\varsigma = T/(T+144\,\mu s)$', labelpad=3)
axt.tick_params(axis='x', length=2.5)
```
⛔ 注意与「异量纲隔离」的区别：这里是**同一个量的两种口径**（可换算）才用；两个**不同物理量**
（时间 vs 百分比）挤一根轴是错的，那种情况要用 `twinx` 各自标单位、或干脆拆 panel。

### 13. QQ 图加 95% 逐点包络（比一根参考线专业得多）
只画一条正态参考线，读者无法判断"偏离多少才算显著"。用 Beta 序统计量算出逐点置信包络，
越出包络的才是真尾部偏离：

```python
from scipy import stats
(osm, osr), (slope, icpt, r) = stats.probplot(resid, dist='norm')
ax.scatter(osm, osr, s=10, color=PALETTE[0], alpha=0.55, rasterized=True)
ax.plot([osm.min(), osm.max()], [slope * osm.min() + icpt, slope * osm.max() + icpt],
        '--', color=PALETTE[1], lw=1.6, label=f'正态参考线（$R^2$={r**2:.4f}）')
n = resid.size; k = np.arange(1, n + 1)          # 第 k 个序统计量服从 Beta(k, n-k+1)
lo = stats.norm.ppf(stats.beta.ppf(0.025, k, n - k + 1)) * slope + icpt
hi = stats.norm.ppf(stats.beta.ppf(0.975, k, n - k + 1)) * slope + icpt
ax.fill_between(np.sort(osm), lo, hi, color=PALETTE[3], alpha=0.22, label='95% 逐点包络')
```

### 14. 大量散点加 `rasterized=True`（控制 PDF 体积，不牺牲文字清晰度）
上千个散点写进矢量 PDF 会让文件膨胀到几 MB、打开卡顿。给**数据层**开栅格化，
坐标轴/文字仍是矢量（缩放不虚）：

```python
ax.scatter(x, y, s=9, color=PALETTE[0], alpha=0.34, linewidths=0,
           rasterized=True)          # 只栅格化点，标签文字仍矢量
```
适用：散点云 > 500 点、蜂群图、密集轨迹。热力图/柱状图不需要。

### 15. ★★ 版面精调六件套（"看起来专业"的直接来源，实测差距最大的一组）

对 94 张真实竞赛图统计：高分图集和平庸图集在这六项上的差距是**压倒性**的（前者 46%-82% 都做，
后者 0%-17%）。**图型选对了但还是显得"业余"，八成是这六项没做。**
⛔ 下面给的数值是精调后的参考量级，**按你的图实际调整，不要当死数照抄**。

**① 手动指定刻度位置（差距最大：82% vs 7%）**
matplotlib 默认刻度经常给出 `0 / 2.5 / 5.0 / 7.5` 这种无意义分割，或者密到糊掉。
自己按**数据语义**挑刻度，尤其**把关键阈值/上限/范围端点塞进刻度**——读者能直接从轴上读出结论：

```python
ax.set_xticks([4, 8, 12, 16, 21])        # 21 是题给硬上限 → 进刻度，一眼看出实测顶到上限
ax.set_yticks([0, 0.2, 0.4, 0.6, 0.8, 0.9, 1.0])   # 0.9 是 Q90 判据线 → 单独加一个刻度
# 数据范围很窄时（如 0.41~0.44）别让 matplotlib 给 0/0.2/0.4，那样细节全糊：
ax.set_yticks([0.41, 0.42, 0.43, 0.44])
# 刻度本身无意义时（状态矩阵、类别条形的位置轴）主动清空，别留一排没用的数字：
ax.set_yticks([])
```

**② 字号定义成常量族，不要每处随手写（46% vs 0%）**
随手写字号会导致同一张图里标注 8pt、9pt、8.5pt 混用，看着"脏"。开头定一套层级，全图复用：

```python
FS_ANNO, FS_TICK, FS_LAB, FS_TITLE, FS_LEG = 8.4, 9.0, 10.4, 11.4, 8.6
#         标注    刻度    轴标签   面板标题  图例
ax.set_xlabel('...', fontsize=FS_LAB)
ax.tick_params(labelsize=FS_TICK)
ax.set_title('(a) ...', fontsize=FS_TITLE, fontweight='bold', loc='left', pad=5)
```
层级关系（**标注 < 刻度 < 轴标签 < 面板标题**）比具体数值更重要。

#### ⛔⛔ 硬规则：`figsize` 原生宽要**贴合该图长宽比档位的上页显示宽**（治"坐标轴糊成一团 + 线条发虚"的真根因）

**这是实测坐实的翻车根因，不是风格偏好。** 竞赛/期刊单栏正文宽只有 **约 6.5in**。
你把图画成 10in 宽，插进论文必然被缩到一半 —— **图里所有字号和线宽同比腰斩**：

真实案例（国赛 A 题 `fig_q4_snapshots`，4-panel 队形快照）：
| 元素 | 代码里写的 | 原生 10.4in 缩到 5.5in（比 0.53）后上页 | 后果 |
|---|---|---|---|
| 刻度 `labelsize` | 8.5pt | **4.5pt** | 刻度数字挤成一团、看着像"坐标轴乱套" |
| 轴标签 | 9.5pt | 5.0pt | 看不清 |
| 面板标题 | 10.5pt | 5.6pt | 看不清 |
| 数据线 `lw` | 0.6 | **0.32pt** | 低于印刷可辨极限 → 整张图"发虚/模糊" |

**⛔ 动手写 `figsize` 前先算这一步（一行心算，别跳过）：**
```
上页字号 = 代码字号 × (论文引用宽 ÷ 原生figsize宽)
```
**⛔⛔ 关键：不是"一律 ≤7.2in"，而是「原生宽 ≈ 上页显示宽」。**
`fig_include_size.py` 会**按你图的长宽比 r=高/宽 分档**决定 `\includegraphics` 的宽度系数，
不同长宽比的图上页显示宽差一倍多。**原生宽要贴着那个显示宽写**，才不被缩：

| 图的长宽比 r=高/宽 | 分档给的 width | 上页显示宽 | **原生 figsize 宽该写** | 举例 |
|---|---|---|---|---|
| r ≤ 0.80（横图/宽图） | `0.85\textwidth` | 5.53in | **6.0in** | `(6.0, 3.8)` 单图、`(6.0, 2.8)` 1×2 横排 |
| 0.80 < r ≤ 1.20（**近方图**） | `0.70\textwidth` | 4.55in | **5.0in** | `(5.0, 4.9)` 2×2、`(5.0, 4.8)` 等比例几何图 |
| 1.20 < r ≤ 1.60（偏竖） | `0.50\textwidth` | 3.25in | **3.6in** | `(3.6, 5.0)` |
| r > 1.60（瘦高） | `0.42\textwidth` | 2.73in | **3.0in** | `(3.0, 5.4)` |

（实测这六种推荐值算出的缩放比都是 **0.90–0.92**，正中目标区间。
⛔ 唯一例外：`fig_include_size.py` 还有个 `height ≤ 0.80\textheight`≈7.76in 的上限，
**只有 r > 2.84 的极端瘦高图**（如条目极多的 barh）会被高度反制、显示得更窄 —— 此时按
`原生宽 = 7.76 ÷ r × 1.1` 另算；前三档的长宽比定义域压根到不了触发线，不必操心。）

⛔ **最容易踩的坑：2×2 多 panel 和等比例几何图都是"近方图"，只能给到 `5.0in` 左右。**
写成 7.2in 看着"没超 7.5"，实际仍被缩到 **0.63** → 刻度 8.5pt 变 5.4pt，病没治好。
（实测：国赛A题 13 张图按此表定尺寸后，缩放比 0.92–1.10、刻度上页 7.8–9.4pt、重叠 0 处。）

**心算一步再动手：** `上页字号 = 代码字号 × (上页显示宽 ÷ 原生figsize宽)`，目标**缩放比 0.9–1.1**。
矢量图**略微放大(1.0–1.6)完全无害**，字反而更大更清楚 —— 所以"原生宁可略小于显示宽"，
**怕的只有"原生远大于显示宽"**。

- ⛔ **需要更多信息量时"加 panel 密度"，不要"把画布摊大"** —— 画布越大缩得越狠，字反而越小。
- ⛔ 数据线 `lw` 下限 **0.9**（缩放后仍 ≥0.7pt）；参考线/网格线可 0.6–0.8，但**数据线不能低于 0.9**。
- ⛔ 刻度字号下限 **8pt**、轴标签 **9pt**。

#### ⛔⛔ 多 panel 共用 colorbar：必须用 gridspec 的 cax，**不能用 `ax=axes`**（实测踩过）

**根因（实测坐实，别再试参数）：** `save_fig` 内部会**无条件**跑 `fig.tight_layout(pad=0.5)`
（见 `plot_utils._save`），而 `fig.colorbar(sm, ax=axes)` 预留的空间**会被 tight_layout 重算掉**
→ 面板扩张回去、压到 colorbar 上 → **右列面板的刻度数字和 colorbar 的刻度数字叠在一起**。
⛔ 调 `fraction`/`pad` 治不了：实测 `pad=0.08/0.11/0.14` 重叠一直在。
⛔ 也**别用 `constrained_layout=True`**：`plot_utils` 已设 `figure.constrained_layout.use=False`
（避免与 tight_layout 冲突），开了会打架。

**正确写法 —— 把 cax 做成 gridspec 的一列，tight_layout 就会把它当同级一起排：**
```python
fig = plt.figure(figsize=(5.4, 4.9))                      # 近方图 → 5.0-5.4in（见上表）
gs  = fig.add_gridspec(2, 3, width_ratios=[1, 1, 0.055],  # 第3列留给 colorbar
                       wspace=0.30, hspace=0.34)
axes = np.array([[fig.add_subplot(gs[0, 0]), fig.add_subplot(gs[0, 1])],
                 [fig.add_subplot(gs[1, 0]), fig.add_subplot(gs[1, 1])]])
cax  = fig.add_subplot(gs[:, 2])                          # 跨两行
cbar = fig.colorbar(sm, cax=cax)                          # ⛔ 用 cax=，不是 ax=axes
cbar.set_label('...', fontsize=9.5, labelpad=8)           # 标签长了会撞自己的刻度 → 加 labelpad
cbar.ax.tick_params(labelsize=8.5)
```
- 单 panel 用 `fig.colorbar(sm, ax=ax, fraction=0.046, pad=0.03)` 没问题（只一个 axes，不会被挤）
- colorbar 标签**宁短勿长**：`把手序号（龙头→龙尾）` 就够，详细口径写进 `\caption{}`
  （实测长标签 `把手节号（0=龙头 → 223=龙尾后把手）` 会横跨过去压到自己的刻度数字上）

#### ⛔ 2×2 多 panel 的轴标签：只在下排标 x、左列标 y
画布收到 5in 级别后，**上排的 `xlabel` 会和下排的 `title` 撞在同一高度**（实测重叠）。
```python
for i, ax in enumerate(axes.flat):
    if i >= 2:      ax.set_xlabel('x (m)', fontsize=9.5)   # 只下排
    if i % 2 == 0:  ax.set_ylabel('y (m)', fontsize=9.5)   # 只左列
    ax.xaxis.set_major_locator(MaxNLocator(nbins=5))       # 画布小了刻度会挤 → 限档数
    ax.yaxis.set_major_locator(MaxNLocator(nbins=5))
```

**③ 图例去框 + 收紧（37% vs 0%）**
默认图例带灰边框、条目松散，占地方还显土。去框 + 收紧间距：

```python
ax.legend(frameon=False,          # ★ 去掉那个灰框
          fontsize=FS_LEG,
          handlelength=1.7,       # 默认 2.0 偏长
          labelspacing=0.28,      # 默认 0.5 偏松
          handletextpad=0.36,
          borderpad=0.2,
          loc='upper right')      # 位置按数据空白区挑，挤就 bbox_to_anchor 移轴外
```

**④ 浅色填充 + 主色描边（`_lighten` 用了 113 次 vs 0 次）**
这是"层次感"最廉价也最有效的来源：**填充用同色浅版、边线用主色**，而不是整块实色。
比"每个系列换一个色相"高级得多，也不会让图变成调色盘：

```python
ax.stairs(counts, edges, fill=True,
          color=_lighten(PALETTE[0], 0.50),   # 填充：主色的浅版（0.4~0.6 最常用）
          edgecolor=PALETTE[0], lw=1.5)       # 描边：主色本身
ax.bar(x, y, color=_lighten(PALETTE[1], 0.44), edgecolor=PALETTE[1], linewidth=1.4)
ax.fill_between(x, lo, hi, color=_lighten(PALETTE[2], 0.60), alpha=0.42)  # 置信带更浅
```
`_lighten` 系数经验值：**主体填充 0.4~0.5**、**背景带/次要元素 0.55~0.7**、**渐变起点 0.6~0.8**。

**⑤ `zorder` 分层 + 关键点白描边（95% / 86%）**
不设 `zorder` 时数据可能被网格线或填充压住；关键标记点加白描边能从密集背景里"跳出来"：

```python
# 层次约定：参考带/网格 0-2 → 填充 3 → 数据主体 4-6 → 关键标记 7-9
ax.fill_between(x, lo, hi, color=..., alpha=0.2, zorder=2)
ax.plot(x, y, lw=2.0, color=PALETTE[0], zorder=6)
ax.scatter(x_key, y_key, s=86, color=PALETTE[2], zorder=8,
           edgecolors='white', linewidths=1.1)      # ★ 白描边=从背景里跳出来
ax.plot(x, y, '-o', markersize=4.4, markeredgecolor='white', markeredgewidth=0.7)
```

**⑥ 多 panel 用 `subplots_adjust` 手动抠边距（46% vs 0%）**
`tight_layout()` 是自动的、经常留一圈多余白边或把标签挤掉。多 panel 图最后手动定一次：

```python
gs = gridspec.GridSpec(2, 2, hspace=0.44, wspace=0.24,   # 子图间距：0.24~0.52 常用
                       height_ratios=[1.0, 1.06])        # 行高微调（下排放长标签就给多点）
# ... 画完所有 panel 后 ...
fig.subplots_adjust(left=0.075, right=0.985, bottom=0.062, top=0.945)
```
判据：**打开图看四周白边是否均匀、有没有标签被裁**。`hspace` 不足时下排 panel 的 x 轴标签会
顶到上排 panel 的底部——这是多 panel 图最常见的挤压。

## 避免的常见丑图

- ❌ 默认蓝色单色（用多色配色方案）
- ❌ 图内加 `plt.title()`（标题只在 LaTeX caption 中）
- ❌ 默认灰色网格线（去掉或用极淡的虚线）
- ❌ 图例遮挡数据（放在空白区域或图外）
- ❌ 坐标轴标签用变量名（如 `col_1`，应改为有意义的中文/英文标签）
- ❌ 字体太小（打印后看不清）
- ❌ 用 `jet` colormap（色盲不友好，用 `coolwarm` 或 `viridis`）

## ⛔ 防遮挡规则（文字/数据/曲线互相遮挡是最常见的图表质量问题）

### ⛔⛔ 上位原则：图内文字最小化，结论进图注（治遮挡的根，最先执行）
遮挡最常见的根因不是"没摆好"，而是**往绘图区塞了本不该进图的文字**。目标：**图内尽量不写字，最多留极简短标注**。放任何文字进图前先过下面三层闸。

**第 1 层·禁止（一律进 caption，不要浮在数据上）**
多行结论陈述、判据解释、方法说明、参数罗列——例如把这种框压在曲线上：

```
实测范围 4–21          ← ❌ 4 行统计结论浮在数据上，必然遮挡
中位 13.0
打满 21 的行占 5.12%
越界 0 行
```

这些是 caption 的活。caption 可以写得很长很详细，不占图、不遮挡、还能被检索，**信息零丢失**。判据：**≥2 行的文字框，一律移出图**。

**第 2 层·克制（真要标，优先用"不占绘图区"的机制，别手写 `ax.text`）**

| 想标的东西 | ❌ 别手写 | ✅ 改用 |
|---|---|---|
| 柱顶/条端数值 | `ax.text(x, h, f'{h}')` 逐个摆 | **`ax.bar_label(bars, fmt='%.2f', padding=2)`** — matplotlib 自动定位，天然防重叠 |
| 多条线/多个系列的身份 | 每条线旁写名字 | **图例**；4 条以上或图内挤 → `ax.legend(bbox_to_anchor=(1.02,1), loc='upper left')` 移到轴外 |
| 散点/极值点的标签 | 手调 `xytext` 偏移 | **`smart_labels(ax, xs, ys, texts)`** — 内部用 adjustText 物理模拟自动推开 |
| 多个标注点（≥3） | 全堆图顶 | 图内只放编号 **①②③**，含义列进 caption |
| 结论数值、占比、量级 | 图内文字框 | **caption** |
| 阈值/上限线的说明 | 一句话 | 线旁**一个短标签**（如 `上限 21`），细节进 caption |

**第 3 层·必需（不受限制，砍掉反而是残图）**
坐标轴标签 + 单位、图例、colorbar、隐藏刻度时的直接数据标注。这些是图可读的下限，**不要为了"少写字"删掉**。

**配额参考**：图内 `ax.text`/`annotate` **每个 panel ≤2 个、每个 ≤1 行**（按 panel 算，多 panel 图不必因此变挤）。超了先问："这句能不能进 caption？"能就搬走。

**万一信息非图内呈现不可**：拆一个专门的文字/图例**子面板**，或扩大边距留白区放，**绝不浮在数据上**。

⛔ **不要过度收缩**：本条减的是"文字"，不是"信息"和"图表能力"。该有的多 panel、置信带、判据线、丰富图型（见上方「图表质量跃升清单」）**一个都不能少**——把结论搬进 caption 是为了让图更清楚，不是把图做简陋。

### 图例位置
- **首选**：`ax.legend(loc='best')` 让 matplotlib 自动找空白区域
- **如果 best 还是遮挡**：移到图外 `ax.legend(bbox_to_anchor=(1.05, 1), loc='upper left')`
- **折线图 4+ 条线**：用图外图例，不要挤在图内
- **永远不要**：把图例放在数据密集区域的正中间

### 数值标注
- **柱状图标注**：放在柱子顶部上方（`va='bottom'`），不要放在柱子内部
- **如果柱子太矮标注会重叠**：只标注最大值和最小值，或用 `rotation=45` 斜着标
- **散点图标注**：用 `adjustText` 库自动避免重叠（`from adjustText import adjust_text`），或手动设 `xytext` 偏移
- **热力图数值**：字号用 8-9pt，如果格子太小就不标数值
- **⛔ 单条竖线标注（如 Makespan 线）**：线旁一个**短标签**即可，别放 X 轴刻度区（会和刻度重叠）。**只有 1-2 条竖线时**才把短标签贴到线顶：
  ```python
  # ❌ 错误：标注放在 X 轴附近，和刻度重叠
  ax.text(makespan, 0, f'Makespan={makespan}', color='red')
  # ✅ 正确（仅 1-2 条竖线）：短标签贴线顶，用 transform 定位
  ax.axvline(makespan, color='red', ls='--', lw=1.5)
  ax.text(makespan, 0.97, f'M={makespan}', color='red',
          transform=ax.get_xaxis_transform(), ha='right', va='top', fontsize=9)
  ```
- **⛔⛔ 多条竖线/多个标注（≥3 个）时禁止全堆图顶**（会层叠糊成一团，是最常见的遮挡事故）：改用**编号 ①②③ 标在各线旁 + 含义列进 caption**，或让标签**高低交替错开**；绝不把多个文字标签都塞到 `y=0.95` 顶部。呼应上位原则——说明性内容进图注，图内只留极短锚点。

### 曲线/数据点重叠
- **多条折线重叠**：用不同线型（实线/虚线/点线/点划线）+ 不同标记（o/s/^/D）区分
- **散点图数据密集**：降低 `alpha=0.5-0.7`，或用 hexbin/KDE 等高线代替
- **多组箱线图/小提琴图**：确保组间间距足够，`width` 不要超过 0.8

### 坐标轴标签
- **长标签**：用 `rotation=45, ha='right'` 斜着显示，或换行 `'第一行\n第二行'`
- **中文标签**：每个标签不超过 6 个字，超过就缩写或换行
- **刻度太密**：用 `ax.xaxis.set_major_locator(MaxNLocator(nbins=6))` 减少刻度数

### 通用技巧
```python
# 保存时确保不裁切标签
save_fig(fig, 'xxx.pdf')

# 自动调整子图间距
fig.tight_layout()

# 散点标注防重叠（需要 pip install adjustText）
from adjustText import adjust_text
texts = [ax.text(x[i], y[i], labels[i], fontsize=8) for i in range(len(x))]
adjust_text(texts, arrowprops=dict(arrowstyle='->', color='gray', lw=0.5))
```

## SciencePlots 库（可选）

如果环境中安装了 `SciencePlots`，可以一行代码切换到 Nature/IEEE 风格：
```python
# pip install SciencePlots
import scienceplots
plt.style.use(['science', 'no-latex'])  # 不依赖 LaTeX 的科学风格
# plt.style.use(['science', 'ieee'])    # IEEE 风格
# plt.style.use(['science', 'nature'])  # Nature 风格（需要 LaTeX）
```
注意：SciencePlots 的 `science` 和 `nature` 风格默认需要 LaTeX，用 `no-latex` 可以避免依赖。

## TikZ 技术路线图/架构图模板

TikZ 画出来丑的根本原因：没有颜色分层、没有分阶段色块、节点样式太朴素。好的技术路线图应该是分阶段分色、自上而下清晰流动的。

### 设计原则

1. **分阶段着色**：每个研究阶段用不同的背景色块（浅色填充 + 深色边框），一眼看出层次
2. **圆角矩形**：所有节点用 `rounded corners=4pt`，不要直角方框
3. **箭头统一**：用 `-{Stealth[length=6pt]}`，粗细 `line width=0.8pt`
4. **留白充足**：节点间距 ≥1cm，不要挤在一起
5. **字体统一**：节点内文字用 `\small` 或 `\footnotesize`，不要太大
6. **阴影可选**：`drop shadow` 增加层次感，但不要过度

### 模板 1/2/3：已废弃（被模板 4/9/10/11 替代）

模板 1（纵向路线图）、模板 2（问题关系图）、模板 3（模型架构图）是早期简单版本，存在左侧文字重叠、线穿过节点等问题。**⛔ 不要使用模板 1/2/3，改用模板 4/9/10/11。**

- 模板 1 的场景 → 用模板 4 或模板 9
- 模板 2 的场景 → 用模板 10（管道式）
- 模板 3 的场景 → Claude 自由画架构图，遵守防遮挡规则即可

### 模板 4：通用研究技术路线图（所有论文类型通用）

白底 + 浅灰虚线框分阶段 + 蓝色主节点（微阴影）+ 白色子节点 + 蓝色粗箭头。简洁专业，适合所有论文类型。不依赖 `backgrounds` 和 `fit` 库。

**完整代码**：
- 通用版：见 `demo_roadmap_template4.tex`
- 竞赛专用版（多问题双行+星号标注）：见 `demo_roadmap_competition.tex`

**竞赛论文必须参考 `demo_roadmap_competition.tex`**：每个问题可有 2 行主节点+子节点，子节点 4 个一排，用 `$^{\bigstar}$` 标注最优方法。

**使用规则：复制下面的完整代码，只改节点文字和数量。**

**核心样式定义**（直接复制到 tikzpicture 参数）：
```latex
\begin{tikzpicture}[scale=1.0,
    main/.style={rectangle, rounded corners=3pt,
        minimum width=5.5cm, minimum height=0.7cm,
        draw=blue!80, line width=0.7pt, fill=blue!6,
        font=\small\bfseries, align=center,
        drop shadow={opacity=0.15, shadow xshift=0.5pt, shadow yshift=-0.5pt}},
    sub/.style={rectangle, rounded corners=2pt,
        minimum width=2.4cm, minimum height=0.6cm,
        draw=teal!70, line width=0.5pt, fill=white,
        font=\footnotesize, align=center},
    dashbox/.style={rectangle, rounded corners=4pt,
        draw=gray!40, dashed, line width=0.7pt, fill=gray!2},
    bigarrow/.style={-stealth, line width=1.4pt, color=blue!70},
    smarrow/.style={-stealth, line width=0.5pt, color=gray!50},
    label/.style={font=\small\bfseries, color=black!70},
]
```

**每个阶段的结构模式**（重复此模式，改文字和子节点数量）：
```latex
% === 阶段 N ===
% 1. 虚线框（先画，节点覆盖在上面）
\node[dashbox, minimum width=13cm, minimum height=2cm] (boxN) at (0, Y) {};
\node[label, anchor=north west] at (boxN.north west) {\scriptsize 阶段名称};

% 2. 主节点（蓝色，居中）
\node[main] (mN) at (0, Y+0.35) {主步骤名称};

% 3. 子节点（白色，一行排列，间距 2.8cm）
\node[sub] (sNa) at (-4.2, Y-0.65) {方法A};
\node[sub] (sNb) at (-1.4, Y-0.65) {方法B};
\node[sub] (sNc) at (1.4, Y-0.65) {方法C};
\node[sub] (sNd) at (4.2, Y-0.65) {方法D};
\foreach \x in {sNa,sNb,sNc,sNd} {\draw[smarrow] (mN) -- (\x);}

% 4. 阶段间粗箭头
\draw[bigarrow] (0, Y-1.4) -- (0, Y-2.0);
```

**双层阶段**（一个阶段有两行主节点时，虚线框高度改为 4.2cm）：
```latex
\node[dashbox, minimum width=13cm, minimum height=4.2cm] (boxN) at (0, Y) {};
% 第一行主节点 + 子节点
\node[main] (mN) at (0, Y+1.7) {第一步};
\node[sub] ... % 子节点
% 第二行主节点 + 子节点
\node[main] (mNb) at (0, Y-0.5) {第二步};
\node[sub] ... % 子节点
```

**关键参数**：
- 虚线框宽度统一 13cm，单层高度 2cm，双层高度 4.2cm
- 子节点 x 坐标：4 个时用 -4.2, -1.4, 1.4, 4.2；3 个时用 -2.8, 0, 2.8
- 阶段间粗箭头间距 0.6cm
- 标注最佳方法用 `$^{\bigstar}$` 上标

**使用规则：复制下面的完整代码，只改节点文字和数量。从下方 5 套配色中选一套替换 main/.style 和 sub/.style 的颜色值。**

<tikz_color_schemes>
#### TikZ 架构图配色方案（5 套，按论文类型选择）

**方案 A：低饱和蓝灰+淡青（★ 默认，适合经管/统计/社科/竞赛）**
```latex
main/.style={fill={rgb,255:red,200;green,218;blue,235},
    draw={rgb,255:red,140;green,170;blue,200}, ...},
sub/.style={fill={rgb,255:red,218;green,232;blue,220},
    draw={rgb,255:red,165;green,200;blue,175}, ...},
bigarrow: color={rgb,255:red,74;green,144;blue,184}
```

**方案 B：钢蓝+浅灰蓝（适合 CS/AI/工程类）**
```latex
main/.style={fill={rgb,255:red,180;green,210;blue,235},
    draw={rgb,255:red,120;green,160;blue,200}, ...},
sub/.style={fill={rgb,255:red,220;green,230;blue,240},
    draw={rgb,255:red,170;green,190;blue,210}, ...},
bigarrow: color={rgb,255:red,70;green,100;blue,150}
```

**方案 C：薰衣草紫+淡粉（适合医学/生物/心理学）**
```latex
main/.style={fill={rgb,255:red,210;green,195;blue,230},
    draw={rgb,255:red,170;green,150;blue,200}, ...},
sub/.style={fill={rgb,255:red,235;green,215;blue,225},
    draw={rgb,255:red,200;green,175;blue,195}, ...},
bigarrow: color={rgb,255:red,130;green,100;blue,160}
```

**方案 D：青绿+薄荷（适合环境/地理/生态）**
```latex
main/.style={fill={rgb,255:red,175;green,220;blue,210},
    draw={rgb,255:red,120;green,185;blue,170}, ...},
sub/.style={fill={rgb,255:red,215;green,235;blue,225},
    draw={rgb,255:red,170;green,205;blue,190}, ...},
bigarrow: color={rgb,255:red,60;green,130;blue,120}
```

**方案 E：暖灰+赭石（适合人文/历史/法学，低调沉稳）**
```latex
main/.style={fill={rgb,255:red,225;green,210;blue,195},
    draw={rgb,255:red,190;green,170;blue,150}, ...},
sub/.style={fill={rgb,255:red,235;green,230;blue,220},
    draw={rgb,255:red,200;green,195;blue,180}, ...},
bigarrow: color={rgb,255:red,140;green,120;blue,100}
```

**选择建议**：
| 论文类型 | 推荐方案 |
|---------|---------|
| 经管/统计/社科/竞赛 | A（低饱和蓝灰+淡青）★ 默认 |
| CS/AI/电子/通信 | B（钢蓝+浅灰蓝） |
| 医学/生物/心理 | C（薰衣草紫+淡粉） |
| 环境/地理/生态/农学 | D（青绿+薄荷） |
| 人文/历史/法学/哲学 | E（暖灰+赭石） |

All schemes share the same structural rules: white background, dashed boxes, rounded corners, draw-order layering. Only the fill/draw colors differ.
</tikz_color_schemes>

```latex
\begin{figure}[H]
\centering
\begin{tikzpicture}[scale=0.85, every node/.style={scale=0.85},
    main/.style={fill={rgb,255:red,200;green,218;blue,235},
        draw={rgb,255:red,140;green,170;blue,200}, rounded corners=3pt,
        minimum width=4.5cm, minimum height=0.6cm, align=center,
        font=\small, line width=0.4pt},
    sub/.style={fill={rgb,255:red,218;green,232;blue,220},
        draw={rgb,255:red,165;green,200;blue,175}, rounded corners=2pt,
        minimum width=2cm, minimum height=0.5cm, align=center,
        font=\footnotesize, line width=0.3pt},
    bigarrow/.style={-{Stealth[length=7pt,width=5pt]}, line width=1.8pt,
        color={rgb,255:red,74;green,144;blue,184}},
    smarrow/.style={-{Stealth[length=3pt]}, line width=0.3pt, color=gray!40},
    lbl/.style={font=\small\bfseries, color=black},
    dashbox/.style={draw=gray!40, dashed, rounded corners=4pt,
        fill={rgb,255:red,248;green,249;blue,250}},
]

% 第一步：虚线框（先画，节点覆盖在上面）
\node[dashbox, minimum width=10.5cm, minimum height=1.6cm] (b1) at (0, -0.3) {};
\node[lbl, anchor=east] at ([xshift=-6pt]b1.west) {综述};
\node[dashbox, minimum width=10.5cm, minimum height=5.2cm] (b2) at (0, -3.15) {};
\node[lbl, anchor=east] at ([xshift=-6pt]b2.west) {模型构建};
\node[dashbox, minimum width=10.5cm, minimum height=2.2cm] (b3) at (0, -6.65) {};
\node[lbl, anchor=east] at ([xshift=-6pt]b3.west) {实证分析};
\node[dashbox, minimum width=10.5cm, minimum height=2.2cm] (b4) at (0, -9.35) {};
\node[lbl, anchor=east] at ([xshift=-6pt]b4.west) {策略应用};
\node[dashbox, minimum width=10.5cm, minimum height=2.2cm] (b5) at (0, -12.05) {};
\node[lbl, anchor=east] at ([xshift=-6pt]b5.west) {结论};

% 第二步：节点和箭头
% 阶段1
\node[main] (m1) at (0, 0) {绪论};
\draw[bigarrow] (0,-0.7) -- (0,-1.3);

% 阶段2
\node[main] (m2) at (0,-1.8) {理论基础};
\node[sub] (s2a) at (-2.8,-2.7) {文献回顾};
\node[sub] (s2b) at (-0.9,-2.7) {概念界定};
\node[sub] (s2c) at (0.9,-2.7) {理论框架};
\node[sub] (s2d) at (2.8,-2.7) {研究假设};
\foreach \x in {s2a,s2b,s2c,s2d} {\draw[smarrow] (m2) -- (\x);}
\node[main] (m2b) at (0,-3.6) {模型设定};
\foreach \x in {s2b,s2c} {\draw[smarrow] (\x) -- (m2b);}
\node[sub] (s2e) at (-2.2,-4.5) {变量定义};
\node[sub] (s2f) at (0,-4.5) {计量模型};
\node[sub] (s2g) at (2.2,-4.5) {识别策略};
\foreach \x in {s2e,s2f,s2g} {\draw[smarrow] (m2b) -- (\x);}
\draw[bigarrow] (0,-5.2) -- (0,-5.8);

% 阶段3
% 阶段3 — 以下节点文字仅为示例，根据实际研究内容替换
% Example nodes shown below. Replace with actual research content:
% 预测类：数据预处理/模型构建/模型对比/预测应用
% 分类类：特征工程/模型训练/分类评估/模型解释
% 评价类：指标构建/权重确定/综合评价/结果分析
% 因果推断类：描述统计/回归分析/稳健检验/异质分析
\node[main] (m3) at (0,-6.3) {模型构建与分析};
\node[sub] (s3a) at (-3.2,-7.2) {数据预处理};
\node[sub] (s3b) at (-1.1,-7.2) {模型构建};
\node[sub] (s3c) at (1.1,-7.2) {模型对比};
\node[sub] (s3d) at (3.2,-7.2) {结果分析};
\foreach \x in {s3a,s3b,s3c,s3d} {\draw[smarrow] (m3) -- (\x);}
\draw[bigarrow] (0,-7.9) -- (0,-8.5);

% 阶段4
\node[main] (m4) at (0,-9) {策略应用};
\node[sub] (s4a) at (-2.2,-9.9) {制度优化};
\node[sub] (s4b) at (0,-9.9) {实施路径};
\node[sub] (s4c) at (2.2,-9.9) {保障措施};
\foreach \x in {s4a,s4b,s4c} {\draw[smarrow] (m4) -- (\x);}
\draw[bigarrow] (0,-10.6) -- (0,-11.2);

% 阶段5
\node[main] (m5) at (0,-11.7) {结论};
\node[sub] (s5a) at (-2.2,-12.6) {主要结论};
\node[sub] (s5b) at (0,-12.6) {创新点};
\node[sub] (s5c) at (2.2,-12.6) {研究展望};
\foreach \x in {s5a,s5b,s5c} {\draw[smarrow] (m5) -- (\x);}

\end{tikzpicture}
\caption{研究技术路线图}
\label{fig:research-roadmap}
\end{figure}
```

**架构要点（Claude 画技术路线图时必须遵循）：**
1. **不依赖 `backgrounds` 和 `fit` 库**——只用 `tikz` + `arrows.meta` + `positioning` + `shapes.geometric` + `calc`
2. **不要灰色大背景 `\fill`**——白底最安全，不会出现黑色外围
3. 虚线框用 `dashbox` 样式（手动坐标 + minimum width/height），极浅灰填充 `rgb(248,249,250)`
4. **先画虚线框，再画节点**——利用绘制顺序，节点的 fill 自然覆盖虚线框
5. 左侧标签用 `lbl` 样式，**颜色必须是 `color=black`**，不要蓝色
6. 主节点统一橙色（`rgb(240,195,150)`），子节点统一绿色（`rgb(185,215,180)`）
7. 阶段间用蓝色粗箭头 `bigarrow`，节点间用灰色细箭头 `smarrow`
8. `scale=0.85` 确保一页放得下，阶段控制在 4-5 个
9. 子节点间距至少 1.5cm，超过 4 个分两行
10. **禁止用 `on background layer`、`fit=()`、灰色大背景 `\fill`**

#### 虚线框坐标计算规则（⛔ 防止框重叠）

虚线框用手动坐标，必须按以下规则计算，不能靠猜：

**单层阶段**（1 个主节点 + 1 行子节点）：
- 主节点 y 坐标 = `Y`
- 子节点 y 坐标 = `Y - 0.9`
- 虚线框中心 y = `(Y + Y-0.9) / 2 = Y - 0.45`
- 虚线框高度 = `1.6cm`
- 粗箭头从 `Y - 1.6` 到 `Y - 2.2`（间距 0.6）
- 下一阶段主节点 y = `Y - 2.7`（间距 = 上一阶段底部 + 0.5）

**双层阶段**（2 个主节点 + 2 行子节点）：
- 第一主节点 y = `Y`，第一行子节点 y = `Y - 0.9`
- 第二主节点 y = `Y - 1.8`，第二行子节点 y = `Y - 2.7`
- 虚线框中心 y = `(Y + Y-2.7) / 2 = Y - 1.35`
- 虚线框高度 = `3.4cm`
- 粗箭头从 `Y - 3.4` 到 `Y - 4.0`
- 下一阶段主节点 y = `Y - 4.5`

**三层阶段**（主节点 + 子节点 + 第二主节点 + 第二行子节点 + 第三行子节点）：
- 虚线框高度 = `5.2cm`，按实际内容范围计算

**关键公式**：
```
dashbox_center_y = (最高节点y + 最低节点y) / 2
dashbox_height = (最高节点y - 最低节点y) + 1.4cm  (上下各留 0.7cm padding)
bigarrow_start_y = 最低节点y - 0.7
bigarrow_end_y = bigarrow_start_y - 0.6
next_stage_main_y = bigarrow_end_y - 0.5
```

**验证方法**：每个虚线框的底边 y = `center_y - height/2`，下一个虚线框的顶边 y = `next_center_y + next_height/2`。两者之间必须有 ≥ 0.3cm 的间距，否则会重叠。
    % 阶段间粗箭头（灰蓝色，和竖条同色系）
    bigarrow/.style={-{Stealth[length=8pt, width=6pt]}, line width=2pt,
        color={rgb,255:red,90;green,120;blue,150}},
    % 节点间细箭头
    arrow/.style={-{Stealth[length=4pt]}, line width=0.5pt, color=gray!60},
]

% ========== 阶段一：研究设计 ==========
\node[stagelabel, rotate=90] (L1) at (-6.5, 0) {研究设计};
\node[stagebox] (B1) at (0, 0) {};
\node[main] (m1) at (0, 0.8) {研究问题确定};
\node[sub] (s1a) at (-3, -0.3) {文献梳理};
\node[sub] (s1b) at (-1, -0.3) {理论分析};
\node[sub] (s1c) at (1, -0.3) {假设提出};
\node[sub] (s1d) at (3, -0.3) {研究设计};
\draw[arrow] (m1) -- (s1a); \draw[arrow] (m1) -- (s1b);
\draw[arrow] (m1) -- (s1c); \draw[arrow] (m1) -- (s1d);

% 阶段间箭头
\draw[bigarrow] (0, -1.8) -- (0, -2.5);

% ========== 阶段二：数据与变量 ==========
\node[stagelabel, rotate=90] (L2) at (-6.5, -4.2) {数据与变量};
\node[stagebox] (B2) at (0, -4.2) {};
\node[main] (m2) at (0, -3.4) {数据收集与处理};
\node[sub] (s2a) at (-3.5, -4.5) {数据来源};
\node[sub] (s2b) at (-1.2, -4.5) {变量构建};
\node[sub] (s2c) at (1.2, -4.5) {描述性统计};
\node[sub] (s2d) at (3.5, -4.5) {相关性分析};
\draw[arrow] (m2) -- (s2a); \draw[arrow] (m2) -- (s2b);
\draw[arrow] (m2) -- (s2c); \draw[arrow] (m2) -- (s2d);

% 阶段间箭头
\draw[bigarrow] (0, -6) -- (0, -6.7);

% ========== 阶段三：实证分析 ==========
\node[stagelabel, rotate=90] (L3) at (-6.5, -8.8) {实证分析};
\node[stagebox, minimum height=3.8cm] (B3) at (0, -8.8) {};
\node[main] (m3) at (0, -7.6) {模型构建};
% 子节点分两行 — 以下节点文字仅为示例，根据实际研究内容替换
\node[sub] (s3a) at (-3.5, -8.8) {数据预处理};
\node[sub] (s3b) at (-1.2, -8.8) {模型构建};
\node[sub] (s3c) at (1.2, -8.8) {模型对比};
\node[sub] (s3d) at (3.5, -8.8) {结果分析};
\draw[arrow] (m3) -- (s3a); \draw[arrow] (m3) -- (s3b);
\draw[arrow] (m3) -- (s3c); \draw[arrow] (m3) -- (s3d);
\node[main] (m3b) at (0, -10.1) {模型诊断与检验};

% 阶段间箭头
\draw[bigarrow] (0, -11) -- (0, -11.7);

% ========== 阶段四：结论 ==========
\node[stagelabel, rotate=90] (L4) at (-6.5, -12.8) {结论建议};
\node[stagebox, minimum height=2cm] (B4) at (0, -12.8) {};
\node[main] (m4) at (0, -12.4) {研究结论};
\node[sub] (s4a) at (-2, -13.4) {政策建议};
\node[sub] (s4b) at (0, -13.4) {研究局限};
\node[sub] (s4c) at (2, -13.4) {未来展望};
\draw[arrow] (m4) -- (s4a); \draw[arrow] (m4) -- (s4b); \draw[arrow] (m4) -- (s4c);

\end{tikzpicture}
\caption{研究技术路线图}
\label{fig:research-roadmap}
\end{figure}
```

**架构要点（模板 4 通用规则）：**
1. **绘制顺序决定层级**：先画灰色大背景 → 再画白色虚线框 → 最后画节点和箭头。Do not use `on background layer` or `fit` library
2. 虚线框用 `dashbox` 样式（手动坐标，白色填充），不用 `fit`
3. 左侧阶段标签水平书写，放在虚线框外面左侧
4. 从上方 5 套配色方案中选一套，整张图统一使用。Do not mix schemes or use a different color per stage
5. 阶段之间用粗箭头（`bigarrow`），节点之间用灰色细箭头（`smarrow`）
6. 纵向布局，从上到下流动
7. 配色必须低饱和协调，禁止纯蓝/纯绿/纯红高饱和色
8. 子节点间距至少 1.2cm，超过 4 个分两行

### 常见丑图 vs 好图对比

| 丑图特征 | 改进方法 |
|----------|---------|
| 每个阶段不同颜色 | 选一套配色方案，整张图统一 main+sub 两色 |
| 用了 `on background layer` 导致黑底 | 用绘制顺序控制层级 |
| 直角方框 | `rounded corners=3pt` |
| 箭头太细看不清 | 阶段间用 `bigarrow`（1.8pt） |
| 节点挤在一起 | 子节点间距至少 1.2cm |
| 没有层次感 | 灰色大背景 + 白色虚线框 |
| 箭头交叉乱 | 用 `|-` 和 `-|` 走直角路径，避免斜线交叉 |
| 字体太大 | 节点内用 `\small`，标签用 `\footnotesize` |


### 模板 9：圆形编号 + 卡片分层（高级经管/实证风格）

**视觉特征**：左侧圆形编号+阶段名称 + 浅色卡片区域 + 方法节点/工具节点双层信息 + 右侧胶囊输出标签。适合方法论丰富的实证研究。

**完整代码**（复制后只改节点文字和阶段数量）：

```latex
\begin{figure}[H]
\centering
\begin{tikzpicture}[
    phasenum/.style={circle, fill={rgb,255:red,#1}, minimum size=22pt,
        font=\footnotesize\bfseries, text=white, inner sep=0pt},
    phasename/.style={font=\small\bfseries, color={rgb,255:red,#1}, anchor=west},
    method/.style={fill={rgb,255:red,#1}, draw={rgb,255:red,#2}, 
        rounded corners=4pt, minimum width=3.4cm, minimum height=0.85cm, 
        align=center, font=\small, line width=0.5pt},
    tool/.style={fill={rgb,255:red,248;green,248;blue,248}, 
        draw={rgb,255:red,210;green,210;blue,210}, rounded corners=2pt,
        minimum width=1.8cm, minimum height=0.5cm, align=center,
        font=\scriptsize, line width=0.3pt},
    outputtag/.style={fill={rgb,255:red,#1}, rounded corners=10pt,
        minimum width=1.6cm, minimum height=0.4cm, align=center,
        font=\tiny\bfseries, text=white, inner sep=2pt},
    pipe/.style={-{Stealth[length=7pt, width=5pt]}, line width=1.8pt,
        color={rgb,255:red,200;green,210;blue,225}},
    inner/.style={-{Stealth[length=3pt]}, line width=0.4pt, color=gray!45},
    card/.style={fill={rgb,255:red,#1}, rounded corners=6pt, line width=0pt},
]
% Phase 1: 研究设计（蓝色）
\fill[card={245;green,250;blue,255}] (-1, 2.3) rectangle (15.5, -0.8);
\node[phasenum={100;green,160;blue,210}] at (-0.2, 1.7) {1};
\node[phasename={80;green,140;blue,190}] at (0.4, 1.7) {研究设计};
\node[method={232;green,243;blue,252}{165;green,200;blue,230}] (rq) at (3.2, 1.0) {研究问题提出};
\node[method={232;green,243;blue,252}{165;green,200;blue,230}] (lit) at (7.2, 1.0) {系统文献综述};
\node[method={232;green,243;blue,252}{165;green,200;blue,230}] (hypo) at (11.2, 1.0) {假设与框架构建};
\draw[inner] (rq) -- (lit); \draw[inner] (lit) -- (hypo);
\node[tool] at (3.2, -0.05) {文献计量}; \node[tool] at (5.5, -0.05) {知识图谱};
\node[tool] at (8.2, -0.05) {理论推演}; \node[tool] at (11.2, -0.05) {概念模型};
\node[outputtag={100;green,160;blue,210}] at (14.2, 1.0) {理论模型};
\draw[pipe] (7.2, -0.8) -- (7.2, -1.6);
% Phase 2: 数据准备（绿色）— 同样结构，换色
% Phase 3: 实证分析（橙色）— 三行：模型设定→机制检验→稳健性
% Phase 4: 结论建议（紫色）
% 每阶段重复：卡片背景 → 编号+名称 → 方法节点行 → 工具节点行 → 输出标签 → 管道箭头
\end{tikzpicture}
\caption{研究技术路线图}
\end{figure}
```

**四阶段配色**（蓝→绿→橙→紫）：
- 研究设计：编号 `rgb(100,160,210)`，卡片 `rgb(245,250,255)`，方法节点 `rgb(232,243,252)`
- 数据准备：编号 `rgb(80,170,130)`，卡片 `rgb(245,252,248)`，方法节点 `rgb(230,246,237)`
- 实证分析：编号 `rgb(215,155,75)`，卡片 `rgb(255,251,243)`，方法节点 `rgb(255,244,228)`
- 结论建议：编号 `rgb(150,120,180)`，卡片 `rgb(250,247,255)`，方法节点 `rgb(242,237,252)`

**架构要点**：
1. 不依赖 `backgrounds`/`fit` 库，用绘制顺序控制层级
2. 左侧圆形编号 + 阶段名称文字（不要用色带竖条）
3. 方法节点和工具节点形成双层信息，方法节点 y 间距 ≥ 1.0cm
4. 工具节点间距 ≥ 2.2cm，一行最多 5 个
5. 右侧胶囊标签标注每阶段输出物
6. 完整示例见 `demo_roadmap_research_premium.tex`

---

### 模板 10：管道分段 + 并行分支 + 汇聚（数据科学/竞赛风格）

**视觉特征**：5段管道色块 + 白色卡片带顶部彩色装饰条 + 并行三分支建模 + 汇聚节点 + 圆角胶囊方法标签 + 左侧圆形编号。适合多模型对比、数据驱动研究。

**完整代码**：见 `demo_roadmap_research_pipeline.tex`

**五阶段配色**（蓝→绿→橙→紫→灰绿）：
- 问题定义：标题 `rgb(85,155,210)`，背景 `rgb(244,249,255)`
- 特征工程：标题 `rgb(75,162,125)`，背景 `rgb(242,251,244)`
- 模型构建：标题 `rgb(212,158,75)`，背景 `rgb(255,250,240)`
- 评估验证：标题 `rgb(142,115,182)`，背景 `rgb(249,244,255)`
- 结论建议：标题 `rgb(102,132,112)`，背景 `rgb(246,249,246)`

**架构要点**：
1. 每个 Stage 是一个大圆角色块（`draw=none` 无边框），内含白色卡片
2. 卡片顶部有 0.15cm 彩色装饰条
3. Stage 3 用并行三分支 + Σ 汇聚节点，展示多模型对比
4. 方法标签用圆角胶囊样式，标签间距 ≥ 2cm
5. 汇聚节点和下方卡片间距 ≥ 0.8cm

---

### 模板 5：算法流程图（带判断分支）

```latex
\begin{figure}[H]
\centering
\begin{tikzpicture}[
    node distance=0.8cm,
    process/.style={fill=blue!10, draw=blue!50, rounded corners=4pt,
        minimum width=3.5cm, minimum height=0.8cm, align=center,
        font=\small, line width=0.6pt},
    decision/.style={fill=orange!12, draw=orange!50, diamond, aspect=2.5,
        minimum width=2cm, align=center, font=\small, line width=0.6pt,
        inner sep=1pt},
    io/.style={fill=gray!8, draw=gray!50, rounded corners=3pt,
        minimum width=3cm, minimum height=0.7cm, align=center, font=\small},
    arrow/.style={-{Stealth[length=5pt]}, line width=0.7pt, color=gray!70},
    yesno/.style={font=\footnotesize, color=gray!60},
]
\node[io] (start) {输入数据 $D$};
\node[process, below=of start] (init) {初始化参数 $\theta_0$};
\node[process, below=of init] (compute) {计算目标函数 $f(\theta)$};
\node[process, below=of compute] (update) {更新参数 $\theta \leftarrow \theta - \alpha\nabla f$};
\node[decision, below=of update] (conv) {收敛?};
\node[io, below=of conv] (output) {输出最优解 $\theta^*$};
\draw[arrow] (start) -- (init);
\draw[arrow] (init) -- (compute);
\draw[arrow] (compute) -- (update);
\draw[arrow] (update) -- (conv);
\draw[arrow] (conv) -- node[yesno, right] {是} (output);
\draw[arrow] (conv.west) -- ++(-1.5,0) node[yesno, above] {否} |- (compute.west);
\end{tikzpicture}
\caption{优化算法流程图}
\label{fig:algorithm-flow}
\end{figure}
```

### 模板 6：数据处理 Pipeline（横向多阶段）

```latex
\begin{figure}[H]
\centering
\begin{tikzpicture}[
    node distance=0.3cm,
    stage/.style={fill=#1!12, draw=#1!50, rounded corners=5pt,
        minimum width=2.2cm, minimum height=2.2cm, align=center,
        font=\small, line width=0.6pt},
    detail/.style={font=\tiny, color=gray!40, align=center, text width=2cm},
    arrow/.style={-{Stealth[length=6pt]}, line width=1pt, color=gray!50},
]
\node[stage=blue] (raw) {\textbf{原始数据}\\[2pt]\footnotesize 多源采集};
\node[stage=blue, right=1cm of raw] (clean) {\textbf{数据清洗}\\[2pt]\footnotesize 缺失值/异常值};
\node[stage=teal, right=1cm of clean] (feat) {\textbf{特征工程}\\[2pt]\footnotesize 变量构建};
\node[stage=teal, right=1cm of feat] (model) {\textbf{模型训练}\\[2pt]\footnotesize 参数优化};
\node[stage=blue, right=1cm of model] (eval) {\textbf{评估验证}\\[2pt]\footnotesize 交叉验证};
\node[detail, below=0.3cm of raw] {CSV/API/\\数据库};
\node[detail, below=0.3cm of clean] {插值/IQR/\\标准化};
\node[detail, below=0.3cm of feat] {PCA/交互项/\\时序特征};
\node[detail, below=0.3cm of model] {XGBoost/\\DNN/SVM};
\node[detail, below=0.3cm of eval] {RMSE/AUC/\\$R^2$};
\draw[arrow] (raw) -- (clean);
\draw[arrow] (clean) -- (feat);
\draw[arrow] (feat) -- (model);
\draw[arrow] (model) -- (eval);
\draw[arrow, dashed, color=red!40] (eval.north) -- ++(0,0.8) -| (feat.north)
    node[pos=0.25, above, font=\tiny, color=red!50] {特征调优};
\end{tikzpicture}
\caption{数据处理与建模流程}
\label{fig:pipeline}
\end{figure}
```

### 模板 7：经管/统计 — 变量关系路径图（中介效应）

```latex
\begin{figure}[H]
\centering
\begin{tikzpicture}[
    node distance=2cm and 3cm,
    var/.style={fill=#1!12, draw=#1!50, rounded corners=5pt,
        minimum width=3cm, minimum height=1cm, align=center,
        font=\small, line width=0.7pt},
    arrow/.style={-{Stealth[length=5pt]}, line width=0.8pt},
    coef/.style={font=\footnotesize, fill=white, inner sep=2pt},
]
\node[var=blue] (x) {\textbf{自变量}\\数字化转型};
\node[var=orange, above right=1.5cm and 3.5cm of x] (m) {\textbf{中介变量}\\创新能力};
\node[var=red, below right=1.5cm and 3.5cm of x] (y) {\textbf{因变量}\\企业绩效};
\draw[arrow, color=blue!60] (x) -- node[coef, below] {$c'$ (直接效应)} (y);
\draw[arrow, color=orange!60] (x) -- node[coef, above left] {$a$ (H1)} (m);
\draw[arrow, color=red!60] (m) -- node[coef, above right] {$b$ (H2)} (y);
\node[fill=gray!8, draw=gray!40, rounded corners=3pt,
    minimum width=2.5cm, minimum height=0.7cm, align=center,
    font=\footnotesize, below=1.5cm of y] (ctrl) {控制变量\\企业规模/行业/年份};
\draw[-{Stealth[length=4pt]}, dashed, color=gray!40, line width=0.5pt] (ctrl) -- (y);
\node[font=\footnotesize\itshape, color=gray!50, below=0.3cm of x] {H3: $a \times b$ 中介效应};
\end{tikzpicture}
\caption{理论模型与研究假设}
\label{fig:theoretical-model}
\end{figure}
```

### 模板 8：竞赛 — 单问题求解流程图（带分支+判断+并行对比）

```latex
\begin{figure}[H]
\centering
\begin{tikzpicture}[
    node distance=0.7cm and 1.2cm,
    step/.style={fill=#1!10, draw=#1!45, rounded corners=4pt,
        minimum width=3.5cm, minimum height=0.75cm, align=center,
        font=\small, line width=0.5pt},
    substep/.style={fill=gray!6, draw=gray!35, rounded corners=3pt,
        minimum width=2.6cm, minimum height=0.6cm, align=center,
        font=\footnotesize, line width=0.4pt},
    decision/.style={fill=orange!10, draw=orange!45, diamond, aspect=2.8,
        minimum width=1.5cm, align=center, font=\small, line width=0.5pt, inner sep=1pt},
    note/.style={font=\tiny, color=gray!40, text width=3cm, align=left},
    arrow/.style={-{Stealth[length=4pt]}, line width=0.5pt, color=gray!55},
    yesno/.style={font=\tiny, color=gray!50},
    phaselabel/.style={font=\tiny\bfseries, color=#1!50, rounded corners=2pt,
        fill=#1!6, inner sep=2pt},
]
% 阶段一：数据准备
\node[phaselabel=blue] (L1) at (-3.5, 0) {数据准备};
\node[step=blue] (input) at (0, 0) {读取附件数据};
\node[step=blue, below=of input] (eda) {数据探索与可视化};
\node[decision, below=0.8cm of eda] (missing) {有缺失值?};
\node[substep, right=1.5cm of missing] (fill) {插值/删除处理};
\node[step=blue, below=0.8cm of missing] (clean) {清洗后数据集};
\draw[arrow] (input) -- (eda); \draw[arrow] (eda) -- (missing);
\draw[arrow] (missing) -- node[yesno, above] {是} (fill);
\draw[arrow] (fill.south) |- (clean);
\draw[arrow] (missing) -- node[yesno, right] {否} (clean);
% 阶段二：建模（并行两种方法）
\node[phaselabel=teal] (L2) at (-3.5, -4.5) {模型构建};
\node[step=teal, below=0.8cm of clean] (formulate) {建立数学模型};
\node[substep, below left=0.8cm and 0.8cm of formulate] (method1) {方法A：精确求解};
\node[substep, below right=0.8cm and 0.8cm of formulate] (method2) {方法B：启发式};
\draw[arrow] (clean) -- (formulate);
\draw[arrow] (formulate.south) -- ++(0,-0.3) -| (method1.north);
\draw[arrow] (formulate.south) -- ++(0,-0.3) -| (method2.north);
\node[note, right=0.3cm of formulate] {目标函数\\约束条件\\决策变量};
% 阶段三：对比选优
\node[substep, below=0.7cm of method1] (result1) {结果A};
\node[substep, below=0.7cm of method2] (result2) {结果B};
\node[step=orange, below=1.2cm of formulate] at (0, -8.5) (compare) {方法对比与选优};
\draw[arrow] (method1) -- (result1); \draw[arrow] (method2) -- (result2);
\draw[arrow] (result1.south) |- (compare.west);
\draw[arrow] (result2.south) |- (compare.east);
% 阶段四：验证
\node[step=orange, below=0.7cm of compare] (verify) {结果验证与分析};
\node[step=red, below=0.7cm of verify] (sense) {灵敏度/稳健性分析};
\node[step=red, below=0.7cm of sense] (output) {输出最终方案};
\draw[arrow] (compare) -- (verify); \draw[arrow] (verify) -- (sense); \draw[arrow] (sense) -- (output);
\end{tikzpicture}
\caption{问题一求解流程}
\label{fig:solve-flow-q1}
\end{figure}
```

### TikZ 通用样式速查

```latex
% 在 tikzpicture 外部定义（放在 preamble 或 figure 环境开头）
\usetikzlibrary{arrows.meta, positioning, shapes.geometric, calc, decorations.pathreplacing, shadows}

% 常用颜色搭配（按阶段）
% 阶段一：blue    阶段二：teal    阶段三：orange    阶段四：red
% 辅助/数据：gray  高亮/核心：purple

% 节点间距参考
% 紧凑型：node distance=0.5cm and 0.8cm
% 标准型：node distance=0.8cm and 1.2cm
% 宽松型：node distance=1.2cm and 2cm

% 箭头样式
% 主流程：-{Stealth[length=5pt]}, line width=0.7pt, color=gray!70
% 数据流：-{Stealth[length=4pt]}, line width=0.5pt, dashed, color=gray!40
% 反馈：-{Stealth[length=4pt]}, line width=0.5pt, dashed, color=red!40
```
