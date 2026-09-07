# Shared Writing Rules

Common rules for all paper-writing skills (paper-write, paper-write-zh, comp-paper-zh, comp-paper-en).
Read this file at the start of writing workflow via `cat _utils/writing_rules.md`.

<figure_text_interleaving>
## Figure-Text Interleaving

Every figure/table needs surrounding text. This is the single most important quality signal
that separates human-written papers from AI-generated ones.

### Pattern (Chinese example)

```latex
为了分析各子问题的求解精度，我们将模型预测值与实际值进行对比，结果如图\ref{fig:compare}所示。

\begin{figure}[H]
  \centering
  \includegraphics[width=0.9\textwidth]{../figures/fig_compare.pdf}
  \caption{模型预测值与实际值对比}
  \label{fig:compare}
\end{figure}

从图\ref{fig:compare}可以看出，模型在问题一中的预测误差最小（RMSE=0.023），
而问题三由于数据稀疏性，误差相对较大（RMSE=0.156）。这表明模型对密集数据的
拟合能力较强，但在稀疏场景下仍有改进空间。

进一步地，我们对模型的关键参数进行灵敏度分析，结果见表\ref{tab:sensitivity}。

\begin{table}[H]
  \centering
  \caption{关键参数灵敏度分析}
  \label{tab:sensitivity}
  \begin{tabular}{lcc}
    \toprule
    参数 & 变化范围 & 目标函数变化 \\
    \midrule
    $\alpha$ & 0.1--0.9 & $<5\%$ \\
    $\beta$  & 0.01--0.5 & $<3\%$ \\
    \bottomrule
  \end{tabular}
\end{table}

表\ref{tab:sensitivity}显示，当参数$\alpha$从0.1变化到0.9时，目标函数值变化幅度
不超过5\%，说明模型对该参数不敏感，具有较好的鲁棒性。
```

### Pattern (English example)

```latex
As shown in Figure~\ref{fig:main}, we compare our method against three baselines
across all evaluation metrics.

\begin{figure}[H]
  \centering
  \includegraphics[width=0.95\textwidth]{../figures/fig_main_results.pdf}
  \caption{Main results comparison across all datasets and metrics.}
  \label{fig:main}
\end{figure}

From Figure~\ref{fig:main}, our method achieves a 3.2\% improvement in F1 score
over the strongest baseline (TransformerXL). The gain is most pronounced on the
long-sequence subset (5.1\%), suggesting that our attention mechanism better captures
long-range dependencies. On shorter sequences, the improvement is marginal (0.8\%),
which aligns with our hypothesis that the benefit scales with sequence length.
```

### Rules

> ⛔⛔⛔ **机械铁律（先记死这一条，再谈逻辑流）：图/表后那段分析的第一句，开头绝对不许是"图N""表N""Figure N""Table N"。** 每张图都这么起句是最刺眼的 AI 痕迹。把图号**沉进句子中段**，句子开头留给"论证在讲什么"。**四种合规句式轮着用，同一节里"图作主语"最多一次**：
> 1. **括号旁注**（首选）：`来源分布呈显著长尾，头部门户高度集中（图 5）。`——先说结论，图号进括号
> 2. **动词引导**：`观察各来源发文量（图 5），可见头部集中、长尾寥寥。` / `将预测值与实测对比（图 3）后发现……`
> 3. **后置印证**：`这种权威度梯度在来源分布中得到印证（图 5）。` / `该趋势在图 4 中体现得尤为清晰。`
> 4. **承上引入**（图前用）：`既然可信度依赖来源权威性，先看清训练集的来源结构。`——下一句再自然带出图
> ❌ 禁：`图5展示了…` `图3可以看出…` `如表2所示，…`（"如图/如表所示"开头也算无信息起句，禁）。✅ 对：上面四类任意一种。**写每张图的配文前，先在这四类里挑一个和上一张不同的。**
>
> ⛔⛔ **图不是孤岛——最高原则是"承上启下的逻辑流"（这是"像正常论文 vs 一股 AI 味"的分水岭）：** 每张图都必须**从上文的论述里自然长出来**（因为前面谈到 X、需要看清 Y，所以引入这张图），阐述时**顺着一条逻辑线展开**（图揭示了什么 → 为什么会这样 → 说明/支持了什么观点），最后**把结论接到下文**（因此下一步要做 Z / 这引出问题 N）。**绝对禁止**"凭空冒出一张图 + 一句干巴巴的描述（如'图3展示了情感分布，可以看出正面占比高'）就完事"——那种图删掉不影响行文，就是没融进论证的孤岛。数值/趋势**有就用来支撑逻辑，没有不强求**；关键是**这段话读起来是不是论证的一环，而不是一张图的说明卡**。
>   - **❌ 孤岛式反例（一股 AI 味）**：`图 5 展示了新闻来源的分布。可以看出，新浪财经等门户发文量领先。` —— 突兀出现、就图论图、与上下文无联系，删了毫无影响。
>   - **✅ 承上启下正例（正常论文的样子）**：`既然可信度评分依赖来源权威性，就需要先看清训练集的来源结构。观察各来源发文量的长尾分布（图 5），头部门户高度集中而数百个长尾来源各自寥寥——这种权威度梯度正是式(6)中"来源类型先验"的现实依据，也提示我们在任务二中必须对不同来源差异化加权。` —— 从上文"可信度"引入、顺逻辑阐述、接到下文"差异化加权"。

1. 图/表前：先写"为什么现在要看这张图"的引入句（承上），把它接到上文正在展开的论述上，**不许**只写"如图所示""见下图"这种无信息的引子。
   - **⛔ 如果图/表很大（占半页以上），引导文字必须至少 3-5 句**，否则会出现一页只有一句话+大片空白的情况。在引导文字中加入方法说明、参数设置、数据来源等内容填充
2. 图/表后：顺着一条逻辑线阐述（3-5 句），做到"承上启下"：
   - **解读**：图揭示了什么关键现象/结构/趋势（有具体数值就用数值锚定，没有就说清定性特征，不强求编数字）
   - **归因或对比**：为什么会这样 / 与基线·其他方案·上一问相比如何 / 与预期是否一致
   - **推论与衔接**：这说明/支持了什么观点，因此引出下文的哪一步——让这段成为论证链的一环，而不是就图论图
