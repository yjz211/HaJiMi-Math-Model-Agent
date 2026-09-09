---
name: paper-figure-html
description: "用 HTML+CSS 画流程图/技术路线图/系统架构图/流水线/框架矩阵图，再用 Electron printToPDF 转成矢量 PDF 供论文 \\includegraphics 引用。paper-figure-drawio 的 HTML 平替（默认）。当用户说\"画HTML图\"、\"技术路线图\"、\"流程图\"或需要论文非数据类示意图时使用。"
argument-hint: [figure-plan-or-data-path]
allowed-tools: Bash(*), Read, Write, Edit, Grep, Glob, Agent
---

# Paper Figure — HTML/CSS 矢量图（Sub-step）

用 HTML+CSS 生成论文非数据类示意图：**$ARGUMENTS**

这是从 paper-figure 拆出的**轻量子步骤**，是 `paper-figure-drawio` 的 **HTML 平替**（用户可二选一，HTML 为默认）。只处理架构/流程/路线类示意图，数据图（matplotlib/seaborn）已在前一步 paper-figure 生成。

**HTML 相对 DrawIO 的核心优势**：用 flex/grid 自动布局，不写绝对坐标 → 天然免疫节点重叠/坐标错位/连线穿越。因此本 skill **不需要** drawio 的坐标结构自检（drawio_check.py），改用 HTML/PDF 专属质检。

## ⚡ 快速模式检测（开头先跑）

```bash
FAST_MODE=0
grep -q 'MH_FAST_MODE=1' CLAUDE.md 2>/dev/null && FAST_MODE=1
echo "FAST_MODE=$FAST_MODE"
```

**若 `FAST_MODE=1`（速度优先）：** 仍按图表清单产出所有图（一张不漏、能出 PDF、过 html_pdf_check、**过 Step 4.5 元素级几何自检**），但**跳过** vision 视觉自检的多轮修复循环——生成即用，仅当 html_pdf_check FAIL 或明显空图时才补。**若 `FAST_MODE=0`（默认）：** 视觉自检修复循环照常执行。⛔ **几何自检（Step 4.5）任何模式都跑**：它快（纯几何、几十毫秒）、且能挡"文字被裁/越界/重叠"这类真翻车，不算 vision 加分项。

## Constants

- **FIG_DIR = `figures/`**
- **CUSTOM_REQUIREMENTS** — 用户自定义要求，最高优先级。

## ⛔ 工具路径解析（每次开头先跑，后续步骤都用这些变量）

本 skill 的模板、主题、质检脚本运行时由后端注入到工作区。位置可能在 `_templates/`（模板目录，一定会注入）或 `_utils/`（脚本目录）。用防御式解析，找不到不报错、优雅降级：

```bash
PYTHON=""; for _c in "$MH_PYTHON" python python3; do [ -z "$_c" ] && continue; if $_c -c "import sys" >/dev/null 2>&1; then PYTHON="$_c"; break; fi; done; [ -z "$PYTHON" ] && PYTHON=python
# ⛔ 这台机器必须用 python，不能用 python3（python3 触发 Microsoft Store 存根，exit 49）

# 模板目录：优先 _templates/，回退到 skill 源目录
TPL_DIR=""
for d in _templates skills/paper-figure-html/templates _utils; do
  if [ -f "$d/tpl_roadmap.html" ]; then TPL_DIR="$d"; break; fi
done
echo "模板目录 TPL_DIR=$TPL_DIR"

# 出图工具（screenshot_capture.py，后端复制进 _utils/）
CAPTURE=""
for f in _utils/screenshot_capture.py tools/screenshot_capture.py; do
  [ -f "$f" ] && { CAPTURE="$f"; break; }
done
echo "出图工具 CAPTURE=$CAPTURE"

# HTML/PDF 质检脚本（优先 _utils/，回退 _templates/、skill 源目录）
HTMLCHECK=""
for f in _utils/html_pdf_check.py _templates/html_pdf_check.py skills/paper-figure-html/tools/html_pdf_check.py; do
  [ -f "$f" ] && { HTMLCHECK="$f"; break; }
done
echo "质检脚本 HTMLCHECK=$HTMLCHECK"

# 视觉自检脚本（复用 drawio_vision_check.py，与画图引擎无关；不存在则跳过视觉自检）
VISION=""
for f in _utils/drawio_vision_check.py tools/drawio_vision_check.py; do
  [ -f "$f" ] && { VISION="$f"; break; }
done
echo "视觉自检 VISION=${VISION:-（不可用，将跳过视觉自检）}"

# ===== TikZ 依赖（仅当规划有精密几何图才用；公式本身走 HTML+KaTeX，几何示意才靠 xelatex 编译 TikZ）=====
# 规则文档（物理尺寸/字号/scale 匹配规则）
TIKZ_RULES=""
for f in _utils/tikz_rules.md skills/shared-scripts/tikz_rules.md; do
  [ -f "$f" ] && { TIKZ_RULES="$f"; break; }
done
echo "TikZ 规则 TIKZ_RULES=${TIKZ_RULES:-（无，将用内置规则）}"

# tikz_check.sh 结构自检脚本
TIKZ_CHECK=""
for f in _utils/tikz_check.sh skills/shared-scripts/tikz_check.sh; do
  [ -f "$f" ] && { TIKZ_CHECK="$f"; break; }
done
echo "TikZ 自检 TIKZ_CHECK=${TIKZ_CHECK:-（不可用，将跳过结构自检）}"

# tikz_vision_check.py 视觉自检（与 drawio_vision_check 同源，接受 PNG）
# ⛔ 三处查找（对齐 drawio 侧 Step 7.5）：_utils/（后端正常复制的位置）→ $MH_TOOLS_DIR
#    （后端注入的发布包 tools/ 路径，_utils 复制失败时兜底）→ tools/（开发态相对路径）。
#    少了 $MH_TOOLS_DIR 时：一旦 _utils/ 未建/复制失败，html 侧会误判脚本缺失而跳过自检。
TIKZ_VISION=""
for f in _utils/tikz_vision_check.py "${MH_TOOLS_DIR}/tikz_vision_check.py" tools/tikz_vision_check.py; do
  [ -n "$f" ] && [ -f "$f" ] && { TIKZ_VISION="$f"; break; }
done
echo "TikZ 视觉自检 TIKZ_VISION=${TIKZ_VISION:-（不可用，将跳过）}"

# xelatex（TikZ 编译器；不存在则本机无 TikZ 能力，跳过 TikZ 只出 HTML 图）
XELATEX=$(command -v xelatex 2>/dev/null)
echo "TikZ 编译器 XELATEX=${XELATEX:-（不可用，将跳过 TikZ 图）}"
```

## ⛔⛔⛔ Output Contract（最高优先级）

**必须产出至少 1 张 `figures/fig_*.pdf`，并更新 `figures/latex_includes.tex`**。产物契约与 paper-figure-drawio **完全一致**（后端按同一口径对账，两个 skill 可互换）：

- 图名前缀固定：`fig_arch`（架构）/ `fig_flow`（流程，如 `fig_flow_q1`）/ `fig_roadmap`（技术路线）/ `fig_pipeline`（流水线）/ `fig_framework`（框架）。
- 中间产物是 `figures/fig_*.html`，最终产物是同名 `figures/fig_*.pdf`。
- ⛔ **图内绝不放标题**：标题一律由 LaTeX `\caption{}` 管理（避免标题重复、字体不一致）。
- ✅ **流程/算法/架构图里的公式可直接写在 HTML 里**：节点文字内用 `\( ... \)`（行内）或 `\[ ... \]`（独立行）写 LaTeX，出图时命令带 `--render-math`（见 Step 3），截图管线会注入 KaTeX 把它们渲染成真公式（矢量、可放大不糊）。不再需要为了几个公式就整张图退回 TikZ。
- ⛔ **只有"精密几何示意图"才走 TikZ**：需要按真实坐标画点/线/角度/向量场的几何图（如绳系摆几何、光路、受力分解），HTML 的 flex 相对布局摆不准，才用 TikZ 编译（见 Step 5.5）。产物 `figures/tikz_*.pdf` + 同名 `.tex`，写进 `latex_includes.tex`。⛔ 仅当规划清单明确要求这类几何图时才生成，无则跳过。

⛔ **特殊豁免**：若 PAPER_PLAN.md 明确无架构图/流程图需求（纯文字论文/数据分析报告），允许跳过本 skill 的产物要求；但仍要保留已有 `figures/latex_includes.tex` 不破坏。

⛔ **结束前必须跑产物校验**：

```bash
PASS=true
mkdir -p figures
PDF_COUNT=$(ls figures/fig_*.pdf 2>/dev/null | wc -l)
PLAN_NEEDS_DIAGRAM=$(grep -iE 'html|架构图|流程图|技术路线|fig_arch|fig_flow|fig_roadmap|fig_pipeline|fig_framework' PAPER_PLAN.md PROBLEM_ANALYSIS.md 2>/dev/null | wc -l)

# ⛔ 优先按 FIGURE_MANIFEST 对账：规划的每张图必须产出
PLAN_FILE=""
for f in PROBLEM_ANALYSIS.md PAPER_PLAN.md MODELING_REPORT.md; do
  [ -f "$f" ] && grep -q '<!-- BEGIN FIGURE_MANIFEST -->' "$f" && { PLAN_FILE="$f"; break; }
done

if [ -n "$PLAN_FILE" ]; then
    START=$(grep -n '<!-- BEGIN FIGURE_MANIFEST -->' "$PLAN_FILE" | head -1 | cut -d: -f1)
    END=$(grep -n '<!-- END FIGURE_MANIFEST -->' "$PLAN_FILE" | head -1 | cut -d: -f1)
    MANI=$(sed -n "${START},${END}p" "$PLAN_FILE")
    # ⛔ 按 manifest「HTML/DrawIO 章节」标题抓该章节下的全部图名（权威），不靠文件名前缀白名单
    EXPECTED=$(printf '%s\n' "$MANI" | awk '
        /^[[:space:]]*\*\*/ { cap = (tolower($0) ~ /html|drawio|tikz/) ? 1 : 0; next }
        cap && match($0, /^[[:space:]]*-[[:space:]]+(fig_|tikz_)[a-zA-Z0-9_]+/) {
            s=substr($0, RSTART, RLENGTH); sub(/^[[:space:]]*-[[:space:]]*/, "", s); print s
        }')
    missing=0
    for name in $EXPECTED; do
        # ⛔ 认 .pdf/.html/.png 三种：.pdf(PDF模式或本步未转)、.html(HTML中间产物)、
        #    .png(Word/docx 模式下 tikz_*.pdf/fig_*.pdf 被转 PNG 删 PDF 后的产物)。
        #    只认 pdf/html 会把 docx 模式下已转 png 的 TikZ 图误判成 missing。
        ls figures/${name}.pdf figures/${name}.html figures/${name}.png 2>/dev/null | head -1 | grep -q . || { echo "❌ MANIFEST: $name missing"; missing=$((missing+1)); }
    done
    if [ $missing -gt 0 ]; then
        echo "⛔ FIGURE_MANIFEST 对账失败（缺 $missing 张）"; PASS=false
    else
        echo "✅ FIGURE_MANIFEST 全部产出"
    fi
elif [ "$PDF_COUNT" -ge 1 ]; then
    echo "✅ figures/fig_*.pdf = $PDF_COUNT"
elif [ "$PLAN_NEEDS_DIAGRAM" -eq 0 ]; then
    echo "✓ 规划无架构图/流程图需求，跳过"
else
    echo "❌ 规划要求架构图/流程图但未生成"; PASS=false
fi
[ -f figures/latex_includes.tex ] || touch figures/latex_includes.tex
[ "$PASS" != true ] && echo "⛔ Output verification FAILED — must complete before ending"
```

## Workflow

### Step 0: 恢复检查（断线重跑必读）

⛔ 本步骤可能因断线/手动重跑被多次启动。每次启动前**必须**先扫描已有产物：

```bash
echo "=== 工作区扫描 ==="
HAS_HTML=$(ls figures/fig_*.html 2>/dev/null | wc -l)
HAS_PDF=$(ls figures/fig_*.pdf 2>/dev/null | wc -l)
HAS_TIKZ=$(ls figures/tikz_*.pdf 2>/dev/null | wc -l)
echo "  fig_*.html: $HAS_HTML, fig_*.pdf: $HAS_PDF, tikz_*.pdf: $HAS_TIKZ"
ls -la figures/fig_*.pdf figures/tikz_*.pdf 2>/dev/null | head -30
```

| 状态 | 行动 |
|---|---|
| 规划要求的图都已生成（含 .html + 对应 .pdf 且过 html_pdf_check；有公式图的 tikz_*.pdf 也在） | **跳到 Step 6（latex_includes 核对）**，验证通过即完成 |
| 部分已生成 | **只生成缺失的**（已有的不重画） |
| 啥都没有 | 从 Step 1 开始 |

⛔ **铁律**：已有的 `figures/fig_*.html` / `figures/fig_*.pdf` / `figures/tikz_*.pdf` 不要重写。

### Step 1: 读规划 + 确定要画哪些图 + 算风格种子

1. 选规划文档（按存在性优先级）并确定语言：

```bash
PLAN_DOC=""
for f in PROBLEM_ANALYSIS.md PROPOSAL.md PAPER_PLAN.md; do
    [ -f "$f" ] && { PLAN_DOC="$f"; break; }
done
echo "=== 使用规划文档: ${PLAN_DOC:-（无，将只画 1 张 fig_roadmap 兜底）} ==="

# 文献综述工作流不需要架构图，直接跳过
if [ -f LITERATURE_REVIEW.md ] && [ -z "$PLAN_DOC" ]; then
    echo "✅ 文献综述工作流不需要架构图，已跳过"; exit 0
fi

# 语言判定（comp_apmcm_zh 是中文赛项，先排除）
if grep -qi 'comp_apmcm_zh' "$PLAN_DOC" CLAUDE.md 2>/dev/null; then
    FIG_LANG="zh"
elif grep -qi 'MCM\|ICM\|APMCM\|comp_mcm\|comp_apmcm\|Language.*English\|语言.*English' "$PLAN_DOC" CLAUDE.md 2>/dev/null; then
    FIG_LANG="en"
else
    FIG_LANG="zh"
fi
echo "图内文字语言: $FIG_LANG"

echo "=== 规划中的架构/流程图清单 ==="
grep -A 60 -iE 'HTML|DrawIO|架构图|流程图|技术路线' "$PLAN_DOC" 2>/dev/null | grep -E '^\- \[ \]? *fig_(arch|flow|roadmap|pipeline|framework)' || echo "（未找到显式清单，按工作流类型决定）"

# ⛔ 判断规划里有没有「精密几何示意图」需求（只有它才走 TikZ）
# 注意：含公式的流程/算法/架构图不再走 TikZ —— 公式直接写进 HTML 节点，出图加
#       --render-math 由 KaTeX 渲染（见 Step 3、产物契约）。TikZ 只留给需要按真实
#       坐标画点/线/角度/向量的几何图（绳系摆、光路、受力分解等）。
NEED_TIKZ=0
if grep -qiE 'tikz|几何示意|几何图|受力分解|坐标.*示意|光路' "$PLAN_DOC" 2>/dev/null; then NEED_TIKZ=1; fi
# manifest 里出现 tikz_ 图名也算
grep -qE '^[[:space:]]*-[[:space:]]+tikz_' "$PLAN_DOC" 2>/dev/null && NEED_TIKZ=1
echo "需要 TikZ 几何图: $NEED_TIKZ（1=是，见 Step 5.5；0=否，跳过 TikZ）"
echo "（提示：含公式的流程/算法/架构图走 HTML+KaTeX，不计入 NEED_TIKZ）"
```

2. **⛔ 输出 HTML PLAN CHECKLIST（后续步骤对照用，规划清单就是合同）：**

工作流类型决定数量：
- **数模竞赛 / 科研流程**（有 PROBLEM_ANALYSIS.md）：**严格按规划清单生成，一张不多一张不少**，**至少 1 张 fig_roadmap 技术路线图**。
  ⛔ **清单里没有 `fig_flow_q1/q2/…` 就一张都不要画，也不要"补齐每个问题"**——子问题流程图默认关闭
  （用户可在前端开启，开启时规划清单里自然会有），清单没列即用户不要，自作主张补齐属于违规超产。
- **开题报告**（有 PROPOSAL.md）：**只生成 fig_roadmap**，不画 fig_flow_q1/q2。
- **课程/论文写作**（有 PAPER_PLAN.md）：按 PAPER_PLAN.md 列出的 fig_arch/fig_flow_*/fig_pipeline 生成。
- **精密几何图**（`NEED_TIKZ=1`）：另在 Step 5.5 生成 `tikz_*`（按坐标画点/线/角度/向量的几何示意，如绳系摆、光路、受力分解），HTML 图与 TikZ 图**互补不重复**——同一张图只归其中一种引擎。含公式的流程/架构图归 HTML（公式靠 KaTeX 渲染），不进 TikZ。

```
HTML PLAN CHECKLIST (from $PLAN_DOC):
[ ] 1. fig_roadmap   — 技术路线图 (tpl_roadmap, HTML)
[ ] 2. fig_flow_q1   — 问题一求解流程图 (tpl_flow, HTML；公式写 \(...\)，出图加 --render-math)
[ ] 3. fig_flow_q2   — 问题二求解流程图 (tpl_flow, HTML)
[ ] 4. fig_pipeline  — 数据处理流水线 (tpl_pipeline, HTML)
[ ] 5. tikz_geom     — 精密几何示意图 (TikZ, 仅 NEED_TIKZ=1 时)
Total: N 张（HTML M 张 + TikZ K 张）
```

