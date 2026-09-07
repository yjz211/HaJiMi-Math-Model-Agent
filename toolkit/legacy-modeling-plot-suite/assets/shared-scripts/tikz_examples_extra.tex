% TikZ 额外参考模板库
% Claude 生成 TikZ 时可参考这些绘图模式（不要直接复制，根据实际内容改编）
%
% 模板索引：
%   A 神经网络(MLP)   B 蛛网/雷达图   C 状态自动机
%   D 函数图像(坐标轴+plot)   E 向量场/相平面   F 力学受力分析
%   G 光学光路系统   H CNN卷积层堆叠   I Transformer模块化架构(残差)
%   J 几何示意(calc:三角形/重心/中线)   K 装饰路径(弹簧/波浪/锯齿)
%   L PINNs物理信息网络架构(反向传播回环)   M 线性规划可行域图
%   N 3D曲面(需 tikz-3dplot)   O 电路图(需 circuitikz)
%
% ⛔ 配色提示：下列模板的颜色只是结构示例。实际生成时配色必须按 tikz_rules.md 的
%   6 套方案(A学术蓝/B森林绿/C暖灰棕/D靛蓝紫/E青灰/F石板灰)选用，遵循"浅填充(!5~!6)
%   + 中等边框(!70~!80)"原则，并保持 rounded corners + 微阴影 + 防遮挡规则。
% ⛔ 中文必须用 xelatex 编译。