3. **⛔ Between consecutive figures/tables: at least one full paragraph (≥5 lines of text)**. 绝对禁止两张图/表连续出现中间没有分析文字。每张图后面必须有承上启下的分析段落，然后才能放下一张图
4. **Subfigure 组合图：按"必要性"判断，AI 自决（适用所有论文类型，含竞赛/学术/课程/人文社科）**

   组合图 = 把 2-4 个**信息上互补**的图放进同一个 `figure` 环境用 `subfigure` 排版。判据严格按"必要性"，不是为了凑数或省页：

   **🟢 鼓励组合的场景（"必要性"高）：**
   - **对比性强**：同一指标的多方法/多模型/多算法对比（A vs B 同坐标系，看趋势优劣一目了然）
   - **维度同构**：同一物理量的多视角/多尺度/多时间快照（不同 t 下的场分布、不同视角的几何示意）
   - **诊断聚合**：残差诊断四联图（Q-Q + 残差-拟合 + 直方图 + 残差-时间）—— 单独看每张图意义都不完整，必须并排
   - **灵敏度网格**：2-4 个参数的变化曲线（每参数一个 panel，看哪个最敏感）
   - **门面对比**（感知/重构类）：处理前后并排 + 局部放大（图像增强/去噪/分割/检测/超分等的"定性证据"）
   - **多子问题最优方案并排**：每个子问题一张小图，整体看竞赛多问题的求解差异
   - **训练曲线 2-panel**（AI/ML 必备）：Loss 收敛曲线 + 准确率/F1 曲线，左右并排同 x 轴（epoch）—— 让评委一眼判断是否过拟合 + 何时收敛
   - **分类评估 2-panel**（监督学习必备）：混淆矩阵热图 + ROC 曲线（或 PR 曲线），同一模型的两种评估视图互补
   - **EDA 概览 4-panel**（数据分析章节开篇）：左上分布直方图 / 右上缺失值热图 / 左下相关性矩阵 / 右下异常值箱线 —— 数据画像的"一图概览"
   - **数据预处理前后 2-panel**（数据清洗章节）：原始分布 vs 处理后分布（Box-Cox / 归一化 / 重采样后），证明预处理生效
   - **空间-时间联动 2-panel**（时空数据）：左幅热图展示某时刻的空间分布 + 右幅折线展示选定点的完整时序，让读者既看"全貌"又看"局部细节"
   - **可解释性 2-panel**（可解释 ML 章节）：左幅特征重要性条形 + 右幅 SHAP 摘要图 或 PDP 曲线，全局重要性 + 局部解释互补
   - **3D 多视角 2-3 panel**（工程仿真 / 计算物理）：同一三维场或几何的 2-3 个视角（俯视 / 侧视 / 等距），让读者三维结构理解透彻
   - **🟡 版面效率触发（相关为前提、留白才触发）**：两张**同类或可比**的数据图（如两个变量的分布直方图、两个场景的同类结果曲线），若**各自单独放都只占半页、后面配一段文字就撑出半页以上留白**，则**优先并排**成一行，把版面填满、读起来更紧凑。⚠️ 关键前提是"同类/可比"——只有本身相关的两张图才因留白而并排；**内容不相关的图，哪怕都很空、留半页白，也各自单列，绝不为填页硬凑一行**（见下面🔴"单纯为凑页"）。

   **🔴 禁止组合的场景（"必要性"低，等于拼图凑数）：**
   - **⛔ 逻辑框图（流程图 flow / 架构图 architecture / 技术路线图 roadmap / 数据流 pipeline / 研究框架图 framework / TikZ 几何·算法·架构示意图 tikz_*.pdf）一律禁止并排**：必须单列独占一行，宽度 `0.72-0.82\textwidth`。逻辑框图的价值在**节点文字和连线可读**，两张并排缩到半栏字就糊了；它们不是"同坐标系比趋势"的数据对比，并排没有信息收益、只有可读性损失。即使两张流程图主题相关，也分成两个独立 figure、中间用过渡文字串起来，不并排。（数据结果图不受此条限制，按下面的必要性判断可并排。）
   - 两张内容无关的图硬塞一行（如把"算法收敛曲线" + "数据分布直方图"放一起）
   - **超过 4 个 panel**（视觉一定看不清，拆成两个 figure 反而更清楚）
   - 单个 panel 宽度 < `0.45\textwidth`（两张挤在一起每张都太小）
   - 单图本身就复杂（满版热力图、地理图、3D 渲染、网络图）—— 独占一行才能看清细节
   - **panel 间数据量级差异巨大且不共享坐标**（如左 panel y∈[0,1] 概率，右 panel y∈[0,10000] 计数）—— 视觉对比失真，应共享坐标或干脆拆开
   - **4-panel 实际是 4 个独立小实验**（彼此结论无关）—— 应拆成 4 个独立 figure，每个 figure 配一段独立分析
   - **单纯为凑页把不相关的图硬拼一行 / 只为减少 figure 环境数量**——这是禁止的。注意与🟡"版面效率触发"的区别：那条要求两张图**本身同类/可比**，留白只是"要不要并排"的次级信号；这条禁的是**不相关**的图为填页硬凑。相关 → 可因留白并排；不相关 → 留白也各自单列。

   **🟡 两条实现路线（先选路线，再谈排版）**：

   组合图有两种做法，**决定权在"这些 panel 是否能在 matplotlib 里一次画出"**：

   - **✅ 首选：matplotlib 端一次画成「单个 PDF」（竞赛类型必须走这条）。** 用 `plt.subplots(1,2)` / `plt.subplots(2,2)` + 每子图 `(a)(b)(c)(d)` 标签，输出一个 PDF；LaTeX 端就是普通单图一行 `\includegraphics[width=0.85\textwidth]{fig_xxx.pdf}`。这样分辨率最高、绝不会被压小，也不受 LaTeX subfigure 排版坑影响。**只要数据在你手里、图能重画，就走这条。**
   - **🟠 退路：LaTeX `subfigure` 并排「多个已有独立 PDF」（仅学术/课程类型、且原图无法重画时用）。** 此时 panel 宽度 `0.48\textwidth`（2-panel）/ `0.32\textwidth`（3-panel）是**故意的半栏系数**，兜底脚本 `compile_utils.sh` 已识别 `subfigure`/`minipage` 并豁免、不会把它强改成 `0.85`。**⛔ 竞赛论文禁用这条**（见 `comp-paper-zh`/`comp-paper-en` 铁律：竞赛的多面板一律回 matplotlib 合成单 PDF）。**⛔ 逻辑框图（流程/架构/路线/pipeline/框架/TikZ 示意图）不适用本退路**——无论能否重画，一律单列独占，不进 subfigure。

   **🟡 排版规范（仅走🟠退路时适用）**：
   - 用 `\begin{subfigure}` 而非 `\subfloat`（更标准）
   - 每 panel 的 `\caption{}` 用短标签（`(a) Q-Q 图` / `(b) 残差分布`，3-5 字）
   - 详细说明放在主 figure 的 `\caption{}` 或正文里
   - 宽度：2-panel 用 `0.48\textwidth`，3-panel 用 `0.32\textwidth`，4-panel 用 `2×2` 网格（每个 `0.48\textwidth`）
   - panel 之间用 `\hfill` 留间距
   - 主 figure 的 `\caption{}` 用主标题描述整体（"残差诊断"），子 caption 标 `(a)(b)(c)(d)`

   **🟣 matplotlib 端实现技巧（让多面板视觉一致）**：
   - **共享坐标轴**：同物理量对比时用 `sharex=True` / `sharey=True`，让读者一眼对比量级（如训练曲线 2-panel 共享 x=epoch；多模型 ROC 共享 0-1 坐标）
   - **共享 colorbar**：多热图共一个色条时用 `fig.colorbar(im, ax=axes.ravel().tolist(), shrink=0.6)` 让所有 panel 共一个色阶（视觉一致 + 节省空间）
   - **GridSpec 不对称布局**：3+ panel 复杂场景（如 2 个大图 + 1 个长条形 colorbar，或 1 大图 + 边际小图）用 `from matplotlib.gridspec import GridSpec; gs = GridSpec(2, 2, width_ratios=[3, 1], height_ratios=[1, 3])`，比 `plt.subplots(2,2)` 更灵活
   - **子图标签 `(a)(b)(c)(d)` 位置**：用 `ax.set_title(f'({chr(97+i)})', loc='left', pad=3, fontsize=11, fontweight='bold')`，**不要**用 `ax.text(transAxes)`（`set_aspect('equal')` 时会飘到子图外）
   - **panel 间间距**：`fig.tight_layout(pad=1.2)` 是基础值，3+ panel 视觉过挤可加 `wspace=0.3, hspace=0.3`；视觉过松可减到 0.15

   **AI 决策流程（规划阶段必走）**：
   0. **先分流图类型**：这张图是**逻辑框图**（流程 / 架构 / 技术路线 / pipeline / 框架 / TikZ 几何·算法·架构示意）还是**数据结果图**（柱状 / 折线 / 热力 / 散点 / 混淆矩阵 / ROC / SHAP…）？逻辑框图 → 直接单列独占一行，**不进入下面 1-4 步的组合判断**；数据结果图 → 才按必要性走 1-4 步。
   1. 这张图要展示的信息是"单值/单维"还是"多值对比/多维并陈"？
   2. 如果是多值对比 → panel 数 ≤ 4？panel 间是"维度同构"还是"内容无关"？
   3. 同构 + 必要性强 → 组合图（**默认走 ✅ matplotlib 合成单 PDF**；仅学术/课程且原图无法重画时才退到 🟠 LaTeX subfigure）；同构 + 必要性弱 → 单图按时间/类别分组；内容无关 → 拆成多个 figure
   3.5 **版面效率复核（单图默认，别一律并排）**：数据图**默认单列**；只有当两张图**同类/可比**、且**各自单列都只占半页、配文字后会留半页以上白**时，才把这两张并排以填满版面。两张图不相关 → 保持各自单列，留白也不硬凑。（逻辑框图跳过本步，永远单列。）
   4. 写进 FIGURE_MANIFEST 时显式标注 `[2-panel]` / `[4-panel]` / `[single]`

   **示例**（FIGURE_MANIFEST 写法，含本批新增 7 类典型）：
   - `fig_q2_residual_diag [4-panel] — 残差诊断（Q-Q / 残差-拟合 / 直方图 / 残差-时间）— basic #5 — 章节: 问题二模型验证`
   - `fig_q3_method_cmp [2-panel] — 算法对比（GA vs 模拟退火 收敛曲线 / 计算时间）— competition #1 — 章节: 问题三求解`
   - `fig_q1_data_dist [single] — 训练集 vs 测试集分布 — basic #7 雨云图 — 章节: 问题一数据探索`
   - `fig_train_curves [2-panel] — 训练曲线（Loss / Accuracy 共享 x=epoch）— basic #3 — 章节: 实验设置`
   - `fig_cls_eval [2-panel] — 分类评估（混淆矩阵 / ROC 曲线）— competition #10 + #14 — 章节: 模型评估`
   - `fig_eda_overview [4-panel] — EDA 概览（分布 / 缺失值 / 相关性 / 异常值）— basic #1 + #5 — 章节: 数据探索`
   - `fig_preproc_cmp [2-panel] — 预处理前后（原始分布 / Box-Cox 后分布）— basic #7 — 章节: 数据清洗`
   - `fig_space_time [2-panel] — 空间-时间联动（t=10 空间热图 / 选定点完整时序）— competition #8 — 章节: 问题二`
   - `fig_explain [2-panel] — 可解释性（特征重要性 / SHAP 摘要）— advanced #7 — 章节: 模型可解释性`
   - `fig_3d_views [3-panel] — 三维场多视角（俯视 / 侧视 / 等距）— competition #6 — 章节: 问题三可视化`