3. **⛔ 计算「确定性风格种子」**（不再从 4 套预设里挑主题）。风格种子由**工作区目录名**（=工作流 ID）确定性哈希得来，保证：**同一篇论文所有图共用同一种子 → 视觉统一；不同论文/不同用户种子不同 → 风格各异；断线重跑种子不变 → 可复现**。

```bash
# 风格种子 = 工作流ID(工作区目录名)的确定性哈希
WFID=$(basename "$PWD")
if command -v cksum >/dev/null 2>&1; then
    SEED=$(printf '%s' "$WFID" | cksum | cut -d' ' -f1)
else
    # 降级：无 cksum 时用 python 算哈希（仍确定性）
    SEED=$("$PYTHON" -c "import sys,zlib;print(zlib.crc32(sys.argv[1].encode()))" "$WFID")
fi
H0=$(( SEED % 360 ))
# 回避刺眼黄绿[50,70) 与 高纯红[330,360)∪[0,10)
if { [ $H0 -ge 50 ] && [ $H0 -lt 70 ]; } || [ $H0 -ge 330 ] || [ $H0 -lt 10 ]; then H0=$(( (H0 + 40) % 360 )); fi
TONE=$(( SEED % 3 ))   # 造型档(均为黑白基调+H0强调): 0=纯黑白线稿 1=彩边白卡 2=灰阶分区+单焦点
# ⛔ 结构旋钮：从 SEED 不同位段派生(互相独立、不跟 H0/TONE 绑死)，全是"黑白造型"变化、不加颜色。
#    这是"每篇长相都不同"的关键——只靠 H0/TONE 会撞脸(TONE 仅 3 档)，结构维度才拉开差异。
RADIUS=$(( (SEED / 7) % 4 ))     # 圆角: 0=直角 1=微圆(4px) 2=圆角(10px) 3=胶囊(999px)
ARROW=$(( (SEED / 11) % 4 ))     # 连线: 0=细实箭头 1=粗实箭头 2=点线箭头 3=chevron(›)分隔
NODEACC=$(( (SEED / 13) % 3 ))   # 焦点/类型节点的强调方式: 0=纯描边 1=左竖条 2=顶横条
SECT=$(( (SEED / 17) % 3 ))      # 分区/分组框法: 0=无框(留白分组) 1=细虚线框 2=左侧竖标签条
# ⛔ LAYOUT：布局拓扑选择种子（本次新增，"千人千面"从"换皮肤"升到"换骨架"的关键）。
#    它不指定某个具体拓扑，而是当 A 节某逻辑类型列了【多个等价范式】时(如线性=纵向主干/横向流水线)，
#    用它确定性选一个：选编号 = (LAYOUT % 候选数)。这样同类题的不同用户宏观骨架朝向(竖/横)也不同。
#    ⛔ 铁律：只在【逻辑等价】的范式间选——迭代题必画循环、并行题必画分叉，绝不为套 LAYOUT 而选不贴合逻辑的范式(见 A 节)。
LAYOUT=$(( (SEED / 19) % 6 ))    # 0-5 的选择种子；A 节按"LAYOUT % 该逻辑的等价范式数"落地
# ⛔ SKELETON：技术路线图/求解流程图的【骨架池选择】(独立位段 /29，直接 %4 保证 4 骨架大致均等；
#    不用 LAYOUT%4 是因为 LAYOUT 只 0-5、%4 后骨架2/3 各只占 1/6 偏斜)。0横向泳道 1主干侧挂 2左右双栏 3分层堆叠。
#    这是"每人每题不一样"的主来源(配色默认黑白收敛，布局靠它轮换)。见文末《骨架池》。
SKELETON=$(( (SEED / 29) % 4 ))
# ⛔ STYLE_FAMILY：风格族（最顶层维度，本次新增）。它比 H0/TONE/旋钮更高一级，先定"三大类观感"，
#    再由族内的 H0/LAYOUT/ARROW 等继续细分 —— 这就是"两层随机"：①族间随机(A/B/C) ②族内随机(色相/骨架/连线)。
#    取和其它旋钮独立的位段(SEED/23)，不跟 H0/TONE 绑死，保证族的分配与族内细分互不相关。
#    0 = A 朴素竞赛风（衬线印刷体、纯白底、直角细黑边、无阴影、无副标题；焦点/连线用 H0 少量彩色——国赛/数模黑白框图带一点色）
#    1 = B 现代精致风（无衬线、极淡灰底、微圆、无阴影、关键节点留一行副标题；H0 克制点缀——清爽但不过度设计）
#    2 = C 纯黑白线稿（⛔ 零彩色：连 H0 都不用，全靠黑/灰/白 + 边框粗细 + 字重分层次；是/否/回边用黑色实线+文字标签——最朴素、最"不像 AI"、印刷友好）
#    ⛔ 三族的硬约束见文末《G 风格族》；族只管"字体/底色/圆角/阴影/副标题/分组框/是否用彩色"这几项，
#       H0(强调色相)/LAYOUT(骨架朝向)/ARROW(连线)在 A/B 族里照常随机；C 族强制零彩色，H0 仅在极端时不用（见 G 节）。
STYLE_FAMILY=2   # ⛔ 默认纯黑白 C：最不"AI感"、最像传统竞赛/数模论文、印刷友好。
#    ⛔ 关键：默认统一黑白配色，"每个人每道题不一样"改由【布局骨架】承担——LAYOUT 在 4 个精致骨架间轮换
#       (见文末《路线图/流程图 骨架池》)，配色收敛到黑白反而更稳、更不像 AI。想要彩色的用户可手选。
# ⛔ 用户手选覆盖（可选，照 FAST_MODE 的 grep 先例）：前端选了 现代/朴素 时，后端会往 CLAUDE.md 注入
#    `MH_DIAGRAM_STYLE=N`（0=A朴素 1=B现代 2=C纯黑白）。读得到就用它、覆盖默认；读不到就保持默认黑白。
_FORCED_FAM=$(grep -oE 'MH_DIAGRAM_STYLE=[0-2]' CLAUDE.md 2>/dev/null | head -1 | cut -d= -f2)
if [ -n "$_FORCED_FAM" ]; then STYLE_FAMILY=$_FORCED_FAM; fi
case $STYLE_FAMILY in
  0) _FAM_NAME="A 朴素竞赛风";;
  1) _FAM_NAME="B 现代精致风";;
  2) _FAM_NAME="C 纯黑白线稿";;
esac
echo "🎨 风格种子 SEED=$SEED  STYLE_FAMILY=$STYLE_FAMILY（$_FAM_NAME）  SKELETON=$SKELETON  H0=$H0°  TONE=$TONE  RADIUS=$RADIUS  ARROW=$ARROW  NODEACC=$NODEACC  SECT=$SECT  LAYOUT=$LAYOUT（全篇共用）"
```

- **H0（强调色相）** 是全篇**强调色**的种子（节点主体是黑白灰，H0 只染焦点/语义连线/类型边框等 ≤15% 的部分），Step 2 按《设计规范 B 节》从它 HSL 推导强调色 + 灰阶色板。
- **TONE（造型基调）** 决定全篇统一的造型档次（见《设计规范 D 节》）。
- **RADIUS/ARROW/NODEACC/SECT（造型旋钮）** 决定圆角、连线样式、节点强调条、分区框法——**全是黑白造型变化、不加任何颜色**，按《设计规范 F 节》落到 CSS。它们把**皮肤**拉开差异。**全篇所有图共用同一组值。**
- **LAYOUT（拓扑旋钮，本次新增）** 把差异从"皮肤"升到"骨架"：当某图的逻辑在 A 节表里有**多个等价范式**时，用 `LAYOUT` 确定性选一个（选编号 `= LAYOUT % 候选数` 的那个），使同类题的不同用户**宏观骨架朝向也不同**（如线性题：纵向主干 vs 横向流水线）。⛔ 仅在**逻辑等价**范式间选，绝不为套种子而失真（见 A 节铁律）；逻辑只有唯一贴合范式的（如放射中心）不参与轮选。**全篇共用同一值。**
- **STYLE_FAMILY（风格族，最顶层，本次新增）** 是比上述所有旋钮都高一级的维度：先定**三大类观感**（A 朴素竞赛风 / B 现代精致风 / C 纯黑白线稿），再由族内的 H0/TONE/LAYOUT/ARROW 继续细分。**三族的完整硬约束见文末《G 风格族》**——它管字体族、节点底色、圆角上限、阴影、副标题、分组框、是否用彩色这几项（族说了算，凌驾于同名旋钮）；H0/LAYOUT/ARROW 仍在族内照常随机（C 族强制零彩色，不用 H0）。这实现了你要的**两层随机**：①族间随机决定风格大类 ②族内随机决定色相/骨架/连线，所以**同族不同篇也各不相同**。**全篇共用同一值。**
- **可选的学科微调**：若 `$PLAN_DOC` 明显是某学科（能源/经济/计算机…），允许把 H0 吸附到规范 B.1 列的友好色带；否则直接用种子值。**吸附也要全篇一致。**

⛔ 记下 `STYLE_FAMILY`/`H0`/`TONE`/`RADIUS`/`ARROW`/`NODEACC`/`SECT`/`LAYOUT`，Step 2 每张图都按同一组值设计——**禁止逐图换、禁止随机数/时间戳**。组合空间 **3(风格族)** ×12(H0色带)×3(TONE)×4×4×3×3(造型皮肤)×2(拓扑朝向) ≈ 三万种长相；关键是 STYLE_FAMILY 先分三大类观感、LAYOUT 再扰动**宏观骨架**（都比皮肤更抢眼），撞脸概率极低；但同篇内始终统一。

### Step 2: 逐张自主设计并生成 HTML（读设计规范 → 按逻辑与种子设计 → 直接 Write）

⛔ **一次只画一张 → 转 PDF → 质检 → 过了再画下一张**（和 drawio 版"逐张画逐张检"一致，避免批量出错难定位）。

⛔ **不再"选模板填字"。** 每张图**由你按下方《AI 自主生成 HTML 流程图设计规范》从零设计** HTML/CSS：结构服从该图的真实逻辑，配色/造型由 Step 1 的 `H0`/`TONE` 推导。这样同篇视觉统一、异篇风格各异、同篇内每张图因逻辑不同而结构不同。

**产物文件名仍是固定契约**（后端对账依赖，名字不能改；只是内部结构你自由设计）：

| 图的用途 | 产物文件名 |
|---|---|
| 技术路线图（阶段推进/时间轴） | `fig_roadmap.html` |
| 求解流程图（**仅当规划清单里有**，默认没有） | `fig_flow_q1.html` / `fig_flow_q2.html` … |
| 系统架构图（分层/模块） | `fig_arch.html` |
| 数据流水线（横向数据流） | `fig_pipeline.html` |
| 框架矩阵图（方法对比/多维） | `fig_framework.html` |

**对清单里每一张图，按顺序：**

1. **先读规范再动手**：通读本 SKILL 末尾《AI 自主生成 HTML 流程图设计规范》A–E 节。用一句话说清这张图的**逻辑流向**（如"q1 是线性四步预处理"、"q3 是带收敛判断的迭代循环"、"q5 是三模块并行汇合"），再按 A 节的「逻辑类型→等价范式」表定骨架：**先锁定逻辑贴合的那一类，若该类列了多个等价范式就按 `LAYOUT % 候选数` 确定性选一个**（同类题不同用户骨架也不同）——**不同子问题逻辑不同，就该长得不同**。⛔ 同时守 **A.1**：节点填这道题**特有的**方法/模型/判据实体（不写"数据预处理/建立模型"这类通用空词），并把方法**真实存在**的非平凡结构（校验回调/假设分支/收敛回环/多方法比选）挖出来画上——这是"有内核 vs 通用空壳"的分水岭。⛔ 复杂范式（分层架构/放射中心/贯穿侧栏/多分区）照 **A.2 骨架库**搭 flex/grid，别退化成一根线；出图前对照 **D.1 高级感五条**（字重层次/语义连线/副标题密度/唯一焦点/低饱和）逐条过。

2. **先定风格族，再推导配色/造型**：⛔ **第一步先读文末《G 风格族》，按 `STYLE_FAMILY` 落定基线**——字体族、节点底色、圆角上限、阴影、副标题、分组框（直接照抄 G.1 或 G.2 的 `:root`+节点骨架）。**然后**按 B 节从 `H0` 用 HSL 推导 `--ac`/`--acbg` 强调色代入，按 D 节 `TONE` 在族允许范围内定层次。⛔ 族与旋钮冲突时**以族为准**（如 A 族封顶直角，`RADIUS` 档再大也按 2px）。**全篇所有图共用同一 `STYLE_FAMILY`/`H0`/`TONE`。**

3. **直接 Write 出 `figures/fig_xxx.html`**（自包含单文件），务必满足：
   - ⛔ **满足规范 0 节全部硬约束**（根容器+html+body 全 `width:fit-content`；flex/grid 自动布局禁 absolute；单文件禁外链；图内无标题；单页、宽高比 ≤8:1；公式用 `\(...\)`/`\[...\]` 写进节点、出图加 `--render-math` 渲染，只有精密几何图才走 TikZ）。
   - ⛔ **逻辑完美嵌入**：填规划文档里的**真实**方法名/步骤/模块/子问题，不留占位文字（"核心模型""方法A"要换成论文实际模型名、算法名）。
   - ⛔ **图内文字语言 = `$FIG_LANG`**（中文论文全中文，英文论文全英文）。

4. **模板仅作极端兜底参考**：`$TPL_DIR` 下 5 个 `.html` **不是必抄骨架**。仅当连续多轮自检失败、实在设计不出结构时，才 `cat "$TPL_DIR/tpl_flow.html"` 瞄一眼找灵感——正常流程**不读模板、不复制模板**。

5. **每张生成后立即验证文件存在**：
```bash
[ -f figures/fig_roadmap.html ] && echo "✅ fig_roadmap.html created" || echo "❌ MISSING"
```

### Step 3: 转 PDF（Electron printToPDF，矢量单页无白边）

对刚生成的 HTML 转 PDF：

```bash
# 无公式的图：
$PYTHON "$CAPTURE" --file figures/fig_roadmap.html --out figures/fig_roadmap.pdf --format pdf 2>&1 | tail -8
[ -f figures/fig_roadmap.pdf ] && echo "✅ fig_roadmap.pdf 已生成" || echo "❌ PDF 生成失败"

# 含公式的图（节点里写了 \(...\)/\[...\]）：必须加 --render-math，KaTeX 才会渲染公式
$PYTHON "$CAPTURE" --file figures/fig_flow_q1.html --out figures/fig_flow_q1.pdf --format pdf --render-math 2>&1 | tail -8
[ -f figures/fig_flow_q1.pdf ] && echo "✅ fig_flow_q1.pdf 已生成" || echo "❌ PDF 生成失败"
```

- `--format pdf`（或 out 以 .pdf 结尾）→ 量内容真实像素、页面设成刚好等于内容 → **单页、无白边、真矢量**（文字可选可搜、无限放大不糊），等效 drawio `--crop`。
- `--render-math` → 截图前注入 KaTeX 渲染 HTML 里的 `\(...\)`/`\[...\]`/`$$`。**图里有公式就必须加**；没公式不用加（无害但多一步）。素材缺失时自动降级（图仍出、公式不渲染），不阻断。
- 若 `$CAPTURE` 为空或退出码 2 → Electron 不可用。这是硬依赖，应报告用户"HTML 出图需要 Electron 运行时"，本 skill 无法降级出图。

### Step 4: html_pdf_check 质检（⛔ 每张必跑，FAIL 必修）

**每出一张 PDF 就跑一次**。4 项检查：①单页（最关键，多页=FAIL，LaTeX 只显示第一页会截断）②矢量（有字体对象，非整页位图）③裁切（页面尺寸异常）④宽高比（>8:1 给 WARN）。

```bash
$PYTHON "$HTMLCHECK" figures/fig_roadmap.pdf
# 退出码：0=通过(可能带WARN，不阻塞) 1=FAIL(必修) 2=无法检查(跳过)
```

**⛔ 若退出码 1（FAIL）**，按明细修复后**重新出 PDF 再检**，直到过：
- **多页** → 内容太多/太高：精简节点文字、减少条目、或调窄 `.fig` 的 width 让内容更紧凑；实在放不下就拆成两张图。改完回 Step 3 重出。
- **无字体/整页位图** → 检查 HTML 是否误用了 `<img>`/`canvas`/背景图代替文字，改回纯文本+CSS。
- **尺寸异常小/裁切** → 检查 `.fig` 是否 `display:inline-block` 且有内容、`body{margin:0}`。
- **宽高比过宽（WARN）** → 不阻塞，但建议：pipeline 让阶段换行、roadmap 改窄卡片。

退出码 2（如缺 PDF 解析条件）→ 跳过，不阻塞。

### Step 4.5: 元素级几何自检 + 自修复循环（⛔ 每张必跑，有问题就改到干净）

