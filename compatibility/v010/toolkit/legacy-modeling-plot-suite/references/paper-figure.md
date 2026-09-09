---
name: paper-figure
description: "Generate publication-quality figures and tables from experiment results. Use when user says \"画图\", \"作图\", \"generate figures\", \"paper figures\", or needs plots for a paper."
argument-hint: [figure-plan-or-data-path]
allowed-tools: Bash(*), Read, Write, Edit, Grep, Glob, Agent, mcp__codex__codex, mcp__codex__codex-reply
---

# Paper Figure: Publication-Quality Figure Generation

Generate figures and tables from data: **$ARGUMENTS**

## Constants

- **FIG_DIR = `figures/`**
- **FORMAT = `pdf`** (vector, suitable for LaTeX)
- **DPI = 300**
- **CUSTOM_REQUIREMENTS** — User-specified requirements, highest priority.

<tools_and_style>
## Tools and Style

`shared-scripts/plot_utils.py` is the **MANDATORY** style baseline. Every `gen_fig_*.py` script **MUST** begin with `from _utils.plot_utils import setup_style, save_fig, PALETTE, COLORS; setup_style()`.

⛔ **风格随机化（去指纹，自动，无需你操心）**：裸调 `setup_style()`（即 `palette='auto'`）时，plot_utils 会按**工作区目录名的确定性种子**自动选配色（从 28 套精选配色池）+ 派生字体/边框/网格/图例/线宽/marker/描边——**同一篇所有图统一、不同篇各异、重跑不变**。你**照常**用 `PALETTE[n]` / `COLORS[...]` 取色即可，无需也不要在脚本里手动指定配色名或写死风格（那会破坏随机）。若用户在前端手选了固定配色，plot_utils 会自动读 `CLAUDE.md` 的 `MH_DATA_FIG_PALETTE` 覆盖，你同样无感。

**After `setup_style()` you have full creative freedom**:
- ✅ Use plot_utils helper functions (`heatmap`, `bar_compare`, `forest_plot`, ...) for common chart types
- ✅ OR use **raw matplotlib / seaborn** for any chart type not in plot_utils (Sankey, Treemap, 3D, Bivariate Choropleth, custom layouts ...)
- ✅ Use `PALETTE[n]` / `COLORS['up'/'down'/'highlight'/'ref_line'/'grid'/'text']` as the primary color source
- ✅ **A small number of hand-picked coordinated hex colors are OK** for special highlights / reference lines (≤ 2 per figure, must visually harmonize with the active palette)
- ❌ Never use matplotlib's `tab10` defaults — bright blue `#1f77b4`, orange `#ff7f0e`, green `#2ca02c` are the unmistakable "default style" reviewers spot in 1 second
- ❌ Never use CSS bright color names (`'blue'`, `'red'`, `'green'`, `'orange'`) — same `tab10` aesthetic
- ❌ Never use ugly colormaps (`RdYlGn` traffic-light, `RdBu_r` too dark, `dark_background` theme)

⛔⛔ **The real rule**: figures must NOT look like "ran with matplotlib defaults". `setup_style()` 已按种子随机换上 28 套精选学术配色之一（Okabe-Ito / Tol / Nord / 莫兰迪 / 期刊风等，均为出版级、避开 tab10 默认色）。你用 `PALETTE[n]` / `COLORS[...]` 取色即可自动跟随本篇被随机选中的那套；可再加 ≤2 个协调高亮色。禁止的是那套"从没自定义过"的 matplotlib 默认组合。