5. Per-page density: figures/tables ≤60% of page area, text ≥40%
6. If a section has 3+ figures, each must have ≥5 lines of text between them

### Anti-pattern (never do this)

```latex
\begin{figure}[H]...\end{figure}
\begin{figure}[H]...\end{figure}  % consecutive figures with no text between them
\begin{table}[H]...\end{table}    % still no analysis
```

Also never write just: "如表所示，我们的方法表现最好" / "As shown in Table X, our method outperforms all baselines." — this is empty analysis. Explain WHERE it's better, by HOW MUCH, and WHY.

### ⛔ 图表是论据，不是主语（Figure as Evidence, Not Subject）

获奖论文的图文衔接是论点驱动的：先有论点，图表作为旁证嵌入论证链条，最后给出推论。去掉图表引用，句子的逻辑依然完整。

**禁止模式**（AI 典型痕迹 — 图表做主语，段落变流水账）：
```
图3展示了三种算法的收敛曲线。从图中可以看出，遗传算法收敛最快。
图4给出了灵敏度分析的结果。由图可知，参数α对结果影响最大。
表5列出了各模型的评价指标。从表中可以看出，模型A表现最优。
```

**正确写法**（论点驱动 — 图表是括号里的旁证）：
```
算法选择的关键在于收敛效率与解质量的平衡。在相同迭代次数下，
遗传算法在第15代即趋于稳定，而模拟退火需要约40次迭代才能达到
相近精度（图3）。考虑到竞赛时间约束，本文最终采用遗传算法求解。

为验证模型的鲁棒性，对关键参数α进行了±20%的扰动。当α从0.8
变化到1.2时，目标函数值波动不超过3.7%（图4），表明模型对参数
扰动不敏感，具有良好的实用价值。
```

**核心原则**：
- **✅ 图号必须显式引用（硬规范，不能为了"不套路"就把图号删掉）**：每张图/表都要在正文里被明确点名（"图 N"／"表 N"），让读者能把这段文字准确对应到是哪张图。要变的是**引用的句式和位置**，不是要不要引用。
- **⛔ 真正要禁的是"内容空洞的流水账开头"**：像"图X展示了……从图中可以看出……"、"表5列出了……从表中可以看出……"——图表做主语 + 后半句是任何图都成立的空话，连续几张都这么写，就是 AI 痕迹。禁的是这种**空洞 + 单调重复**，不是禁止一切图作主语的句子。
- **✅ 引用句式必须换着来，至少在下面几种之间轮换，相邻两张图别用同一种**：
  - 括号旁注（首选，最不着痕迹）：「……目标函数值波动不超过 3.7%（图 4），表明模型对扰动不敏感」
  - 句首带出：「图 1 所示流程中，第三阶段的双阈值门控处于核心位置……」
  - 动词引导：「观察图 3 中的三条收敛曲线，其差异集中体现于收敛速度与最终高度……」
  - 图作主语（**限量使用：整个小节最多一次，且绝不能作为默认开头**）：「图 4 对比了本文方法与基线在四项指标上的表现，其中 NDCG 由 0.83 提升至 0.908……」
  - 后置印证：「……这一结论在图 6 中得到印证。」
- **⛔ 相邻硬边界（机器会查）**：相邻的两个图表分析段落，**不得都以图号/表号起句**（如上一段「图21给出……」、下一段「图22：可信模型……」——这是最刺眼的 AI 痕迹）。连续两张及以上图都以图号开头，直接判违规。首选把图号沉到句中或句末括号（「……（图 22）」）。
- 连续两段不能用相同方式引用图表（如连续两段都以"...（图X）"结尾也不行）
- 每个图表的分析段落必须包含：数值解读 + 对比/原因分析 + 结论推断，三者缺一不可

**⛔ 图注（caption）只写简短标签，不当正文写（LaTeX 与 docx 通用）**：
- caption 只写这张图/表**是什么**的简短名词短语。**中文 caption 主体 ≤20 字，英文 ≤14 词**（均不含"图 N／Figure N"编号前缀）。判据、公式、参数取值、坐标轴含义、结论、"如何得出"这类细节一律写进正文那段图解读里，绝不塞进 caption——caption 太长时，LaTeX 图下方会折成多行、docx 里图注居中加粗更是挤成一坨，都很难看。
- LaTeX 语法：`\caption{站点覆盖半径几何示意}`；docx 语法：`![图 3：站点覆盖半径几何示意](figures/fig3.png)`。
  - **❌ 超长反例**：`\caption{覆盖半径几何示意：站点为圆心、R=3km 覆盖圆、区域出车距离与响应时间判据}`（把判据/参数全堆进题注）。
  - **✅ 简短正例**：`\caption{站点覆盖半径几何示意}`（"R=3km 覆盖圆、出车距离与响应时间判据"移到正文图解读里讲）。
- 例外：仅当某符号/单位不写进 caption 就看不懂图时，才补一个极短括注（如 `各方案能耗对比（单位 kW·h）`），仍须守住 ≤20 字／≤14 词上限。
- 编译/导出阶段会用脚本扫 caption 长度（中文数汉字、英文数单词），超限直接判违规要求改写——细节留正文，别指望题注承载。