html_pdf_check 只看 PDF 结构（单页/矢量/尺寸），**看不出图里文字有没有被裁、有没有越界、两块文字有没有压在一起**——这些是"截图一看就丑、但结构检查过得了"的翻车。这一步用 `$CAPTURE --geom-check` **纯几何测量**（不调大模型、几十毫秒）把它们精确抓出来，然后**你亲自读 HTML 改 CSS 修好**。这是本 skill 的"截图识别→发现问题→自修复"闭环。

**几何自检测四类问题（都在 `.fig` 内、渲染公式之后测，所以准）：**
| 类型 | 含义 | 常见成因 |
|---|---|---|
| **文字溢出被裁** | 元素实际内容宽/高 > 盒子宽/高 | 节点 `width`/`min-width` 太窄、文字太长、`overflow:hidden` 切掉 |
| **越出 .fig 边界** | 元素跑到画布外（会被论文页面裁掉） | 误用 `position:absolute` 定坐标、`margin`/`transform` 把元素推出去 |
| **文字块重叠** | 两个同级文字块几何相交、内容互相压盖 | absolute 定位撞车、负 margin、回边/侧栏占位算错（q3 回环最易犯） |
| **对齐偏差**（声明式） | 打了 `data-mh-col`/`data-mh-row` 的同组元素中轴没对齐（极差 >4px） | 手写不同 `width`、`margin` 挪位、没用 grid 锁列/行、竖箭头没接节点中轴 |

> ⛔ **对齐偏差只对打了 `data-mh-col="k"`/`data-mh-row="k"` 标记的元素生效**（见 G.5 第 4 条）：主干/纵列的节点+竖箭头打 `data-mh-col`、同行节点打 `data-mh-row`，工具就会验证它们中轴是否成一条线。没打标记的图不触发这项（与旧行为一致）。**所以画主干/多列/多行结构时务必打标记**，让"差几像素的错位"这种 vision 抓不住、肉眼却嫌丑的偏差被确定性揪出。

**每出一张 PDF（Step 3）、过了 html_pdf_check（Step 4）后，立即跑几何自检：**

```bash
# 无公式的图：
$PYTHON "$CAPTURE" --geom-check figures/fig_roadmap.html
# 含公式的图：必须加 --render-math（公式渲染会改变盒尺寸，不加会误报/漏报）
$PYTHON "$CAPTURE" --geom-check figures/fig_flow_q1.html --render-math
# 退出码：0=干净（无溢出/越界/重叠） 1=有几何问题（必修） 2=无法检查（Electron 不可用，跳过不阻塞）
```

**⛔ 若退出码 1（有问题），进入自修复循环（最多 3 轮，每轮"检→读→改→重出→重检"）：**

1. **读报告**：工具会逐条列出「哪块文字溢出/越界/重叠、越了多少 px / 交叠多大面积」。**照着定位问题元素**（报告里印了每块前 20 字，对得上 HTML 里的节点）。
2. **用 Read 读这张 `figures/fig_xxx.html`**，按问题类型针对性改 CSS：
   - **文字溢出被裁** → 加大该节点 `min-width`/`width`，或缩短文字/移一部分到副标题 `.sub`，或调小 `font-size`（12px→11px），或去掉不该有的 `overflow:hidden`+`white-space:nowrap`（让文字正常换行）。
   - **越出 .fig 边界** → ⛔ 十有八九是**误用了 `position:absolute` 定坐标**（违反 0 节硬约束第 3 条）。改回 **flex/grid 自动布局**，让元素待在文档流里；留白靠 `padding`/`gap` 不靠绝对偏移。回边/侧栏这类确需叠加的，用相对定位并给父容器留足空间。
   - **文字块重叠** → 同上，绝大多数是 absolute 或负 margin 造成。改成 flex/grid 顺排；两块本就该错开的（如循环回边标签），给它独立的 flex 轨道或加 `gap`，别让它压到主链。**（这正是 q3 循环回环反复踩的坑——回边占了主链宽度就会重叠/错位。）**
   - **对齐偏差** → 报告会印「哪个 `data-mh-col`/`row` 组、错开多少 px、成员是谁」。⛔ **十有八九是没把这一列/行放进同一个 grid**，或给节点写了不同 `width`、用 `margin` 手动挪位。改法：把这组元素装进 `display:grid`（列用 `grid-template-columns:<定宽或1fr>` + `justify-items:center`，行用 `grid-auto-flow:column`+`align-items:center`），节点 `width:auto;min-width:0` 交给 grid 拉齐，竖箭头放进同列容器居中——**别靠手写 width/margin 对齐**（见 G.5）。
3. **改完重出 PDF**（Step 3 命令）→ 重跑 html_pdf_check（Step 4）→ 再跑本步几何自检。
4. 循环直到退出码 0，或 3 轮用完（用完仍有问题**不阻塞**，但要在心里记下这张需人工看一眼）。

**⛔ 与 vision 自检（Step 5）的分工**：几何自检是**精确的、必修的**（纯数学，说重叠就是真重叠）；vision 是**模糊的、不阻塞的**（看配色/审美/挤不挤）。先过几何（硬门槛），再走 vision（加分项）。**FAST_MODE=1 时几何自检照跑**（它快、且能挡真翻车），只跳 vision。

- 若 `$CAPTURE` 为空或退出码 2 → Electron 不可用，几何自检跳过（和出 PDF 同一依赖，出得了 PDF 就查得了几何）。

### Step 5: 视觉自检（vision LLM，复用 drawio_vision_check，⛔ 不阻塞）

html_pdf_check 只看 PDF 结构，看不出渲染后的视觉效果（文字挤、配色刺眼等）。这一步用 vision LLM 真正"看图"。**复用** `drawio_vision_check.py`（它接受 PDF/PNG，与画图引擎无关）。**FAST_MODE=1 时跳过本步。**

⛔ **执行原则**：vision 不可用（`$VISION` 为空 或退出码 2）就跳过，**绝不阻塞**；这是加分项不是硬门槛，3 轮仍未解决也继续。

```bash
# ⛔ 块内自检 FAST_MODE（本 skill bash 块间不共享变量，须就地 detect，否则快速模式跳不掉 vision）。
FAST_MODE=0; grep -q 'MH_FAST_MODE=1' CLAUDE.md 2>/dev/null && FAST_MODE=1
# ⛔ 用户在高级选项【关闭】了流程图/TikZ 视觉质检 → 跳过 vision（复用 FAST_MODE 的跳过路径；
#    免费的 html_pdf_check/几何自检/tikz_check 不在此 if 内，照常跑，不受影响）。
grep -q 'MH_SKIP_DIAGRAM_VISION=1' CLAUDE.md 2>/dev/null && FAST_MODE=1
mkdir -p _tmp
# ⛔ 无条件清空三笔记账（防断线重跑读到上一轮残留）；下面按需 append，Step 7 最终门结算：
#   passed=真跑了vision且通过(执行凭证) / unresolved=审了3轮没修好(硬拦) / skipped=环境原因没审成(警告)。
#   ⛔ passed 是「执行证明」：Step 7 会核对每张该检的图都必须在三者之一里有记录，否则判定
#      「视觉自检被静默跳过」并 FAIL——杜绝"没跑却当跑了"（HTML 与 TikZ 图都适用）。
rm -f _tmp/vision_unresolved.txt _tmp/vision_skipped.txt _tmp/vision_passed.txt
if [ "$FAST_MODE" = "1" ]; then
  echo "⚡ 快速模式：跳过 HTML vision 视觉自检（省 API）；Step 7 的执行凭证断言仅非快速模式生效，不因此 FAIL。"
elif [ -z "$VISION" ]; then
  # ⛔ vision 工具不可用是真实环境限制，不硬拦；但要给每张该检的图写 skipped 留痕，
  #    让 Step 7 知道"审过了、只是环境不允许"，而不是"静默没跑"。
  echo "🟥 vision 工具(drawio_vision_check.py)不可用，HTML 流程/架构图未做视觉审查（环境限制，不硬拦）"
  for pdf in figures/fig_arch*.pdf figures/fig_flow_*.pdf figures/fig_roadmap*.pdf figures/fig_pipeline*.pdf figures/fig_framework*.pdf; do
    [ -f "$pdf" ] || continue
    echo "$(basename "$pdf" .pdf) (vision 工具不可用)" >> _tmp/vision_skipped.txt
  done
else
  # ⛔ 只检本 skill 拥有的流程/架构图前缀（fig_arch/fig_flow_/fig_roadmap/fig_pipeline/fig_framework）；
  #    数据图（fig_q1_* 等）由上一步 paper-figure 自检，不在此扫，免得误检+浪费 vision API。
  for pdf in figures/fig_arch*.pdf figures/fig_flow_*.pdf figures/fig_roadmap*.pdf figures/fig_pipeline*.pdf figures/fig_framework*.pdf; do
    [ -f "$pdf" ] || continue
    bn=$(basename "$pdf" .pdf)
    for VROUND in 1 2 3; do
      echo "=== 视觉自检: $bn (round $VROUND) ==="
      VOUT=$($PYTHON "$VISION" "$pdf" 2>&1); VEXIT=$?
      echo "$VOUT"
      if [ "$VEXIT" -eq 0 ]; then echo "✅ $bn 视觉通过"; echo "$bn PASS" >> _tmp/vision_passed.txt; break
      elif [ "$VEXIT" -eq 2 ]; then echo "⚠ vision 不可用，跳过 $bn（不阻塞）"; echo "$bn (Vision API 不可用/调用失败)" >> _tmp/vision_skipped.txt; break
      fi
      # VEXIT=1：有视觉问题
      if [ "$VROUND" -lt 3 ]; then echo "⛔ $bn 有视觉问题，读 HTML 修复后重出 PDF..."
      else echo "⚠ $bn 3 轮仍有问题（Step 7 最终门将记账，不静默放行）"; echo "$bn (3轮视觉自检未修好)" >> _tmp/vision_unresolved.txt; fi
    done
  done
fi
```

**⛔ 当某张图返回 ISSUE（VEXIT=1）时，你必须逐步修复（不是只跑检测脚本）：**
1. 用 **Read** 读该图的 `figures/fig_xxx.html`。
2. 按 vision 反馈改（HTML 是相对布局，改法比 drawio 简单）：
   - "文字溢出/截断" → 加大对应节点 `min-width` 或缩短文字（CSS 已 wrap，一般是 width 太窄）。
   - "配色刺眼/杂乱" → 按《设计规范 B 节》从 `H0` 重新推导色板，饱和度 ≤55%、有意义色 ≤4，别自造高饱和色。
   - "布局松散/大片留白" → 内容居中的类已处理；检查是否漏填内容或容器过宽。
   - ⛔ **"节点不对齐/大小参差/边缘不齐/箭头歪接/间距忽大忽小"（最常见的"丑"）** → 按 D.1 ④ 硬纪律改：并列节点改用 `grid`+`1fr`（或 flex `flex:1`+`align-items:stretch`）强制等宽等高；多行多列用 `display:grid` 让行列自动对齐；箭头 `align-items:center` 接中轴；`gap`/`padding`/`border-radius` 全篇统一。**别手写不同 width、别用 margin 挪位置**——那正是参差的根源。
   - "出现 HTML 源码/黑背景" → 检查标签是否闭合、`body{margin:0}`。
3. **重新出 PDF**（Step 3 命令），再跑 html_pdf_check（Step 4），再回本步验证。
4. 重复直到通过或 3 轮用完（用完仍不过也继续，不阻塞）。

### Step 5.5: 生成 TikZ 几何示意图（⛔ 仅当 Step 1 判定 NEED_TIKZ=1；否则整步跳过）

⚠ **公式本身不用 TikZ**：流程/算法/架构图里的公式直接写进 HTML 节点，出图加 `--render-math` 由 KaTeX 渲染即可（见 Step 3）。本步只画 HTML 摆不准的**精密几何示意图**——需要按真实坐标画点/线/角度/向量场的图（绳系摆几何、光路、受力分解、坐标标注等），用 TikZ 编译成矢量 PDF。**无这类几何图需求（`NEED_TIKZ=0`）直接跳过本步。**

```bash
# ⛔⛔ 就地重算 NEED_TIKZ（关键修复）：本 skill bash 块间不共享变量，Step 1 算的 NEED_TIKZ
#     在本块为空 → 老逻辑 `[ "$NEED_TIKZ" != "1" ]` 会因空值恒真而误跳过整步（TikZ 静默丢失）。
#     这里重定位 PLAN_DOC 并重新判定，与 Step 1 同口径。
PLAN_DOC=""
for f in PROBLEM_ANALYSIS.md PROPOSAL.md PAPER_PLAN.md; do [ -f "$f" ] && { PLAN_DOC="$f"; break; }; done
NEED_TIKZ=0
# ⛔ 判据①：manifest/规划里出现 tikz_ 图名 = 硬需求（与 Step 6 对账、drawio 侧同口径）
if grep -qE '^[[:space:]]*-[[:space:]]+tikz_' "$PLAN_DOC" 2>/dev/null || grep -qE 'tikz_[a-zA-Z0-9_]+' "$PLAN_DOC" 2>/dev/null; then NEED_TIKZ=1; fi
# ⛔ 判据②：规划提到精密几何图关键词
if grep -qiE 'tikz|几何示意|几何图|受力分解|坐标.*示意|光路' "$PLAN_DOC" 2>/dev/null; then NEED_TIKZ=1; fi
# ⛔ XELATEX 也可能跨块丢失，就地重取
[ -z "$XELATEX" ] && XELATEX=$(command -v xelatex 2>/dev/null)
echo "重算 NEED_TIKZ=$NEED_TIKZ, XELATEX=${XELATEX:-（无）}, PLAN_DOC=${PLAN_DOC:-（无）}"

if [ "$NEED_TIKZ" != "1" ]; then
  echo "ℹ 规划无精密几何图需求，跳过 TikZ（Step 5.5）"
elif [ -z "$XELATEX" ]; then
  # ⛔ 硬需求但无编译器：这是必须暴露的失败，不能静默跳过（Word 侧历史 bug 根因之一）
  echo "❌❌ 规划要求 TikZ 几何图但本机无 xelatex，无法编译 → 论文将缺规划的几何图！"
  echo "    请在设置页安装 LaTeX(MiKTeX) 后重跑本步；严禁用 matplotlib/HTML 顶替 TikZ 几何图。"
else
  echo "=== 开始生成 TikZ 几何图（manifest 硬合同，逐个必产）==="
fi
```

**⛔ 若 `NEED_TIKZ=1` 且 `XELATEX` 可用，按下面做（否则按上面的失败提示处理，绝不用 matplotlib 顶替）：**

⛔⛔ **硬合同：FIGURE_MANIFEST 的 TIKZ 清单必须逐个产出同名 TikZ PDF，不许换、不许跳。**
规划阶段列进 TIKZ 类的每个 `tikz_<name>` 都是对本步的硬合同：**必须产出 `figures/<name>.pdf`（真 TikZ 编译产物），严禁用 matplotlib 数据图或 HTML 替代、严禁因"觉得不够精密/函数曲线用数据图更好"而跳过或改名**。规划端已保证只有真几何图（可行域/相平面/受力/几何示意/光路/架构）才会进 TIKZ 类，函数曲线等已归 DATA 类——所以这里列出的就该老老实实用 TikZ 画。先提取清单：

```bash
# ⛔ 就地重解析 PLAN_DOC（本 skill bash 块间不共享变量，Step 1 的 PLAN_DOC 在此块为空，必须重定位）
PLAN_DOC=""
for f in PROBLEM_ANALYSIS.md PROPOSAL.md PAPER_PLAN.md; do [ -f "$f" ] && { PLAN_DOC="$f"; break; }; done
# ⛔ 从 manifest 提取所有 tikz_ 名（这就是必须逐个产出的硬合同清单）
TIKZ_NAMES=$(awk '/BEGIN FIGURE_MANIFEST/,/END FIGURE_MANIFEST/' "$PLAN_DOC" 2>/dev/null | grep -oE 'tikz_[a-zA-Z0-9_]+' | sort -u)
[ -z "$TIKZ_NAMES" ] && TIKZ_NAMES=$(grep -oE 'tikz_[a-zA-Z0-9_]+' "$PLAN_DOC" 2>/dev/null | sort -u)
echo "规划要求的 TikZ 图（必须逐个产出同名 .pdf）：$TIKZ_NAMES"
```

⛔⛔ **TikZ 物理尺寸 vs 字号匹配规则（避免"文字撞主图/标注互叠"）**：TikZ 默认 1 单位=1cm，`\small`≈0.35cm、`\footnotesize`≈0.30cm、`\tiny`≈0.20cm。

- ⛔ **铁律**：任何标注节点的可用空间 **≥ 字号 × 2**（留 50% 留白）。
- 📐 量出图的 width/height（cm）：若 `min(width,height) < 3cm` → **必须** `scale=2.0+`（建议 2.5/3）拉开物理距离（字号不变）。
- 标注层间距 < 0.5cm 会撞 → 拉大或减层。
- ❌ 别用 `\resizebox`/`\adjustbox{max width=...}` 去"放大小图"（会把字撑爆位置）；只有图本身 > textwidth 才用来缩小。

1. **读规则**（用变量，优雅降级）：
```bash
[ -n "$TIKZ_RULES" ] && cat "$TIKZ_RULES" || echo "（无 tikz_rules.md，按上面内置规则画）"
```