%% ============================================================
%% 模板 A: 神经网络图（输入层-隐藏层-输出层）
%% 适用：机器学习模型架构、多层感知机、集成学习结构
%% 关键技巧：\foreach 循环画节点，双重循环画连线
%% ============================================================
% \def\layersep{2.5cm}
% \begin{tikzpicture}[shorten >=1pt,->,draw=black!50, node distance=\layersep]
%   \tikzstyle{neuron}=[circle,fill=black!25,minimum size=17pt,inner sep=0pt]
%   \tikzstyle{input neuron}=[neuron, fill=green!50];
%   \tikzstyle{output neuron}=[neuron, fill=red!50];
%   \tikzstyle{hidden neuron}=[neuron, fill=blue!50];
%   \tikzstyle{annot} = [text width=4em, text centered]
%   % 输入层
%   \foreach \name / \y in {1,...,4}
%     \node[input neuron, pin=left:Input \#\y] (I-\name) at (0,-\y) {};
%   % 隐藏层
%   \foreach \name / \y in {1,...,5}
%     \path[yshift=0.5cm] node[hidden neuron] (H-\name) at (\layersep,-\y cm) {};
%   % 输出层
%   \node[output neuron,pin={[pin edge={->}]right:Output}, right of=H-3] (O) {};
%   % 全连接
%   \foreach \source in {1,...,4}
%     \foreach \dest in {1,...,5}
%       \path (I-\source) edge (H-\dest);
%   \foreach \source in {1,...,5}
%     \path (H-\source) edge (O);
%   % 层标注
%   \node[annot,above of=H-1, node distance=1cm] (hl) {Hidden layer};
%   \node[annot,left of=hl] {Input layer};
%   \node[annot,right of=hl] {Output layer};
% \end{tikzpicture}


%% ============================================================
%% 模板 B: 蛛网图 / 雷达图（多维度评估对比）
%% 适用：模型评价、多指标对比、方案优劣分析
%% 关键技巧：极坐标 + \foreach 画网格 + 半透明路径叠加
%% ============================================================
% \newcommand{\D}{7}          % 维度数
% \newcommand{\U}{7}          % 刻度数
% \newdimen\R \R=3.5cm        % 最大半径
% \newdimen\L \L=4cm          % 标签半径
% \newcommand{\A}{360/\D}     % 角度间隔
% \begin{tikzpicture}[scale=1]
%   \path (0:0cm) coordinate (O);
%   % 画蛛网骨架
%   \foreach \X in {1,...,\D}{\draw (\X*\A:0) -- (\X*\A:\R);}
%   \foreach \Y in {0,...,\U}{
%     \foreach \X in {1,...,\D}{
%       \path (\X*\A:\Y*\R/\U) coordinate (D\X-\Y);
%       \fill (D\X-\Y) circle (1pt);}
%     \draw [opacity=0.3] (0:\Y*\R/\U)
%       \foreach \X in {1,...,\D}{-- (\X*\A:\Y*\R/\U)} -- cycle;}
%   % 维度标签
%   \path (1*\A:\L) node {\tiny 安全性};
%   \path (2*\A:\L) node {\tiny 准确率};
%   \path (3*\A:\L) node {\tiny 效率};
%   \path (4*\A:\L) node {\tiny 稳定性};
%   \path (5*\A:\L) node {\tiny 可用性};
%   \path (6*\A:\L) node {\tiny 泛化性};
%   \path (7*\A:\L) node {\tiny 可解释性};
%   % 方案 A（红色半透明）
%   \draw [color=red,line width=1.5pt,opacity=0.5]
%     (D1-5) -- (D2-6) -- (D3-4) -- (D4-5) -- (D5-3) -- (D6-4) -- (D7-6) -- cycle;
%   % 方案 B（蓝色半透明）
%   \draw [color=blue,line width=1.5pt,opacity=0.5]
%     (D1-3) -- (D2-4) -- (D3-6) -- (D4-3) -- (D5-5) -- (D6-6) -- (D7-2) -- cycle;
% \end{tikzpicture}

%% ============================================================
%% 模板 C: 有限状态自动机 / 状态转移图
%% 适用：算法状态机、马尔可夫链、决策过程
%% 关键技巧：automata 库 + state 样式 + bend/loop 连线
%% ============================================================
% \usetikzlibrary{arrows,automata}
% \begin{tikzpicture}[->,>=stealth',shorten >=1pt,auto,node distance=2.8cm,semithick]
%   \tikzstyle{every state}=[fill=red!30,draw=red!60,text=black]
%   \node[initial,state] (A)                    {$q_a$};
%   \node[state]         (B) [above right of=A] {$q_b$};
%   \node[state]         (D) [below right of=A] {$q_d$};
%   \node[state]         (C) [below right of=B] {$q_c$};
%   \node[state]         (E) [below of=D]       {$q_e$};
%   \path (A) edge              node {0,1,L} (B)
%             edge              node {1,1,R} (C)
%         (B) edge [loop above] node {1,1,L} (B)
%             edge              node {0,1,L} (C)
%         (C) edge              node {0,1,L} (D)
%             edge [bend left]  node {1,0,R} (E)
%         (D) edge [loop below] node {1,1,R} (D)
%             edge              node {0,1,R} (A)
%         (E) edge [bend left]  node {1,0,R} (A);
% \end{tikzpicture}


%% ============================================================
%% 模板 D: 函数图像（坐标轴 + 曲线 + 刻度标注）
%% 适用：函数曲线、收敛曲线、拟合对比、灵敏度曲线
%% 关键技巧：domain+samples 画 plot；\foreach 画刻度；node 标注
%% 优势：公式刻度($\pi/2$)与正文字体统一，矢量无损，比 matplotlib 更协调
%% ============================================================
% \begin{tikzpicture}[scale=0.9]
%   \draw[->] (-0.5,0) -- (7,0) node[right] {$x$};
%   \draw[->] (0,-1.5) -- (0,1.6) node[above] {$y$};
%   \draw[gray!20, very thin] (-0.3,-1.4) grid (6.6,1.5);
%   \draw[blue!70, line width=1pt, domain=0:6.28, samples=120]
%       plot (\x, {sin(\x r)}) node[right] {$\sin x$};
%   \draw[red!70, line width=1pt, dashed, domain=0:6.28, samples=120]
%       plot (\x, {cos(\x r)}) node[right] {$\cos x$};
%   \foreach \x/\lbl in {1.57/{$\frac{\pi}{2}$}, 3.14/{$\pi$}, 4.71/{$\frac{3\pi}{2}$}, 6.28/{$2\pi$}} {
%       \draw (\x,0.08) -- (\x,-0.08);
%       \node[below, font=\scriptsize] at (\x,-0.1) {\lbl};
%   }
% \end{tikzpicture}

%% ============================================================
%% 模板 E: 二维向量场 / 相平面图
%% 适用：微分方程稳定性、动力系统、相轨迹、F(x,y)=(-y,x) 旋度场
%% 关键技巧：双 \foreach + \pgfmathsetmacro 算分量；箭头 ->
%% ============================================================
% \begin{tikzpicture}[scale=0.9]
%   \foreach \x in {-2,-1,0,1,2}{
%     \foreach \y in {-2,-1,0,1,2}{
%       \pgfmathsetmacro{\vx}{-\y*0.28}
%       \pgfmathsetmacro{\vy}{\x*0.28}
%       \draw[->, blue!60, thick] (\x,\y) -- ++(\vx,\vy);
%     }
%   }
%   \draw[->] (-3,0) -- (3,0) node[right] {$x$};
%   \draw[->] (0,-3) -- (0,3) node[above] {$y$};
%   % 可叠加一条相轨迹示意：
%   % \draw[red, thick, domain=0:6.28, samples=80] plot ({1.5*cos(\x r)},{1.5*sin(\x r)});
% \end{tikzpicture}

%% ============================================================
%% 模板 F: 力学受力分析图（自由体图）
%% 适用：物理/力学类赛题（受力分析、斜面、桥梁、约束反力）
%% 关键技巧：彩色矢量箭头 + 角度 arc + pattern 画地面 + 白底标注防遮挡
%% ============================================================
% \usetikzlibrary{patterns}
% \begin{tikzpicture}
%   \draw[thick, fill=gray!12, rounded corners=2pt] (0,0) rectangle (2,1.4);
%   \node at (1,0.7) {$m$};
%   \draw[->, thick, red!70]    (1,0)   -- (1,-1.4) node[right, fill=white, inner sep=1pt] {$m\vec{g}$};
%   \draw[->, thick, blue!70]   (1,1.4) -- (1,2.8)  node[right, fill=white, inner sep=1pt] {$\vec{N}$};
%   \draw[->, thick, green!55!black] (0,0.7) -- (-1.4,0.7) node[left, fill=white, inner sep=1pt] {$\vec{f}$};
%   \draw[->, thick, orange!80] (2,0.7) -- (3.8,1.4) node[right, fill=white, inner sep=1pt] {$\vec{F}$};
%   \draw[dashed, gray] (2,0.7) -- (3.6,0.7);
%   \draw (2.9,0.7) arc (0:22:0.9) node[midway, right, font=\scriptsize] {$\theta$};
%   \fill[pattern=north east lines] (-1,-0.25) rectangle (3,0);
%   \draw[thick] (-1,0) -- (3,0);
% \end{tikzpicture}

%% ============================================================
%% 模板 G: 光学光路系统图
%% 适用：光学类赛题（透镜成像、反射折射、激光路径）
%% 关键技巧：ellipse 画透镜 + 红色光线箭头汇聚 + 虚线光轴 + 焦距标注
%% ============================================================
% \begin{tikzpicture}
%   \fill[orange!80] (-3,0) circle (0.18); \node[below, font=\scriptsize] at (-3,-0.3) {光源};
%   \draw[thick, fill=cyan!12] (0,0) ellipse (0.16 and 1.2); \node[below, font=\scriptsize] at (0,-1.5) {凸透镜};
%   \foreach \dy in {-0.3,0,0.3} \draw[red!70, thick, ->] (-2.8,\dy) -- (-0.15,\dy);
%   \foreach \dy in {-0.3,0,0.3} \draw[red!70, thick, ->] (0.15,\dy) -- (2,0);
%   \fill[blue!70] (2,0) circle (0.09); \node[below, font=\scriptsize] at (2,-0.3) {焦点 $F$};
%   \draw[dashed, gray] (-3.4,0) -- (3,0);
%   \draw[<->] (0,-1) -- (2,-1) node[midway, below, font=\scriptsize] {$f$};
% \end{tikzpicture}

%% ============================================================
%% 模板 H: CNN 卷积层堆叠（伪 3D 立方体特征图）
%% 适用：深度学习/图像类模型架构（卷积-池化-全连接）
%% 关键技巧：\foreach 偏移叠多张半透明矩形造"厚度"；箭头标注操作
%% ============================================================
% \begin{tikzpicture}[
%   cube/.style={draw, thick, fill opacity=0.75},
%   arrow/.style={->, thick, >=stealth}]
%   \foreach \z in {0,0.18,0.36} \draw[cube, fill=blue!25] (0+\z,0+\z) rectangle (1.8+\z,1.8+\z);
%   \node[below, font=\scriptsize] at (1.1,-0.3) {输入 $28\times28\times3$};
%   \draw[arrow] (2.6,0.9) -- (3.5,0.9) node[midway, above, font=\scriptsize] {Conv};
%   \foreach \z in {0,0.14,...,0.56} \draw[cube, fill=green!25] (3.8+\z,0.3+\z) rectangle (5.0+\z,1.5+\z);
%   \node[below, font=\scriptsize] at (4.7,-0.3) {$24\times24\times16$};
%   \draw[arrow] (5.9,0.9) -- (6.8,0.9) node[midway, above, font=\scriptsize] {Pool};
%   \foreach \z in {0,0.14,...,0.56} \draw[cube, fill=orange!25] (7.1+\z,0.5+\z) rectangle (8.0+\z,1.5+\z);
%   \node[below, font=\scriptsize] at (7.9,-0.3) {$12\times12\times16$};
% \end{tikzpicture}

%% ============================================================
%% 模板 I: Transformer / 模块化架构图（带残差虚线连接）
%% 适用：Transformer、Encoder-Decoder、带 skip connection 的模块堆叠
%% 关键技巧：block 样式统一 + 竖直堆叠 + 残差用 dashed |- 绕到右侧
%% ============================================================
% \begin{tikzpicture}[
%   block/.style={draw, rounded corners=3pt, minimum width=3.2cm, minimum height=0.8cm, thick},
%   arrow/.style={->, thick, >=stealth}]
%   \node[block, fill=blue!12]   (embed) at (0,0)   {Embedding};
%   \node[block, fill=blue!18]   (pe)    at (0,1.2) {Positional Encoding};
%   \node[block, fill=orange!18] (mha)   at (0,2.6) {Multi-Head Attention};
%   \node[block, fill=violet!12] (norm1) at (0,3.8) {Add \& Norm};
%   \node[block, fill=green!18]  (ffn)   at (0,5.0) {Feed Forward};
%   \node[block, fill=violet!12] (norm2) at (0,6.2) {Add \& Norm};
%   \foreach \a/\b in {embed/pe, pe/mha, mha/norm1, norm1/ffn, ffn/norm2}
%       \draw[arrow] (\a) -- (\b);
%   \draw[arrow, dashed, gray] (pe.east)    -- ++(1,0) |- (norm1.east);
%   \draw[arrow, dashed, gray] (norm1.east) -- ++(1.3,0) |- (norm2.east);
%   \node[left, font=\small] at (-2,3.1) {\textbf{Encoder Block}};
% \end{tikzpicture}

%% ============================================================
%% 模板 J: 几何示意图（calc 库：三角形 + 中线 + 重心）
%% 适用：几何证明配图、平面几何、向量分解、坐标几何
%% 关键技巧：$(A)!0.5!(B)$ 取中点；嵌套 $(A)!0.333!(...)$ 算重心
%% ============================================================
% \usetikzlibrary{calc}
% \begin{tikzpicture}
%   \coordinate (A) at (0,0); \coordinate (B) at (4,0); \coordinate (C) at (2,3);
%   \draw[thick] (A) -- (B) -- (C) -- cycle;
%   \coordinate (MAB) at ($(A)!0.5!(B)$);
%   \coordinate (MBC) at ($(B)!0.5!(C)$);
%   \coordinate (MCA) at ($(C)!0.5!(A)$);
%   \coordinate (G)   at ($(A)!0.3333!($(B)!0.5!(C)$)$);
%   \draw[dashed, blue!60] (A)--(MBC) (B)--(MCA) (C)--(MAB);
%   \fill[red] (G) circle (1.6pt) node[right, font=\scriptsize] {重心 $G$};
%   \node[below left] at (A) {$A$}; \node[below right] at (B) {$B$}; \node[above] at (C) {$C$};
% \end{tikzpicture}

%% ============================================================
%% 模板 K: 装饰路径（弹簧 / 波浪 / 锯齿 / 阻尼）
%% 适用：力学弹簧振子、机械连接、热流/波动示意（作为片段嵌入物理图）
%% 关键技巧：decorations.pathmorphing 库 + decorate
%% ============================================================
% \usetikzlibrary{decorations.pathmorphing}
% \begin{tikzpicture}
%   \draw[thick, decorate, decoration={coil, aspect=0.5, amplitude=3mm, segment length=2.5mm}]
%       (0,0) -- (3,0) node[right, font=\scriptsize] {弹簧 $k$};
%   \draw[thick, decorate, decoration={snake, amplitude=1.5mm, segment length=4mm}]
%       (0,-1) -- (3,-1) node[right, font=\scriptsize] {波动};
%   \draw[thick, decorate, decoration={zigzag, amplitude=1.5mm, segment length=3mm}]
%       (0,-2) -- (3,-2) node[right, font=\scriptsize] {锯齿/阻尼};
% \end{tikzpicture}

%% ============================================================
%% 模板 L: PINNs / 物理信息神经网络架构（带反向传播回环）
%% 适用：科研类 PINN/算子学习/带物理约束的训练流程
%% 关键技巧：彩色 block + 主数据流箭头 + 灰色 dashed 反向传播回环走外侧
%% ============================================================
% \begin{tikzpicture}[
%   block/.style={draw, rounded corners=3pt, minimum width=2.2cm, minimum height=0.85cm, thick},
%   arrow/.style={->, thick, >=stealth}]
%   \node[block, fill=green!15]  (input)  at (0,0)  {$(x,t)$};
%   \node[block, fill=blue!15]   (nn)     at (3,0)  {$\mathcal{NN}_\theta$};
%   \node[block, fill=yellow!18] (output) at (6,0)  {$u_\theta(x,t)$};
%   \node[block, fill=orange!18] (ad)     at (6,-2) {自动微分};
%   \node[block, fill=red!15]    (pde)    at (3,-2) {$\mathcal{N}[u_\theta]-f$};
%   \node[block, fill=violet!15, minimum width=4cm] (loss) at (4.5,-4)
%       {$\mathcal{L}=\mathcal{L}_{\text{data}}+\mathcal{L}_{\text{PDE}}$};
%   \foreach \a/\b in {input/nn, nn/output, output/ad, ad/pde} \draw[arrow] (\a)--(\b);
%   \draw[arrow] (pde) -- (loss);
%   \draw[arrow, dashed, gray] (loss.west) -- ++(-4,0) |- (nn.south);
%   \node[gray, font=\scriptsize] at (-0.3,-2) {反向传播};
% \end{tikzpicture}

%% ============================================================
%% 模板 M: 线性规划可行域图（约束直线 + 可行域阴影 + 等高线 + 最优解）
%% 适用：线性/整数规划、优化类赛题（可行域可视化、最优解几何解释）
%% 关键技巧：clip 裁剪可行域 + pattern/fill opacity 阴影 + 平行等高线 + 最优顶点高亮
%% ============================================================
% \begin{tikzpicture}[scale=0.9]
%   \draw[->] (0,0) -- (6,0) node[right] {$x_1$};
%   \draw[->] (0,0) -- (0,6) node[above] {$x_2$};
%   % 可行域(多边形顶点按约束交点算出后填充)
%   \fill[blue!12] (0,0) -- (4,0) -- (3,2) -- (1.5,3.5) -- (0,4) -- cycle;
%   % 约束直线
%   \draw[red!70, thick]   (0,4) -- (4,0)   node[pos=0.15, above right, font=\scriptsize] {$x_1+x_2\le 4$};
%   \draw[green!55!black, thick] (0,5) -- (5,0) node[pos=0.8, above right, font=\scriptsize] {约束2};
%   % 目标函数等高线(平行虚线，箭头指优化方向)
%   \foreach \c in {1,2,3} \draw[gray!60, dashed] (\c,0) -- (0,\c*1.3);
%   \draw[->, thick] (0.5,0.6) -- (1.6,1.9) node[right, font=\scriptsize] {$\nabla z$};
%   % 最优顶点高亮
%   \fill[red] (3,2) circle (2pt) node[above right, font=\scriptsize] {最优解 $(x_1^*,x_2^*)$};
% \end{tikzpicture}

%% ============================================================
%% 模板 N: 3D 曲面 / 立体示意（需要宏包 tikz-3dplot）
%% 适用：三维曲面 z=f(x,y)、空间几何、立体场景的"近似示意"
%% ⛔ preamble 需 \usepackage{tikz-3dplot}（MiKTeX 会自动装包）
%% ⛔ 复杂写实 3D 场景(球面反射/透视)仍建议用 GPT Image，TikZ 只做简洁示意
%% ============================================================
% \tdplotsetmaincoords{70}{110}
% \begin{tikzpicture}[tdplot_main_coords, scale=1]
%   \draw[->] (0,0,0) -- (4,0,0) node[right] {$x$};
%   \draw[->] (0,0,0) -- (0,4,0) node[above] {$y$};
%   \draw[->] (0,0,0) -- (0,0,3) node[above] {$z$};
%   \foreach \x in {0,0.5,...,3}
%     \draw[blue!50] plot[domain=0:3, samples=20] (\x, \x, {sin(\x*60)*cos(\x*60)});
% \end{tikzpicture}

%% ============================================================
%% 模板 O: 电路图（需要宏包 circuitikz）
%% 适用：电类赛题(电工杯)、电路网络、信号系统
%% ⛔ preamble 需 \usepackage{circuitikz}（MiKTeX 会自动装包）；环境用 circuitikz 不是 tikzpicture
%% ============================================================
% \begin{circuitikz}[american]
%   \draw (0,0) to[V, l=$V_s$] (0,3)
%               to[R, l=$R_1$] (3,3)
%               to[L, l=$L$]   (3,0)
%               to[C, l=$C$]   (0,0);
%   \draw (3,3) to[R, l=$R_2$] (6,3) to[short] (6,0) to[short] (3,0);
%   \draw (3,0) node[ground]{};
%   \draw[->, blue] (1.5,3.3) -- (2.5,3.3) node[midway, above, font=\scriptsize] {$I$};
% \end{circuitikz}