### ⛔ 术语与代号必须通俗化（Define Jargon in Plain Words at First Use）

论文正文是给评委/读者看的，不是给流水线看的。**内部代号、变量简写、生造术语在正文里首次出现时，必须先用一句大白话说清"它是什么/衡量什么"，再往下用。** 权威 SCI 论文与华为杯优秀论文都遵循这一点：读者不该为一个缩写去猜。

严禁把建模流水线里的内部代号、临时命名直接搬进正文，例如：`C4`、`C14`、`C~密度`、`blend 策略`、`弱监督自洽上界`、`脊线分布`——这些对读者是黑话。

**反例**（内部代号直接进正文，读者看不懂）：
```
按 C4(0≤C≤1) 与 C14 计算可信分数，blend 策略避免 0/1 极化，
再取弱监督自洽上界作为约束，得到 C~密度 的脊线分布。
```

**正例**（先解释再使用，把黑话翻成人话）：
```
本文用一个 0 到 1 之间的可信分数刻画每条记录的可靠程度（分数越高越可信）。
为避免分数在打分时被推到 0 或 1 两个极端、失去区分度，采用混合加权的方式平滑取值；
其分布沿分数轴呈现明显的脊状聚集，说明多数记录集中在中高可信区间。
```

**一组完整正例段落**（目标语气：先讲论点、黑话已解释、**相邻段落引用句式各不相同**——依次用「括号旁注→动词引导→后置印证→句首带出」四种，且不出现相邻两段都以图号起句）：
```
模型的可靠性首先取决于打分是否稳定。在 ±20% 的参数扰动下，可信分数的
波动始终控制在 3.7% 以内（图 21），说明评分机制对输入噪声不敏感，可以作为
后续筛选的依据。

那么，模型究竟依赖哪些信息来判断可信度？观察特征贡献度的排序（图 22）可以发现，
记录来源的一致性与时间新鲜度占据了前两位，二者合计解释了近六成的分数变化，
这与领域内"多源互证优先"的经验判断相符。

进一步看分数本身的分布形态，绝大多数记录集中在 0.6 至 0.8 的中高可信区间，
仅少量落入低可信尾部；这种偏向高分的聚集形态，在可信分数分布图中得到清晰印证
（图 23），也为设定 0.5 的准入阈值提供了直接支撑。

图 24 按三个来源层级作了拆分：一级来源的中位可信分数达到 0.82，明显高于二、
三级来源，差距在 0.15 以上，因此在数据融合时对一级来源赋予更高权重是合理的。
```

### ⛔ 写作期图数据定位（Bind Each Figure to Its Real Data Before Writing）

**你看不到图片的像素**（生成的是 PDF，模型非多模态）。所谓"从图里读出 3.7%"，本质是"把这张图对应的真实数据从数据文件里找出来复述"。找准数据 = 图文契合的前提；找不准就会出现图文对不上、描述浮于表面、甚至编造坐标。

**写任何一张图/表的分析段落前，必须先完成三步定位，再落笔：**
1. **认图**：从 `figures/FIGURE_MANIFEST.txt` / `figures/latex_includes.tex` 读这张图的 `\label{}` + 中文标题，判定它**画的是什么量**（如"特征重要性排序""各模型精度对比""残差 Q-Q 图"）。
2. **定位真实数值**：按这个量名去 `RESULTS.md` / `experiment_results.md` / `figures/all_results.json` 里找对应的**真实数字**——标题含"特征重要性"就找 importance/权重数组，含"精度对比"就找各模型的 accuracy/F1，含"分布"就找均值/分位数。
3. **只用定位到的真值**：分析文字里出现的每个数字，都必须来自第 2 步找到的真实值。**严禁凭图形的形状、高低、位置去猜数；严禁编造坐标或百分比。**

**兜底**：若在数据文件里确实找不到某张图对应的数（说明图与数据可能脱节），**不许编数**——改为只做定性描述（趋势、相对高低、形态），并说明"具体数值见数据文件/附录"；同时把这当作"manifest 与数据脱节"的信号记下。

这一步和上面"图号必须显式引用 + 数值解读+对比+结论"的要求衔接：先定位到真数（本节），再按论点驱动的句式把它写进论证链（上一小节）。
</figure_text_interleaving>

<figure_embedding>
## Figure Embedding

- Copy each figure/table block into the corresponding section file individually
- Do not use `\input{../figures/latex_includes.tex}` (dumps all figures into one section)
- Do not use pgfplots to draw from CSV (path/column/encoding issues are common)
- Image paths: `../figures/xxx.pdf` (relative to paper/ directory)
- **⛔ 图片宽度规则**：单张图 `width=0.9\textwidth`（默认），双栏并排 `width=0.48\textwidth`。不要用 `width=0.5\textwidth` 或更小的值——图会显得很小。如果图本身是宽幅的（如时序图、热力图），用 `width=0.95\textwidth`。
- **⛔ 图片高度规则**：单张图不能超过页面高度的 70%（约 18cm）。如果数据条目多（如 20+ 个类别的柱状图），必须限制 figsize 高度或分成多张子图。Python 生成时 `figsize=(width, height)` 的 height 不要超过 8（英寸）。超长的横向柱状图（30+ 条目）改用 `figsize=(7, 6)` + 缩小字号，或者只展示 Top 15/20。
- Float specifier（受控浮动）：图用 `[H]`（就地钉死），表用 `[H]`（就地），伪代码 `[H]`（均需 `\usepackage{float}`）。图用 `[H]` 是为了钉在引出文字正下方、从机制上杜绝"多图连排/浮动堆叠一页"（`[htbp]` 会让 LaTeX 把多张图攒到一页，最伤可读性）。代价：极少数"图接近整页高 + 恰好落页底"时 `[H]` 放不下就整块下移、上方留一段空白，但图已被 `keepaspectratio` 限高在 `0.9\textheight` 内、且每张图前后都要有引导/承接文字，此情形罕见，取舍上优于连排。模板已加载 `\usepackage[section]{placeins}`，每节末自动 `\FloatBarrier`（防残余浮动体跨节）。⛔ 表格同样别用 `[htbp]`：会被 `\FloatBarrier` 逼到节末，在表上方留半页空白。`\includegraphics` 用 `width=0.85\textwidth,keepaspectratio` 以宽为主，不要加 `height=0.38\textheight` 这种小限高（会把方图/竖图压得更小）；只有确实接近整页高、可能溢出的图才加 `height=0.9\textheight` 兜底
- Figure/table captions: keep short (one line, ≤20 Chinese characters or ≤12 English words). Detailed descriptions go in the body text before/after the figure, not in the caption. Example: `\caption{残差诊断四联图}` not `\caption{Wiener 过程模型残差诊断。(a) Q-Q 图检验正态性;(b) 残差 vs 拟合值检验同方差性;(c) 残差直方图与标准正态分布对比;(d) 残差 vs 时间检验独立性。}`
- **⛔ Caption 分隔符必须是空格，不能是冒号。** 中文论文的图表标题格式是"图 1 xxx"而不是"图 1: xxx"。在 preamble 中必须有 `\captionsetup{labelsep=quad}` 或 `\captionsetup{labelsep=space}`。如果模板已有此设置则不要重复添加。如果 Claude 自己写 main.tex，必须在 `\usepackage{caption}` 后加 `\captionsetup{labelsep=quad}`
- Wide tables (≥6 columns or multiple `p{}` columns): wrap with `\resizebox{\textwidth}{!}{...}`
- Narrow tables (≤4 columns): do not use `\resizebox` — it stretches text to full width, font becomes huge, table fills entire page
- Medium tables (5 columns): use `\resizebox` only if the table actually overflows margins; when in doubt, skip it
- Safest universal approach for any table: use `\begin{tabular*}{\textwidth}` or `\small\begin{tabular}` instead of `\resizebox` — this constrains width without distorting font size
- If a table is too tall (>12 rows), it MUST be truncated in body text — show first 3 rows + `$\vdots$` + last 3 rows, full table goes to appendix
- **⛔ 超过 12 行的结果表必须截断展示**：正文只放前 3 行 + `\midrule` + `$\vdots$` 省略行 + 后 3 行，完整表放附录。示例：
  ```latex
  \begin{table}[H]
  \centering\small
  \caption{7月1--7日各品类补货与定价策略（部分，完整结果见附录表A-1）}
  \begin{tabular}{llcccc}
  \toprule
  品类 & 日期 & 补货量(kg) & 加成率 & 零售价(元/kg) & 预期收益(元) \\
  \midrule
  花叶类 & 7月1日 & 174.1 & 0.600 & 8.53 & 160.94 \\
  花叶类 & 7月2日 & 177.3 & 0.600 & 8.53 & 163.88 \\
  花叶类 & 7月3日 & 164.2 & 0.600 & 8.53 & 151.80 \\
  \multicolumn{6}{c}{$\vdots$} \\
  辣椒类 & 7月5日 & 53.4 & 0.700 & 21.03 & 284.34 \\
  辣椒类 & 7月6日 & 53.3 & 0.700 & 21.03 & 283.87 \\
  辣椒类 & 7月7日 & 52.8 & 0.700 & 21.03 & 281.20 \\
  \bottomrule
  \end{tabular}
  \end{table}
  ```
  正文用截断表 + 文字总结关键发现，附录放完整表（用 `longtable` 跨页）。