2. **为 `$TIKZ_NAMES` 里的每个 `tikz_<name>` 写一个独立的 `figures/<name>.tex`**（产物名=规划名，天然对齐硬合同；不要再用合集 `tikz_diagrams.tex`，否则拆页后名字 `tikz_diagrams_1` 对不上 manifest 的 `tikz_<name>`）。
   - 每个 .tex 是可独立编译的完整文档（`\documentclass{standalone}` 或 `article`+`\pagestyle{empty}` 均可），内含**一个** `\begin{tikzpicture}`。
   - ⛔ 中文用 xelatex + `\usepackage{ctex}`（或 `fontspec` 指定中文字体），否则中文丢失。
   - ⛔ **图内不写标题**（交给 LaTeX `\caption{}`）。
   - ⛔ 图内文字语言 = `$FIG_LANG`。

3. **逐个编译 + 修复循环（每张最多 3 轮）**：
```bash
# ⛔⛔ 就地重取 XELATEX（关键修复）：bash 块间不共享变量，前面块取的 XELATEX 在本块为空 →
#     `"$XELATEX" ...` 会退化成执行空命令、编译必失败、TikZ 静默产不出。必须在本块重取。
[ -z "$XELATEX" ] && XELATEX=$(command -v xelatex 2>/dev/null)
if [ -z "$XELATEX" ]; then
  echo "❌❌ 本块无 xelatex，无法编译 TikZ。请装 LaTeX(MiKTeX) 后重跑；严禁用 matplotlib/HTML 顶替。"
fi
# 结构自检脚本也可能跨块丢，就地重定位（空则跳过自检，不致命）
[ -z "$TIKZ_CHECK" ] && for f in _utils/tikz_check.sh skills/shared-scripts/tikz_check.sh; do [ -f "$f" ] && { TIKZ_CHECK="$f"; break; }; done
for tname in $TIKZ_NAMES; do
  tex="figures/${tname}.tex"
  if [ ! -f "$tex" ]; then
    echo "⛔ 硬合同缺口：manifest 要求 $tname 但没写 $tex —— 必须先写出该 TikZ 源码再编译（不许用数据图替代/跳过）"
    continue
  fi
  [ -z "$XELATEX" ] && { echo "⛔ 跳过编译 $tname（无 xelatex），但这是失败不是完成"; continue; }
  for TROUND in 1 2 3; do
    echo "=== TikZ 编译 $tname round $TROUND ==="
    "$XELATEX" -interaction=nonstopmode -output-directory=figures "$tex" 2>&1 | tail -12
    if [ ! -f "figures/${tname}.pdf" ]; then
      echo "⛔ $tname 编译失败：检查数学模式配对/缺 \\usetikzlibrary/中文需 ctex。读 $tex 修复后进入下一轮"
      continue
    fi
    # 结构自检（有脚本才跑）
    if [ -n "$TIKZ_CHECK" ]; then
      bash "$TIKZ_CHECK" "$tex"; TC=$?
      if [ "$TC" -gt 0 ]; then echo "⛔ $tname tikz_check 有 $TC 个 CRITICAL，读 $tex 修复后重编"; continue; fi
    fi
    echo "✅ $tname 编译通过 + 结构自检通过"; break
  done
  [ -f "figures/${tname}.pdf" ] || echo "⚠ $tname 三轮仍未出 PDF：尽量简化公式/减少标注层后再试；实在编不过在 latex_includes.tex 该图位置留 '% TODO: $tname 编译失败，需人工补' 注释，不阻塞其余产物"
done
```

⛔ **失败兜底**：HTML 引擎**没有 drawio 可退**。若某公式图 3 轮编不出，**大幅精简**（去掉次要标注、拆成两张更简单的图、公式改行内文字描述）再试；仍不行则**保留其余已成功产物**，在 latex_includes.tex 该图位置写一行 `% TODO: tikz_xxx 编译失败，需人工补` 注释，**不阻塞整步结束**。

### Step 5.6: TikZ 视觉自检（vision LLM，⛔ 不阻塞；FAST_MODE=1 跳过）

结构自检看不出渲染后的视觉挤叠。这一步用 `tikz_vision_check.py`（接受 PNG）真正"看图"。**只检 TikZ 图**（同名 .tex 含 `\begin{tikzpicture}` 的 PDF），HTML 流程图前缀（`fig_arch/fig_flow_/fig_roadmap/fig_pipeline/fig_framework`）已在 Step 5 检过，这里排除。

```bash
# ⛔ 块内自检 FAST_MODE（本 skill bash 块间不共享变量，须就地 detect，否则快速模式跳不掉 vision）。
FAST_MODE=0; grep -q 'MH_FAST_MODE=1' CLAUDE.md 2>/dev/null && FAST_MODE=1
# ⛔ 用户在高级选项【关闭】了流程图/TikZ 视觉质检 → 跳过 vision（复用 FAST_MODE 的跳过路径；
#    免费的 html_pdf_check/几何自检/tikz_check 不在此 if 内，照常跑，不受影响）。
grep -q 'MH_SKIP_DIAGRAM_VISION=1' CLAUDE.md 2>/dev/null && FAST_MODE=1
# ⛔ 门控改为「看实际产物」而非「看规划标志 NEED_TIKZ」：规划措辞没命中「几何示意/受力
#    分解/光路」等关键词、但实际生成了 TikZ 图（如 tikz_ballistic_motion）时，旧逻辑
#    NEED_TIKZ=0 会整段跳过 → 明明有图却不检、遮挡/越界问题漏网。改为先扫产物收集，
#    收集到才检、收集为空才真跳过（对齐 drawio 侧 Step 7.5 的稳健口径）。NEED_TIKZ 仅
#    在 Step 5.5 控制「要不要生成」，此处自检一律以实际产物为准，两者解耦。
if [ "$FAST_MODE" = "1" ]; then
  echo "⚡ 快速模式：跳过 TikZ vision 视觉自检修复循环（省 API）；结构/几何自检仍由最终门把关。"
else
  mkdir -p _tmp
  # 多页 tikz_diagrams.pdf 先拆单页便于逐张检
  command -v pdfseparate >/dev/null 2>&1 && [ -f figures/tikz_diagrams.pdf ] && \
    pdfseparate figures/tikz_diagrams.pdf figures/tikz_diagrams_%d.pdf 2>/dev/null
  # 先收集所有 TikZ 图 PDF（tikz_ 前缀 或 同名 .tex 含 tikzpicture）；排除 HTML 流程图前缀
  TIKZ_LIST=""
  for pdf in figures/*.pdf; do
    [ -f "$pdf" ] || continue
    bn=$(basename "$pdf" .pdf)
    case "$bn" in fig_arch*|fig_flow_*|fig_roadmap*|fig_pipeline*|fig_framework*) continue ;; esac
    is_tikz=0
    [ "${bn#tikz_}" != "$bn" ] && is_tikz=1
    # ⛔ 收集判断只认「同名 .tex 含 tikzpicture」，绝不回退到合集 tikz_diagrams.tex：否则所有
    #    无同名 .tex 的 matplotlib 数据图（fig_velocity.pdf 等）都会回退命中合集而被误判成
    #    TikZ 图 → 拿去编 xelatex、当 TikZ 做视觉自检。tikz_diagrams.pdf 拆出的单页名为
    #    tikz_diagrams_N.pdf 带 tikz_ 前缀，已被上一行前缀判断覆盖，无需回退（对齐 drawio 侧 7.5）。
    [ -f "figures/${bn}.tex" ] && grep -q '\\begin{tikzpicture}' "figures/${bn}.tex" 2>/dev/null && is_tikz=1
    [ "$is_tikz" = "1" ] && TIKZ_LIST="$TIKZ_LIST $pdf"
  done
  if [ -z "$TIKZ_LIST" ]; then
    echo "ℹ 未发现 TikZ 图产物（figures/*.pdf 无 tikz_ 前缀、也无同名 .tex 含 tikzpicture），无需 TikZ 视觉自检"
  elif [ -z "$TIKZ_VISION" ]; then
    echo "🟥🟥🟥 发现 TikZ 图但找不到 tikz_vision_check.py（_utils/ 与 tools/ 均无）——【这些图未做视觉审查，遮挡/越界类问题可能漏网】"
    for pdf in $TIKZ_LIST; do echo "$(basename "$pdf" .pdf) (找不到 tikz_vision_check.py)" >> _tmp/vision_skipped.txt; done
  else
    for pdf in $TIKZ_LIST; do
      bn=$(basename "$pdf" .pdf)
      tex="figures/${bn}.tex"; [ -f "$tex" ] || tex="figures/tikz_diagrams.tex"
      # ⛔ 硬刹车：TikZ vision 最多 2 轮。vision 对几何图的主观意见（四角空白/浮空标签/贴线）
      #    永远挑得出，多轮只会震荡烧额度。2 轮后用当前最新 PDF 定稿、记 unresolved、往下走。
      for VROUND in 1 2; do
      echo "=== TikZ 视觉自检: $bn (round $VROUND / 上限 2) ==="
      PNG_OK=0
      # ⛔ 首选 PyMuPDF(fitz)：纯 wheel、自带渲染、不依赖 poppler，打包 runtime 必有；
      #    pdftoppm 依赖 poppler，打包环境常缺 → 曾导致 TikZ 视觉自检每次静默跳过。
      $PYTHON -c "
import fitz
d=fitz.open('$pdf'); d[0].get_pixmap(matrix=fitz.Matrix(200/72,200/72)).save('_tmp/${bn}_v.png')
" 2>/dev/null && [ -f "_tmp/${bn}_v.png" ] && PNG_OK=1
      if [ "$PNG_OK" = "0" ] && command -v pdftoppm >/dev/null 2>&1; then
        pdftoppm -png -r 200 -singlefile "$pdf" "_tmp/${bn}_v" && PNG_OK=1
      fi
      # 第三级兜底 pdf2image（对齐 drawio 侧 Step 7.5，多一条转换路径）
      if [ "$PNG_OK" = "0" ] && $PYTHON -c "from pdf2image import convert_from_path" 2>/dev/null; then
        $PYTHON -c "
from pdf2image import convert_from_path
convert_from_path('$pdf', dpi=200, first_page=1, last_page=1)[0].save('_tmp/${bn}_v.png','PNG')
" 2>/dev/null && [ -f "_tmp/${bn}_v.png" ] && PNG_OK=1
      fi
      [ "$PNG_OK" = "0" ] && { echo "🟥🟥🟥 $bn: PyMuPDF/pdftoppm/pdf2image 均不可用，无法转 PNG——【本图未做视觉审查，遮挡类问题可能漏网】"; echo "$bn (PDF→PNG 转换失败，未审成)" >> _tmp/vision_skipped.txt; break; }
      VOUT=$($PYTHON "$TIKZ_VISION" "_tmp/${bn}_v.png" 2>&1); VEXIT=$?
      echo "$VOUT"
      if [ "$VEXIT" -eq 0 ]; then echo "✅ $bn 视觉通过"; echo "$bn PASS" >> _tmp/vision_passed.txt; break
      elif [ "$VEXIT" -eq 2 ]; then echo "⚠ vision 不可用，跳过 $bn（不阻塞）"; echo "$bn (Vision API 不可用/调用失败)" >> _tmp/vision_skipped.txt; break
      fi
      # VEXIT=1：读 $tex 按反馈改坐标/间距/scale/颜色 → 重编 xelatex → 再检
      if [ "$VROUND" -lt 2 ]; then
        echo "⛔ $bn 有视觉问题：读 $tex 修复（scale 不够加 scale=2.0；标注间距<0.5cm 拉到 0.8cm+；rotate=90 长文字留 y 跨度 1.5cm+）后重编。⛔ 只修【客观硬伤】（文字截断/节点重叠/公式撕断/越界）；不要为「四角空白/浮空标签/贴线」等主观意见反复挪位——那会无限震荡"
        "$XELATEX" -interaction=nonstopmode -output-directory=figures "$tex" 2>&1 | tail -6
        command -v pdfseparate >/dev/null 2>&1 && [ -f figures/tikz_diagrams.pdf ] && \
          pdfseparate figures/tikz_diagrams.pdf figures/tikz_diagrams_%d.pdf 2>/dev/null
      else echo "⚠ $bn 已修 2 轮仍有 ISSUE → 用当前最新 PDF 定稿，记 unresolved 不再迭代（Step 7 最终门记账，不静默放行）"; echo "$bn (TikZ 2轮视觉自检未完全修好，已用最新PDF定稿)" >> _tmp/vision_unresolved.txt; fi
      done
    done
  fi
fi
```

**⛔ 当某张返回 ISSUE（VEXIT=1）时，逐步修复**：用 Read 读对应 `.tex`，按反馈调坐标/间距/节点宽度/scale/颜色，用 Edit 写回，重编 xelatex，再检——"检→改→编→再检"。**⛔ 最多 2 轮，硬上限**：第 2 轮后无论 vision 是否仍报 ISSUE，一律**用当前最新 PDF 定稿**、记入 `_tmp/vision_unresolved.txt`、继续下一张/下一步，**绝不为主观意见（四角空白、浮空标签、贴线、布局不紧凑）第 3 轮起反复挪标签**——那只会无限震荡、空烧额度。只有【客观硬伤】（文字截断/节点重叠/公式撕断/内容越界）才值得在 2 轮内修。

### Step 6: 更新 latex_includes.tex（⛔ 每张都要有 include 块）

为每张 PDF **追加**（`>>`，不覆盖）一个 figure 块到 `figures/latex_includes.tex`。⛔ 前一步 paper-figure 已写入数据图的 include，本步只追加本 skill 的图，不破坏已有内容。

**尺寸规则**（width 决定实际大小，height 只是防溢出上限；`keepaspectratio` 下取更小约束，height 只会压小不会放大）：

| 图类型 | width | height（防溢出上限） |
|---|---|---|
| 技术路线图 | `\textwidth` | `0.7\textheight` |
| Pipeline | `\textwidth` | `0.55\textheight` |
| 架构图 | `0.9\textwidth` | `0.65\textheight` |
| 求解流程图 | `0.82\textwidth` | `0.55\textheight` |
| 框架矩阵 | `0.9\textwidth` | `0.55\textheight` |

⛔ 所有图必须有 `keepaspectratio`。⛔ caption 必须与论文语言一致，由你按图意写。

**⛔⛔ 追加完所有 include 块后，必须跑 `fig_include_size.py` 按每张图的真实长宽比自动规整宽度**（上表只是初值；此脚本读 PDF 实际尺寸精确纠正——横图放宽、竖长条收窄，从根上治「竖图按页宽拉伸后撑满整页」，且对数据图/流程图/路线图/TikZ 全都通用）：
```bash
$PYTHON _utils/fig_include_size.py --figdir figures --latex figures/latex_includes.tex 2>&1 | tail -20
# 按 高/宽 分档: ≤0.8→0.85\textwidth / ≤1.2→0.7 / ≤1.6→0.5 / >1.6→0.42; height 一律≤0.8\textheight
# 全软失败: 某图 PDF 读不到就保持原样, 不破坏文件; 只改 width/height, keepaspectratio/caption/label/路径都不动
```
> 这是确定性兜底：即便上表初值填得不合适、或某张图恰好竖长，脚本都会按实测比例修正到与正文协调的宽度。**跑完它，latex_includes.tex 里的尺寸就是最终值**，下游 comp-paper 直接复制引用（见 comp-paper 的「必须使用 latex_includes.tex 里的 figure 块」铁律）。

**⛔⛔ caption 长度铁律（问题「流程图名字太长」的根因）**：caption 只写**图的类别/主题**，≤ 20 个汉字（英文 ≤ 12 词），例如「求解流程图」「问题一求解流程」「整体技术路线图」「系统架构图」。**禁止把整段方法描述、模型名称罗列、步骤枚举塞进 caption**（如「基于XGBoost与模拟退火的滤后水浊度预测多站点再平衡求解总体流程与验证框架」这种一长串是错的）。详细说明写进正文，不写进标题。

**⛔⛔ 尺寸铁律（问题「流程图占太大」的根因，必读）**：竖向长条流程图按 width 缩放后自然高度常超过一页，`keepaspectratio` 下 height 上限会反过来成为实际尺寸 → 图被撑满整页。**因此上表 height 上限已一律压到 ≤ 0.7\textheight**，禁止再回调到 0.8/0.85。更根本的解法在**图本身的布局**：
- ⛔ **流程图优先横向（从左到右）或网格布局，不要画成纯竖向长条**。3~5 步的流程用横向流水线（见 Step 4 `tpl_flow` 横排范式）；步骤多时用「分组横排 + 少量换行」而非一路竖下来。
- ⛔ 竖向布局仅在逻辑上确有强上下依赖（如迭代循环）时才用，且尽量把并列分支横向摊开，压低总高度。
- 目标：出的 PDF 宽高比接近 4:3 ~ 16:9，**不要接近或超过 1:1.5 的瘦高比**（瘦高图一放进论文就占满页）。

**⛔⛔ 技术路线图 / 求解流程图 骨架池（治「单调、一根线」+ 保证「每人每题不一样」）**：**禁止**画成「A→B→C→D」一条横线（信息稀疏、单调、瘦高撑页）。改为从下面 **4 个精致骨架里按 Step1 的 `SKELETON` 值选一个**（`SKELETON=(SEED/29)%4`，独立位段保证 4 骨架大致均等）——不同工作区种子不同 → 抽到不同骨架 → 千人千面；每个骨架都验证过「精致 + 连线可靠 + 不撑页」：