**Quality floor**: 300 DPI PDF, no in-figure title (`plt.title`), font ≥9pt, grayscale-distinguishable, **`figure_check.sh` exit code 0** (CRITICAL only — INFO/WARNING don't block).

**Color palette and recipes**: read `_utils/figure_style_guide.md` (color schemes) and `_utils/figure_recipes_*.md` (code examples).

plot_utils functions: `setup_style`, `save_fig`, `heatmap`, `forest_plot`, `trend_plot`, `bar_compare`, `distribution_plot`, `scatter_plot`, `residual_diagnostic`, `multi_line_plot`, `box_plot`, `radar_plot`, `subplot_grid`

Stats tables: `stats_utils.py` provides `regression_table`, `descriptive_table`, `correlation_table`.
</tools_and_style>

## ⛔⛔⛔ Output Contract (highest priority)

**Must produce all planned figures (per PAPER_PLAN.md or skill-specific plan)** as `figures/fig_*.png/pdf` plus `figures/latex_includes.tex` (or, in docx mode, the same PNGs without latex_includes.tex requirement).

⛔ **数据图命名规范**：本步骤画的是**数据图**（柱状/折线/热力/散点等），命名 `fig_<语义>`，但**避开架构/流程图专用前缀**：`fig_arch` / `fig_flow` / `fig_roadmap` / `fig_pipeline` / `fig_framework` / `fig_network` / `fig_state` / `fig_decision` / `fig_overview` 等（这些归 paper-figure-drawio）。例如流速图用 `fig_velocity` 而非 `fig_flow_rate`、状态分布用 `fig_status_dist` 而非 `fig_state_traj`。否则本步骤的产出对账会把它当架构图跳过，导致漏画不报错。

⛔ **特殊豁免**：如果 PAPER_PLAN.md 明确写"无图表"或图表清单为空（纯文字综述/思辨论文），允许 figures/ 为空，但**必须**写一个空的 `figures/latex_includes.tex` (`touch figures/latex_includes.tex; mkdir -p figures`) 让下游知道这步跑过了。

⛔ **MUST run output verification before ending**:
```bash
PASS=true
mkdir -p figures
FIG_PNG=$(ls figures/fig_*.png 2>/dev/null | wc -l)
FIG_PDF=$(ls figures/fig_*.pdf 2>/dev/null | wc -l)
TOTAL=$((FIG_PNG + FIG_PDF))

# ⛔⛔⛔ 优先按 FIGURE_MANIFEST 对账 (规划了几张就必须画几张, 少一张都报错)
PLAN_FILE=""
for f in PROBLEM_ANALYSIS.md PAPER_PLAN.md MODELING_REPORT.md; do
  [ -f "$f" ] && grep -q '<!-- BEGIN FIGURE_MANIFEST -->' "$f" && { PLAN_FILE="$f"; break; }
done

if [ -n "$PLAN_FILE" ]; then
  START=$(grep -n '<!-- BEGIN FIGURE_MANIFEST -->' "$PLAN_FILE" | head -1 | cut -d: -f1)
  END=$(grep -n '<!-- END FIGURE_MANIFEST -->' "$PLAN_FILE" | head -1 | cut -d: -f1)
  # ⛔ 只对「数据图」硬对账。流程/架构/路线图和 tikz_ 由 paper-figure-drawio 子流程产出，
  # 不属于本步骤职责。按 manifest「数据图章节」标题抓该章节下的图名(权威), 不靠前缀排除——
  # 旧排除法对 fig_data_pipeline/fig_model_arch 这类「关键词在中间」的架构图排不掉, 会把它们
  # 误当数据图纳入对账 → 本步骤因"缺架构图"永远自检不过而空转。按章节抓则精准只对数据图。
  EXPECTED_FIGS=$(sed -n "${START},${END}p" "$PLAN_FILE" | awk '
      /^[[:space:]]*\*\*/ {
          if ($0 ~ /数据图/ || tolower($0) ~ /matplotlib|gen_fig/) cap=1; else cap=0;
          next
      }
      cap && match($0, /^[[:space:]]*-[[:space:]]+fig_[a-zA-Z0-9_]+/) {
          s=substr($0, RSTART, RLENGTH); sub(/^[[:space:]]*-[[:space:]]*/, "", s); print s
      }')
  TOTAL_EXPECTED=$(echo "$EXPECTED_FIGS" | grep -c . )
  MISSING_FIGS=""
  for name in $EXPECTED_FIGS; do
    ls figures/${name}.png figures/${name}.pdf figures/${name}.drawio 2>/dev/null | head -1 | grep -q . || MISSING_FIGS="$MISSING_FIGS $name"
  done
  MISSING_COUNT=$(echo "$MISSING_FIGS" | wc -w)
  if [ "$MISSING_COUNT" -gt 0 ]; then
    echo "❌ FIGURE_MANIFEST 对账失败(仅数据图): 规划 $TOTAL_EXPECTED 张, 缺失 $MISSING_COUNT 张:"
    for m in $MISSING_FIGS; do echo "    - $m"; done
    echo "⛔ 必须把这些数据图全部产出才能结束 paper-figure 步骤(流程/架构/路线图由 paper-figure-drawio 负责, 不在此列)"
    PASS=false
  else
    echo "✅ FIGURE_MANIFEST 数据图全部产出: $TOTAL_EXPECTED 张(流程/架构图归 paper-figure-drawio)"
  fi
else
  # 没有 MANIFEST 时退回旧的宽松检查
  PLAN_HAS_FIG=$(grep -E '^\s*-?\s*fig_|图表清单|figures/fig_' PAPER_PLAN.md PROBLEM_ANALYSIS.md 2>/dev/null | wc -l)
  if [ "$TOTAL" -ge 1 ]; then
    echo "✅ figures/fig_*.png/pdf ($TOTAL) [no FIGURE_MANIFEST, weak check]"
  elif [ "$PLAN_HAS_FIG" -eq 0 ]; then
    echo "✓ 规划无图表, 创建占位 latex_includes.tex"
    touch figures/latex_includes.tex
  else
    echo "❌ 规划要求图表但未生成"
    PASS=false
  fi
fi

# 半完成状态检测: 数据备好但没画图
HAS_PLOT_DATA=$([ -f figures/_plot_data.json ] && echo 1 || echo 0)
HAS_GEN_FIG=$(ls figures/gen_fig_*.py 2>/dev/null | wc -l)
HAS_PREP_DATA=$(ls figures/prep_plot_data.py figures/prep_*.py 2>/dev/null | wc -l)
if [ "$HAS_PLOT_DATA" -eq 1 ] && [ "$HAS_GEN_FIG" -eq 0 ]; then
  echo "❌ 半完成: _plot_data.json 存在但 gen_fig_*.py 全无 (备好食材没下锅)"
  PASS=false
fi
if [ "$HAS_PREP_DATA" -ge 1 ] && [ "$HAS_GEN_FIG" -eq 0 ]; then
  echo "❌ 半完成: prep_plot_data.py 存在但 gen_fig_*.py 全无 (数据准备完没画图)"
  PASS=false
fi

MODE=$(grep -q "Word（.docx）\|docx mode" CLAUDE.md 2>/dev/null && echo docx || echo pdf)
if [ "$MODE" = "pdf" ] && [ ! -f figures/latex_includes.tex ]; then
    touch figures/latex_includes.tex
fi
[ "$PASS" != true ] && echo "⛔ Output verification FAILED — must complete before ending"
```

## Workflow

### Step 0: 恢复检查（断线重跑必读）

⛔ **本步骤可能因为断线/手动重跑被多次启动**。每次启动前**必须**先扫描已有产物 + **按 FIGURE_MANIFEST 对账**：

```bash
echo "=== 工作区扫描 ==="
HAS_PNG=$(ls figures/fig_*.png 2>/dev/null | wc -l)
HAS_PDF=$(ls figures/fig_*.pdf 2>/dev/null | wc -l)
HAS_TIKZ=$(ls figures/tikz_*.pdf 2>/dev/null | wc -l)
HAS_DRAWIO=$(ls figures/fig_*.drawio 2>/dev/null | wc -l)
HAS_GEN_FIG=$(ls figures/gen_fig_*.py 2>/dev/null | wc -l)
HAS_PLOT_DATA=$([ -f figures/_plot_data.json ] && echo 1 || echo 0)
HAS_PREP_DATA=$(ls figures/prep_plot_data.py figures/prep_*.py 2>/dev/null | wc -l)
HAS_INCLUDES=$([ -f figures/latex_includes.tex ] && wc -c < figures/latex_includes.tex || echo 0)
TOTAL_FIG=$((HAS_PNG + HAS_PDF))
echo "  fig_*.png: $HAS_PNG, fig_*.pdf: $HAS_PDF, tikz_*.pdf: $HAS_TIKZ, fig_*.drawio: $HAS_DRAWIO"
echo "  gen_fig_*.py: $HAS_GEN_FIG, prep_*.py: $HAS_PREP_DATA, _plot_data.json: $HAS_PLOT_DATA"
echo "  latex_includes.tex: $HAS_INCLUDES bytes"
```

#### ⛔ FIGURE_MANIFEST 对账（必须跑）

```bash
echo ""
echo "=== FIGURE_MANIFEST 对账 ==="
PLAN_FILE=""
for f in PROBLEM_ANALYSIS.md PAPER_PLAN.md MODELING_REPORT.md; do
  [ -f "$f" ] && grep -q '<!-- BEGIN FIGURE_MANIFEST -->' "$f" && { PLAN_FILE="$f"; break; }
done

if [ -z "$PLAN_FILE" ]; then
  echo "⚠ 没找到 FIGURE_MANIFEST 区块 (PROBLEM_ANALYSIS.md 等都不含)"
  echo "  说明上游赛题分析阶段没产出图表清单 → 退而求其次, 用 fig_/tikz_ 数粗略对账"
  # 先数所有 fig_, 再减去 drawio/scene 类型
  ALL_FIG_REFS=$(grep -ohE 'fig_[a-zA-Z0-9_]+' PAPER_PLAN.md PROBLEM_ANALYSIS.md MODELING_REPORT.md 2>/dev/null | sort -u | wc -l)
  DRAWIO_REFS=$(grep -ohE 'fig_(roadmap|flow_q[0-9]+|pipeline|index_[a-zA-Z0-9_]+|gantt|network|framework|model_decision|scene)' PAPER_PLAN.md PROBLEM_ANALYSIS.md MODELING_REPORT.md 2>/dev/null | sort -u | wc -l)
  EXPECTED_DATA=$((ALL_FIG_REFS - DRAWIO_REFS))
  [ "$EXPECTED_DATA" -lt 0 ] && EXPECTED_DATA=0
  echo "  估算需要的数据图: $EXPECTED_DATA"
else
  echo "✅ 找到 FIGURE_MANIFEST: $PLAN_FILE"
  START=$(grep -n '<!-- BEGIN FIGURE_MANIFEST -->' "$PLAN_FILE" | head -1 | cut -d: -f1)
  END=$(grep -n '<!-- END FIGURE_MANIFEST -->' "$PLAN_FILE" | head -1 | cut -d: -f1)
  MANIFEST=$(sed -n "${START},${END}p" "$PLAN_FILE")

  # 提取每个 fig_xxx / tikz_xxx 名字
  ALL_MANIFEST_FIGS=$(echo "$MANIFEST" | grep -oE '^[[:space:]]*-[[:space:]]+(fig_[a-zA-Z0-9_]+|tikz_[a-zA-Z0-9_]+)' | sed 's/^[[:space:]]*-[[:space:]]*//')
  # ⛔ 拆成「数据图」与「流程/架构图(drawio/tikz)」两类。本步骤只对数据图硬对账，
  # drawio/tikz 类由 paper-figure-drawio / TikZ 子流程负责，缺它们不算本步骤失败(否则空转)。
  DRAWIO_PREFIXES='^(fig_arch|fig_flow|fig_roadmap|fig_pipeline|fig_framework|fig_er|fig_overview|fig_system|fig_module|fig_index|fig_hierarchy|fig_multiagent|fig_topology|fig_dataflow|fig_pkg|fig_class|fig_seq|fig_gantt|fig_network|fig_model_decision|fig_decision|fig_state|fig_uml|tikz_)'
  EXPECTED_FIGS=$(echo "$ALL_MANIFEST_FIGS" | grep -vE "$DRAWIO_PREFIXES")
  DRAWIO_FIGS=$(echo "$ALL_MANIFEST_FIGS" | grep -E "$DRAWIO_PREFIXES")
  echo "  规划数据图(本步骤负责)："
  echo "$EXPECTED_FIGS" | grep . | sed 's/^/    /'
  [ -n "$(echo "$DRAWIO_FIGS" | grep .)" ] && { echo "  流程/架构图(由 paper-figure-drawio 负责, 本步骤不检查)："; echo "$DRAWIO_FIGS" | grep . | sed 's/^/    /'; }

  # 逐条检查数据图产物是否存在 (任意一种格式都算: .png / .pdf / .drawio)
  MISSING_FIGS=""
  for name in $EXPECTED_FIGS; do
    if ls figures/${name}.png figures/${name}.pdf figures/${name}.drawio 2>/dev/null | head -1 | grep -q .; then
      :
    else
      MISSING_FIGS="$MISSING_FIGS $name"
    fi
  done
  MISSING_COUNT=$(echo "$MISSING_FIGS" | wc -w)
  TOTAL_EXPECTED=$(echo "$EXPECTED_FIGS" | grep -c . )
  echo ""
  echo "  数据图规划: $TOTAL_EXPECTED 张, 已产出: $((TOTAL_EXPECTED - MISSING_COUNT)) 张, 缺失: $MISSING_COUNT 张"
  if [ "$MISSING_COUNT" -gt 0 ]; then
    echo "  ❌ 缺失的数据图:"
    for m in $MISSING_FIGS; do echo "    - $m"; done
    echo ""
    echo "  ⛔ 必须把上面所有缺失的数据图都生成出来才能结束本步骤(流程/架构图不在此列)."
  else
    echo "  ✅ 数据图全部产出(流程/架构图归 paper-figure-drawio)"
  fi
fi
```

**根据扫描结果决定行动**：

| 状态 | 行动 |
|---|---|
| FIGURE_MANIFEST 对账显示 **MISSING_COUNT > 0** | ⛔⛔⛔ **逐张补齐**：每个缺失的 `fig_xxx` 必须按其在规划文档里的描述去生成。`fig_flow_q*` / `fig_roadmap` / `fig_pipeline` 等 drawio 类的 → 调 paper-figure-drawio；`tikz_*` → 调 TikZ 子流程；其余数据图 → Step 3 写 `gen_fig_xxx.py` 执行画图 |
| **`_plot_data.json` 存在 + `gen_fig_*.py` 计数为 0** | ⛔ **半完成状态！数据备好了但没画图！** 必须从 Step 3 开始为每组数据生成 `gen_fig_*.py` 真正画出 PNG/PDF。**禁止跳到 Step 9 自我安慰** |
| `gen_fig_*.py` 数 < `_plot_data.json` 里的数据组数 | **数据有 N 组但只画了 M 张**，必须补齐缺失的 gen_fig 脚本 |
| `TOTAL_FIG < PLAN_FIG_COUNT` 且 `gen_fig_*.py == 0` | **图全是 drawio 流程图，缺核心数据图**。检查 `figures/*.json` 数据，写 gen_fig 脚本补齐 |
| MANIFEST 全部产出 + latex_includes.tex 存在 | **跳到 Step 9 验证**，验证通过即完成 |
| latex_includes.tex 缺失但图都在 | **只生成 Step 6 的 latex_includes.tex** |
| 啥都没有 | 从 Step 1 开始 |

⛔⛔⛔ **半完成自检（最容易跳过）**：

如果你看到工作区有以下任一组合，**绝对不允许结束**：

1. FIGURE_MANIFEST 规划了 N 张但实际产出 < N → **少一张都不行**
2. `figures/_plot_data.json` 存在 但 `figures/gen_fig_*.py` 不存在 → 「备好食材没下锅」
3. `figures/*_results.json` ≥ 1 个 但 `figures/fig_*.png/pdf` 全是 drawio 流程图 → 「核心数据图没生成」
4. `prep_plot_data.py` 存在但 `gen_fig_*.py` 不存在 → 「数据准备完没真正画图」

碰到上述任意一种 → **跳到 Step 3 强制为每组数据生成 gen_fig 脚本，逐个执行产出 PNG/PDF**。
不允许靠"我已经有图了"来糊弄过去 — 数据图和流程图是两种东西，缺一不可。

**⛔ 参数密集型题目必跑（题面参数 ≥ 20 时）：图脚本审计**

```bash
# Step 4 末尾：检查图标签单位 / 图例与 facts 实体名匹配 / 图脚本数据来源
# ⛔ 先判文件存在再跑：不能写成 `[ -f ... ] && python|tee` 后取 $?——
#   ①有 `| tee` 时 $? 取的是 tee 的码(恒0)，会吞掉 facts_audit 的 FAIL；
#   ②文件不存在时 `&&` 短路，$? 会取到 `[ -f ]` 的 1 → 误判"审计失败"。
if [ -f PROBLEM_FACTS.json ]; then
    python3 _utils/facts_audit.py --stage figure 2>&1 | tee -a AUDIT_REPORT.md
    FIG_RC=${PIPESTATUS[0]}   # 取管道首命令(facts_audit)的真实退出码
else
    FIG_RC=0                  # 无 PROBLEM_FACTS.json(非参数密集题) → 跳过图脚本审计,不误判失败
fi
if [ $FIG_RC -eq 1 ]; then
    echo "⛔ 图脚本审计失败：xlabel/ylabel 缺单位、图例与 facts 实体名不匹配、或脚本未从 JSON 读数据。请修正后重新跑。"
fi
```

**为什么 Step 4 也要审**：
- xlabel `"时间(s)"` 实际是分钟 → AI 长上下文里很容易蒙混过去
- 图例 `"无人机A"` 但 facts.weapons 里只有 `red_drone_1` → 实体名错位
- `plt.plot([0,5,10], [1.2,3.4,5.6])` 硬编码数据而不是读 JSON

⛔ **铁律**：
- **已有 `figures/fig_*.png/pdf` 不要重画**（覆盖会让审稿人看到的图变了）
- **已有的 `figures/TABLE_*.md/tex` 不要重写**（数据已固化）
- 只补缺失的图 / 表
- **drawio 流程图不能替代数据结果图**：竞赛论文要求技术路线图（drawio）+ 子问题求解流程图（drawio）+ **数据结果图（matplotlib gen_fig）**，三类都要有
- **规划了几张就必须画几张**：FIGURE_MANIFEST 是合同，少一张就是违约

### Step 1: Read paper structure + data discovery

1. Read the full style guide (color schemes + figure selection decision table + anti-patterns + DrawIO/TikZ color schemes — all in one file):
```bash
# ⛔ 直接 cat 整个 figure_style_guide.md (~50KB) 容易把 context 顶到上限触发 thrashing
# 改用 head 取前 1500 行的核心规则部分; 需要更细规则时再 grep 或 Read 工具按需读
(cat _utils/figure_style_guide.md 2>/dev/null || cat skills/shared-scripts/figure_style_guide.md) | head -1500
```
2. Scan recipe file headings to know what templates are available:
```bash
echo "=== Advanced ==="
(cat _utils/figure_recipes_advanced.md 2>/dev/null || cat skills/shared-scripts/figure_recipes_advanced.md 2>/dev/null) | grep '^## '
echo "=== Basic ==="
(cat _utils/figure_recipes_basic.md 2>/dev/null || cat skills/shared-scripts/figure_recipes_basic.md 2>/dev/null) | grep '^## '
echo "=== Academic ==="
(cat _utils/figure_recipes_academic.md 2>/dev/null || cat skills/shared-scripts/figure_recipes_academic.md 2>/dev/null) | grep '^## '
echo "=== Competition ==="
(cat _utils/figure_recipes_competition.md 2>/dev/null || cat skills/shared-scripts/figure_recipes_competition.md 2>/dev/null) | grep '^## '
echo "=== Empirical ==="
(cat _utils/figure_recipes_empirical.md 2>/dev/null || cat skills/shared-scripts/figure_recipes_empirical.md 2>/dev/null) | grep '^## '
echo "=== Basic (fallback only) ==="
(cat _utils/figure_recipes_basic.md 2>/dev/null || cat skills/shared-scripts/figure_recipes_basic.md 2>/dev/null) | grep '^## '
```
3. **⛔ MANDATORY: Extract the COMPLETE figure plan from planning docs.** Read ALL planning docs and extract every planned figure/table into a numbered checklist:
```bash
echo "=== Extracting figure plan (head -800 each, 防 thrashing) ==="
for plan in PAPER_PLAN.md PROBLEM_ANALYSIS.md TOPIC_PLAN.md MODELING_REPORT.md; do
    [ -f "$plan" ] || continue
    echo "--- $plan ---"
    head -800 "$plan"
done
# ⛔ 对完整规划用 Read 工具按需读, 不要 cat 全文.
# FIGURE_MANIFEST 区块的图列表可以用这个精确提取:
for plan in PROBLEM_ANALYSIS.md PAPER_PLAN.md MODELING_REPORT.md; do
    [ -f "$plan" ] || continue
    awk '/<!-- BEGIN FIGURE_MANIFEST -->/,/<!-- END FIGURE_MANIFEST -->/' "$plan" 2>/dev/null
done
```
After reading, output a **FIGURE PLAN CHECKLIST** like this (you MUST produce this before proceeding):
```
FIGURE PLAN CHECKLIST (from planning docs):
[ ] 1. fig_xxx — Descriptive stats distribution (Rain Cloud) — data: results.json
[ ] 2. fig_yyy — Model comparison radar (Radar) — data: results.json
[ ] 3. fig_zzz — Regression coefficient forest plot (Forest Plot) — data: results.json
[ ] 4. TABLE_desc — Descriptive statistics table — data: results.json
[ ] 5. TABLE_reg — Regression results table — data: results.json
[ ] 6. drawio_roadmap — Technical roadmap (DrawIO)
Total planned: 6 figures + 2 tables + 1 DrawIO
```
**Every item in the plan MUST appear in this checklist. If the plan says "12 figures", the checklist must have 12 entries.**

3.5. **⛔ JSON 数据完整性检查（确保数据能支撑所有图表）：**
```bash
echo "=== JSON 数据完整性检查 ==="
if [ -f figures/all_results.json ]; then
    python3 -c "
import json
with open('figures/all_results.json', 'r') as f:
    data = json.load(f)
# 列出所有顶层 key
keys = list(data.keys()) if isinstance(data, dict) else [f'[{i}]' for i in range(min(len(data), 10))]
print(f'JSON 顶层 key ({len(keys)} 个): {keys}')
# 检查是否有空值
def check_empty(obj, path=''):
    issues = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if v is None or v == '' or v == []:
                issues.append(f'{path}.{k} 为空')
            else:
                issues.extend(check_empty(v, f'{path}.{k}'))
    elif isinstance(obj, list) and len(obj) == 0:
        issues.append(f'{path} 为空列表')
    return issues
issues = check_empty(data)
if issues:
    print(f'⚠ 发现 {len(issues)} 个空值:')
    for i in issues[:5]:
        print(f'  - {i}')
else:
    print('✅ JSON 数据无空值')
" 2>/dev/null
else
    echo "⚠ figures/all_results.json 不存在，图表将缺少数据支撑"
fi
# 检查各子问题的结果文件
for f in figures/problem_*_results.json; do
    [ -f "$f" ] && echo "✅ $(basename $f) 存在" || true
done
```

4. Scan data files (`user_data/` > `figures/` > root). **⛔ 不要 `cat` 或 `print()` 整个 JSON 文件——大 JSON 会撑爆上下文。** 只用以下方式扫描：
```bash
ls -la figures/*.json 2>/dev/null
python3 -c "
import json, os
def summarize(v, depth=0):
    if isinstance(v, list):
        n = len(v)
        nulls = sum(1 for x in v if x is None)
        nums = [x for x in v if isinstance(x, (int,float)) and x is not None]
        if nums:
            return f'list[{n}] nulls={nulls} range=[{min(nums):.4g}, {max(nums):.4g}] sample={v[:3]}'
        elif v and isinstance(v[0], dict):
            return f'list[{n}] of dict, keys={list(v[0].keys())[:8]}'
        return f'list[{n}] sample={str(v[:3])[:100]}'
    elif isinstance(v, dict) and depth < 2:
        items = []
        for k2, v2 in list(v.items())[:6]:
            items.append(f'{k2}: {summarize(v2, depth+1)}')
        return 'dict{' + ', '.join(items) + '}'
    return f'{type(v).__name__}={str(v)[:60]}'

for f in sorted(os.listdir('figures')):
    if not f.endswith('.json'): continue
    sz = os.path.getsize(f'figures/{f}')
    with open(f'figures/{f}') as fh: d = json.load(fh)
    print(f'\n=== {f} ({sz//1024}KB) ===')
    if isinstance(d, dict):
        for k, v in list(d.items())[:10]:
            print(f'  {k}: {summarize(v)}')
    elif isinstance(d, list):
        print(f'  {summarize(d)}')
"
```

Every figure in the plan must be generated — the actual count can exceed the plan but not fall short.

<supplement_mode>
**Supplement mode**: if `figures/` already has ≥3 PDFs + `latex_includes.tex` from a previous step (e.g., experiment-bridge):
1. Compare existing PDFs against the FIGURE PLAN CHECKLIST
2. Check quality of each existing PDF (correct chart type, uses PALETTE, correct language labels)
3. **Regenerate** any figure that fails quality check
4. **Generate** any planned figure that doesn't exist yet
5. **Always generate** DrawIO architecture diagrams
6. **Always regenerate** `latex_includes.tex` to include ALL figures

**Normal mode** (no existing PDFs — this is the default for stats modeling since comp-code only outputs JSON):
Generate all figures from scratch using JSON data in `figures/*.json`.
</supplement_mode>

### Step 1.5: Generate GPT Image figures (non-data figures)

GPT Image 2 can generate high-quality scene diagrams, technical roadmaps, flowcharts, and architecture diagrams — far better than DrawIO.

**1. GPT Image 直接使用，无需预检查：**

API Key 已通过配置文件 `_utils/_gpt_image_config.json` 注入（用户在设置页面配置，后端自动写入）。
**直接调用即可。成功就用，失败 3 次后 DrawIO 兜底。不需要检测 Python 或检查环境变量。**

```bash
# Python 路径：MH_PYTHON 由后端注入，fallback 到系统 python
PYTHON=""; for _c in "$MH_PYTHON" python python3; do [ -z "$_c" ] && continue; if $_c -c "import sys" >/dev/null 2>&1; then PYTHON="$_c"; break; fi; done; [ -z "$PYTHON" ] && PYTHON=python
GPT_IMG=1
echo "GPT_IMAGE: ready (Python=$PYTHON, config=_utils/_gpt_image_config.json)"
```

**2. Determine language:**
```bash
# Check paper language from planning docs（注意：comp_apmcm_zh 是中文赛项，必须先排除）
if grep -qi 'comp_apmcm_zh' CLAUDE.md 2>/dev/null; then
    GPTIMG_LANG="zh"
elif grep -qi 'MCM\|ICM\|APMCM\|comp_mcm\|comp_apmcm\|comp_certcup_en\|comp_shuwei_en' CLAUDE.md 2>/dev/null; then
    GPTIMG_LANG="en"
else
    GPTIMG_LANG="zh"
fi
echo "GPT Image language: $GPTIMG_LANG"
```

**3. Read ALL upstream documents to understand the FINAL methods and results:**
```bash
echo "=== Reading upstream docs for GPT Image prompt construction ==="
cat PROBLEM_ANALYSIS.md 2>/dev/null | head -500
cat MODELING_REPORT.md 2>/dev/null | head -500
cat RESULTS.md 2>/dev/null | head -200
```

**4. Read the GPT Image plan from PROBLEM_ANALYSIS.md:**
```bash
grep -A 30 'GPT Image' PROBLEM_ANALYSIS.md 2>/dev/null
```

**5. For each planned GPTIMG figure, construct a prompt and call the tool.**

**⛔ MANDATORY: 如果 PROBLEM_ANALYSIS.md 中规划了 GPTIMG 图（包含 "GPTIMG-" 或 "GPT Image" 字样），你必须尝试调用 gpt_image.py 生成。不允许跳过、不允许直接用 TikZ 替代。**

执行规则：
1. 检查规划中有几张 GPTIMG 图
2. 对每张图：调用 `python3 _utils/gpt_image.py`（工具内置 3 次重试）
3. 如果 3 次重试全部失败 → 记录到 `_gptimg_failed.txt` → 由 paper-figure-drawio 步骤自行选择最合适的替代方案（DrawIO 或 TikZ，根据图的内容自主判断）
4. **禁止行为：** 看到规划有 GPTIMG 但不调用就直接画替代图。必须先尝试 GPT Image，失败后才能降级

```bash
# ⛔ 强制检查：规划中是否有 GPTIMG 图
GPTIMG_PLAN_COUNT=$(grep -ci 'GPTIMG\|GPT.Image\|场景示意图' PROBLEM_ANALYSIS.md 2>/dev/null || echo 0)
echo "规划中的 GPT Image 图数量: $GPTIMG_PLAN_COUNT"
if [ "$GPTIMG_PLAN_COUNT" -gt 0 ]; then
    echo "⛔ 检测到 $GPTIMG_PLAN_COUNT 张 GPT Image 图规划 — 必须逐张尝试调用 gpt_image.py"
    echo "   失败 3 次后才允许降级（DrawIO 或 TikZ，自行判断哪个更合适）"
    echo "   ❌ 禁止跳过调用直接用替代方案"
fi
```

Claude must construct the prompt BASED ON THE FINAL methods/results from MODELING_REPORT.md (not the initial plan — methods may have changed during modeling/coding). Only write the core scene/layout/content description — language adaptation, style guidelines, and safety rules are automatically injected by the tool.

**⛔ 提示词越简洁，GPT Image 发挥越好。只描述场景和元素，不要写死颜色和布局细节。**

**GPT Image 只用于场景示意图（物理/工程类赛题的问题背景图）。技术路线图、求解流程图、模型架构图使用 DrawIO。**

<gpt_image_prompt_templates>

#### 场景示意图 (fig_scene.png)

仅适用于有具体物理/工程空间场景的赛题（光学、无人机、传感器、交通、热传导等）。
纯数据/统计类赛题不需要。

Claude 根据赛题自由构造 prompt，参考格式：

```
生成一张学术论文插图风格的{场景名}示意图。
{俯视/侧视/3D等距}视角。
画面包含：{元素1}、{元素2}、{元素3}。
用虚线箭头表示{某种关系/流向}，用不同颜色区分{不同类别}。
包含图例说明各颜色含义。
```

⛔ 约束：
- 不超过 6 个视觉元素
- 不生成真人面孔/肖像——需要人物时用抽象图标
- 必须包含图例框解释颜色含义
- 尺寸标注用数学变量（R, H, L）不用具体数字

</gpt_image_prompt_templates>

**6. Execute GPT Image calls (max 3 retries per figure, handled by the tool):**

```bash
GPTIMG_FAILED=""

# For each planned figure, call gpt_image.py
# Example (Claude generates the actual calls based on the plan):
$PYTHON _utils/gpt_image.py \
  --prompt "Generate a structured technical roadmap..." \
  --output figures/fig_roadmap.png \
  --lang $GPTIMG_LANG \
  --aspect-ratio 9:16 \
  --max-retries 3

if [ -f figures/fig_roadmap.pdf ]; then
    echo "✅ fig_roadmap generated via GPT Image 2"
else
    echo "❌ fig_roadmap FAILED after 3 retries — will use DrawIO fallback"
    GPTIMG_FAILED="$GPTIMG_FAILED fig_roadmap"
    GPTIMG_TOTAL_FAILURES=$((GPTIMG_TOTAL_FAILURES + 1))
fi

# Repeat for each GPTIMG figure...
# ⛔ 每张图独立重试 3 次（--max-retries 3），不要因为一张图失败就跳过后面的图
```

**7. Record failures for DrawIO fallback (persist to file for paper-figure-drawio step).**

```bash
# 统计结果
GPTIMG_TOTAL_PLANNED=$(echo "$GPTIMG_PLANNED" | wc -w)  # 计划生成的图数量
GPTIMG_TOTAL_FAILURES=${GPTIMG_TOTAL_FAILURES:-0}

echo "$GPTIMG_FAILED" > figures/_gptimg_failed.txt

# ⛔ 只有在 Python 不存在时才写 DISABLED
# 如果 Python 存在但 API Key 没配置或网络不通，所有图都会失败 → 写 ALL_FAILED（不是 DISABLED）
# 这样下一步 DrawIO 会为所有失败的图生成替代品
if [ "$GPT_IMG" -eq 0 ]; then
    # Python 不存在，完全跳过了 GPT Image
    echo "GPT_IMG_DISABLED" > figures/_gptimg_status.txt
elif [ -z "$GPTIMG_FAILED" ]; then
    # 所有图都成功了
    echo "ALL_SUCCESS" > figures/_gptimg_status.txt
elif [ "$GPTIMG_TOTAL_FAILURES" -ge "$GPTIMG_TOTAL_PLANNED" ] 2>/dev/null; then
    # 所有图都失败了（可能是 API Key 没配置或网络不通）
    echo "ALL_FAILED" > figures/_gptimg_status.txt
    echo "⚠ 所有 GPT Image 图都失败了，可能是 API Key 未配置或网络问题，DrawIO 将生成所有替代图"
else
    # 部分成功部分失败
    echo "SOME_FAILED" > figures/_gptimg_status.txt
fi
```

Status meanings:
- `ALL_SUCCESS` → all GPT Image figures generated, DrawIO only generates figures NOT in the GPT Image plan
- `SOME_FAILED` → DrawIO generates replacements ONLY for the failed figures
- `ALL_FAILED` → all attempts failed (API Key missing / network error), DrawIO generates ALL non-data figures
- `GPT_IMG_DISABLED` → Python not found, DrawIO generates ALL non-data figures

**8. GPT Image 生成后自检：**

对每张成功生成的 GPT Image 图，检查：
```bash
for img in figures/fig_scene*.pdf figures/fig_gptimg*.pdf; do
    [ -f "$img" ] || continue
    bn=$(basename "$img")
    sz=$(wc -c < "$img")
    echo "=== $bn ($sz bytes) ==="
    # 文件大小检查：GPT Image 生成的 PDF 通常 > 50KB
    if [ "$sz" -lt 50000 ]; then
        echo "❌ $bn 文件过小 ($sz bytes)，可能是空白或损坏"
    else
        echo "✅ $bn 文件大小正常"
    fi
done
```

⛔ GPT Image 无法做内容级自检（不能读取图片内容），但必须确保：
- PDF 文件存在且 > 50KB
- 如果生成的是 PNG，确认已自动转换为 PDF（LaTeX 需要 PDF）
- 失败的图记录到 GPTIMG_FAILED，DrawIO 子阶段会自动兜底

### Step 2: Figure type decisions

Browse the recipe library (97 total across 5 files) and the `<figure_selection_guide>` decision table from the style guide. For each planned figure:

1. Identify the data characteristic (e.g., "3 methods × 4 metrics comparison")
2. Browse ALL available recipe types — don't default to the same few charts every time
3. Pick the type that best fits the data AND looks visually distinct from other figures in this paper
4. Ensure visual variety: do not use the same chart type more than 2 times in one paper. Mix basic, advanced, competition, and empirical recipes
5. Read the full code example from the matched recipe file
6. Select the color palette based on paper domain

**⛔ Do NOT always default to grouped bar / lollipop / line chart.** The recipe library has 97 chart types — use the variety. For any data shape, there are usually 3-5 suitable types. Pick the one that's most visually interesting AND hasn't been used yet in this paper.

Reference `_utils/figure_exemplars.md` for figure distribution examples by paper type. Decide count and placement autonomously.

### Step 2.5: Detailed figure type planning (variety check)

For each planned figure, create a Figure Type Audit Table. The "Chosen Type" should be your autonomous choice from the full recipe library — the examples below are just illustrations, not fixed recommendations:

```
| # | Data Description | Chosen Type | Why | Recipe Ref |
|---|-----------------|-------------|-----|------------|
| 1 | 4 methods × 3 metrics | (your choice from library) | (your reasoning) | (recipe #) |
| 2 | ablation results | (your choice) | | |
| 3 | feature importance | (your choice) | | |
| ... | ... | ... | ... | ... |
```

**Variety check**: count unique chart types in the table. If < 4 unique types for a paper with ≥6 figures, go back and swap some for alternatives from the recipe library. Browse recipe headings again if needed.

### Step 3: Generate figure scripts

One `gen_fig_xxx.py` script per figure, executed from workspace root. Each script starts with `_utils` initialization and `setup_style()` call.

**MANDATORY**: Before writing each script, you MUST extract the matched recipe code using `get_recipe.py`. Copy the recipe code as the starting point, then adapt it to the actual data. Do NOT write figure scripts from scratch — the recipes contain critical styling details (gradient fills, KDE backgrounds, annotation boxes, layered visuals) that you will miss if you write from memory.

**⛔ Subfigure 组合图实现（当 FIGURE_MANIFEST 标了 `[2-panel]` / `[4-panel]`）**：

读 MANIFEST 时识别 panel 标注，生成的 PDF 内部已包含多 panel：

```python
# 例：fig_q2_residual_diag [4-panel]  → 用 plt.subplots(2, 2)
fig, axes = plt.subplots(2, 2, figsize=(5.0, 4.9))   # ⛔ 2×2 属「近方图」上页只显示 4.55in → 原生给 5.0in（写 7.2 会缩到 0.63、写 10 缩到 0.53）
fig.tight_layout(pad=1.2)
# 每个 subplot 加 (a)(b)(c)(d) 标签（短标签紧贴左上角）
for i, ax in enumerate(axes.flat):
    ax.set_title(f'({chr(97+i)})', fontsize=11, fontweight='bold', loc='left', pad=3)
# (a) Q-Q 图
axes[0,0].scatter(theoretical, sample, ...); axes[0,0].set_xlabel('理论分位数')
# (b) 残差-拟合
axes[0,1].scatter(fitted, resid, ...)
# (c) 直方图
axes[1,0].hist(resid, bins=30)
# (d) 残差-时间
axes[1,1].plot(time, resid)
save_fig(fig, 'figures/fig_q2_residual_diag.pdf')

# 例：fig_q3_method_cmp [2-panel]  → 用 plt.subplots(1, 2)
fig, axes = plt.subplots(1, 2, figsize=(6.0, 2.8))   # ⛔ 1×2 属横图上页显示 5.53in → 原生给 6.0in（别写 11）
axes[0].plot(iters, ga_obj, label='GA'); axes[0].set_title('(a)', loc='left')
axes[1].bar(['GA','SA'], [42.3, 67.8]);    axes[1].set_title('(b)', loc='left')
fig.tight_layout()
save_fig(fig, 'figures/fig_q3_method_cmp.pdf')
```

**关键点**：
- multi-panel 在**单个 PDF 内**实现（不是写两张 PDF），下游 LaTeX 用一个 `\includegraphics` 引用即可
- panel 数量 ≤ 4。**⛔ 按长宽比档位定宽：1×2 横排 `(6.0, 2.8)`；2×2 属「近方图」只给 `(5.0, 4.9)`。**
  ⛔ **绝不要写 10/11/12** —— 原生 10in 会被缩到 0.53，刻度 8.5pt 变 4.5pt、线 lw0.6 变 0.32pt，
  肉眼就是"坐标轴糊成一团、线条发虚"（实测翻车：国赛A题 `fig_q4_snapshots`）。
  ⛔ 也别写 7.2 就以为安全：**2×2 是近方图，上页只显示 4.55in**，7.2in 仍被缩到 0.63、刻度变 5.4pt。
  panel 显得挤就减 panel 数或简化内容，**不要靠摊大画布**——摊得越大缩得越狠，字反而更小。
  ⛔ 2×2 还要注意：**只在下排标 xlabel、左列标 ylabel**（画布收小后上排 xlabel 会撞下排 title，实测过），
  并用 `MaxNLocator(nbins=5)` 限刻度档数。
- 每 panel 内部小标题 `(a) (b)` 短标签，用 `loc='left'` 紧贴左上
- 详细描述（如"Q-Q 图检验正态性"）放主 figure 的 LaTeX `\caption{}`，不要塞进 ax 标题
- save_fig 文件名仍按 MANIFEST 名（`fig_xxx.pdf` 单文件），LaTeX 引用时整张图作为 `\includegraphics`

**★★ 第一步就把本题用到的配方【一次全预取】到一个文件**（强烈建议，别逐张取）。
实测教训：逐张取要跑十几次命令，嫌麻烦就容易跳过，然后凭印象硬写——规划写着"等高线图
(competition #14)"，凭印象写出来成了横向条形图，进阶图型全退化成 plot/bar/scatter。
下面一条命令解决，之后写每张图只要翻这一个文件：

```bash
# 从规划里自动抓出所有配方号，一次全取到 _utils/RECIPES_FOR_THIS_PAPER.md
PLAN=""; for pf in PROBLEM_ANALYSIS.md TOPIC_PLAN.md PAPER_PLAN.md; do
    [ -f "$pf" ] && PLAN="$PLAN $pf"
done
PYTHON=""; for _c in "$MH_PYTHON" python python3; do
    [ -z "$_c" ] && continue; command -v "$_c" >/dev/null 2>&1 && PYTHON="$_c" && break
done
grep -ohE '\((basic|advanced|empirical|competition|academic)[[:space:]]*#[[:space:]]*[0-9]+\)' $PLAN 2>/dev/null \
  | tr -d '()' | sed 's/#[[:space:]]*/ /' | tr -s ' ' | sort -u \
  | while read -r cat num; do
        echo "########## $cat #$num ##########"
        "$PYTHON" _utils/get_recipe.py "$cat" "$num" 2>/dev/null \
            || "$PYTHON" skills/shared-scripts/get_recipe.py "$cat" "$num" 2>/dev/null
        echo
    done > _utils/RECIPES_FOR_THIS_PAPER.md
echo "已预取 $(grep -c '^##########' _utils/RECIPES_FOR_THIS_PAPER.md 2>/dev/null || echo 0) 个配方 → _utils/RECIPES_FOR_THIS_PAPER.md"
wc -c _utils/RECIPES_FOR_THIS_PAPER.md 2>/dev/null
```

单独补取某个配方（预取漏了或临时改图型时）：

```bash
python3 _utils/get_recipe.py competition 14   # 等高线图
python3 _utils/get_recipe.py advanced 1       # 棒棒糖图
```

**⛔ For EVERY figure script you write, the workflow is:**
1. Read the plan entry: `fig_xxx — 图表类型 (category #N)`
2. **翻 `_utils/RECIPES_FOR_THIS_PAPER.md` 找到 `category #N` 那一段**（已预取好；漏了才单独 `get_recipe.py`）
3. Copy the recipe code as starting point
4. Replace demo data with actual data from `figures/*.json`
5. Save as `figures/gen_fig_xxx.py`

⛔⛔ **规划写了什么图型，就必须画出那个图型**——这是对规划的硬合同。规划写"等高线/响应面"
就必须出现 `contourf`/`contour`，写"棒棒糖"就必须是 `hlines`+`scatter` 或 `barh`，写"热力图"
就必须有 `imshow`/`pcolormesh`。**凭印象退化成 plot/bar/scatter 是最常见的质量塌方**，
Step 4 自检会逐图对账并报出不一致。图型确实不适合本题数据时，**先改规划再改图**，不要闷头画别的。

**Skip this = ugly figures with wrong colors and no styling. The quality gate WILL reject them.**

If you skip this step and generate a figure with matplotlib default blue, no gradient fills, or no annotations, the figure will be rejected in Step 4 self-check.

<script_template>
**Copy this EXACTLY as the first lines of every gen_fig_*.py script. Output extension：默认 `.pdf`（LaTeX 模式）；如果 CLAUDE.md 末尾包含「⛔ 输出格式：仅 PNG」（Word/docx 模式）就改成 `.png`：**

```python
import os, sys, shutil
os.makedirs('_utils', exist_ok=True)
for src in ['plot_utils.py']:
    for search in ['skills/shared-scripts', '../skills/shared-scripts']:
        p = os.path.join(search, src)
        if os.path.isfile(p):
            shutil.copy2(p, f'_utils/{src}')  # copies .py file, NOT .pdf
            break
sys.path.insert(0, '.')  # plain dot, NOT '.pdf'
from _utils.plot_utils import setup_style, save_fig, PALETTE
setup_style()  # defaults to Soft palette; alternatives: tableau/npg/nejm/science/colorblind

# ... figure generation code ...
# Read data from JSON/CSV, never hardcode numbers
# NEVER use cmap='RdYlGn' — use 'coolwarm' or 'YlOrRd' instead. Do NOT use 'RdBu_r' (too dark)
# No plt.title() — captions go in LaTeX only
# ⛔ 图内文字最小化：结论陈述/多行说明/方法解释一律进 LaTeX \caption{}，绝不浮在数据上；
#    图内只留"数据锚点短标签"（≤1 行、贴着数据、不是句子），每个 panel ≤2 个。
#    柱顶数值优先用 ax.bar_label(bars, fmt='%.2f', padding=2)（自动定位、天然防重叠），
#    别手写一排 ax.text；点标注多时用 smart_labels(ax, xs, ys, texts) 自动推开。
#    详见 figure_style_guide「图内文字最小化」三层闸 + 替代路径对照表。
# 默认 LaTeX 模式：save_fig(fig, 'figures/fig_xxx.pdf')
# Word/docx 模式：save_fig(fig, 'figures/fig_xxx.png')  # 自动 350 DPI 防中文糊
```

**★ 图多于 5 张时，先建一个 `figures/_figbase.py` 共用引导模块**（实测这是高分图集的共同做法：把样板收敛到一处，几十份脚本不再各写各的，也避免各图指标口径不一致导致论文数字打架）：

```python
# figures/_figbase.py — 各 gen_fig_*.py 统一 from _figbase import ... 
"""数据图公共引导：路径注入 + JSON 载入 + 口径函数。数据一律来自真实产物，不硬编码。"""
import json, os, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
if ROOT not in sys.path: sys.path.insert(0, ROOT)
from _utils.plot_utils import setup_style, save_fig, PALETTE, COLORS, _lighten, smart_labels
setup_style()

def load(name):
    """按 figures/ → output/ 顺序找结果 JSON。"""
    for base in (HERE, os.path.join(ROOT, 'output')):
        p = os.path.join(base, name)
        if os.path.exists(p):
            with open(p, encoding='utf-8') as f: return json.load(f)
    raise FileNotFoundError(name)

P1 = load('problem_1_results.json')      # 按本题实际结果文件调整

def panel(ax, tag):
    """子图角标 (a)(b)(c) — 贴左上，不是整图标题。"""
    ax.set_title(tag, fontsize=11, fontweight='bold', loc='left', pad=3)

# ⛔ 对数轴零值地板：真值为 0 时用它占位并单独标注，禁止静默丢点（log 轴会把 0 悄悄扔掉）。
#    ⛔ 地板必须【按各图真实数据下界现算】，不要写死一个极小常量！写死 1e-18 会把对数轴
#    撑到 6+ 个数量级 → 图左边(或下边)一大片纯空白，曲线在那段只是一条平线（实测翻车过）。
def log_floor(vals, eps=1e-6):
    """贴着真实最小值下方半个数量级取地板；<eps 的（含 1e-15 量级浮点残差）视为 0。"""
    import numpy as np
    real = np.asarray(vals, float)
    real = real[real > eps]
    if real.size == 0:
        return eps
    return 10 ** (np.floor(np.log10(real.min())) - 0.5)

# ⛔ 中文字体缺字兜底：雅黑缺 ⛔✔⚠ 及组合附加符（ν̈ ν̇），PDF 里会渲染成空白方框。
#    凡是来自 JSON 的中文/符号标签，一律过一遍 cn()。
_GLYPH_FIX = (('⇒', '→'), ('≫', r'$\gg$'), ('⛔', '【校核】'), ('✔', '√'), ('⚠', '【注】'))
def cn(s):
    for bad, good in _GLYPH_FIX: s = s.replace(bad, good)
    return s
```

**★ 每个 `gen_fig_*.py` 开头写文件级 docstring**（三引号），注明：本图讲什么 → 每个 panel 是什么 → 数据来源哪个 JSON → 关键数值。这不是形式主义：写的过程会迫使先想清楚"这张图要让读者看到什么"，是"先想再画"和"边画边凑"的分界。有余力时把版式也算一下（如"原生宽 8.2in，正文按 0.98\textwidth 引用 → 缩放约 0.75，最小字号上页 ≥6pt"），可提前避免"缩到页面上字看不清"。
</script_template>

**⛔ 地图类图表（中国省级热力图）环境说明：**
- 环境已预装 `geopandas`，直接 `import geopandas as gpd` 即可
- GeoJSON 文件：`_utils/china_provinces.geojson`（首次运行自动从 `skills/shared-scripts/` 复制或从阿里云 DataV 下载）
- **⛔ 绝对不要用散点图代替地图！** 必须用 `gdf.plot()` 画省份多边形轮廓
- 如果 geopandas 导入失败，用纯 matplotlib 方案：从 GeoJSON 解析坐标，用 `matplotlib.patches.Polygon` 手动画省份轮廓（参考 figure_recipes_competition.md #7 方案 B）

**⛔ figsize 硬限制（所有图表必须遵守）：**
- ⛔⛔ **width（第一维）必须贴合「长宽比档位」的上页显示宽** —— 这条最容易被忽略、后果最严重。
  `fig_include_size.py` 按 `r=高/宽` 分档给 `\includegraphics` 宽度，**不同长宽比上页显示宽差一倍多**：

  | 长宽比 r=高/宽 | 分档 width | 上页显示宽 | **原生 figsize 宽写** |
  |---|---|---|---|
  | r ≤ 0.80 横图 | `0.85\textwidth` | 5.53in | **6.0in**（如 `(6.0,3.8)`、1×2 `(6.0,2.8)`） |
  | 0.80<r≤1.20 **近方**（2×2、等比例几何图） | `0.70\textwidth` | **4.55in** | **5.0in**（如 `(5.0,4.9)`） |
  | 1.20<r≤1.60 偏竖 | `0.50\textwidth` | 3.25in | **3.6in** |
  | r>1.60 瘦高 | `0.42\textwidth` | 2.73in | **3.0in** |

  实测翻车：国赛A题 `fig_q4_snapshots` 写 `(10.4,10)` → 缩到 **0.53**、刻度 8.5pt→**4.5pt**、
  线 lw0.6→**0.32pt** → 肉眼"坐标轴糊成一团 + 线条发虚"（同篇 13 张全中）。按上表定尺寸后
  缩放比 0.92–1.10、刻度上页 7.8–9.4pt、文字重叠 0 处。
  ⛔ **别只记「≤7.2」**：近方图写 7.2in 仍被缩到 0.63、刻度变 5.4pt（`figure_check.sh` 分档闸会抓）。
  矢量图**略放大(1.0–1.6)无害**，字更大更清楚；怕的只有"原生远大于上页显示宽"。
  配套下限：**数据线 lw≥0.9、刻度 ≥8pt、轴标签 ≥9pt**。
  ⛔ **多 panel 共用 colorbar 必须用 gridspec `cax=`，不能 `ax=axes`**（`save_fig` 无条件跑
  `tight_layout` 会吃掉 `ax=axes` 预留的空间 → 面板压到 colorbar 上；调 `fraction`/`pad` 治不了，
  也别开 `constrained_layout`（plot_utils 已禁用）。写法见 `figure_style_guide.md`）。
- `figsize` 的 height 不能超过 8 英寸（约 20cm）。超过会导致图占满整页，前一页只剩一句引导文字
- 数据条目多（20+ 个类别的柱状图/条形图）：只展示 Top 15-20，其余放附录表格。或者用 `figsize=(7, 6)` + `fontsize=7` 缩小
- **条目超过 15 个时优先换图表类型**：横向柱状图 → 棒棒糖图（lollipop，更紧凑）；排名柱状图 → 表格（LaTeX 三线表更省空间）；分类对比 → 雷达图或热力图（一张图展示所有维度）
- 横向柱状图（barh）条目超过 15 个时，必须限制 `figsize=(7, max(4, n*0.25))`，且 height 上限 8
- 热力图/混淆矩阵超过 10×10 时，用 `figsize=(8, 7)` + `fontsize=7`
- **验证**：生成后检查 PDF 文件尺寸，如果高度 > 25cm 必须缩小重新生成

### Step 4: Self-check + execute

⛔⛔ **MANDATORY: run figure_check.sh BEFORE executing any gen_fig script.** Exit code 0 is required to proceed. Non-zero means CRITICAL violations exist (missing `setup_style`, hardcoded colors, `#1f77b4` matplotlib-default blue, etc.) — fix them and re-run until exit code is 0.

```bash
bash _utils/figure_check.sh 2>/dev/null || bash skills/shared-scripts/figure_check.sh
RC=$?
if [ "$RC" -ne 0 ]; then
    echo "❌ figure_check.sh failed (RC=$RC) — $RC CRITICAL violations must be fixed BEFORE running gen_fig scripts"
    echo "   Common fixes listed below; apply with Edit tool, then re-run figure_check.sh"
    # 不要 exit — 让 AI 继续读后续 fix_patterns 并修复
fi
```

<fix_patterns>
If violations found (especially CRITICAL), fix and re-check before executing:
- CRITICAL missing `setup_style` → add initialization code from script_template above
- Hardcoded color (`color='#XXXXXX'` not from PALETTE/COLORS) → `PALETTE[n]` or `COLORS['up'/'down'/'grid'/'text']`
- Named CSS color (`color='blue'`, `'red'`, `'green'`) → `PALETTE[n]`
- matplotlib default blue `#1f77b4` (and the rest of tab10) → use `PALETTE` (just calling `setup_style()` auto-applies it to all subsequent `ax.bar/plot/scatter` without `color=` arg)
- `plt.title()` → remove (caption in LaTeX only)
- `ax.grid()` → remove (setup_style handles grid)
- `RdYlGn` or `RdYlGn_r` colormap → use `coolwarm` (for diverging) or `YlOrRd` (for sequential). Do NOT use `RdBu_r` (too dark)
- Empty value placeholders → read from data files
- ⛔ **「N 张图的代码没画出规划要求的图型」**（规划写等高线却画成条形图这类）→ 翻
  `_utils/RECIPES_FOR_THIS_PAPER.md` 里对应的 `category #N` 配方，按配方代码重写该图；
  若该图型确实不适合本题数据，**先改规划文档里的图型再改图**，别让规划与产物不一致。
  这是实测中图表质量塌方的首要原因，务必逐条处理完。
</fix_patterns>

**After fixing, re-run figure_check.sh until RC=0. Only then execute the figure scripts.**

**Execute scripts in PARALLEL for speed, then fix any failures serially. 各 `gen_fig_*.py` 相互独立（one script per figure），可并行跑成功路径提速；失败的再逐个串行诊断修复。**

⛔ **并行前必须预热两处竞态源**（否则多进程首次并发会翻车，产出内容不受影响，只防崩）：
1. **预复制 `plot_utils.py`**：每个脚本头都 `shutil.copy2` 复制它到 `_utils/`，多进程同时写同一文件在 Windows 会 `PermissionError`。并行前先复制好一次，把并发写窗口降到最小。
2. **预热 matplotlib 字体缓存**：首次 `import matplotlib.pyplot` 会构建字体缓存，多进程同时首次构建可能损坏缓存。并行前先单进程 import 一次，后续并发只读缓存。

```bash
PYTHON=""; for _c in "$MH_PYTHON" python python3; do [ -z "$_c" ] && continue; if $_c -c "import sys" >/dev/null 2>&1; then PYTHON="$_c"; break; fi; done; [ -z "$PYTHON" ] && PYTHON=python

# ── 预热1：预复制 plot_utils.py（消除并发 copy2 竞态）──
mkdir -p _utils
for _s in skills/shared-scripts ../skills/shared-scripts; do
    [ -f "$_s/plot_utils.py" ] && cp "$_s/plot_utils.py" _utils/plot_utils.py && break
done
# ── 预热2：单进程触发字体缓存构建（后续并发只读不重建）──
$PYTHON -c "import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot" >/dev/null 2>&1

# ── 并行执行（并发限 4，各自 log 到 _tmp/figlogs/，用 exit code 判定最可靠）──
mkdir -p _tmp/figlogs
_n=0
for script in figures/gen_fig*.py; do
    [ -f "$script" ] || continue
    bn=$(basename "$script" .py)
    ( $PYTHON "$script" > "_tmp/figlogs/${bn}.log" 2>&1; echo $? > "_tmp/figlogs/${bn}.rc" ) &
    _n=$((_n+1))
    [ $((_n % 4)) -eq 0 ] && wait     # 每 4 个一批，控并发不拖垮机器
done
wait
[ -d "figures/figures" ] && mv figures/figures/*.pdf figures/ 2>/dev/null

# ── 判定：只认 rc=0 且该脚本自己的 fig 产出（expected_pdf）──
# ⛔ 并行下不能用 `find -newer $script` 兜底：并发跑完后所有图 mtime 都比脚本新，
#    任何 rc=0 脚本都会命中 → 一个 rc=0 却没画出图的脚本会被别人的新 PDF 误判成功。
#    故判定收紧为 rc=0 且 expected_pdf 存在；命名不规范/一脚本多图（expected_pdf 对不上）
#    会被列入待核对，交给下面串行阶段人工核对（不重跑、不误杀）。
FAILED=0; FAILED_LIST=""
for script in figures/gen_fig*.py; do
    [ -f "$script" ] || continue
    bn=$(basename "$script" .py)
    rc=$(cat "_tmp/figlogs/${bn}.rc" 2>/dev/null || echo 1)
    expected_pdf="figures/${bn#gen_}.pdf"
    if [ "$rc" = "0" ] && [ -f "$expected_pdf" ]; then
        echo "✅ OK: $script → $expected_pdf"
    else
        echo "❌ FAILED: $script (exit=$rc) — 见下方日志"
        cat "_tmp/figlogs/${bn}.log"
        FAILED=$((FAILED+1)); FAILED_LIST="$FAILED_LIST $script"
    fi
done
echo ""
echo "=== Summary: $FAILED scripts failed ==="
[ "$FAILED" -gt 0 ] && echo "待处理清单（逐个核对/修复）:$FAILED_LIST"
```

**If FAILED > 0, you MUST 逐个核对处理（先分清是"真失败"还是"一脚本多图命名对不上"）：**
0. **先看日志判性质**：若该脚本 `exit=0` 且日志无报错 —— 很可能是"一脚本产多图"或输出名与 `fig_${bn#gen_}.pdf` 不同（判定按脚本名推期望 PDF，对不上就被列出）。此时 **`ls figures/` 确认它的图确实生成了即可跳过，不要重跑**。
1. 若确有报错：Read the error output (ImportError? FileNotFoundError? data issue?)
2. Fix the script (add missing import, fix data path, etc.)
3. Re-run ONLY the failed script: `$PYTHON figures/gen_fig_xxx.py`
4. Verify the PDF exists: `ls -la figures/fig_xxx.pdf`
5. Repeat until all scripts produce PDFs

**Do NOT proceed to Step 5 until every gen_fig_*.py has produced its PDF.**

### Step 4.5: 数据图视觉质检（可选，默认关 · 仅当用户在高级选项开启时才跑）

⛔ **这一步默认不执行**。只有工作区 CLAUDE.md 含 `MH_DATA_FIG_VISION=1` 标记（用户在前端「高级选项」开启了「数据图视觉质检」）时才跑。它会对每张数据图调 vision 模型看图，检查坐标轴标签截断 / 图例压数据 / 刻度重叠等**肉眼硬伤**（`figure_check.sh` 的静态检查抓不到这些渲染层问题）。**会消耗额度**（每张图每轮都调一次 vision），所以默认关。

先跑下面这段**检测脚本**，它会对每张数据图调 vision 并把结果记进独立账本 `_tmp/datafig_vision_*.txt`：

```bash
# ⛔ 门 1：默认关。CLAUDE.md 无 MH_DATA_FIG_VISION=1 标记就整段跳过（一个字不打，静默）
if ! grep -q 'MH_DATA_FIG_VISION=1' CLAUDE.md 2>/dev/null; then
  :  # 用户没开数据图视觉质检 → 跳过（默认行为，省额度）
# ⛔ 门 2：快速模式让位。省额度优先，即使开了数据图 vision 也跳过
elif grep -q 'MH_FAST_MODE=1' CLAUDE.md 2>/dev/null; then
  echo "⚡ 快速模式：跳过数据图视觉质检（省额度）"
else
  mkdir -p _tmp
  PYTHON=""; for _c in "$MH_PYTHON" python python3; do [ -z "$_c" ] && continue; if $_c -c "import sys" >/dev/null 2>&1; then PYTHON="$_c"; break; fi; done; [ -z "$PYTHON" ] && PYTHON=python
  # 定位数据图 vision 脚本：_utils/ 优先，兜底 $MH_TOOLS_DIR，再兜底 tools/
  DFV=""
  for _p in "_utils/data_fig_vision_check.py" "$MH_TOOLS_DIR/data_fig_vision_check.py" "tools/data_fig_vision_check.py"; do
    [ -n "$_p" ] && [ -f "$_p" ] && { DFV="$_p"; break; }
  done
  # ⛔ 收集数据图：靠【产物来源】判定，不靠前缀猜（前缀既会误伤真数据图 fig_error_dist，
  #    又会误收流程图 → 用数据图 PROMPT 检流程图/插画会得到牛头不对马嘴的反馈、误导修图）。
  #    数据图 = matplotlib gen_fig 脚本产的；流程/架构图有同名 .drawio（归 paper-figure-drawio 的
  #    vision，已单独质检，本步不重复检）；TikZ 有同名 .tex 含 tikzpicture；GPT Image 插画是
  #    fig_scene*/fig_gptimg*（AI 生成的场景图，非数据图）。判据：
  #      正向铁证：存在同名 gen_fig 脚本（规范 one gen_fig script per figure）→ 一定是数据图
  #      负向兜底：无 .drawio、无 tikz .tex、非 GPT 前缀 → 可能是「一脚本产多图」的数据图，也检
  DF_LIST=""
  for pdf in figures/fig_*.pdf; do
    [ -f "$pdf" ] || continue
    bn=$(basename "$pdf" .pdf)
    # 已判过 PASS 的不再调（复核循环省额度）
    grep -q "^${bn} PASS" _tmp/datafig_vision_passed.txt 2>/dev/null && continue
    is_data=0
    if [ -f "figures/gen_${bn}.py" ]; then
      is_data=1                                   # 正向：有同名 gen_fig 脚本 = 铁定数据图
    else
      # 兜底：排除 drawio 流程图 / TikZ / GPT Image 插画，其余当数据图（覆盖一脚本多图）
      _skip=0
      [ -f "figures/${bn}.drawio" ] && _skip=1
      [ -f "figures/${bn}.tex" ] && grep -q '\\begin{tikzpicture}' "figures/${bn}.tex" 2>/dev/null && _skip=1
      case "$bn" in fig_scene*|fig_gptimg*) _skip=1 ;; esac
      [ "$_skip" = "0" ] && is_data=1
    fi
    [ "$is_data" = "1" ] && DF_LIST="$DF_LIST $pdf"
  done
  if [ -z "$DF_LIST" ]; then
    echo "ℹ 数据图视觉质检：无待检数据图（或都已 PASS）"
  elif [ -z "$DFV" ]; then
    echo "🟥 开了数据图视觉质检但找不到 data_fig_vision_check.py（_utils/ 与 tools/ 均无）——本轮跳过，不阻断"
    for pdf in $DF_LIST; do echo "$(basename "$pdf" .pdf) (找不到 data_fig_vision_check.py)" >> _tmp/datafig_vision_skipped.txt; done
  else
    for pdf in $DF_LIST; do
      bn=$(basename "$pdf" .pdf)
      echo "=== 数据图视觉质检: $bn ==="
      PNG_OK=0
      # PyMuPDF(fitz) 优先：纯 wheel、不依赖 poppler，打包 runtime 必有
      $PYTHON -c "
import fitz
d=fitz.open('$pdf'); d[0].get_pixmap(matrix=fitz.Matrix(200/72,200/72)).save('_tmp/${bn}_dfv.png')
" 2>/dev/null && [ -f "_tmp/${bn}_dfv.png" ] && PNG_OK=1
      if [ "$PNG_OK" = "0" ] && command -v pdftoppm >/dev/null 2>&1; then
        pdftoppm -png -r 200 -singlefile "$pdf" "_tmp/${bn}_dfv" && PNG_OK=1
      fi
      if [ "$PNG_OK" = "0" ] && $PYTHON -c "from pdf2image import convert_from_path" 2>/dev/null; then
        $PYTHON -c "
from pdf2image import convert_from_path
convert_from_path('$pdf', dpi=200, first_page=1, last_page=1)[0].save('_tmp/${bn}_dfv.png','PNG')
" 2>/dev/null && [ -f "_tmp/${bn}_dfv.png" ] && PNG_OK=1
      fi
      [ "$PNG_OK" = "0" ] && { echo "🟥 $bn: PDF→PNG 均失败，本图未审（不阻断）"; echo "$bn (PDF→PNG 转换失败)" >> _tmp/datafig_vision_skipped.txt; continue; }
      DVOUT=$($PYTHON "$DFV" "_tmp/${bn}_dfv.png" 2>&1); DVEXIT=$?
      echo "$DVOUT"
      if [ "$DVEXIT" -eq 0 ]; then
        echo "✅ $bn 视觉通过"; echo "$bn PASS" >> _tmp/datafig_vision_passed.txt
      elif [ "$DVEXIT" -eq 2 ]; then
        echo "⚠ vision 不可用，跳过 $bn（不阻断）"; echo "$bn (Vision API 不可用/调用失败)" >> _tmp/datafig_vision_skipped.txt
      else
        # DVEXIT=1：有硬伤 → 记 pending，交给上面散文里的修复循环（AI 改脚本重跑后重跑本检测块复核）
        echo "⛔ $bn 有视觉硬伤（见上），按修复循环改 gen_fig 脚本重跑"
        echo "$bn" >> _tmp/datafig_vision_pending.txt
      fi
      rm -f "_tmp/${bn}_dfv.png"   # 临时 PNG 只喂 vision 用完即弃，检完即删避免 _tmp/ 堆积
    done
    # 汇总（供 AI 判断还剩几张要修）：pending.txt 跨轮累积，需剔除已 PASS 的图才是真待修数
    _pend=0
    if [ -f _tmp/datafig_vision_pending.txt ]; then
      for _b in $(sort -u _tmp/datafig_vision_pending.txt); do
        grep -q "^${_b} PASS" _tmp/datafig_vision_passed.txt 2>/dev/null || _pend=$((_pend+1))
      done
    fi
    echo "=== 数据图视觉质检小结：真待修 $_pend 张（已 PASS 的不计；passed/skipped 见 _tmp/datafig_vision_*.txt）==="
    echo "   （待修的图改完 gen_fig 脚本、重跑出图后，重新执行本检测块复核；最多 3 轮，之后警告不阻断）"
  fi
fi
```

**⛔ 修复循环（AI 执行，最多 3 轮，不阻断出稿）**：
上面脚本若打印出某张图的 `ISSUE ...`，你必须逐张修复——数据图的修复是**改 `gen_fig_xxx.py` 的绘图代码**（不是改 LaTeX）：
1. 用 Read 读 vision 反馈里点名的那张图对应的 `figures/gen_fig_xxx.py`
2. 按反馈用 Edit 改：标签被截断 → `save_fig` 已带 `bbox_inches='tight'`，多为 figsize 太小或字太大，调 `figsize`/`fontsize`；图例压数据 → 改 `legend(loc=...)` 或 `bbox_to_anchor` 移到画布外；刻度重叠 → `plt.xticks(rotation=30, ha='right')` 或减少刻度数；子图挤压 → `fig.tight_layout()` 或调 `figsize`
3. 重跑该脚本：`$PYTHON figures/gen_fig_xxx.py`，确认新 PDF 生成
4. **重新执行上面的检测脚本复核**（它只对还没 PASS 的图再调 vision）
5. 每张图最多修 3 轮。3 轮后小结里「真待修」仍 > 0 → 这些图就是没修好的（仍留在 `_tmp/datafig_vision_pending.txt`、未进 `passed`），**警告即可、不阻断**，直接继续 Step 5（用户会自己复核）

⛔ **绝不能因为数据图 vision 没修好就卡在这里不往下走**——这是可选增值检查，警告即可。API 不可用 / 转图失败等环境问题一律记 skipped 跳过，同样不阻断。

### Step 5: Generate tables (LaTeX OR Markdown — pick by output mode)

**⛔ FIRST: detect output format mode**

```bash
echo "=== 检测输出格式 ==="
# CLAUDE.md 顶部「## 参数」段会列 output_format
OUTPUT_FORMAT=$(grep -E '^- output_format:' CLAUDE.md 2>/dev/null | sed -E 's/.*: *//' | head -1 | tr -d '[:space:]')
OUTPUT_FORMAT=${OUTPUT_FORMAT:-pdf}
echo "Output format: $OUTPUT_FORMAT"

# 学术写作四大模板始终是 docx 模式（即使 output_format 没明写）
TEMPLATE=$(grep -E '^- template:' CLAUDE.md 2>/dev/null | sed -E 's/.*: *//' | head -1 | tr -d '[:space:]')
case "$TEMPLATE" in
    thesis_proposal|literature_review|course_paper|course_report)
        OUTPUT_FORMAT=docx
        echo "学术写作模板，强制 docx 模式"
        ;;
esac

if [ "$OUTPUT_FORMAT" = "docx" ]; then
    TABLE_EXT="md"
    echo "⛔ Word/DOCX 模式：表格输出 .md（Markdown 三线表）"
else
    TABLE_EXT="tex"
    echo "PDF 模式：表格输出 .tex（booktabs 三线表）"
fi
echo "TABLE_EXT=$TABLE_EXT (将用于 figures/TABLE_*.${TABLE_EXT})"
```

**⛔ At minimum: main results comparison table + descriptive statistics table.**
- PDF 模式 → Save as `figures/TABLE_xxx.tex`（booktabs 三线表）
- Word/DOCX 模式 → Save as `figures/TABLE_xxx.md`（Markdown 三线表）

**⛔ For Chinese papers: table captions and column headers MUST be in Chinese.** Check TOPIC_PLAN.md or PROBLEM_ANALYSIS.md to determine paper language. If Chinese (stats modeling / math modeling competition), all `\caption{}` and column headers must use Chinese.

**⛔⛔ 表注只写短标题（中文 ≤20 字 / 英文 ≤14 词）**：`\caption{}` 只写"这张表是什么"的名词短语，**统计口径（重复次数/置信区间/随机数种子）、结论、数据来源全部进正文**，一个字都别塞进表注。正例 `\caption{各体积分数下的导通概率}`；反例 `\caption{问题二四个题给体积分数下的导通概率（$T$=1000 次独立重复……数据来源：\texttt{results/xxx.json}。}`。详见本步末尾 `<table_sizing>` 的表注铁律与「为什么表注更容易写超」。

**⛔ DOCX 模式下 Markdown 三线表的标准格式（必须遵守）：**

```markdown
**表 1：模型性能对比**

| 模型 | RMSE | MAE | R² |
|---|---|---|---|
| LSTM | 0.023 | 0.018 | 0.94 |
| Transformer | 0.019 | 0.015 | 0.96 |
| XGBoost | 0.021 | 0.017 | 0.95 |

> 注：所有指标基于测试集；最优值已加粗。

<!-- label: tab:model_perf -->
```

铁律：
- 表标题：`**表 X：标题**`（不是 `\caption{}`）
- 表头单独一行 `| h1 | h2 |`，**接下来必须有分隔行** `|---|---|`
- 每行 `|` 数量必须一致（列数对齐）
- 单元格里的 `|` 必须转义为 `\|`
- 表注：`> 注：xxx`（引用块）
- ⛔ **不要**在 .md 里写 `\begin{table}` / `\begin{tabular}` / `\toprule` / `\midrule` / `\bottomrule`
- ⛔ **不要**输出 .tex 文件（Word 模式根本不读）

**调用 stats_utils 时按后缀输出对应格式：**

```python
from _utils.stats_utils import regression_table, descriptive_table

# 自动按后缀选格式（推荐）
ext = "md" if output_format == "docx" else "tex"
regression_table(results, ['OLS', 'Logit'],
                 output=f'figures/TABLE_regression.{ext}',
                 caption='回归结果')
descriptive_table(df, output=f'figures/TABLE_descriptive.{ext}')
```

<table_sizing>
**⛔⛔ 表注（`\caption`）只写短标题：中文 ≤20 字 / 英文 ≤14 词，与图注同一口径。**
表格本身就是数字载体，**不存在**「图内文字遮挡数据」那个刚需，所以**统计口径、结论、数据来源一律进正文**，不要塞进表注。

- ✅ `\caption{各体积分数下的导通概率}`（11 字）
- ❌ `\caption{问题二四个题给体积分数下的导通概率（$T$=1000 次独立重复，公共随机数）。$P$ 随 $f_A$ 严格单调上升，八点扫描的反序数为 0……数据来源：\texttt{results/problem\_2\_results.json}。}`（292 字）

**★ 为什么表注比图注更容易写超（必读）**：正文引**图**时是「复制 `figure` 块 → 改 caption」，caption 会被过一遍手、顺带精简；而**表**是 `\input{figures/TABLE_*.tex}` **直通 PDF**——你在这里写多长，论文里就是多长，**没有任何中间精简环节**。实测某工作区 6 张表因此平均 391 字、最长 546 字，表头下方糊成一整段。编译期 `writing_check.sh` 会递归跟随 `\input` 扫表注长度，超限判违规。

**LaTeX 模式（.tex）：**
- Narrow tables (≤4 columns): do not use `\resizebox` — it stretches text to full width, font becomes huge
- Wide tables (≥6 columns): wrap with `\resizebox{\textwidth}{!}{...}` to prevent overflow
- Use three-line style (booktabs): `\toprule`, `\midrule`, `\bottomrule`
- **⛔ Tall tables (>30 rows or multirow causing >35 visual rows)**: use `longtable` environment or split into multiple smaller tables. A single `tabular` that exceeds one page will be silently truncated.
- **⛔ Hyperparameter/config tables**: if models have very different parameter counts (e.g., Linear Reg 2 params vs LSTM 9 params), split into separate small tables per model or use `longtable`. Do not cram all models into one huge tabular.

**Markdown 模式（.md）：**
- 列数 ≤ 8（Word 渲染列数过多会挤压）；超过 8 列必须横向拆分
- 数据行 ≤ 25（超过 25 行的表格在 Word 里跨页效果差）；超过的拆为「正文摘要表 + 附录完整表」
- 单元格内不要换行（`<br>` Word 不一定渲染）
- 不要嵌套表格（Markdown 不支持）
- 数值精度统一：百分比保留 2 位小数（94.72%），系数保留 3-4 位（0.0234）
</table_sizing>

### Step 6: Generate LaTeX include snippets

Save to `figures/latex_includes.tex`. Figures use `[H]` float specifier (pinned in place to prevent multi-figure stacking); tables use `[H]` (requires `\usepackage{float}`).

**⛔ Captions must match paper language.** Check TOPIC_PLAN.md or PROBLEM_ANALYSIS.md:
- Chinese papers (stats modeling / math competition): `\caption{模型性能对比雷达图}` — Chinese caption
- English papers (MCM/ICM/APMCM): `\caption{Model Performance Comparison}` — English caption

**★★ 图注（figure caption）要承载结论，别只写一个图名**（实测常见毛病：图内塞满结论文字框、caption 却只有"随轨道相位的变化"这样一句，正好写反了）。图注是**图内文字的去处**——写长不占版面、不遮挡数据、还能被检索。推荐结构：

> ⛔ **本节只管图注，不要套用到表注。** 表注按 `<table_sizing>` 的铁律写短标题（≤20 字），结论进正文——表格是数字载体，没有「图内文字遮挡数据」这个前提，而且表是 `\input` 直通 PDF、没有精简环节。曾有工作区把这套长 caption 规范套到 6 张表上，平均 391 字、最长 546 字。

> **一句话讲图型与内容** → **多 panel 逐个说明 (a)(b)(c)** → **关键结论数值** → 必要的数据来源/口径

```latex
% ❌ 太干：结论无处安放，读者只能去图里挤着看
\caption{相对论钟速率随轨道相位的变化}

% ✅ 结论进图注：图内因此只需留极简锚点，两边都清爽
\caption{相对论钟速率沿轨道相位的变化。(a) 速度项 $v^2/2c^2$ 与引力项 $GM_E/rc^2$ 
分别随相位振荡，量级均为 $10^{-10}$；(b) 两项之和的单圈累积达 5473\,ns，
折合每日 83.4\,$\mu$s，远超 0.1\,$\mu$s 的定位精度需求，故该项不可忽略。
数据源：problem\_3\_results.json（轨道积分 1200 周期）。}
```

⛔ 图内被搬走的结论**必须在 caption 里出现**，否则是丢信息不是搬信息。

**⛔ Axis labels in gen_fig_*.py must also match paper language:**
- Chinese: `ax.set_xlabel('迭代次数')`, `ax.set_ylabel('目标函数值')`, `label='本文算法'`
- English: `ax.set_xlabel('Iterations')`, `ax.set_ylabel('Objective Value')`, `label='Ours'`

### Step 8: Quality check

<quality_checklist>
- No in-figure title (captions in LaTeX only)
- Font ≥10pt
- Grayscale-distinguishable
- Legend does not obscure data
- Axes have units
- PDF vector output
- All values populated (no empty placeholders)
- Text does not obscure data points
- Numbers consistent with paper body / RESULTS.md
- ⛔ **完整性（防残图）**：y 轴必须有刻度数字（不要清空 y 轴）；隐藏 x 刻度时必须直接标注数据（bar_label/text）；每个 `fill_between`/置信带必须同时画出主曲线（不能只剩一块色块）；非热力图不要 `set_frame_on(False)`；多子图每个子图都要有可见的轴+标签。**打开每张图确认它不是漂浮的色块，否则修正重画。**
- ⛔⛔ **防标注遮挡（多点/轨迹/3D 图必守，"一堆文字糊成一团"是最常见的丑）**：一图有 ≥2 个文字标注就必须互不重叠、不压数据点。**2D** 用 `adjustText` 自动排开或手动 `xytext` 异向偏移+`arrowprops` 引线；**3D**（adjustText 无效，手动）点挤在视觉中心时**不要每点硬塞长中文**——改成"点旁短代号（M1/F1/E）+ 全称进图例"，或"偏移+引线各朝不同方向拉开"，或"只标图例、点上不标字"。出图后放大标注区自检：有没有两段字叠一起、字压在点上看不清？有就改，别交付糊成一团的图。
</quality_checklist>

**⛔ MANDATORY: Figure intelligent self-review (review each figure after all are generated):**

Review each generated figure against its script code. Answer the following for each. If any ❌, regenerate that figure.

```
=== Per-figure review ===
For each fig_xxx.pdf, answer:

1. [Type match] Is this chart type the best choice for this data?
   - Method comparison (≤4 methods) → Grouped bar, not lollipop
   - Single-dim ranking/count → Horizontal bar (sorted + gradient color) or Pareto. Do NOT use vertical multi-color bars (random color per bar without grouping = visual noise, looks amateurish)
   - Method ranking (≥5 methods) → Horizontal bar preferred; Lollipop OK but must have gradient bg + highlight row + reference line
   - ⛔ Lollipop: if only plain stem+dot with no decoration, visual effect is poor — must follow adv #1 recipe with gradient bg + #1 highlight + median reference line
   - Time series trend → Line chart, not bar chart
   - Distribution comparison → Rain Cloud or box plot, not bar chart
   - Correlation matrix → Heatmap, not scatter matrix
   - Composition/proportion → Stacked bar or donut chart
   - If unsure, refer to _utils/figure_style_guide.md decision table

2. [Visual quality] Does the figure look professional and clear?
   - Enough spacing between data points/bars? (not crammed together)
   - Uses PALETTE colors, not matplotlib default blue?
   - Has light-fill + solid-border premium look? (not plain solid blocks + white edges)
   - Annotation text readable? (no overlap, not too small)
   - Heatmap: text color auto-adapts to background? (white on dark cells, black on light cells)

3. [Occlusion check] Are there any overlap/clipping issues?
   - Labels overlapping each other? → use smart_labels() or adjust offset/fontsize
   - Labels overlapping data elements (bars/lines/dots)? → move labels above/below or add white bbox background
   - Legend covering data points? → move legend to empty area (loc='upper left' if data is on the right, etc.) or place outside plot
   - Axis tick labels cut off or overlapping? → rotate labels, reduce fontsize, or increase figure margins
   - Data points clipped at plot edges? → expand xlim/ylim by 5-10%
   - Colorbar overlapping the plot area? → adjust pad/shrink parameters
   - For multi-panel figures: subplot titles overlapping adjacent subplot content? → increase hspace/wspace

3. [Recipe usage] Is each figure based on recipe code?
   - Does the script call setup_style() + PALETTE?
   - Has premium elements from recipe? (gradient fills, KDE backgrounds, annotation boxes, smart_labels, etc.)
   - If plain matplotlib default style (blue bars, no annotations, no fills), must rewrite using recipe

4. [Information value] Does the figure convey meaningful information?
   - Has reference lines / annotation boxes / significance markers?
   - Are data differences visible? (if all bars are nearly the same height, the figure has no information value)
   - Is there a "so what" — what conclusion can the reader draw?

5. [Diversity] Are chart types diverse across the paper?
   - Same chart type appearing ≥3 times? If so, swap one
   - All bar charts? Mix at least 3+ different types
   - Lollipop: if used, must have premium visual effects (gradient background, #1 highlight row, median reference line + annotation box). Plain stem+dot = reject and redo
```

If any figure has wrong type or poor visual quality, delete and regenerate.

### Step 9: Count verification (MUST match plan — checklist reconciliation)

**⛔ 先重新读规划文档，提取图表清单（上下文可能已截断，必须重新读）：**
```bash
echo "=== 重新读取规划文档中的图表清单 ==="
for plan in PROBLEM_ANALYSIS.md TOPIC_PLAN.md PAPER_PLAN.md MODELING_REPORT.md; do
    [ -f "$plan" ] || continue
    echo "--- $plan 中的图表规划 ---"
    grep -E 'fig_|TABLE_|DrawIO|TikZ|GPTIMG|数据图|图表' "$plan" | head -30
done
echo ""
echo "=== 已生成的 PDF 文件 ==="
ls -la figures/fig_*.pdf 2>/dev/null
echo ""
echo "=== 已生成的 TABLE 文件 ==="
ls -la figures/TABLE_*.tex figures/TABLE_*.md 2>/dev/null
```

Go back to the FIGURE PLAN CHECKLIST from Step 1. For each item, check if the corresponding file exists:

```bash
echo "=== FIGURE PLAN CHECKLIST RECONCILIATION ==="
echo ""
echo "PDF figures generated:"
ls -1 figures/*.pdf 2>/dev/null
echo ""
echo "Tables generated:"
ls -1 figures/TABLE_*.tex figures/TABLE_*.md 2>/dev/null
echo ""
echo "DrawIO diagrams:"
ls -1 figures/*.drawio 2>/dev/null && echo "YES" || echo "NO"
echo ""
echo "=== Planned figures (from planning docs) ==="
for plan in PAPER_PLAN.md PROBLEM_ANALYSIS.md TOPIC_PLAN.md MODELING_REPORT.md; do
    [ -f "$plan" ] && echo "--- $plan ---" && grep -i 'fig\|图\|table\|表\|chart\|plot\|heatmap\|radar\|DrawIO\|drawio\|TikZ\|tikz' "$plan" | head -30
done
```

**⛔ MANDATORY: Update the checklist with actual status:**
```
FIGURE PLAN CHECKLIST (reconciliation):
[✅] 1. fig_desc_stats — 描述性统计分布图 → figures/fig_desc_stats.pdf (exists, 45KB)
[✅] 2. fig_radar — 模型对比雷达图 → figures/fig_radar.pdf (exists, 38KB)
[❌] 3. fig_forest — 回归系数森林图 → MISSING — need to generate
[✅] 4. TABLE_desc — 描述性统计表 → figures/TABLE_desc.{tex|md}（按 OUTPUT_FORMAT 决定）(exists)
[❌] 5. TABLE_reg — 回归结果表 → MISSING — need to generate
[✅] 6. drawio_roadmap — 技术路线图 → figures/fig_roadmap.drawio + figures/fig_roadmap.pdf (exists)
Result: 4/6 complete, 2 MISSING
```

**If ANY item is marked ❌:**
1. Go back to Step 3 and generate scripts for the missing figures
2. Execute them (Step 4)
3. Re-run this Step 9 reconciliation
4. **Repeat until ALL items are ✅**
5. **⛔ 如果某张图反复失败（同一工具 3 轮都不行），启用跨工具兜底：**
   - DrawIO 失败 → 降级到 TikZ（简化版）
   - TikZ 失败 → 降级到 DrawIO（去掉公式，用文字代替）
   - GPT Image 失败 → 降级到 DrawIO（已有机制）
   - Matplotlib 失败 → 简化图表类型（如雷达图失败→换分组柱状图）

**Do NOT finish until every planned item exists as a file. The plan is the contract.**

### Step 10: ⛔ FINAL QUALITY GATE

```bash
echo "=========================================="
echo "  FIGURE GENERATION QUALITY GATE"
echo "=========================================="
GATE_FAIL=0

# 1. All gen_fig scripts produced PDFs
SCRIPTS=$(ls figures/gen_fig*.py 2>/dev/null | wc -l)
PDFS=$(ls figures/fig_*.pdf 2>/dev/null | wc -l)
[ "$PDFS" -ge "$SCRIPTS" ] && echo "✅ All scripts produced PDFs ($PDFS/$SCRIPTS)" || { echo "❌ $((SCRIPTS-PDFS)) scripts failed to produce PDFs"; GATE_FAIL=$((GATE_FAIL+1)); }

# 2. latex_includes.tex exists and non-empty
[ -s figures/latex_includes.tex ] && echo "✅ latex_includes.tex exists" || { echo "❌ latex_includes.tex missing or empty"; GATE_FAIL=$((GATE_FAIL+1)); }

# 2.5 ⛔ 用户在「高级选项」指定的 MIN_FIGURES 数量自检（数据图最低数量硬目标）
#     只在用户明确指定 MIN_FIGURES > 0 时生效；其他情况跳过保持原本行为
source .env_skill 2>/dev/null || true
if [ -n "$MIN_FIGURES" ] && [ "$MIN_FIGURES" -gt 0 ] 2>/dev/null; then
    DATA_FIGS=$(ls figures/fig_*.png figures/fig_*.pdf 2>/dev/null | wc -l)
    if [ "$DATA_FIGS" -lt "$MIN_FIGURES" ]; then
        echo "❌ 用户在前端「高级选项」要求数据图 ≥ $MIN_FIGURES 张，但实际产出 $DATA_FIGS 张"
        echo "   必须扩展：补充缺失的 gen_fig_*.py 脚本生成更多图，或检查 FIGURE_MANIFEST 是否漏了"
        GATE_FAIL=$((GATE_FAIL+1))
    else
        echo "✅ 数据图数量达标 ($DATA_FIGS / 用户要求 $MIN_FIGURES)"
    fi
fi

# 3. DrawIO diagrams (if planned)
if grep -qi 'drawio\|DrawIO\|架构图\|技术路线\|roadmap\|framework\|流程图' PAPER_PLAN.md TOPIC_PLAN.md PROBLEM_ANALYSIS.md 2>/dev/null; then
    # DrawIO/TikZ 检查已移至 paper-figure-drawio 步骤，此处跳过
    DRAWIO_COUNT=$(ls figures/*.drawio 2>/dev/null | wc -l)
    [ "$DRAWIO_COUNT" -gt 0 ] && echo "  (DrawIO: $DRAWIO_COUNT files — will be validated by paper-figure-drawio step)" || echo "  (no DrawIO yet — will be generated by paper-figure-drawio step)"
fi

# 4. Figure check script passes
bash _utils/figure_check.sh 2>/dev/null || bash skills/shared-scripts/figure_check.sh 2>/dev/null
FC_EXIT=$?
[ "$FC_EXIT" -eq 0 ] && echo "✅ Figure check passed" || { echo "❌ Figure check failed (exit=$FC_EXIT) — fix color/style issues"; GATE_FAIL=$((GATE_FAIL+1)); }

# 4.1 图例/标注遮挡检查（代码层面）
echo "--- 图例遮挡风险检查 ---"
for script in figures/gen_fig*.py; do
    [ -f "$script" ] || continue
    bn=$(basename "$script")
    # 检查是否硬编码了 loc='upper right'（收敛曲线等场景容易遮挡）
    if grep -q "loc='upper right'" "$script" 2>/dev/null; then
        echo "  ⚠ $bn: 图例硬编码 loc='upper right' — 如果数据在右上角会遮挡，建议改为 loc='best'"
    fi
    # 检查是否有 annotate 和 legend 在同一区域
    HAS_ANNOTATE=$(grep -c 'ax.annotate\|ax.text' "$script" 2>/dev/null || echo 0)
    HAS_LEGEND=$(grep -c 'ax.legend' "$script" 2>/dev/null || echo 0)
    if [ "$HAS_ANNOTATE" -gt 0 ] && [ "$HAS_LEGEND" -gt 0 ]; then
        if ! grep -q "bbox_to_anchor\|loc='best'" "$script" 2>/dev/null; then
            echo "  ⚠ $bn: 同时有标注和图例但未用 loc='best' 或 bbox_to_anchor — 可能遮挡"
        fi
    fi
    # 检查 annotate 的 xytext 是否用硬编码偏移（容易超出图表边界）
    # plot_utils._clamp_texts_to_axes 会在 savefig 时自动裁剪，但最好从源头避免
    if [ "$HAS_ANNOTATE" -gt 0 ]; then
        HARDCODED_OFFSET=$(grep -cP 'xytext=\([^)]*\+\s*\d' "$script" 2>/dev/null || echo 0)
        if [ "$HARDCODED_OFFSET" -gt 2 ]; then
            echo "  ⚠ $bn: $HARDCODED_OFFSET 处 annotate 用硬编码偏移 — 数据靠近边缘时标注会超出图表"
            echo "    建议：用 textcoords='offset points' 或确保 xytext 在 ax.get_xlim()/get_ylim() 范围内"
        fi
    fi
done

# 4.5 TikZ/DrawIO — handled by paper-figure-drawio step, skip here
echo "  (TikZ/DrawIO diagrams will be generated and validated by the next step: paper-figure-drawio)"

# 4.6 GPT Image figures (if planned)
GPTIMG_PLANNED=$(grep -ci 'GPTIMG\|GPT.Image\|场景示意' PROBLEM_ANALYSIS.md 2>/dev/null || echo 0)
if [ "$GPTIMG_PLANNED" -gt 0 ]; then
    GPTIMG_PDF=$(ls figures/fig_scene*.pdf figures/fig_gptimg*.pdf 2>/dev/null | wc -l)
    if [ "$GPTIMG_PDF" -gt 0 ]; then
        echo "✅ GPT Image figures: $GPTIMG_PDF PDFs"
    else
        # Check if DrawIO fallback was used
        echo "  GPT Image: no PDFs (may have used DrawIO fallback — check GPTIMG_FAILED)"
    fi
else
    echo "  (no GPT Image planned)"
fi

# 5. Plan reconciliation count
PLAN_FIGS=0
for plan in PAPER_PLAN.md TOPIC_PLAN.md PROBLEM_ANALYSIS.md; do
    [ -f "$plan" ] || continue
    pf=$(grep -ci 'fig_\|图.*：\|figure.*:\|TABLE_' "$plan" 2>/dev/null || echo 0)
    [ "$pf" -gt "$PLAN_FIGS" ] && PLAN_FIGS=$pf
done
ACTUAL_TOTAL=$((PDFS + $(ls figures/TABLE_*.tex figures/TABLE_*.md 2>/dev/null | wc -l)))
if [ "$PLAN_FIGS" -gt 0 ]; then
    [ "$ACTUAL_TOTAL" -ge "$PLAN_FIGS" ] && echo "✅ Output count: $ACTUAL_TOTAL (plan: ~$PLAN_FIGS)" || { echo "❌ Only $ACTUAL_TOTAL outputs (plan: ~$PLAN_FIGS)"; GATE_FAIL=$((GATE_FAIL+1)); }
else
    echo "  Output count: $ACTUAL_TOTAL (no plan to compare)"
fi

# 6. No empty/tiny PDFs
TINY=0
HUGE=0
for pdf in figures/fig_*.pdf; do
    [ -f "$pdf" ] || continue
    sz=$(wc -c < "$pdf")
    [ "$sz" -lt 5000 ] && { echo "  ❌ $(basename $pdf) is only $sz bytes — likely broken"; TINY=$((TINY+1)); }
done
# Check for oversized PDFs (DrawIO/TikZ/GPT Image figures that might be too tall)
for pdf in figures/fig_roadmap.pdf figures/fig_framework.pdf figures/fig_flow_*.pdf figures/fig_model_*.pdf figures/fig_pipeline.pdf figures/fig_index_*.pdf figures/fig_network.pdf figures/fig_scene*.pdf; do
    [ -f "$pdf" ] || continue
    bn=$(basename "$pdf")
    # Use Python to check PDF page dimensions if possible
    dims=$($PYTHON -c "
try:
    from PyPDF2 import PdfReader
    r = PdfReader('$pdf')
    p = r.pages[0]
    w = float(p.mediabox.width) * 0.3528  # points to mm
    h = float(p.mediabox.height) * 0.3528
    ratio = h / w if w > 0 else 0
    print(f'{w:.0f}x{h:.0f}mm ratio={ratio:.2f}')
    if h > 250: print('TOO_TALL')
    if ratio > 1.8: print('TOO_NARROW')
except: pass
" 2>/dev/null)
    if echo "$dims" | grep -q 'TOO_TALL'; then
        echo "  ⚠ $bn 高度超过 250mm — 编译后可能占满整页，建议压缩"
        HUGE=$((HUGE+1))
    fi
    if echo "$dims" | grep -q 'TOO_NARROW'; then
        echo "  ⚠ $bn 宽高比过窄 — 用 width=0.6\\textwidth 而非 \\textwidth"
        HUGE=$((HUGE+1))
    fi
done
[ "$TINY" -eq 0 ] && echo "✅ All PDFs non-trivial" || { echo "❌ $TINY tiny/broken PDFs"; GATE_FAIL=$((GATE_FAIL+1)); }
[ "$HUGE" -eq 0 ] && echo "✅ All PDFs reasonable size" || echo "⚠ $HUGE oversized PDFs — adjust width in latex_includes.tex"

echo ""
[ "$GATE_FAIL" -eq 0 ] && echo "✅ ALL PASSED — figures ready for paper writing" || echo "❌ $GATE_FAIL FAILURES — fix and re-run"
```

**⛔ If GATE_FAIL > 0, fix every ❌ and re-run. Do NOT finish with any ❌.**

## Key Rules

- Data figures must be PDF. Do not use pgfplots to draw from CSV (path/column/encoding issues)
- DrawIO .drawio files export to PDF via `draw.io.exe --export --format pdf --crop`
- Primary output: `figures/` directory
- Temp files: `_tmp/`
- One script per figure, independently re-runnable
- Read data from JSON/CSV, do not hardcode values