- **⛔ 超参数/配置表格规则**：如果不同模型的参数数量差异很大（如线性回归 2 个参数 vs LSTM 9 个参数），**不要用一个大表**——拆成每个模型一个小表，或者用 `longtable` 跨页。否则表格会超出页面底部被截断。
- **⛔ 表格高度预估**：每行约 0.5cm，一页最多放 ~40 行。如果表格总行数（含 multirow 展开后的实际行数）> 35 行，必须用 `longtable` 或拆分。
- **⛔ 表格不能被页面截断**：编译后必须检查每个表格是否完整显示。如果表格底部被切掉，改用 `longtable` 环境（需要 `\usepackage{longtable}`）或拆分成多个小表。
- TikZ code: paste directly into section files, do not copy `\usepackage` lines
- TikZ node text: do not use bare backslash with Chinese (`\归一化` → `\\归一化` or `/归一化`)
- No emoji or special Unicode in LaTeX source
- Never create empty figure environments: every `\begin{figure}...\end{figure}` must contain either `\includegraphics{../figures/xxx.pdf}` or a `tikzpicture`. If the PDF file doesn't exist yet, skip the figure entirely rather than writing an empty shell with just a caption

### TikZ geometry/algorithm/architecture figures

TikZ figures are generated by paper-figure-drawio as `figures/tikz_diagrams.tex`, compiled to `figures/tikz_diagrams.pdf` (multiple figures → `tikz_diagrams_N.pdf` / `tikz_*.pdf`). Their `\includegraphics` figure blocks are already appended to `figures/latex_includes.tex`. (Legacy name `tikz_architecture_examples.tex` is also accepted.)

To embed: copy each `\begin{figure}...\end{figure}` block that references a `tikz_*.pdf` from `latex_includes.tex` directly into the appropriate section (not via `\input`). **Every `tikz_*.pdf` must be embedded — none may be dropped.** Map by caption/content:
- 技术路线图/研究框架图/问题关系图 → introduction/problem analysis chapter
- 模型架构图/求解流程图/几何示意图 → method/model chapter (geometry → the relevant sub-problem section)
- Others → judge by caption

### Python 图表防遮挡规则（Anti-Overlap）

生成 matplotlib/seaborn 图表时，必须检查以下遮挡问题：

**⛔ 强制规则（违反会导致图表不可用）：**
1. **任何 `ax.text()` 标注超过 3 个时，必须改用 `smart_labels()`** — 不允许手动逐个 `ax.text()`，因为无法保证不重叠
2. **任何 `ax.legend()` 必须改用 `auto_legend(ax)`** — 自动选择不遮挡数据的位置
3. **PCA biplot / 散点标注 / 特征重要性图** — 标签必须用 `smart_labels()`，这类图标签密集，手动偏移必定重叠
4. **⛔ 子图标注 (a)(b)(c)(d) 必须用 `ax.set_title()` 而不是 `ax.text(transAxes)`：**
   ```python
   # ✅ 正确：紧贴子图顶部，不受 aspect ratio 影响
   ax.set_title('(a)', fontsize=12, fontweight='bold', loc='left', pad=3)
   
   # ❌ 错误：set_aspect('equal') 时标注会远离子图
   ax.text(-0.08, 1.05, '(a)', transform=ax.transAxes, fontsize=12, fontweight='bold')
   ```
   原因：`transAxes` 坐标相对于 axes 逻辑区域，但 `set_aspect('equal')` 或 `constrained_layout` 会让实际绘图区域缩小，导致 `y=1.05` 看起来离图很远。`set_title(loc='left', pad=3)` 自动贴着实际渲染的 axes 边框。

**⛔ 通用防遮挡规则（所有图表都必须遵守）：**
- **多条线终点标注**：如果 ≥3 条线的终点 y 值差距 < y 轴范围的 5%，必须用 `smart_labels()` 而不是手动 `ax.text()`
- **柱状图 + 折线叠加（双轴图）**：折线数值标注放在折线上方（不是柱子上方），柱子的数值标注放在柱子内部或顶部。两者不要在同一个 y 位置。**⛔ 参考线/基准线的标注框必须放在图的边缘（左上角/右上角），绝对不要放在柱子和折线的交叉区域 — 这是最常见的遮挡场景。** 用 `transform=ax.transAxes` 固定在图的角落位置。
- **图例位置**：如果图例和数据重叠，用 `bbox_to_anchor` 把图例放到图外（上方或右侧）
- **标注框不能超出图表边界**：所有 `ax.text()` 和 `ax.annotate()` 的位置必须在 xlim/ylim 范围内。如果标注在边缘，用 `clip_on=False` + 加大 `pad_inches`
- **等高线图/3D 曲面图标注规则**：最优点标注（星号+文字框）如果在图的边缘（靠近轴），标注文字必须偏向图内侧，不要朝外（会遮挡坐标轴刻度）。用 `textcoords='offset points'` 控制偏移方向：靠右边缘的点偏左标注 `(-60, 20)`，靠上边缘的点偏下标注 `(20, -40)`。同时加大 `pad_inches=0.3` 防止裁切
- **数值标注间距**：相邻标注的 y 间距至少为字号高度的 1.5 倍。如果做不到，只标注关键点（最大/最小/首尾）