| `SKELETON` | 骨架 | 结构 | 连线 |
|---|---|---|---|
| 0 | **横向泳道** | 2~4 个阶段带纵向堆叠，带内横排节点，左侧竖排阶段标签 | 阶段间竖箭头 |
| 1 | **竖向主干+侧挂** | 主干节点竖直串(定宽列)，每个主干右侧横线挂出该阶段的方法/产出 | 竖箭头串主干 + 横线挂侧节点 |
| 2 | **左右双栏对照** | 左列「子问题/目标」右列「方法/模型」，逐行对应 | 左右配对横线(带箭头) |
| 3 | **分层堆叠** | 每层一个带框阶段带(层内横排)，层间竖箭头，层左侧标题 | 纯竖箭头串层 |

- ⛔ **配色默认纯黑白 C**(见 Step1；最不 AI 感)；用户手选才切现代/朴素。**布局骨架按 LAYOUT 随机**——这是"每人每题不一样"的主来源。合起来：黑白基调(不 AI、精致) × 4 骨架轮换(千人千面)。
- ⛔ **连线可靠铁律(k4 双栏真实翻过车)**：固定宽度的并排结构(双栏/主干列)**必须用 `display:grid;grid-template-columns:<定宽> ...`**，⛔ **禁用 `flex:0 0 <固定px>` + 外层 `fit-content` 混搭**——那样 fit-content 算不对总宽、节点会越出右边界(geom-check 会 FAIL)。竖箭头放与主干**同宽的容器**里居中(保证接主干中轴)；横挂线从节点边缘起、接对侧节点。
- ⛔ **对齐标记(4 骨架都要打)**：主干列/纵向节点+其间竖箭头打 `data-mh-col="1"`(第二列 `"2"`)，同一行对照节点打 `data-mh-row="1"`——`--geom-check` 会验证同组中轴是否成一条线，把手写 width/margin 造成的"差几像素错位"抓成 FAIL(见 G.5 第 4 条)。骨架 1 主干列、骨架 2 双栏各列、骨架 3 每层横排行都该打。
- ⛔ 每张出图后**必过 `--geom-check`**(重叠/越界/溢出/对齐偏差，退出码1必修)——连线/节点错位它会抓。选中哪个骨架，都要守 D.1 ④ 对齐纪律(grid+1fr/stretch)。
- ⛔ 骨架只是脚手架，**节点必须填本题真实实体**(守 A.1，不写"数据预处理/建立模型"空词)。

```latex
% === 技术路线图 ===
\begin{figure}[H]
\centering
\includegraphics[width=\textwidth,height=0.7\textheight,keepaspectratio]{figures/fig_roadmap.pdf}
\caption{整体技术路线图}\label{fig:roadmap}
\end{figure}
```

**⛔⛔ TikZ 公式图也必须写进 latex_includes.tex（最常被漏！）**：Step 5.5 已把每个 manifest 的 `tikz_<name>` 编译成**独立同名** `figures/<name>.pdf`。**每一个 `tikz_<name>.pdf` 都要有独立 `\includegraphics` 块**，否则写作步骤读不到、论文缺图。

- 为 `$TIKZ_NAMES`（Step 5.5 提取的清单）里的**每个** `tikz_<name>` 各写一个 figure 块，`\includegraphics` 指向 `figures/<name>.pdf`，caption 与规划的该 TikZ 条目一一对应。
- ⛔ caption 与论文语言一致。
- （历史兼容：若工作区仍有旧的合集 `tikz_diagrams.pdf` 多页产物，用 `pdfseparate` 拆成 `tikz_diagrams_%d.pdf` 后逐页各写一块——但新流程一律走上面的独立命名，不再产合集。）

```latex
% === TikZ 几何/算法/架构图（每个 tikz_<name> 一块，文件名=manifest 规划名）===
\begin{figure}[H]
\centering
\includegraphics[width=0.85\textwidth,height=0.85\textheight,keepaspectratio]{figures/tikz_risk_function.pdf}
\caption{分段风险函数示意}\label{fig:tikz_risk_function}
\end{figure}
```

**追加后自检**：
```bash
echo "=== latex_includes.tex 追加验证 ==="
for pdf in figures/fig_*.pdf; do
    [ -f "$pdf" ] || continue
    bn=$(basename "$pdf")
    grep -q "$bn" figures/latex_includes.tex 2>/dev/null && echo "✅ $bn 有 include" || echo "❌ $bn MISSING — 需追加"
done
# ⛔ TikZ PDF（含多页拆分）也逐个核对 —— 最常被漏
for tpdf in figures/tikz_diagrams.pdf figures/tikz_diagrams_*.pdf figures/tikz_*.pdf; do
    [ -f "$tpdf" ] || continue
    tbn=$(basename "$tpdf")
    grep -q "$tbn" figures/latex_includes.tex 2>/dev/null && echo "✅ TikZ $tbn 有 include" || echo "❌ TikZ $tbn MISSING — 需追加"
done
DUPS=$(grep -oh '\\label{[^}]*}' figures/latex_includes.tex 2>/dev/null | sort | uniq -d)
[ -z "$DUPS" ] && echo "✅ 无重复 label" || echo "❌ 重复 label: $DUPS"
```
有 ❌ 立即修复（追加缺失 include / 改重复 label）。TikZ 的 ❌ 尤其不能放过。

### Step 7: 最终质量门（⛔ MUST PASS，不允许带 ❌ 结束）

```bash
echo "=========================================="
echo "  HTML FIGURE QUALITY GATE"
echo "=========================================="
GATE_FAIL=0
HTML_COUNT=$(ls figures/fig_*.html 2>/dev/null | wc -l)
PDF_OK=0
for hf in figures/fig_*.html; do
    [ -f "$hf" ] || continue
    bn=$(basename "$hf" .html)
    if [ -f "figures/${bn}.pdf" ]; then
        # 每张 PDF 过一遍 html_pdf_check（FAIL 计入门禁）
        $PYTHON "$HTMLCHECK" "figures/${bn}.pdf" >/tmp/_hc.txt 2>&1
        [ $? -eq 1 ] && { echo "❌ ${bn}.pdf html_pdf_check FAIL"; cat /tmp/_hc.txt | grep FAIL; GATE_FAIL=$((GATE_FAIL+1)); } || PDF_OK=$((PDF_OK+1))
        # 元素级几何自检（溢出/越界/重叠；--render-math 无公式时无害）。退出码1=有问题计入门禁，2=无法检查跳过
        if [ -n "$CAPTURE" ]; then
            $PYTHON "$CAPTURE" --geom-check "figures/${bn}.html" --render-math >/tmp/_gc.txt 2>&1
            GC=$?
            [ "$GC" -eq 1 ] && { echo "❌ ${bn} 几何自检有问题（溢出/越界/重叠）"; grep -E '溢出|越出|重叠|共 ' /tmp/_gc.txt; GATE_FAIL=$((GATE_FAIL+1)); }
        fi
    else
        echo "❌ ${bn}.html 无对应 PDF"; GATE_FAIL=$((GATE_FAIL+1))
    fi
done
rm -f /tmp/_hc.txt /tmp/_gc.txt
[ "$HTML_COUNT" -gt 0 ] && echo "✅ HTML=$HTML_COUNT, PDF 过检=$PDF_OK" || echo "⚠ 无 HTML 图（若规划要求则为 FAIL）"

# TikZ 公式图（仅当规划要求；NEED_TIKZ=1）——⛔ 逐个核对 manifest 每个 tikz_<name> 都有同名 PDF
if [ "${NEED_TIKZ:-0}" = "1" ]; then
    # ⛔ 就地重解析 PLAN_DOC（块间变量不共享，此块 Step 1 的 PLAN_DOC 为空，必须重定位）
    _PLAN_DOC=""
    for f in PROBLEM_ANALYSIS.md PROPOSAL.md PAPER_PLAN.md; do [ -f "$f" ] && { _PLAN_DOC="$f"; break; }; done
    # 重新提取 manifest 的 TIKZ 硬合同清单（与 Step 5.5 同口径）
    _TIKZ_NAMES=$(awk '/BEGIN FIGURE_MANIFEST/,/END FIGURE_MANIFEST/' "$_PLAN_DOC" 2>/dev/null | grep -oE 'tikz_[a-zA-Z0-9_]+' | sort -u)
    [ -z "$_TIKZ_NAMES" ] && _TIKZ_NAMES=$(grep -oE 'tikz_[a-zA-Z0-9_]+' "$_PLAN_DOC" 2>/dev/null | sort -u)
    if [ -z "$XELATEX" ]; then
        echo "⚠ 规划需 TikZ 图但本机无 xelatex — 已在 latex_includes 留 TODO，不计 FAIL（环境限制）"
    elif [ -z "$_TIKZ_NAMES" ]; then
        echo "  (NEED_TIKZ=1 但 manifest 未列出具体 tikz_ 名，跳过逐项核对)"
    else
        # ⛔ 逐个硬核对：manifest 列了 tikz_<name> 就必须有 figures/<name>.pdf，缺一个 FAIL 一个
        _tikz_miss=0
        for tname in $_TIKZ_NAMES; do
            if [ -f "figures/${tname}.pdf" ]; then
                echo "✅ TikZ 产物: ${tname}.pdf"
                # 有源码则结构自检 CRITICAL 计入门禁
                if [ -n "$TIKZ_CHECK" ] && [ -f "figures/${tname}.tex" ]; then
                    bash "$TIKZ_CHECK" "figures/${tname}.tex" >/dev/null 2>&1
                    [ $? -gt 0 ] && { echo "❌ ${tname} tikz_check CRITICAL"; GATE_FAIL=$((GATE_FAIL+1)); }
                fi
            else
                echo "❌ 硬合同缺口: manifest 规划了 $tname 但无 figures/${tname}.pdf（不许用数据图替代/跳过，必须用 TikZ 产出）"
                _tikz_miss=$((_tikz_miss+1))
            fi
        done
        [ "$_tikz_miss" -gt 0 ] && GATE_FAIL=$((GATE_FAIL+_tikz_miss))
    fi
fi

# ⛔ 结算 Step 5 / Step 5.6 视觉自检两笔账（元素级几何自检抓不到的渲染遮挡/参差靠这里守门）：
#   - unresolved：审了、3 轮没修好 → 计入 GATE_FAIL，硬拦（与 drawio 引擎对称，默认引擎不再静默放行）
#   - skipped：环境原因（无 vision API / PDF→PNG 失败）根本没审 → 醒目警告 + 提示，不硬拦
if [ -s _tmp/vision_unresolved.txt ]; then
    _n_unres=$(wc -l < _tmp/vision_unresolved.txt 2>/dev/null); _n_unres=${_n_unres:-0}
    echo "❌ 视觉审查未通过 $_n_unres 张（3 轮没修好，带遮挡/参差/瑕疵）："
    sed 's/^/     - /' _tmp/vision_unresolved.txt
    GATE_FAIL=$((GATE_FAIL+_n_unres))
fi
if [ -s _tmp/vision_skipped.txt ]; then
    _n_skip=$(wc -l < _tmp/vision_skipped.txt 2>/dev/null); _n_skip=${_n_skip:-0}
    echo "🟥🟥🟥 警告：$_n_skip 张图【未做视觉审查】（仅过了结构/几何检查，遮挡类问题可能漏网）："
    sed 's/^/     - /' _tmp/vision_skipped.txt
    echo "     → 想让这些图被真正审查：确认已配 vision API（editor_ai/reviewer），并确保工作区有 PyMuPDF 或 pdftoppm。"
fi

# ⛔⛔ 执行凭证断言（防"没跑却当跑了"——本次会话暴露的静默跳过就靠这里拦）：
#   HTML 流程/架构图 + TikZ 图，每一张【该检的图】都必须在 passed/unresolved/skipped 三笔账里
#   有一条裁定记录。图在产物里、却三笔账都查无此名 → 说明视觉自检被静默跳过（既没审也没记）
#   → 计入 GATE_FAIL 硬拦。⛔ 仅非快速模式生效（FAST_MODE=1 是用户主动省 API，不苛求 vision 记录）。
_FM=0; grep -q 'MH_FAST_MODE=1' CLAUDE.md 2>/dev/null && _FM=1
# ⛔ 用户关闭了流程图/TikZ 视觉质检时，同样不苛求 vision 记录（否则关了 vision 反而因缺记录 GATE_FAIL 崩）。
grep -q 'MH_SKIP_DIAGRAM_VISION=1' CLAUDE.md 2>/dev/null && _FM=1
if [ "$_FM" != "1" ]; then
    _no_verdict=0
    for pdf in figures/fig_arch*.pdf figures/fig_flow_*.pdf figures/fig_roadmap*.pdf figures/fig_pipeline*.pdf figures/fig_framework*.pdf figures/tikz_*.pdf; do
        [ -f "$pdf" ] || continue
        _vb=$(basename "$pdf" .pdf)
        # tikz_diagrams.pdf 合集本身不算（拆页 tikz_diagrams_N 才是被检对象），跳过避免误判
        [ "$_vb" = "tikz_diagrams" ] && continue
        if grep -q "^${_vb} \|^${_vb}(\|^${_vb} PASS\|^${_vb} " _tmp/vision_passed.txt _tmp/vision_unresolved.txt _tmp/vision_skipped.txt 2>/dev/null; then
            :  # 有裁定记录（PASS/没修好/环境跳过其一），算审过
        else
            echo "❌ 执行凭证缺失：$_vb 在产物里但三笔视觉账都无记录 —— 视觉自检疑被静默跳过，必须真跑 Step 5/5.6 vision 再复核（不许用推理/手算顶包）"
            _no_verdict=$((_no_verdict+1))
        fi
    done
    [ "$_no_verdict" -gt 0 ] && GATE_FAIL=$((GATE_FAIL+_no_verdict)) || echo "✅ 视觉自检执行凭证齐全（每张 HTML/TikZ 图都有 PASS/未修好/环境跳过 裁定）"
fi

# latex_includes.tex 含本 skill 图的 include（HTML + TikZ）
if [ -s figures/latex_includes.tex ]; then
    N=$(grep -c 'fig_roadmap\|fig_flow\|fig_arch\|fig_pipeline\|fig_framework\|tikz_' figures/latex_includes.tex 2>/dev/null || echo 0)
    [ "$N" -gt 0 ] && echo "✅ latex_includes.tex 含 $N 条本 skill 图" || { echo "❌ latex_includes.tex 无本 skill 图 include"; GATE_FAIL=$((GATE_FAIL+1)); }
    # 有 TikZ PDF 时逐个核对 include（防漏）
    for tpdf in figures/tikz_diagrams.pdf figures/tikz_diagrams_*.pdf figures/tikz_*.pdf; do
        [ -f "$tpdf" ] || continue
        grep -q "$(basename $tpdf)" figures/latex_includes.tex 2>/dev/null || { echo "❌ TikZ $(basename $tpdf) 无 include"; GATE_FAIL=$((GATE_FAIL+1)); }
    done
else
    echo "❌ latex_includes.tex 缺失"; GATE_FAIL=$((GATE_FAIL+1))
fi

# 无损坏小 PDF（HTML + TikZ）
for pdf in figures/fig_*.pdf figures/tikz_*.pdf; do
    [ -f "$pdf" ] || continue
    sz=$(wc -c < "$pdf")
    [ "$sz" -lt 3000 ] && { echo "❌ $(basename $pdf) 仅 $sz 字节，疑损坏"; GATE_FAIL=$((GATE_FAIL+1)); }
done

echo ""
[ "$GATE_FAIL" -eq 0 ] && echo "✅ ALL PASSED" || echo "❌ $GATE_FAIL FAILURES — 逐个修复后重跑本门禁"
```

**⛔ 若 GATE_FAIL > 0**：逐个修复每个 ❌（重生成 HTML→重出 PDF→重检，或重编 TikZ，或追加 latex_includes），重跑门禁，直到 GATE_FAIL=0。若某张 HTML 图 html_pdf_check 反复多页，最后手段是拆图或大幅精简内容；若某张 TikZ 3 轮编不出，大幅精简后仍不行才留 TODO（环境限制不计 FAIL）。

**⛔ 全通过后输出最终 CHECKLIST 确认：**
```
HTML PLAN CHECKLIST (FINAL):
[✅] 1. fig_roadmap  — figures/fig_roadmap.pdf (XX KB) — html_pdf_check PASS
[✅] 2. fig_flow_q1  — figures/fig_flow_q1.pdf (XX KB) — html_pdf_check PASS
[✅] 3. tikz_model   — figures/tikz_diagrams.pdf (XX KB) — 编译+自检 PASS（仅 NEED_TIKZ=1）
[✅] latex_includes.tex — 含 N 条本 skill 图 include
ALL COMPLETE — paper-figure-html step finished successfully
```

## FIGURE_MANIFEST（后端按此对账图数量）

规划步骤（paper-plan 等）在规划文档里维护 `<!-- BEGIN FIGURE_MANIFEST -->` 区块，本 skill 据此对账。章节标题格式与 drawio 版保持一致，只把 "DrawIO" 字样改成 "HTML"。后端按**粗体章节标题里的关键词**归类（`html` 或 `drawio` 都归到本 skill/-drawio 这一类，两者互换），不看文件名前缀，所以 `fig_data_pipeline` 这类"关键词在中间"的名字也不会漏。

⛔ **几何图（TikZ）的 manifest 归属**：HTML 引擎下 TikZ 也由**本 skill** 产出，所以 TikZ 图名要放进**含 "HTML" 字样的章节**（或单独写一个标题里带 "HTML/TikZ" 的章节），这样后端才把它归到本 skill 的对账通道（后端第一优先匹配标题里的 `html`/`drawio` 关键词）。⛔ **不要**沿用 drawio 版把 TikZ 单列成 `**TikZ 图（paper-figure 产出）：**`——那个标题会被后端归到 `paper-figure`（数据图）通道，导致本 skill 产出的 tikz 图对不上账。

示例 manifest 区块（供规划步骤参考）：
```
<!-- BEGIN FIGURE_MANIFEST -->
**数据图（matplotlib gen_fig_*.py，paper-figure 产出 .png/.pdf）：**
- fig_data_dist
- fig_result_compare

**HTML 流程/架构图 + TikZ 公式图（paper-figure-html 产出 .html/.pdf + tikz_*.pdf）：**
- fig_roadmap
- fig_flow_q1
- fig_pipeline
- tikz_model
<!-- END FIGURE_MANIFEST -->
```

## Key Rules（速查）

- HTML 用 flex/grid 自动布局，**不写绝对坐标** → 免疫重叠/错位/连线穿越（相对 drawio 的核心优势）。
- 单文件自包含：CSS 变量内联在 `<style>`，**不引 CDN/网络资源**（离线环境）；字体用高端系统栈（西文优先）`"Segoe UI","Helvetica Neue",Helvetica,Arial,"Microsoft YaHei","Noto Sans SC",sans-serif` + `font-variant-numeric:tabular-nums`（见 0 节硬约束 4）。
- ⛔ 画布透明：`html`/`body`/`.fig` 背景一律 `transparent`，**整图不铺底色块**（融入论文页面），只有节点自身可浅填充。
- 出图：`$PYTHON "$CAPTURE" --file figures/fig_x.html --out figures/fig_x.pdf --format pdf` → 单页矢量无白边。
- ⛔ 用 `python` 不用 `python3`（本机 python3 触发 Store 存根，exit 49）。
- ⛔ **图内不写标题**，标题交给 LaTeX `\caption{}`。
- ⛔ 图内文字语言与论文一致。
- ⛔ 配色由 Step 1 风格种子 `H0` 按《设计规范 B 节》HSL 推导，全篇共用同一 `H0`/`TONE`；别自造高饱和色、别逐图换色、别用随机数。
- ⛔ 逐张画 → 转 PDF → html_pdf_check（FAIL 必修）→ **几何自检 `--geom-check`（有问题必修，最多3轮）**→ vision 自检（不阻塞）→ 过了再画下一张。
- ⛔ **元素级几何自检**：`$CAPTURE --geom-check figures/fig_x.html`（含公式加 `--render-math`）精确抓「文字溢出被裁 / 越出画布 / 文字块重叠」。退出码 1 必修——读 HTML 改 CSS（多为误用 absolute→改回 flex/grid）后重出重检。这是"截图识别→发现问题→自修复"闭环，任何模式都跑（比 vision 快且必修）。
- ⛔ 每张 PDF（含 TikZ）都要在 latex_includes.tex 有一个 `\includegraphics` 块。
- html_pdf_check 退出码：0=通过 / 1=FAIL 必修 / 2=无法检查跳过。多页 PDF 是最常见 FAIL（LaTeX 只显示第一页）。
- ✅ **公式直接写 HTML + `--render-math`**：流程/算法/架构图里的公式用 `\(...\)`/`\[...\]` 写进节点，出图命令加 `--render-math`（Step 3），KaTeX 渲染成矢量公式。**只有精密几何示意图**（按坐标画点线角度）才走 TikZ（Step 5.5，`NEED_TIKZ=1`，用 `xelatex` 编译，产物 `tikz_*.pdf`；编不出就精简重试，实在不行留 TODO 不阻塞其余产物）。
- ⛔ TikZ 图的 manifest 章节标题要带 "HTML" 字样（归本 skill 对账通道），别用 drawio 版的独立 "TikZ 图" 标题。
- ⛔ TikZ 视觉自检（Step 5.6）排除 HTML 流程图前缀（fig_arch/fig_flow_/fig_roadmap/fig_pipeline/fig_framework），只检同名 .tex 含 tikzpicture 的图。

---

## AI 自主生成 HTML 流程图设计规范

> Step 2 逐张设计时的唯一准绳。目标：**每张图的结构忠实于它自己的逻辑，配色/造型由风格种子确定性推导**，从而同篇统一、异篇各异、单张之间因逻辑不同而不雷同，同时始终高级、克制、符合科研/竞赛审美。

### 0 硬约束（⛔ 违反即出图失败，无例外）

1. **一路 `fit-content` 收缩到内容**：`html, body` 与最外层根容器都必须
   ```css
   html, body { margin:0; padding:0; width:fit-content; height:fit-content; background:transparent; }
   .fig { width:fit-content; height:fit-content; background:transparent; }
   ```
   根容器**不允许**出现固定像素宽（如 `width:640px`）或 `100%/100vw`——否则 Electron 会量到视口宽 1280px，PDF 右侧留大白边。留白靠内部 `padding`/`gap`，不靠外层撑宽。
2. **⛔ 整图不设背景色块**：`html`/`body`/`.fig` 背景一律 `transparent`，**不给整张画布铺任何底色**（哪怕近白 `#fff`/`#fafafa` 也不行）。图要能无缝融入论文页面，插进白底/浅灰底文档都不露出"这是一块带底色的图"的边界。只有**节点自身**可有浅填充（见 D 节 `--node-bg`），画布本身透明。
3. **flex/grid 自动布局，禁 `position:absolute` 定坐标**：节点、连线、分区一律用 flex/grid 排布。自动布局是"永不重叠/错位/连线穿越"的根本。
4. **单文件自包含，禁外链**：CSS 内联在 `<style>`；不引 CDN、不引网络字体、不引外部图片。⛔ **字体走系统栈（离线安全，全是 Win/Mac 自带字体），且按 `STYLE_FAMILY` 选字体族**（见文末《G 风格族》）：
   ```css
   /* STYLE_FAMILY=1（B 现代精致风）：无衬线现代体 —— 西文优先，中文 fallback 雅黑/思源 */
   .fig,.fig *{
     font-family:"Segoe UI","Helvetica Neue",Helvetica,Arial,"Microsoft YaHei","Noto Sans SC",sans-serif;
     font-variant-numeric:tabular-nums;   /* 等宽数字：参数/指标竖直对齐 */
     -webkit-font-smoothing:antialiased;
   }
   /* STYLE_FAMILY=0（A 朴素竞赛风）或 2（C 纯黑白线稿）：衬线印刷体 —— 贴近论文正文/黑白框图观感 */
   .fig,.fig *{
     font-family:"Times New Roman","SimSun","Songti SC","Microsoft YaHei",serif;
     -webkit-font-smoothing:antialiased;
   }
   ```
   ⛔ **只保留 `STYLE_FAMILY` 对应的那一套 `.fig,.fig *` 字体规则，删掉其它**（别多条都写进同一文件，后写的会覆盖）：`FAMILY=1` 用无衬线；`FAMILY=0` 和 `FAMILY=2` 都用衬线。西文字体族排在中文前 → 英文/数字用西文字形（更精致），中文自动 fallback。**别把中文字体排第一**（否则英文也用中文字体的西文字形，显廉价）。
5. **图内不写标题**：标题交给 LaTeX `\caption{}`，图里只有流程/结构本身。
6. **单页 + 宽高比 ≤ 8:1**：内容多时优先增高不增宽（或分区换行），别撑成超宽单行。
7. **公式写 `\(...\)`/`\[...\]`**：节点里的数学公式用 KaTeX 定界符包裹，出图加 `--render-math` 渲染；只有精密几何示意图（按坐标画点线角度）才走 TikZ（Step 5.5）。
8. **禁 emoji、禁装饰性图标字体**。
9. **⛔ 节点文字禁出现 LaTeX 排版命令**：这是 HTML 不是 LaTeX。节点/副标题/标签里**严禁**写 `\scriptsize`、`\small`、`\footnotesize`、`\bfseries`、`\textbf`、`\centering`、`\node`、`\hline` 等任何 LaTeX 排版/绘图命令——它们不会被渲染，会原样显示成 "scriptsize" 之类的乱字（这是真实翻车过的 bug）。字号一律用 CSS `font-size`、字重用 `font-weight`、对齐用 `text-align`。**唯一例外**：`\(...\)`/`\[...\]` 里的数学内容（第 7 条），那是 KaTeX 公式，不是排版命令。若参考了 `shared-scripts` 下的 TikZ 示范（`.tex`），只借鉴其"画什么内容"，⛔ 绝不照抄任何以反斜杠开头的记号进 HTML。

### A 结构忠实于逻辑（⛔ 废除"强制三件套"）

**旧规则已作废**：不再要求每张流程图都塞"判断分支+循环/分叉+双行节点"。**结构服务逻辑，不为花样而花样。** 线性的问题就画线性，迭代的问题才画循环，并行的问题才画分叉。

**设计前先用一句话说清这张图的逻辑流向**，再从下表按逻辑选范式。⛔ **多数逻辑列了【多个等价范式】（编号从 `⓪` 起：`⓪①②`）——它们描述同一逻辑、只是骨架朝向不同。此时不再"随便挑一个"，而是按 Step 1 的 `LAYOUT` 种子确定性选：选编号 `= (LAYOUT % 该逻辑的候选数)` 的那个**（例：线性有 2 个候选，`LAYOUT=4 → 4%2=0 → 选 ⓪纵向主干`；`LAYOUT=3 → 3%2=1 → 选 ①横向流水线`）。这让同类题的不同用户宏观骨架也不同——"千人千面"从换皮肤升到换骨架的落点。

| 逻辑类型 | 等价范式（选编号 `= LAYOUT % 候选数`，⓪ 表示第 0 个） |
|---|---|
| 线性顺序（A→B→C→D） | ⓪纵向主干 / ①横向流水线 |
| 阶段推进 / 时间演进 | ⓪时间轴（横向刻度） / ①分层堆叠（自上而下阶段） |
| 有条件分支 | ⓪上下分叉树 / ①左右对照分叉（均圆角矩形判定节点→是/否两路，⛔ 不用旋转菱形，见 A.2 骨架 3） |
| 迭代 / 收敛 | ⓪纵向循环回流 / ①横向循环回流（均带回边箭头 + 收敛判断出口） |
| 多任务并行后汇总 | ⓪竖向并行列→底部汇合 / ①横向并行行→右侧汇合 |
| 输入/处理/输出三段 | ⓪横向泳道 / ①左右对照 |
| 模块化系统 | ⓪分层堆叠 / ①矩阵网格 |
| 以核心方法为中心辐射 | ⓪放射中心（3×3，见 A.2 骨架 2）——语义唯一，不参与 LAYOUT 选择 |
| 方法/维度对比 | ⓪矩阵网格 / ①左右对照 |

⛔ **放射中心不进"模块化系统"候选**：放射中心要求有一个**真正统领全局的核心引擎**（数据从四周汇向中心再产出）。模块化系统若无这种中心语义，硬选放射中心会**编造假中心、违反 A.1 反空壳**。所以放射中心只作为"以核心方法为中心辐射"这一逻辑的唯一范式，不参与 LAYOUT 轮选。

⛔⛔ **LAYOUT 铁律（违反即失真、返工）**：`LAYOUT` **只在上表【逻辑等价】的编号范式间选**——迭代题的两个候选都是循环（只是朝向不同），并行题的两个候选都是分叉。**绝不允许**为了套 `LAYOUT` 把迭代题选成线性、把分支题选成流水线。逻辑只有唯一贴合范式的（如"放射中心"），`LAYOUT` 不介入，直接用那一个。**先保证逻辑忠实（A 节铁律），再在等价范式内用 LAYOUT 拉开骨架差异**——顺序不能反。

**⛔ 换骨架不等于降对齐**：选了横向/放射/分层骨架后，仍须满足 D.1 ④ 对齐硬纪律（`grid`+`1fr`/`stretch` 等大对齐）。放射中心用 A.2 骨架 2 的 3×3 grid、分层用骨架 1、分区用骨架 3——**这些骨架本身就是对齐的**，照搭即可，别手写坐标破坏它。

**⛔ 规模兜底（种子不凌驾于排版合理）**：若 `LAYOUT` 选出的朝向与节点数量打架——**横向范式但节点 ≥6 会撑出超宽图（违反 0 节宽高比 ≤8:1）**，或纵向范式但节点 ≥8 会拉成细长条——则**换用同逻辑的另一个等价范式**（如"横向流水线"节点太多 → 退回"纵向主干"，或折成两行 `grid` 蛇形排布）。判定优先级：**逻辑忠实 > 排版合理（不超宽高比、不挤不糊）> LAYOUT 骨架多样**。即 LAYOUT 是"逻辑与排版都允许时才生效"的偏好，不是硬指令。宁可与别人撞骨架，也不出一张压扁/细长/超框的丑图。

**自检问题**：如果把某个判断/循环去掉后，这张图描述的逻辑依然成立——那这个判断/循环就是硬凑的，删掉。宁可结构简单而**准确**，不要为了"看起来复杂"而失真。

**不同子问题必须看得出差异**：q1/q2/q3 若算法逻辑不同（如线性预处理 vs 二分搜索 vs 迭代优化），它们的布局范式就应当不同——这正是本次改造的核心诉求。

**⛔ A.1 反"通用空壳"——图必须有这篇论文特有的内核（违反即返工）**

"结构服从逻辑"不是"允许偷懒画泛泛流程"。⛔ **严禁**画出换任何论文都成立的通用空壳，典型反例：

- 节点全是万能词：`数据采集 → 数据预处理 → 建立模型 → 模型求解 → 结果分析 → 结论建议`。这种图信息量≈0，谁都能套，**一律返工**。

**每张图必须做到两点：**

1. **节点承载实体，不写空词**：节点里填**这个子问题特有的**方法名/模型名/算法/判据/关键变量/关键约束，让内行一眼认出"这是在解这道题、用的是这个方法"。
   - ❌ `建立模型` → ✅ `多目标遗传算法 NSGA-II`、`时变需求下的库存 (s,S) 策略`、`基于 LCA 的碳足迹核算模型`
   - ❌ `数据预处理` → ✅ `3σ 剔除异常 + 样条插补缺失`、`滑动窗口去趋势`
   - ❌ `模型求解` → ✅ `Gurobi 求解 MILP（分支定界）`、`四阶 Runge-Kutta 数值积分`

2. **挖出方法真实的非平凡结构**：很多流程"看起来线性"，是因为没往深挖。建模过程通常**真实存在**结构特征——参数标定回调、假设检验分支、收敛判断回环、多方法并行对比后择优、灵敏度/稳健性反馈。**把真实存在的结构挖出来画上**（这不是硬凑，是忠实），图立刻有内核。
   - ⛔ 但仍守 A 节铁律：只画**真实存在**的结构，不为了"显得深"而编造一个原逻辑里没有的分支/循环。
   - 判据：问自己"这道题的方法，除了顺序执行，还有没有回头校验、条件切换、并行比选？"——有就画出来，别把它拉直成一根线。

**⛔ A.2 节点写"方法与步骤"，不写"具体结果数值"（技术路线图/流程图不是结果展示区）**

技术路线图/求解流程图画的是**做什么、用什么方法、得到什么量**的框架；**具体求解结果数值属于结果图表和正文，绝不塞进流程图节点**。技术路线图更是放在论文最前面（结果还没出），塞结果数值既喧宾夺主、又常与正文精度对不上（如图写 `412.473838` 正文写 `412.47`），还会连带触发数字溯源审计。
- ✅ 正确：`求解得到临界时刻 t*`、`输出最优螺距 p_min`、`时间二分求根至 1e-6 s`（算法收敛精度/迭代设定属**方法参数**，可保留）
- ❌ 错误：`输出：t*=412.473838 s`、`p_min=45.033745 cm`、`交叉验证误差 7.01e-8`、`链长 2.86/1.65 m`（这些是**求解产出的结果值**，只能出现在结果图表/正文，不进流程节点）
- 判据：某个数字如果来自 `RESULTS.md`/`all_results.json`（是"算出来的结果"），就不该进流程图节点；如果是算法本身的固定设定（精度阈值、迭代上限），可以留。

**⛔ 内核自检（每张图出图前必过）**：把所有节点文字抄下来，遮住题目，问"光看这些节点，能认出这是哪类课题、哪个方法吗？"——认不出 = 太泛，回去填实体、挖结构，重画。

### A.2 复杂范式 CSS 骨架库（⛔ 复杂结构照此搭，别退化成一根线）

菜单里"分层架构""放射中心""贯穿侧栏"这类**高级范式**光有名字画不出档次。下面给**可直接照抄的 flex/grid 骨架**。⛔⛔ **注意：下方骨架里的旧变量名是历史示例，务必按新 B 节改成黑白基调**——`--node-bg/-2/-3`→灰阶 `--n-bg/--n-bg2`（`#f4f4f4/#ececec`），`--line`→灰边 `--n-line`，`--primary-dark`→近黑 `--text`；**尤其 `background:var(--primary);color:#fff` 这种实心彩底+白字一律禁用**（违反新原则），核心/焦点节点改用 `--accent-bg` 浅底 + `--text` 深字 + `--accent` 粗边。彩色只落焦点/语义连线/(TONE1)类型边框。用哪种骨架取决于 A 节的逻辑，不是每张都套。

**骨架 1 · 分层系统架构 + 贯穿侧栏**（多层堆叠，每层多模块，右侧横切关注点贯穿全层）——适合系统/平台/数字孪生类：