**检查清单：**
4. 参考线标注不能和数值标签重叠 — **⛔ 参考线/基准线/阈值线的文字标注必须放在图的边缘（角落），用 `transform=ax.transAxes` 定位到 (0.02, 0.98) 或 (0.98, 0.02) 等角落位置。绝对不要用 `ax.text(x_data, y_data, ...)` 把标注放在数据区域中间。**
5. 密集数据（>15 个标签）时 — 只标注关键点（最大/最小/首尾），不要每个点都标
6. 棒棒糖图/森林图 — 值域窄时（如 0.03-0.13），标签偏移量必须按值域比例计算。**数值标签必须用 `smart_labels()` 而不是手动 `ax.text()`**，因为数据点密集时固定偏移必定重叠。如果最大值的标签超出 xlim，必须加大 `xlim` 右边界（`ax.set_xlim(min_val - margin, max_val + margin)`，margin 至少为值域的 15%）。
7. 环形图 — 小扇区（<5%）的标签必须用外部连线，不能放在扇区内
8. 双轴图 — 柱状图用 `alpha=0.6` 半透明避免遮挡折线
9. **多 axes 布局（聚类热力图、边际直方图等）** — 树状图/边际图和主图之间至少留 0.05 的间距。`fig.add_axes([left, bottom, width, height])` 时，相邻 axes 的边界不能紧贴。树状图右边界和热力图左边界之间至少 0.04，标签区域额外预留 0.03。推荐用 `fig.add_gridspec()` 代替手动 `add_axes()`，自动处理间距。

**⛔ 热力图数字必须可读**：`sns.heatmap()` 的 `annot=True` 默认用黑色文字，深色格子上完全看不清。必须加 `annot_kws` 或用自适应文字颜色：
```python
# 方法：用 seaborn 内置的自适应（推荐）
sns.heatmap(data, annot=True, fmt='.2f', cmap='YlOrRd',
            linewidths=0.5, linecolor='white',
            annot_kws={'fontsize': 9, 'fontweight': 'bold'})
# 手动设置阈值：深色格子用白字，浅色格子用黑字
from matplotlib.colors import Normalize
norm = Normalize(vmin=data.min().min(), vmax=data.max().max())
for text in ax.texts:
    val = float(text.get_text())
    text.set_color('white' if norm(val) > 0.6 else 'black')
```
不要只用 `annot=True` 就完事——必须确保所有格子上的数字都清晰可读。
10. **聚类热力图 + 树状图** — **⛔ 必须严格按照 advanced #14 配方的 `fig.add_axes()` 布局代码，不要用 gridspec 自己发挥。** 只保留顶部树状图，不用左侧树状图（会遮挡 y 轴标签）。树状图高度占比不超过 15%（`add_axes([0.22, 0.85, 0.56, 0.12])`）。热力图左边界 `_left` 必须 ≥ 0.22（给 y 轴标签+左侧色条留足空间）。如果有左侧分组色条，色条放在 `_left - 0.05` 处（宽度 0.025），色条和热力图之间至少留 0.025 的间距给 y 轴标签。**⛔ 禁止让色条和 y 轴标签区域重叠 — 这是最常见的遮挡 bug。**
11. **帕累托图** — **⛔ 必须用 basic #9 配方的竖向布局（竖向柱状图 + 右轴累积折线），不要用横向柱状图 + twiny() 自己发挥。** 关键技巧：左轴 ylim 设为数据最大值的 2.5 倍，右轴 ylim 设为 `(-65, 110)`，这样柱子在下半部分、折线在上半部分，互不遮挡。

工具函数（在 `_utils/plot_utils.py` 中）：
- `smart_labels(ax, xs, ys, texts, ...)` — 自动推开重叠标签（基于 adjustText 库）
- `auto_legend(ax, ...)` — 自动选择不遮挡数据的图例位置
- `check_legend_overlap(ax)` — 返回最佳图例位置字符串
</figure_embedding>

<latex_constraints>
## LaTeX Constraints

- Line breaks: use `\\` (double backslash), not `\[` (that starts display math mode)
- Title spacing: `\\[0.5em]`, not `\[0.5em]`
- Table row endings: `\\` (double backslash), not `\` (single backslash — causes compile failure)
- Do not redefine built-in math operators (`\sin`, `\cos`, `\tanh`, `\log`, `\exp`, `\max`, `\min`, etc.)
- `math_commands.tex`: only define paper-specific new commands, never override existing ones
- Avoid `\begin{itemize}` in body text (bullet-point lists read as AI-generated). Use `\begin{enumerate}` or flowing prose instead. Itemize is acceptable only in appendices
- **⛔ 正文中禁止使用 `\begin{itemize}` 和 `\begin{enumerate}` 列表。** 黑点/编号列表是最典型的 AI 写作痕迹。学术论文正文必须用连贯的段落叙述。例外：模型假设（可用编号）、附录、算法步骤描述。
  - ❌ 错误：`\begin{itemize} \item 牛市：2023年7月至... \item 震荡市：2024年4月至... \end{itemize}`
  - ✅ 正确：将每个要点展开为完整段落，用"首先...其次...此外..."等过渡词连接，或用"（1）...（2）...（3）..."行内编号
- **⛔ 正文中禁止出现元叙述和内部指令。** 以下内容绝对不能出现在论文正文中：
  - "参赛者"、"参赛队伍"、"我们团队" → 用"本文"代替
  - "RESULTS.md"、"figures/*.json"、"CLAUDE.md"、"MODELING_REPORT.md" 等文件名 → 这些是内部工作文件，不是论文内容
  - "数据驱动"、"可解释建模"等原则性描述如果是从 SKILL 指令中复制的，不要原样写入正文
  - "竞赛特征"、"竞赛要求" → 论文是独立的学术文档，不要提及竞赛本身的规则或要求
  - 任何看起来像是"给 AI 的指令"而不是"给读者的分析"的内容
- No `\hypersetup{colorlinks=true}` — conflicts with `hidelinks`, causes blue citation links
- Citation format: use venue-appropriate package (gbt7714 for Chinese papers with superscript `[1]`, natbib for English ML venues with `Author, Year`)
- Do not use `\usepackage{natbib}` in Chinese academic papers (thesis/journal) — it produces `[Author, Year]` instead of `[1]`. Exception: the stats competition template intentionally uses natbib with `[numbers, square]` which correctly produces `[1]` format
- **⛔ 引用格式规则（中文论文）：**
  - 每个 `\cite{}` 只引用一篇文献：`\cite{wang2020}` ✅，`\cite{wang2020,li2021,zhang2022}` ❌
  - 引用编号必须按出现顺序递增：正文中先出现的文献编号小，后出现的编号大。不要出现 `[3]` 在 `[1]` 前面的情况
  - 如果需要同时引用多篇，分开写：`王某\cite{wang2020}、李某\cite{li2021}和张某\cite{zhang2022}分别研究了...`
  - 不要在一句话末尾堆砌引用：`...具有重要意义\cite{a,b,c,d,e}` ❌ → 每篇文献对应具体的观点或贡献
- **⛔ 模型假设用 `\needspace{20\baselineskip}`，符号说明用 `\needspace{15\baselineskip}`**——compile_utils.sh 自动处理：
  - 模型假设（`2_assumptions.tex`）：注入 `\needspace{20\baselineskip}`，当前页剩余空间够放 5 条假设就不换页，不够才换
  - 符号说明（`3_symbols.tex`）：注入 `\needspace{15\baselineskip}`，确保标题和表格在同一页
  - 不要手动加 `\clearpage` 或 `\needspace`，compile_utils.sh 会自动处理
- **⛔ 封面信息不要用 tabular + `\cline`。** 封面的学校、队员、指导老师等信息用 `\makebox` 或 `\underline{\hspace{}}` 排版，不要用 tabular 表格。`\cline{2-2}` 在封面上会被渲染成文本 "cline2-2"。正确做法：
  ```latex
  参赛学校：\underline{\makebox[8cm][c]{[学校名称]}} \\[0.8em]
  参赛队员：\underline{\makebox[8cm][c]{[队员姓名]}} \\[0.8em]
  ```
- **⛔ 引号统一用中文全角引号 `"..."` 和 `'...'`（中文论文）：**
  - ✅ 正确（中文论文）：`“重要发现”`（全角双引号 U+201C/U+201D，xeCJK 自动渲染为对称弯引号）
  - ✅ 正确（中文论文）：`‘方法’`（全角单引号 U+2018/U+2019）
  - ❌ 错误（中文论文）：`` ``重要发现'' ``（LaTeX 风格反引号 + 单引号，在中文环境下会显示成两个堆叠的反引号）
  - ❌ 错误：`"重要发现"`（ASCII 直引号 `"...""`，LaTeX 渲染为右右引号 `""`，**Word docx 渲染为左右不分的两个右引号**，截图里那个"差异本身"" 就是这个问题）
  - **英文论文例外**：英文环境用 LaTeX 风格 `` ``important'' ``（西文字体下渲染为对称弯引号），不要用全角引号
  - **docx 模式专属**：`md_to_docx.js` 会自动把含中文的 ASCII 直引号 `"..."` 转成 `"..."`，但**写作时仍优先直接用 `"..."`**（避免引号嵌套或紧贴中英文混合时转换失败）
  - **怎么打中文弯引号**：
    - macOS：默认中文输入法直接打 `“` 就是 `”`，要打 `“` 用 Shift+`”` 第二次
    - Windows：搜狗/微软拼音中文模式打 `"` 默认是中文弯引号；英文模式打的是 ASCII 直引号
    - **实在不会打就在 paper/main.md 里 ctrl+H 全文替换**：`“` → `”`（先左后右），但要小心代码块内的引号
  - 如果不小心写错，compile_utils.sh / comp-compile-zh / md_to_docx.js 会自动统一