```css
.fig{display:flex;flex-direction:row;align-items:stretch;gap:14px}  /* 主栈 + 侧栏并排 */
.stack{display:flex;flex-direction:column;gap:0}                     /* 各层竖向堆叠 */
.layer{background:#ececec;border:1.1px solid #c9c9c9;border-radius:8px;
  padding:11px 14px;display:flex;align-items:center;gap:14px}        /* 一层=灰阶分区块面 */
.layer .lname{writing-mode:vertical-rl;font-size:11px;font-weight:700;
  color:var(--text);letter-spacing:2px;white-space:nowrap}          /* 竖排层名(近黑) */
.mods{display:flex;gap:11px}                                         /* 层内模块横排 */
.flow{text-align:center;color:#8a8a8a;font-size:15px;margin:3px 0}   /* 层间数据流箭头(灰) */
.side{background:var(--accent-bg);border:1.1px solid var(--accent);  /* 侧栏=唯一可带H0色处(横切关注点) */
  border-radius:8px;padding:12px;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:11px;align-self:stretch}
```
- 层间流写"↑ 决策下发　状态上报 ↓"这类**双向语义**，别只画单箭头。
- 侧栏放"横切关注点"（安全/监控/反馈闭环），用 `--accent` 虚线框区别于主栈——这是流程图做不到的架构感。

**骨架 2 · 放射中心（3×3 网格，核心引擎四周辐射）**——适合以某方法/引擎为中心统领子模块：

```css
.grid{display:grid;grid-template-columns:repeat(3,150px);grid-template-rows:repeat(3,auto);
  gap:20px 26px;align-items:center;justify-items:center}
.core{grid-column:2;grid-row:2;background:var(--accent-bg);color:var(--text);
  border:2px solid var(--accent);border-radius:10px;padding:16px 14px;font-weight:700}
  /* 正中核心=全图唯一焦点：H0 浅底+深字+粗彩边，不用实心彩底+白字 */
.node{background:#f4f4f4;border:1px solid #c9c9c9;color:var(--text)}  /* 四周节点全灰阶，不填彩色 */
/* 输入/输出等角色差异靠"位置+副标题文字"区分，不靠给每类填不同颜色 */
```
- 中心 `core` 放主引擎，八格按"输入类/支撑类/输出类"分色，一眼看出数据从四周汇向中心再产出。

**骨架 3 · 多分区块面（泳道/阶段分区，区内放节点）**——适合分阶段、分主体的对照/推进：

```css
.zone{background:#ececec;border:1.1px solid #c9c9c9;border-radius:8px;
  padding:13px 16px;display:flex;flex-direction:column;align-items:center;gap:9px}/* 灰阶分区 */
.zone .zt{font-size:11px;font-weight:700;color:var(--text);letter-spacing:1px}/* 区标题(近黑) */
.row{display:flex;gap:14px}                          /* 区内节点横排 */
.branch{display:flex;gap:52px;align-items:flex-start} /* 条件分支：多路并列 */
```
- 分支范式：**判定节点下接 `.branch`**，每路一个 `.path`（含 `.lbl` 标"是/否""成立/违背"），再 `.merge` 汇合——用于假设检验、策略切换、二分收敛这类**真实条件分叉**。
- ⛔⛔ **判定节点一律用圆角矩形，禁用旋转菱形（`transform:rotate(45deg)` / clip-path 菱形）**：CSS 菱形靠旋转正方形做，**旋转后布局盒仍是正方形、四个尖角戳出到外接圆之外**，为塞下判定文字（如"区间 t₊−t₋>10⁻³?"）撑大后尖角/盒子会**压住左右相邻节点和分区框**（真实翻车）。判定语义靠**下方两条带"是/否"标签的分支箭头**表达，不靠形状是不是菱形。判定节点写法：`border-radius:var(--r)` 的普通节点 + 稍粗边或 `--accent` 边框以示"这是判定"，文字精简成一行（`区间>ε?`），细节移副标题。菱形一时半会看着"像流程图"，但它是本 skill 里遮挡问题的头号来源，一律不用。

**⛔ 骨架只是脚手架**：结构照搭，**节点文字必须换成本题真实实体**（守 A.1）；配色变量必须按 B 节从 `H0` 推导。骨架帮你达到复杂度下限，内核靠你填。

### B 配色配方（⛔ 从种子 H0 用 HSL 推导，示例数值不得照抄）

Step 1 已算出主色相 `H0`（0–359 的整数）。**按下表用 HSL 推导整套色板**，每张图开头写成 `:root` CSS 变量。同一篇论文所有图共用同一 `H0`，所以色板自动统一。

⛔⛔ **核心原则（本次改造：去"全彩 AI 感"）**：**节点主体一律走黑白灰**，`H0` 推导的彩色**只用于三处**——①全图唯一焦点 ②语义连线/判断分支（是/否、回流）③描边档(TONE 1)的类型边框。**绝不给每个节点填不同颜色**（那正是"太像 AI/PPT 模板"的根源）。一张图里彩色占比目测 ≤15%，其余全是灰阶。

| 角色 | 变量 | 推导规则（H=色相 S=饱和 L=亮度） | 用途 |
|---|---|---|---|
| **灰阶·节点底** | `--n-bg` | `#f4f4f4`（中性浅灰，无色相） | 普通节点填充（TONE 2 用） |
| **灰阶·分区底** | `--n-bg2` | `#ececec` | 分区/泳道填充（TONE 2） |
| **灰阶·边框** | `--n-line` | `#c9c9c9`~`#2b2b2b`（按档选，无色相） | 节点边框/连线（黑白档用深、其余用浅） |
| **灰阶·正文字** | `--text` | `#1a1a1a`（近黑，无色相） | 节点内文字 |
| **灰阶·弱文字** | `--muted` | `#6b6b6b` | 副标题/注释 |
| 强调色 | `--accent` | `hsl(H0, 42%, 45%)` | ⛔ **只用于唯一焦点的边+字、语义分支标签、回流箭头**——不填普通节点 |
| 焦点浅底 | `--accent-bg` | `hsl(H0, 40%, 95%)` | 唯一焦点节点的柔和浅底（仅此一个节点可有色底） |
| 类型边框 | `--type-a/-b` | `hsl(H0,38%,48%)` / `hsl((H0+35)%360,32%,50%)` | **仅 TONE 1(描边档)** 用：不同类型节点的彩色边框（白底） |
| 画布底 | —（无变量） | `transparent` | ⛔ 整图不铺底色 |

**⛔ 配色约束（违反即返工）：**
- **节点主体黑白灰，彩色只做强调**：普通节点用 `--n-bg`/白底 + 灰边 + 深字；`H0` 彩色仅进焦点、语义连线、(TONE 1)类型边框。⛔ **禁止用 H0 彩色填充多个普通节点**（旧的"每类一个彩色块"是本次要消除的丑点）。
- `--accent` 饱和度 **≤ 45%**（低饱和才高级），且**全图彩色占比 ≤15%**。
- **画布背景必须 `transparent`**；文字用近黑 `--text`（非纯黑 #000 也可，别带明显色相）。
- 主文字对比度 **≥ 7:1**（深字浅底/白底自然达标）。
- **强调色只 1 种色相（H0 派生），语义连线复用它**；不引入第二种彩色色相（黑白灰不算色相）。
- **B.1 H0 决定"这篇的强调色是什么颜色"**（异篇不同的来源之一）：可选学科吸附——能源/环境≈170（青绿）、经济/管理≈35（暖橙）、计算机/信息≈225（靛蓝）、通用≈210（灰蓝）。吸附后全篇一致。⛔ 注意：H0 只染那 ≤15% 的强调部分，不染节点主体。

### C 同篇统一 + 异篇不同（确定性，非随机）

- **种子 = 工作流 ID（工作区目录名）的哈希**（Step 1 已算）。同一篇论文所有图读到同一 `SEED`，因此配色/造型/布局倾向全篇一致。
- **不同论文/不同用户目录名不同 → SEED 不同 → H0/TONE 不同 → 整体风格明显不同。**
- **断线重跑同目录 → SEED 不变 → 风格可复现。**
- **单张图之间的差异只允许来自"逻辑不同"**（A 节的范式选择），不允许来自配色/造型漂移。
- ⛔ **绝对禁止**用随机数、时间戳、`$RANDOM`、当前时间等非确定性来源决定任何视觉参数。

### D 造型档次（由 TONE 选一种，全篇统一）——三档都是"黑白基调 + H0 强调"

Step 1 的 `TONE`（0/1/2）决定全篇统一的造型档，**三档都以黑白灰为主体、彩色只做强调**，区别在"用什么手段分层次 + 彩色点在哪"。不同论文种子不同 → 落到不同档 + 不同 H0 强调色 → **每个人的图各不相同，但都不全彩、不 AI**：

| TONE | 档名 | 节点主体 | H0 彩色只用在 | 层次靠 |
|---|---|---|---|---|
| **0** | **纯黑白线稿**（对应 demo C：mono_semantic_line） | 全白底、`--n-line` 黑灰细边、零填充 | **语义连线/分支**（是=`--accent`绿向、否/回流=`--accent`红向标签）+ 焦点更粗黑边 | 边框粗细 + 字重 + 留白，**完全不靠填色** |
| **1** | **彩边白卡**（对应 demo A：border_only） | 白底、**彩色边框**按节点类型分（`--type-a`/`--type-b`）、圆角卡片 | **节点边框**（类型区分）+ 焦点粗边 | 边框颜色/粗细 + 极淡阴影 |
| **2** | **灰阶分区 + 单焦点**（对应 demo B：grayscale_oneaccent） | `--n-bg`/`--n-bg2` 灰阶填充分层 | **仅唯一焦点**（`--accent-bg`浅底+`--accent`边字），其余全灰 | 灰阶深浅 + 唯一彩色焦点 |

⛔ **三档共同铁律**：节点主体永远黑白灰；`H0` 彩色占全图 ≤15%，只落在上表"H0 彩色只用在"那一列。**任何档都不许把多个普通节点填成不同彩色**（那就退回全彩 AI 感了）。

**通用造型规则（三档都遵守）：**
- **圆角统一**：全图同一圆角值，⛔ **具体值以《G 风格族》为准**——A 族直角~2px、B 族 5px（`RADIUS` 旋钮在各族封顶内微调），别混用。
- **边框 1–2.2px**：TONE 0 用近黑 `#2b2b2b`(1.2px)、焦点 2.2px 纯黑；TONE 1/2 用灰边或类型彩边(1–1.4px)、焦点 2px。
- **阴影克制**：最多 `0 1px 3px rgba(0,0,0,0.06)`；TONE 0 纯线稿**完全不用阴影**。
- **留白呼吸**：节点内 `padding` ≥ 10–16px，节点间 `gap` ≥ 14–20px。
- **字号层级**：主节点 14–16px、说明文字 12–13px、注释 11px；同层级字号一致。
- **字重梯度（高端细节）**：焦点/核心 `700`、主节点 `600`、普通节点 `500`、副标题/注释 `400`——**用字重拉层次而非字号跳变**（字号只分 3 档，字重补细分）。别全篇一个字重（扁平、廉价）。
- **字间距（高端细节）**：全大写英文标签/分区名加 `letter-spacing:.5–1px`（透气、显精致）；正文中文不加字间距（中文加间距反而松散）；数字统一 `font-variant-numeric:tabular-nums`（0 节已全局设，表格/参数天然对齐）。
- **箭头造型**：细箭头（用 CSS 三角或 `border` 画），颜色 `--line`；线宽与节点边框协调。
- **反面清单（出现即返工）**：高饱和原色（纯红/纯绿/纯蓝）、粗黑边、大面积渐变、多种圆角混用、彩虹配色、emoji、装饰性图标。

### D.1 高级科研审美细节（⛔ 这些细节决定"看起来高级"还是"像 PPT 草稿"）

造型基调对了只是及格，真正拉开档次的是下面这些**克制而精确**的细节。顶刊/顶会配图的共性是"信息密度高、视觉噪声低"：

**① 层次靠"轻重"而非"多色"**：同一张图里区分主次，优先用**字重 + 留白 + 深浅灰**，不是加新颜色。
- 主节点 `font-weight:700` + 略深灰底/白底；次节点 `font-weight:400` + 无填充；层次全靠灰阶明度和字重拉开。
- ⛔ 别靠"每类一个颜色"区分——节点主体黑白灰是硬线（B 节），彩色只留给焦点/语义连线。

**② 连线是"信息"不是"装饰"**：
- 箭头细、短、语义化。多源汇入用倾斜箭头 `↘ ↓ ↙` 收拢到一点；回流/反馈用**虚线 + `--accent`** 与主流区分；双向流写清"上行/下行"语义。这里是 H0 彩色**允许出现**的地方之一。
- ⛔ 禁纯直角折线堆叠、禁多条线交叉穿越（flex/grid 天然避免，别手动 absolute 破坏它）。

**③ 副标题制造信息密度**：每个节点主标题下加一行 `.sub`（`font-size:10-11px；color:--muted`）写方法细节/参数/数据源（如 `RNA-seq`、`Gurobi 分支定界`、`SCADA 秒级`）。这一行是"内行感"的来源，也直接支撑 A.1 内核。

**④ ⛔⛔ 对齐与整齐（硬性纪律，不是建议——"不对齐/参差/大小不一"是最直接的"丑"，一票否决）**：
- **同一行/同一列的并列节点必须等宽等高**：用 `grid` + `grid-auto-columns:1fr`（或 flex 子项 `flex:1` + 父 `align-items:stretch`）让它们**自动等尺寸**，绝不靠手写不同 `width` 凑；文字多少不同也要靠统一 `min-width` + 内部换行拉齐，**禁止一个宽一个窄参差不齐**。
- **网格严格对齐**：多行多列节点一律用 `display:grid` 而非多个手排 flex——grid 天然行列对齐，行与行的节点竖直方向对得上、列与列水平对得上，**不会错位**。禁止用 `margin`/负偏移手动"挪"节点位置。
- **箭头/连线接在节点中轴**：横排流水线的箭头竖直居中对齐（`align-items:center`），竖排的箭头水平居中——别让箭头歪着接在节点角上。
- **统一节奏**：全图同层 `gap` 一个值、节点 `padding` 一个节奏、所有块同一 `border-radius`（=本篇 `RADIUS` 档）；区与区间距 > 区内节点间距（制造分组感）。
- **边缘对齐**：整张图各分区/各行左右边缘尽量对齐成一条线（父容器统一，不要东一块宽西一块窄）；避免某一块莫名突出或缩进。
- 一句话：**看上去像用尺子摆过的——横平竖直、等大等距、边缘成线**。做不到就是没用 grid/stretch 在硬凑，回去改结构。

**⑤ 强调唯一焦点（H0 彩色的主战场）**：全图**只留一个**最强视觉锚点（核心引擎/最终结论）。⛔ **不用实心深块+白字**；改用 **`--accent-bg` 柔和浅底（H0 派生，饱和≤40%）+ `--text` 近黑深字（保证 ≥7:1 可读）+ `--accent` 稍粗边框(2px) + `font-weight:700`**——这是全图**唯一**允许带彩色底的节点，靠"比灰阶节点多一点色 + 更粗边 + 更重字"自然跳出。⛔ 焦点字别用 `--accent`（浅底上对比度不够），必须用近黑 `--text`。其余节点一律灰阶/白底、零彩色。多个焦点 = 没有焦点。（TONE 0 纯线稿档：焦点不加彩底，改用更粗纯黑边 2.2px + 字重 800 突出。）

**⑥ 单位与符号规范**：数学符号用真 Unicode（`≤ ≥ σ ε ×` 而非 `<= >= sigma`），下标用 `f₁ f₂`；术语中英一致（首次出全称+缩写，如 `双重差分 DID`）。

**⑦ 密度平衡**：节点文字控制在 4–10 字 + 一行副标题；超长拆两行或移到 `.sub`。宁可多一个节点，不要一个节点塞两行长句。

> 一句话：**低饱和配色 + 字重层次 + 语义化连线 + 副标题密度 + 唯一焦点**——这五条齐了，图就有科研高级感。

### E 自检清单（设计前 + 出图后各过一遍）

**设计前自问：**
1. 这张图的逻辑流向能用一句话说清吗？
2. 按 A 节，我选的布局范式贴合这个逻辑吗？有没有硬凑判断/循环？
3. 它和本篇其它图的逻辑不同吗？（不同就该长得不同）
4. （A.1）节点里填的是这道题**特有的**方法/模型/判据，还是"数据预处理/建立模型"这种谁都能套的空词？后者立即改。
5. （A.1）这个方法**真实存在**的非平凡结构（校验回调/假设检验分支/收敛回环/多方法比选）挖出来了吗？还是被我拉直成一根线了？