</latex_constraints>

<page_filling>
## Page Filling (Chinese thesis/competition papers)

Every page should be filled. Half-empty pages are a basic formatting failure in Chinese theses and competition papers.

- Last page of each chapter: text fills at least 2/3 of the page. If only a few lines remain, expand the chapter content
- Figures should not occupy a page alone — text must appear above or below
- **⛔ 所有图使用 `keepaspectratio` + `height` 双约束**，LaTeX 自动处理高图缩放，不需要在 DrawIO 层面限制图的高度
- Do not use `\clearpage` or `\newpage` between chapters (except for abstract/TOC pages). Let LaTeX flow naturally
- If a chapter ends with empty space, add a "本章小结" paragraph (2-3 sentences summarizing the chapter and previewing the next)
</page_filling>

<abstract_requirements>
## Abstract Requirements

### Chinese papers (thesis/competition)
- Chinese abstract: 500-700 characters. Aim to fill most of one page but leave 3-4 lines margin at the bottom — overflowing onto a second page looks worse than being slightly short
- Content chain: 研究背景与意义 → 现有方法的不足 → 本文提出的方法 → 数据来源与处理 → 关键发现（must have specific numbers like 精度、R²、p值） → 应用价值
- English abstract: 350-500 words, faithful translation of Chinese abstract. Same principle — fit on one page with a small margin, do not overflow
- Use manual typesetting for abstracts (not `\begin{abstract}` twice — ctexart shows "摘要" as title for both)
- The abstract is the soul of the paper — reviewers read it first. It must be thorough, never just 2-3 paragraphs

**⛔ 论文标题规则：**
- 标题不能太简单笼统（如"车辆路径规划问题研究"）。必须体现具体的研究方法和创新点
- 不要用副标题（不要用"——"分隔的两段式标题），一句话说清楚
- 数模竞赛标题格式：一句话包含 `研究对象 + 核心方法/模型 + 研究视角`。例如：
  - ✗ "物流配送优化" → ✓ "基于改进遗传算法的冷链物流多目标配送路径优化研究"
  - ✗ "疫情传播模型" → ✓ "考虑人口流动与疫苗接种的新冠疫情 SEIR 改进传播模型"
  - ✗ "机器人竞技策略" → ✓ "基于多目标动力学建模与博弈决策的人形机器人竞技策略优化研究"
  - ✗ "数据分析" → ✓ "基于多期双重差分与空间杜宾模型的数据要素市场化配置效应研究"
- 标题应在建模求解/数据分析完成后，根据实际使用的方法和发现来拟定，不要在规划阶段就定死
- 标题长度：中文 15-30 字，简洁有力，不要超过 35 字

**⛔ 摘要页排版规则（中文论文）：**
- 摘要必须在封面之后、目录之前。不要在摘要前放 `\listoffigures`（插图目录）或 `\listoftables`（表格目录）
- 正确的页面顺序：封面 → 摘要（中文）→ 摘要（英文）→ 目录 → 正文。`\listoffigures` 和 `\listoftables` 如果需要，放在目录之后、正文之前

**⛔ 防空白页规则：**
- **不要在正文章节之间加 `\newpage`、`\clearpage` 或 `\nopagebreak`** — 让 LaTeX 自动分页。`\nopagebreak` 会把标题和大表格绑死，放不下就整块推到下一页产生空白页
- 只在摘要后和目录后用分页
- 参考文献和附录前不要加 `\newpage`
- 关键词必须用 `\textbf{关键词：}` 加粗标注，与摘要正文之间空一行
- 摘要页推荐用 `\begin{abstract}` 环境（ctexart 自带），不要用普通 `\section*{摘要}` + 段落文本
- **⛔ 摘要必须有首行缩进（2 字符）。** ctexart 的 `\begin{abstract}` 环境自动有缩进。如果用自定义排版，必须确保 `\parindent=2em`。绝对不要在摘要中使用 `\noindent`
- **⛔ 摘要必须分段，不要写成一整段。** 按论文类型分段：

  **数模竞赛（cumcm/huawei/mathorcup/apmcm）：**
  - 第 1 段：研究背景与问题概述（2-3 句）
  - 第 2 段：针对问题一，方法+模型+关键数值结果
  - 第 3 段：针对问题二，方法+模型+关键数值结果
  - 第 4 段：针对问题三，方法+模型+关键数值结果
  - 第 5 段：模型推广、灵敏度分析、优缺点（1-2 句）
  - 每个子问题必须单独成段，不能把所有问题挤在一段里

  **统计建模/学术论文：**
  - 第 1 段：研究背景与问题（2-3 句）
  - 第 2 段：研究方法与数据（3-4 句）
  - 第 3 段：关键发现与数值结果（3-5 句，必须有具体数字）
  - 第 4 段：研究意义与政策建议（1-2 句）
- 每段之间用 LaTeX 空行分隔（不要用 `\\` 或 `\vspace`）
- 摘要示例结构：
  ```latex
  \begin{abstract}
  在...背景下，...面临...问题。本文以...为研究对象，...

  研究采用...方法，构建了...模型。数据来源于...，样本包含...

  实证结果表明：第一，...（系数 0.042，p < 0.01）；第二，...；第三，...。
  稳健性检验（...）验证了结论的可靠性。

  本文的研究为...提供了实证依据，对...具有重要的政策启示。

  \textbf{关键词：}关键词1；关键词2；关键词3；关键词4；关键词5
  \end{abstract}
  ```

### Competition papers (数模竞赛)
- Chinese abstract: 400-600 characters, every sub-problem must have specific numerical results
- Summary Sheet (MCM/ICM): 300-400 words, self-contained with specific numbers, one full page

### English papers (ML venues)
- 150-250 words, self-contained
- Structure: what → why hard → how → evidence → strongest result
</abstract_requirements>

<resume_strategy>
## Resume / Breakpoint Strategy

Writing can be interrupted by timeout. Use these strategies to enable seamless resume:

1. Write in priority order: method/core chapters → experiments → introduction → related work → conclusion (core content first, auxiliary later)
2. Save each chapter immediately after writing — do not accumulate multiple chapters in memory
3. If approaching output limit, create placeholder files for remaining chapters:
```latex
% [PLACEHOLDER] This chapter needs continuation
% Expected content: [brief description of what this chapter should contain]
\section{Chapter Title}
Content to be added in continuation pass.
```
4. Before writing, always check for existing sections:
   - Placeholder sections (<500 chars or contains "PLACEHOLDER"/"待补充") → write these
   - Completed sections (>2000 chars) → skip, do not overwrite
   - This enables automatic resume after timeout/retry