**出图后自检：**
1. 结构是否真实反映论文逻辑（方法名/步骤都是真的，无占位文字）？
2. 配色是否全部由 `H0` 按 B 节推导、协调低饱和、有意义色 ≤ 4？造型是否符合 `TONE`？
3. 是否满足 0 节**全部**硬约束（`fit-content` 收缩、**画布 `transparent` 无底色块**、无 absolute、无外链、无标题、单页、宽高比 ≤8:1）？
4. **（A.1 内核自检）遮住题目只看节点文字，能认出这是哪类课题、哪个方法吗？** 认不出 = 通用空壳，回去填实体、挖真实结构，重画。
5. `html`/`body`/`.fig` 有没有残留 `background:#fff`/`#fafafa`/带色底？有就改 `transparent`（融入论文页面）。
6. **（D.1 高级感）**字重层次拉开了吗？连线语义化了吗？每个节点有副标题吗？全图有且只有一个焦点吗？——五条齐了才算高级。
7. 与本篇已生成的图相比：配色/造型统一，但结构因逻辑而不同？
8. **（造型旋钮 + LAYOUT 拓扑）** 圆角/连线/强调条/分区框是否按本篇 `RADIUS`/`ARROW`/`NODEACC`/`SECT` 落实、全篇一致？**且：这张图逻辑若有多个等价范式，我是否按 `LAYOUT % 候选数` 选的骨架、而非随手挑？**（若逻辑只有唯一贴合范式则不适用。）没套上等于又回到"千篇一律的默认长相"。
10. **（风格族 G 节）** 字体族对不对（A/C 衬线 / B 无衬线）？A 族有没有混进灰底/圆角>2px/副标题/阴影（有就拉成 B 了）？B 族有没有残留柔和阴影或满屏副标题？**C 族有没有残留任何彩色（`hsl`/`--ac` 都不该有，焦点靠粗黑边+字重）**？A/B 族的 `--ac`/`--acbg` 是否由本篇 `H0` 代入、没写死示例色？——全篇所有图必须同一 `STYLE_FAMILY`。
9. ⛔ **（D.1 ④ 对齐硬纪律）眯眼看整张图：并列节点等大吗？行列对齐成线吗？边缘齐吗？箭头接在中轴吗？间距均匀吗？** 只要有一处参差/错位/大小不一 = 丑，回去用 `grid`+`1fr`/`stretch` 强制对齐，别靠手写 width 或 margin 硬凑。**"像用尺子摆过"才算过。**

### F 造型旋钮落 CSS（⛔ 按 Step 1 种子值选一档，全篇统一；全是黑白造型、不加颜色）

这四个**造型旋钮**（RADIUS/ARROW/NODEACC/SECT）把**皮肤**拉开差异；**宏观骨架**的差异则由 `LAYOUT` 在 A 节等价范式间选（那是"换骨架"，比皮肤更管用）。两者配合 → 每个人长相都不同。按 Step 1 算出的值各选一档，写进 `:root`/对应类，**全篇所有图用同一组**：

**RADIUS（圆角，定 `--r`）**——节点/框统一用 `border-radius:var(--r)`：
| 值 | `--r` | 观感 |
|---|---|---|
| 0 | `0` | 直角，硬朗工程感 |
| 1 | `4px` | 微圆，克制 |
| 2 | `10px` | 明显圆角，柔和 |
| 3 | `999px`（仅小节点/标签）+ 大块 `14px` | 胶囊感 |

**ARROW（连线样式）**——所有流向连线统一：
| 值 | 画法 |
|---|---|
| 0 | 细实线 1px + 小实心箭头 `▶`（`border`+CSS 三角或 `→`） |
| 1 | 粗实线 2.5px + 大箭头，流向感强 |
| 2 | 点线 `border-style:dashed`/`dotted` + 箭头，轻盈 |
| 3 | 不画线，用 `›`/`▸` chevron 字符做节点间分隔（横排流水线尤佳） |

**NODEACC（焦点/类型节点的强调方式）**——**替代**"实心彩底"，仍是黑白+H0细节：
| 值 | 画法 |
|---|---|
| 0 | 纯描边：焦点节点 `border:2px solid var(--accent)` + 白/浅灰底 |
| 1 | 左竖条：`border-left:4px solid var(--accent)`，其余细灰边 |
| 2 | 顶横条：`border-top:3px solid var(--accent)`，其余细灰边 |

**SECT（分区/分组框法）**——含你截图那种"分区标签条"，现在会变：
| 值 | 画法 |
|---|---|
| 0 | 无框：纯靠 `gap`/留白 + 一个小节标题分组，最简洁 |
| 1 | 细虚线框：`border:1px dashed var(--n-line)` 圈住一组 |
| 2 | 左侧竖标签条：组左侧一条竖 `--n-bg2` 窄条写分区名（旋转或竖排），即你截图那种，但仅在 SECT=2 时出现 |

> ⛔ **四个旋钮只改"造型结构"，一律不加颜色**（颜色只由 H0 按 B 节染那 ≤15%）。所以扩这些不会破坏"黑白不像 AI"的基调，只让骨架长相多样。⛔ 同篇统一：一篇里所有图同一组旋钮值，别逐图变。

### G 风格族（⛔ 最顶层维度，由 Step 1 的 `STYLE_FAMILY` 定，凌驾于同名旋钮，全篇统一）

`STYLE_FAMILY` 先把图分成**三大类观感**，再由族内的 `H0`/`TONE`/`LAYOUT`/`ARROW` 继续细分——这就是"两层随机"。⛔ **本节规定的维度（字体族/节点底色/圆角上限/阴影/副标题/分组框/边框/是否用彩色）由风格族说了算，与之冲突的旋钮档以族为准**；本节没规定的维度（`H0` 强调色相、`LAYOUT` 骨架朝向、`ARROW` 连线样式、`NODEACC` 焦点强调）仍按前面各节在族内照常随机（⛔ 但 C 族强制零彩色，`H0` 不用）。

| 维度 | **A 朴素竞赛风**（`=0`） | **B 现代精致风**（`=1`） | **C 纯黑白线稿**（`=2`） |
|---|---|---|---|
| 字体族 | 衬线 `Times`/`SimSun` | 无衬线 `Segoe UI`/`雅黑` | 衬线 `Times`/`SimSun` |
| 节点底 | 纯白 `#fff` | 极淡灰 `#f6f7f9` | 纯白 `#fff` |
| 圆角 | 直角~2px（`RADIUS` 封顶 2px） | 微圆 5px（`RADIUS` 封顶 6px） | 直角 0px（⛔ 强制直角，`RADIUS` 忽略） |
| 阴影 | **无** | **无**（砍掉柔和阴影） | **无** |
| 副标题 `.sub` | **完全不用** | **仅关键节点**留一行 | **完全不用** |
| 分组框 | 黑 `dashed` 虚线框 | 浅灰 `solid` 圆角框 | 黑 `solid`/`dashed` 直角框 |
| 边框 | 深黑灰 `#2b2b2b` 1px | 灰 `#c4c9d0` 1px | 纯黑 `#1a1a1a` 1–1.4px |
| 彩色 | 焦点+是/否/回边用 `H0`（`--ac`/`--no`） | 焦点+语义连线，`H0` 克制点缀 | ⛔ **零彩色**：焦点靠更粗黑边(1.8px)+字重800；是/否/回边全用黑实线+文字标签 |

⛔ **A/C 族"做减法"是刻意的**：高级感来自**朴素**（黑白、直角、细线、无装饰），不是来自精致。别给它们偷偷加灰底/圆角/副标题/阴影/彩色——那就拉成 B 了。⛔ **C 族与 A 族的区别**：A 保留少量 `H0` 彩色（焦点浅底、是/否分支标签着色）；C **一点彩色都没有**，纯靠黑/灰/白 + 边框粗细 + 字重(400/600/800)分层次，焦点用最粗黑边而非彩底——最贴近纯手绘黑白框图、印刷/复印无损。

**G.1 A 朴素竞赛风 · `:root` 与基础节点骨架**（照抄，`H0` 派生的 `--ac`/`--acbg` 用本篇实际强调色代入）：

```css
html,body{margin:0;padding:0;width:fit-content;height:fit-content;background:transparent}
.fig,.fig *{font-family:"Times New Roman","SimSun","Songti SC","Microsoft YaHei",serif;
  -webkit-font-smoothing:antialiased;box-sizing:border-box}
.fig{width:fit-content;padding:26px 30px;background:transparent;
  --edge:#2b2b2b; --txt:#111; --line:#444;
  --ac:hsl(H0,42%,45%); --acbg:hsl(H0,40%,95%); --no:#b0402f}   /* --ac/--acbg 用本篇 H0 代入 */
.n{border:1px solid var(--edge);background:#fff;color:var(--txt);
  padding:9px 14px;font-size:14px;font-weight:500;text-align:center;
  border-radius:2px;line-height:1.4}                            /* 直角、白底、无阴影、无副标题 */
.n.focus{border:1.6px solid var(--ac);background:var(--acbg);color:var(--ac);font-weight:700}
.grp{border:1.3px dashed var(--edge);border-radius:3px;padding:11px 13px;
  display:flex;flex-direction:column;gap:9px;align-items:center}  /* 黑虚线分组框 */
```

**G.2 B 现代精致风 · `:root` 与基础节点骨架**（照抄）：

```css
html,body{margin:0;padding:0;width:fit-content;height:fit-content;background:transparent}
.fig,.fig *{font-family:"Segoe UI","Helvetica Neue",Arial,"Microsoft YaHei","Noto Sans SC",sans-serif;
  font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;box-sizing:border-box}
.fig{width:fit-content;padding:26px 30px;background:transparent;
  --line:#c4c9d0; --txt:#20242b; --muted:#727880; --nb:#f6f7f9;
  --ac:hsl(H0,45%,42%); --acbg:hsl(H0,40%,95%); --no:#c25a48}    /* --ac/--acbg 用本篇 H0 代入 */
.n{background:var(--nb);border:1px solid var(--line);color:var(--txt);
  padding:9px 14px;font-size:14px;font-weight:600;text-align:center;
  border-radius:5px;line-height:1.35}                            /* 淡灰底、5px微圆、无阴影 */
.n .sub{display:block;font-size:10.5px;font-weight:400;color:var(--muted);margin-top:2px}/* 仅关键节点用 */
.n.focus{background:var(--acbg);border:1.6px solid var(--ac);color:var(--ac)}
.grp{background:#fbfbfc;border:1px solid #e3e6ea;border-radius:7px;padding:11px 13px;
  display:flex;flex-direction:column;gap:9px}                     /* 浅灰实线圆角分组框 */
```

**G.4 C 纯黑白线稿 · `:root` 与基础节点骨架**（照抄，⛔ 全程零彩色、无 `--ac`）：

```css
html,body{margin:0;padding:0;width:fit-content;height:fit-content;background:transparent}
.fig,.fig *{font-family:"Times New Roman","SimSun","Songti SC","Microsoft YaHei",serif;
  -webkit-font-smoothing:antialiased;box-sizing:border-box}
.fig{width:fit-content;padding:26px 30px;background:transparent;
  --edge:#1a1a1a; --txt:#111; --line:#333}                       /* ⛔ 无 --ac/--acbg：纯黑白 */
.n{border:1px solid var(--edge);background:#fff;color:var(--txt);
  padding:9px 14px;font-size:14px;font-weight:600;text-align:center;
  border-radius:0;line-height:1.4}                               /* 直角、白底、纯黑边、无阴影 */
.n.focus{border:1.8px solid #000;font-weight:800}                /* 焦点：最粗黑边+字重800，⛔ 不加彩底 */
.grp{border:1.2px dashed var(--edge);border-radius:0;padding:11px 13px;
  display:flex;flex-direction:column;gap:9px;align-items:center} /* 黑虚线直角分组框 */
```

⛔ **C 族判定/分支/回边也全用黑**：把 G.3 里的 `var(--ac)`/`var(--no)` 一律换成 `#1a1a1a`（判定节点 `.dec` 用 `border:1.6px solid #1a1a1a`；是/否标签 `.lbl`/`.lbl.no` 都用 `color:#1a1a1a`；回边虚线 `.loopback` 边框用 `#1a1a1a`）。层次全靠**边框粗细 + 字重**，不靠颜色。

**G.3 三族共用的连线 / 判定 / 循环回边**（不分族，都照 A 节铁律：判定用圆角矩形不用菱形、回边用虚线示意）：

```css
/* 竖直箭头：细线 + CSS 三角 */
.dn{display:flex;flex-direction:column;align-items:center}
.dn .ln{width:1px;height:19px;background:var(--line)}
.dn .tp{width:0;height:0;border-top:6px solid var(--line);
  border-left:4px solid transparent;border-right:4px solid transparent}
/* 判定节点：圆角矩形 + --ac 边（⛔ 禁旋转菱形，见 A.2 骨架3）；下接是/否分支 */
.n.dec{border:1.6px solid var(--ac);border-radius:6px;font-weight:600}
.branch{display:flex;align-items:flex-start;gap:44px}
.path{display:flex;flex-direction:column;align-items:center}
.lbl{font-size:12px;margin:2px 0}.lbl.no{color:var(--no)}
/* 循环回边：左侧虚线包边 + 竖排文字示意"回到上游"（flex/grid 画不出精确大回环，用此妥协画法） */
.loopwrap{display:flex;align-items:stretch}
.loopback{display:flex;align-items:center;border-left:1.4px dashed var(--no);
  border-top:1.4px dashed var(--no);border-bottom:1.4px dashed var(--no);
  border-radius:3px 0 0 3px;padding:0 7px;margin-right:8px}
.loopback .txt{writing-mode:vertical-rl;font-size:11px;color:var(--no);letter-spacing:1px}
```

⛔ **G.3 竖排回边文字禁塞公式**（`\(P_{t+1}\)` 之类）：KaTeX 渲染后会撑高被裁（真实翻车过）。回边文字用纯中文短语（如"↑ 产生下一代种群"），公式留给横排节点。

**G.5 对齐骨架（⛔ 三族通用，防"参差/错位/大小不一"——照抄，别手写 width）**

⛔⛔ **对齐要"治本(grid) + 兜底(标记自检)"双保险**：①**治本**——对齐必须在写 HTML 时用下面的骨架从结构上保证(grid+1fr/stretch)，不靠出图后补救；②**兜底**——给"本应对齐成一列/一行"的元素打 `data-mh-col="k"` / `data-mh-row="k"` 标记后，`--geom-check` 会**测量它们中轴坐标是否真对齐**(极差 >4px 判 FAIL、退出码1)，把手写 width/margin 造成的"差几像素错位"精确抓出来——这是 geom-check 新增的第 4 类检测（前 3 类：溢出/越界/重叠）。

```css
/* ① 一组并列节点(同一行或同一列)：必须放进同一个 grid 容器，自动等宽等高 */
.rowgrid{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:14px;align-items:stretch}
.colgrid{display:grid;grid-auto-flow:row;gap:12px;justify-items:stretch}
/* ② 多行多列矩阵：用 grid 显式列数，行列天然对齐(禁多个 flex 手排) */
.matrix{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;align-items:stretch;justify-items:stretch}
/* ③ 节点在 stretch 下自动等尺寸；文字多的靠内部换行，禁写不同 width 硬凑 */
.n{width:auto;min-width:0}          /* ⛔ 禁 width:120px 之类固定值；等宽交给 grid 的 1fr */
```

**三条硬规则（对应 D.1 ④，出图后眯眼再核一遍）**：
1. **并列必等尺寸**：任何"横排/竖排的一组同级节点"一律进 `grid` + `1fr`/`stretch`，绝不靠手写不同 `width`；文字多少不同就靠 `min-width:0` + 内部换行拉齐。
2. **行列必对齐**：多行多列一律 `display:grid`（`grid-template-columns:repeat(N,1fr)`），禁止多个 `flex` 行手排（行与行会错位）。
3. **边缘必成线**：各分区/各行左右边缘对齐成一条线；箭头接节点中轴（横排 `align-items:center`、竖排 `justify-items:center`）。做不到 = 没用 grid/stretch 在硬凑，回去改结构。
4. ⛔ **给对齐意图打标记（让 geom-check 兜底验证）**：主干/纵列上**每个应竖直对齐的节点 + 中间的竖箭头/连线**都加 `data-mh-col="1"`（同一列用同一个值，第二列用 `"2"`…）；**每个应水平对齐的同行节点**加 `data-mh-row="1"`。⛔ **只给"确实该对齐成一条线"的元素打**——错落设计、不同列的节点别打同一个值（否则会被误判错位）。竖箭头是无文字的 `div` 也照打，正好验证"箭头接在节点中轴"。打了标记后 `--geom-check` 会量它们中轴坐标：grid 锁死的组极差≈0-1px 直接过；手写 width/margin 挪出的错位会被抓成 FAIL。**标记不影响渲染观感**（`data-*` 是纯语义属性），只为让确定性自检生效。

<!-- data-mh 对齐标记示例：主干三节点+两箭头声明同一列，geom-check 验证中轴一致 -->
```html
<div class="colgrid">
  <div class="n" data-mh-col="1">① 数据预处理</div>
  <div class="v-arrow" data-mh-col="1"></div>   <!-- 竖箭头无文字也打，验证接中轴 -->
  <div class="n" data-mh-col="1">② 特征建模</div>
  <div class="v-arrow" data-mh-col="1"></div>
  <div class="n" data-mh-col="1">③ 求解验证</div>
</div>
```

⛔ **G 节收尾自检**：出图前确认——① 字体族对不对（A/C 衬线 / B 无衬线）② A 族有没有混进灰底/圆角>2px/副标题/阴影 ③ B 族有没有残留柔和阴影或满屏副标题 ④ **C 族有没有残留任何彩色**（`hsl(...)`/`--ac`/`--acbg` 都不该出现，焦点靠黑边+字重而非彩底；判定/分支/回边全黑）⑤ A/B 族的 `--ac`/`--acbg` 都由本篇 `H0` 代入、没写死示例色。有一条不符 = 风格族没落实，改。