</resume_strategy>

<chapter_context_card>
## 累积要点卡（Running Points-Card：跨章上下文，防"全文两张皮"）

正文被拆成 `sections/*.tex` 逐章独立写，每章默认只读 `MODELING_REPORT.md / RESULTS.md / all_results.json`——**互相看不见兄弟章节**，于是后章不知道前章下过什么结论、定义过什么符号、用过哪个数字，全文像拼接而非连贯论证。用一份**累积要点卡**打通上下文。

**文件**：工作区根目录 `_writing_context.md`（不放进 `paper/`、不被编译、超时重启后仍可见可续）。

**写完每一章后，立刻往 `_writing_context.md` 追加一张 3-5 行卡片**：
```
## <章节名，如 4 模型建立>
- 核心论点：本章确立了……
- 关键数字：NDCG=0.908, R²=0.87, 阈值=0.5（供后文引用时保持一致）
- 新定义的符号/术语：C(可信分数,0~1)、脊状聚集、……（后文直接用、不再重复定义）
- 已讨论的图表：图 4-1、图 4-2、表 4-1（后文不重复解读）
```

**写下一章前，先 `cat _writing_context.md`**，据此：
- 自然承接前文结论（"在第 3 章确立的评分机制基础上……"），而不是各写各的；
- 复用已定义的符号与术语，**不重复定义**（第一次在哪章定义过，后文直接用）；
- 同一指标的数字**全文保持一致**（前章说 NDCG=0.908，后章不能变成 0.91）；
- **不重复解读**已经讲过的图表。

**resume 安全**：写作是**优先级顺序**（核心→实验→绪论→相关工作→结论），不是章节序号顺序；要点卡按"已完成的章节"累积，不假设顺序。若超时重启后 `_writing_context.md` 缺失或不全，先扫已完成的 `sections/*.tex`（>2000 字符的那些）首段 + 关键数值，把卡片补建出来，再继续写后续章节。与 `<resume_strategy>` 配合使用。
</chapter_context_card>

<de_ai_polish>
## De-AI Polish

Remove these AI writing artifacts before finalizing:

### Structural AI patterns (most obvious — fix first)
- **⛔ `\begin{itemize}` / `\begin{enumerate}` in body text** — the #1 AI writing tell. Convert every bullet list to flowing paragraphs. Use "首先...其次...最后..." or "（1）...（2）...（3）..." inline numbering instead.
- **⛔ 每段只有 1-2 句话** — AI 喜欢写很多短段落。合并相关的短段落为 3-5 句的完整段落。
- **⛔ 连续段落以相同句式开头** — 如连续三段都以"本文..."开头，改为不同的开头方式。

### Chinese
- 具有重要的理论意义和实践价值
- 深入探讨、创新性地、值得注意的是
- Excessive use of 综上所述 to start paragraphs
- Consecutive paragraphs starting with 本文
- 空洞修饰语 — replace with specific numbers and facts
- "如表X所示" 后面没有分析 — 必须跟 2-3 句解读

### English
- delve, pivotal, landscape, tapestry, underscore, noteworthy
- "It is worth noting that", "Importantly,", "Notably,"
- Significance inflation, formulaic transitions, generic conclusions
- Consecutive paragraphs starting the same way
</de_ai_polish>

<references_workflow>
## References Generation Workflow

references.bib is a hard prerequisite for compilation. Without it, the PDF will have no references and will be judged as unqualified. Generate it during the writing phase, never skip.

### Collection
```bash
mkdir -p _tmp
grep -roh '\\cite[tp]*{[^}]*}' paper/sections/*.tex paper/main.tex 2>/dev/null \
  | grep -oP '\{[^}]+\}' | tr -d '{}' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort -u > _tmp/_cited_keys.txt
echo "Cited keys: $(wc -l < _tmp/_cited_keys.txt)"
cat _tmp/_cited_keys.txt
```

### Generation

**⛔ 优先使用 scholar_fetch.py 工具（环境变量 `$SCHOLAR_SCRIPT`）自动获取 BibTeX。**

```bash
PYTHON=""; for _c in "$MH_PYTHON" python python3; do [ -z "$_c" ] && continue; if $_c -c "import sys" >/dev/null 2>&1; then PYTHON="$_c"; break; fi; done; [ -z "$PYTHON" ] && PYTHON=python
# 对每个引用 key，用 scholar_fetch.py 搜索并获取 BibTeX
# ⛔ 必须把 citation key 还原成检索关键词再搜：key 形如 wang2023supply / smith_2021_gnn，
#    直接拿裸 key 当查询词命中率极低 → 搜空 → 被迫编造。去掉 TODO 前缀、下划线转空格。
# ⛔ 把 scholar_fetch 的输出**同时留档**到 _tmp/refs_raw.jsonl —— 收尾的 bib_authenticity_check
#    会拿它交叉核对：.bib 里凡是"检索留档中找不到、又无 DOI/arXiv"的条目一律判编造并拦下。
#    这是把"检索归检索、编造归编造"分开的关键证据，务必保留留档、不要跳过检索直接写 .bib。
while IFS= read -r key; do
    query=$(echo "$key" | sed 's/^TODO__//; s/_/ /g')
    echo "--- Fetching: $key (query: $query) ---"
    $PYTHON "$SCHOLAR_SCRIPT" bibtex "$query" --max 3 | tee -a _tmp/refs_raw.jsonl
    sleep 0.5
done < _tmp/_cited_keys.txt
```

从每个结果的 JSON 输出中选择正确的论文，将其 `bibtex` 字段复制到 `paper/references.bib`。

**Fallback（scholar_fetch.py 搜不到时）：**
1. 用 WebSearch 搜索论文标题 + 第一作者
2. 从 DBLP/CrossRef 手动获取 BibTeX：
   - DBLP: `curl -s "https://dblp.org/search/publ/api?q=TITLE+AUTHOR&format=json&h=3"` → `curl -s "https://dblp.org/rec/{key}.bib"`
   - CrossRef: `curl -sLH "Accept: application/x-bibtex" "https://doi.org/{doi}"`
3. 如果都找不到，手动生成条目但标记 `note = {[VERIFY] Citation needs manual verification}`
4. 保存到 `paper/references.bib`
5. 禁止凭记忆编造 — 找不到就标记 `[VERIFY]`

### Verification
```bash
[ -f paper/references.bib ] && echo "OK: references.bib exists" || echo "CRITICAL: references.bib missing!"
bib_count=$(grep -c '^@' paper/references.bib 2>/dev/null || echo 0)
cited_count=$(wc -l < _tmp/_cited_keys.txt 2>/dev/null || echo 0)
echo "Bib entries: $bib_count, Cited keys: $cited_count"
[ "$bib_count" -eq 0 ] && echo "CRITICAL: references.bib is empty! Must generate entries."
[ "$bib_count" -lt "$cited_count" ] && echo "WARNING: fewer bib entries than cited keys"
```

If references.bib is empty or missing, do not proceed to the next step.
</references_workflow>

<output_conventions>
## Output Conventions

- Primary output: `paper/` directory
- Temp files: `_tmp/` directory
- Do not write extra reports to root (no PAPER_WRITING_REPORT.md, COMPILE_REPORT.md, PAPER_COMPLETION_SUMMARY.md, etc.)
- Large files: use Bash heredoc (`cat << 'EOF' > file`)
- No real author/team info — use placeholders
- Tables: three-line style (booktabs)
- Backup existing `paper/` before overwriting
</output_conventions>
