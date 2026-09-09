#!/bin/bash
# figure_check.sh — 数据图表代码质量自检
# 用法: bash _utils/figure_check.sh

echo "=== 图表代码质量自检 ==="
violations=0   # 只计 CRITICAL（进退出码，硬阻断）
warnings=0     # 建议项（打印提醒但不进退出码，避免因合法风格差异死循环）
for script in figures/gen_fig*.py; do
    [ -f "$script" ] || continue
    bn=$(basename "$script")
    # 硬编码颜色 — 允许少量自创协调色作特殊高亮（WARNING，不阻塞）
    # 真正"简陋"信号是缺 setup_style / 用 #1f77b4 默认蓝 / RdYlGn 红绿灯，这些下面分别 CRITICAL
    # ⛔ 先完整收集所有违规行（用于真实计数），再单独 head -3 用于显示
    real_hardcoded_all=$(grep -Pn "color\s*=\s*['\"]#[0-9a-fA-F]{3,8}['\"]" "$script" 2>/dev/null | grep -v "PALETTE\|COLORS\[" | grep -v "edgecolor.*white\|facecolor.*white\|cmap\|linecolor")
    if [ -n "$real_hardcoded_all" ]; then
        real_count=$(echo "$real_hardcoded_all" | grep -c . | head -1)
        real_count=${real_count:-0}
        if [ "$real_count" -gt 2 ]; then
            echo "CRITICAL $bn: 多个硬编码颜色 ($real_count 处) 绕过 PALETTE — FIX: 改用 PALETTE[n] / COLORS['up/down'] 统一调色"
            echo "$real_hardcoded_all" | head -3
            violations=$((violations+1))
        else
            echo "INFO $bn: $real_count 个硬编码颜色（≤2 允许作高亮，但建议用 COLORS['highlight'/'up'/'down'] 跟随调色板）"
        fi
    fi
    # 检测英文颜色名 — 'gray/grey' 做参考线常见，降为 WARNING；其他鲜艳色才 CRITICAL
    bright_named=$(grep -Pn "color\s*=\s*['\"](?:red|blue|green|orange|purple|brown)['\"]" "$script" 2>/dev/null | grep -v "PALETTE\|COLORS\[" | head -3)
    if [ -n "$bright_named" ]; then
        echo "CRITICAL $bn: CSS 鲜艳命名色 (red/blue/green/orange) — 与 matplotlib 默认色调一致，FIX: 用 PALETTE[n] 或 COLORS['up/down/highlight']"
        echo "$bright_named" | head -3
        violations=$((violations+1))
    fi
    # gray/grey/black 做参考线/网格的语义色 → INFO 提示用 COLORS['ref_line'/'grid'/'text']
    neutral_named=$(grep -Pn "color\s*=\s*['\"](?:grey|gray|black)['\"]" "$script" 2>/dev/null | grep -v "PALETTE\|COLORS\[" | head -3)
    if [ -n "$neutral_named" ]; then
        echo "INFO $bn: gray/grey/black 中性色 — 可用，但建议替换为 COLORS['ref_line'/'grid'/'text'] 跟随主题"
    fi
    # 整图标题 plt.title / suptitle → CRITICAL：标题只能由 LaTeX caption 管，图内不许有整图标题。
    # ⛔ 不查 ax.set_title：真实图里它几乎都是合法的子图面板标签 (a)/(b)/(c)（带 loc='left'），
    #    是学术规范做法，若一并硬禁会误杀大量多子图脚本 → 制造新的死循环。
    if grep -nE 'plt\.title|\.suptitle' "$script" 2>/dev/null; then
        echo "CRITICAL $bn: plt.title/suptitle 整图标题 — 标题必须只在 LaTeX caption 中，删掉图内整图标题（子图面板标签 ax.set_title('(a)…') 合法可保留）"; violations=$((violations+1))
    fi
    # 没有 setup_style — CRITICAL: will produce ugly matplotlib default styling
    if ! grep -q 'setup_style' "$script" 2>/dev/null; then
        echo "CRITICAL $bn: missing setup_style() — figure will use ugly matplotlib defaults — FIX: add 'from _utils.plot_utils import setup_style; setup_style()' at top"; violations=$((violations+1))
    fi
    # 没有 PALETTE 引用 — likely using hardcoded or default colors
    if ! grep -q 'PALETTE' "$script" 2>/dev/null && ! grep -q 'setup_style' "$script" 2>/dev/null; then
        echo "CRITICAL $bn: no PALETTE and no setup_style — colors will be matplotlib default blue — FIX: add setup_style() and use PALETTE[0], PALETTE[1]"; violations=$((violations+1))
    fi
    # 默认蓝色
    if grep -n '1f77b4' "$script" 2>/dev/null; then
        echo "CRITICAL $bn: matplotlib 默认蓝色 #1f77b4 — FIX: replace with PALETTE[0]"; violations=$((violations+1))
    fi
    # 红绿灯配色 (RdYlGn)
    if grep -n 'RdYlGn' "$script" 2>/dev/null; then
        echo "CRITICAL $bn: RdYlGn colormap (traffic light) — FIX: use cmap='coolwarm' instead"; violations=$((violations+1))
    fi
    # RdBu_r 深沉配色
    if grep -n "cmap.*['\"]RdBu_r['\"]" "$script" 2>/dev/null; then
        echo "CRITICAL $bn: RdBu_r colormap is too dark — FIX: use cmap='coolwarm' instead"; violations=$((violations+1))
    fi
    # RdBu 也太重
    if grep -Pn "cmap\s*=\s*['\"]RdBu['\"]" "$script" 2>/dev/null; then
        echo "CRITICAL $bn: RdBu colormap is too dark — FIX: use cmap='coolwarm' instead"; violations=$((violations+1))
    fi
    # 深色背景主题
    if grep -n "dark_background\|darkgrid\|set_style.*dark" "$script" 2>/dev/null; then
        echo "CRITICAL $bn: dark background theme — FIX: use setup_style() which sets white background"; violations=$((violations+1))
    fi
    # .pdf 污染 — 路径/变量名被 .pdf 后缀污染
    if grep -n "setup_style.*\.pdf\|sys\.path.*\.pdf\|palette=.*\.pdf\|xlabel.*\.pdf\|ylabel.*\.pdf\|copy2.*\.pdf'" "$script" 2>/dev/null; then
        echo "CRITICAL $bn: .pdf suffix leaked into code (setup_style/path/label) — remove .pdf from non-filename strings"; violations=$((violations+1))
    fi
    # 深色/土色检测 — JAMA/Lancet/AAAS/Morandi 等土色配色，应改用 Soft/Tableau/NPG/NEJM
    if grep -Pn '#374E55|#00468B|#3B4992|#80796B|#1B1919|#631879|#AD002A|#96C0CE.*#C4956A|#2c3e50|#2C3E50|#34495e|#34495E' "$script" 2>/dev/null | grep -v '^#\|^\s*#' ; then
        echo "WARNING $bn: dark/earth tone colors detected — use PALETTE[n] or setup_style() instead"; warnings=$((warnings+1))
    fi
    # 已移除的土色配色方案名称检测
    if grep -n "palette='jama'\|palette='lancet'\|palette='aaas'\|palette='morandi'" "$script" 2>/dev/null; then
        echo "WARNING $bn: removed ugly palette — use setup_style() (Soft) or 'tableau'/'npg'/'nejm'/'science'/'colorblind'"; warnings=$((warnings+1))
    fi
    # colormap 渐变色
    if grep -n 'plt\.cm\.\|cm\.get_cmap\|LinearSegmentedColormap' "$script" 2>/dev/null | grep -v 'heatmap\|contour\|imshow\|pcolormesh' ; then
        echo "WARNING $bn: 柱状图/折线图不应用 colormap"; warnings=$((warnings+1))
    fi
    # ax.grid
    if grep -n 'ax\.grid\|plt\.grid' "$script" 2>/dev/null; then
        echo "WARNING $bn: 不要手动 ax.grid()（如确需网格读数可保留）"; warnings=$((warnings+1))
    fi
    # 空数值占位符
    if grep -n "= $\|= '\|= \"" "$script" 2>/dev/null | grep -i 'coef\|effect\|path\|a =\|b =\|c =' ; then
        echo "WARNING $bn: 空数值占位符"; warnings=$((warnings+1))
    fi
done
echo "自检完成: $violations 个 CRITICAL（阻断） + $warnings 个 WARNING（仅提醒，不阻断）"


# === Chart type anti-pattern detection ===
echo ""
echo "=== 图表类型反模式检测 ==="
type_violations=0
for script in figures/gen_fig*.py; do
    [ -f "$script" ] || continue
    bn=$(basename "$script")
    # Detect plain bar charts — only warn if it's the 4th+ bar chart in the project
    bar_count=$(grep -rl 'ax\.bar\b\|plt\.bar\b' figures/gen_fig*.py 2>/dev/null | wc -l)
    if grep -n 'ax\.bar\b\|plt\.bar\b' "$script" 2>/dev/null | grep -v 'bar3d\|barh\|waterfall\|stacked' > /dev/null; then
        if [ "$bar_count" -gt 3 ]; then
            echo "UPGRADE $bn: 第 ${bar_count} 个柱状图 → 同类型不超过 3 次，考虑换其他图表类型"
            type_violations=$((type_violations+1))
        fi
    fi
    # Detect plain box plots (should be Rain Cloud)
    if grep -n 'boxplot\|box_plot' "$script" 2>/dev/null | grep -v 'rain\|violin\|strip\|swarm' > /dev/null; then
        echo "UPGRADE $bn: plain box plot → use Rain Cloud Plot (violin + box + strip)"
        type_violations=$((type_violations+1))
    fi
    # Detect pie charts (should be Donut/Waffle)
    if grep -n 'plt\.pie\|ax\.pie' "$script" 2>/dev/null | grep -v 'donut\|waffle\|wedgeprops' > /dev/null; then
        echo "UPGRADE $bn: pie chart → use Donut Chart (add wedgeprops + pctdistance)"
        type_violations=$((type_violations+1))
    fi
    # Detect plain horizontal bar for importance (should be SHAP)
    if grep -n 'barh' "$script" 2>/dev/null | grep -qi 'importance\|feature\|variable' 2>/dev/null; then
        echo "UPGRADE $bn: horizontal bar for feature importance → use SHAP Summary Plot"
        type_violations=$((type_violations+1))
    fi
    # Detect plain heatmap without dendrogram
    if grep -n 'heatmap\|imshow' "$script" 2>/dev/null | grep -qi 'corr\|matrix' 2>/dev/null; then
        if ! grep -q 'dendrogram\|clustermap\|linkage' "$script" 2>/dev/null; then
            echo "UPGRADE $bn: plain correlation heatmap → add dendrogram clustering"
            type_violations=$((type_violations+1))
        fi
    fi
    # Detect heatmap/imshow with very few rows (≤3 models → should be table or dumbbell)
    if grep -q 'heatmap\|imshow' "$script" 2>/dev/null; then
        # Check if data array has ≤3 rows
        few_rows=$(python3 -c "
import re
with open('$script') as f: c = f.read()
# Find array definitions like np.array([[...],[...],...])
for m in re.finditer(r'np\.array\(\[(\[.*?\](?:,\s*\[.*?\])*)\]\)', c, re.DOTALL):
    rows = m.group(1).count('[')
    if rows <= 3: print('FEW_ROWS'); break
" 2>/dev/null)
        if [ "$few_rows" = "FEW_ROWS" ]; then
            echo "UPGRADE $bn: heatmap with ≤3 rows → use Dumbbell Chart or Three-line table instead"
            type_violations=$((type_violations+1))
        fi
    fi
done
echo "图表类型检测: $type_violations 个可升级"

total=$((violations + type_violations))
echo ""
echo "=== 总计: $violations 个违规 + $type_violations 个可升级 ==="

# === 配方使用检测 ===
echo ""
echo "=== 配方代码使用检测 ==="
recipe_issues=0
for script in figures/gen_fig*.py; do
    [ -f "$script" ] || continue
    bn=$(basename "$script")
    # 检查是否用了 save_fig（配方标准保存方式）
    if ! grep -q 'save_fig\|savefig' "$script" 2>/dev/null; then
        echo "WARNING $bn: 没有 save_fig/savefig 调用"; recipe_issues=$((recipe_issues+1))
    fi
    # 检查是否用了 seaborn 高级 API 而不是配方代码
    if grep -q 'sns\.barplot\|sns\.boxplot\|sns\.violinplot\|sns\.lineplot\|sns\.scatterplot' "$script" 2>/dev/null; then
        if ! grep -q 'figure_recipes\|recipe\|配方' "$script" 2>/dev/null; then
            echo "UPGRADE $bn: 使用了 seaborn 高级 API — 应参考配方代码获得更好的视觉效果（渐变填充、标注框等）"
            recipe_issues=$((recipe_issues+1))
        fi
    fi
    # 检查是否有 smart_labels（标签密集的图应该用）
    # 注：grep -c 在某些环境会返回多行，用 head -1 + 默认 0 保证整数
    text_count=$(grep -c 'ax\.text\|ax\.annotate' "$script" 2>/dev/null | head -1)
    text_count=${text_count:-0}
    if [ "$text_count" -gt 3 ] && ! grep -q 'smart_labels\|adjust_text\|adjustText' "$script" 2>/dev/null; then
        # 区分 2D / 3D：3D 用不了 smart_labels/adjustText（自动防遮挡对 3D 投影无效），
        # 必须手动防遮挡，否则会像"M1初始/FY1初始/遮蔽"糊成一团（真实翻车）。
        if grep -qE "projection=['\"]3d['\"]|Axes3D|plot_surface|scatter3|\.plot3D|add_subplot.*3d" "$script" 2>/dev/null; then
            echo "WARNING $bn: 3D 图有 $text_count 个文字标注 — 3D 用不了 smart_labels，必须手动防遮挡：点旁只放短代号(M1/F1/E)+全称进图例，或 xytext 异向偏移+引线，或只标图例。别让标注糊成一团。"
        else
            echo "WARNING $bn: $text_count 个文字标注但没用 smart_labels — 可能重叠遮挡。按优先级处理："
            echo "         ① 结论/说明性文字（多行、成句）→ 搬进 LaTeX \\caption{}，图内别留"
            echo "         ② 柱顶/条端数值 → 改用 ax.bar_label(bars, fmt='%.2f', padding=2) 自动定位"
            echo "         ③ 系列身份 → 用图例（挤就 bbox_to_anchor=(1.02,1) 移轴外）"
            echo "         ④ 剩下真需留在图内的点标注 → smart_labels(ax, xs, ys, texts) 自动推开"
        fi
        recipe_issues=$((recipe_issues+1))
    fi
    # 多行文字框压在数据上 —— 遮挡最常见成因（结论塞进绘图区）
    # 用 python 做括号配平解析（grep 无法可靠匹配跨行调用）
    if command -v python >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1; then
        _PY=$(command -v python || command -v python3)
        multiline_box=$("$_PY" - "$script" <<'PYEOF' 2>/dev/null
import re, sys
try:
    src = open(sys.argv[1], encoding='utf-8', errors='replace').read()
except Exception:
    print(0); raise SystemExit
n = 0
for m in re.finditer(r'\.(?:text|annotate)\(', src):
    i = m.end() - 1
    depth = 0
    for j in range(i, min(len(src), i + 3000)):
        if src[j] == '(':
            depth += 1
        elif src[j] == ')':
            depth -= 1
            if depth == 0:
                blk = src[i + 1:j]
                # 带背景框 + 文字含换行 + 不是画在图级坐标(轴外)
                if 'bbox' in blk and blk.count('\\n') >= 1 \
                        and 'transFigure' not in blk:
                    n += 1
                break
print(n)
PYEOF
)
        multiline_box=${multiline_box:-0}
        if [ "$multiline_box" -gt 0 ] 2>/dev/null; then
            echo "WARNING $bn: $multiline_box 处「多行文字框」压在绘图区 — 这是遮挡数据的首要成因。"
            echo "         多行结论（如\"中位 13.0 / 占比 5.12% / 越界 0 行\"）属于图注的内容，"
            echo "         请搬进 LaTeX \\caption{}（caption 可写长、不遮挡、可检索，信息零丢失），"
            echo "         图内最多留一个 ≤1 行的短锚点标签。"
            recipe_issues=$((recipe_issues+1))
        fi
    fi
    # ⛔ 对数轴跨了太多数量级 → 图边一大片空白（曲线在那段只是一条平线）
    #    ⛔ 判据不能看"地板绝对值多小"：1e-3 对数据主体在 10^1~10^2 的图太小，但对本身
    #    就在 1e-4 量级的数据是合理的。所以改为【算轴跨几个数量级】——这个能静态算出来。
    #    实测翻车：ECDF 图 FLOOR=1e-3 + set_xlim(FLOOR*0.8, 1000) → 轴跨 6.1 个数量级、
    #    左边约 40% 图宽纯空白。>4 个数量级即提示（真横跨那么多量级的数据可忽略本条）。
    _PYSPAN=$(command -v python 2>/dev/null || command -v python3 2>/dev/null)
    if [ -n "$_PYSPAN" ] && grep -qE "set_[xy]scale\(['\"]log" "$script" 2>/dev/null; then
        _span=$("$_PYSPAN" - "$script" 2>/dev/null <<'PYSPAN'
import re, sys
src = open(sys.argv[1], encoding='utf-8', errors='ignore').read()
# 收集字面量常量（FLOOR/LOG_FLOOR 等）
consts = {}
for m in re.finditer(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([0-9.]+e-?[0-9]+|[0-9.]+)\s*(?:#.*)?$',
                     src, re.M):
    try:
        consts[m.group(1)] = float(m.group(2))
    except ValueError:
        pass


def val(tok):
    tok = tok.strip()
    m = re.fullmatch(r'([A-Za-z_][A-Za-z0-9_]*)\s*\*\s*([0-9.]+)', tok)
    if m and m.group(1) in consts:
        return consts[m.group(1)] * float(m.group(2))
    if tok in consts:
        return consts[tok]
    try:
        return float(tok)
    except ValueError:
        return None


best = 0.0
for ax_ in ('x', 'y'):
    if not re.search(r"set_%sscale\(['\"]log" % ax_, src):
        continue
    for m in re.finditer(r'set_%slim\(([^,)]+),\s*([^,)]+)\)' % ax_, src):
        lo, hi = val(m.group(1)), val(m.group(2))
        if lo and hi and lo > 0 and hi > lo:
            import math
            best = max(best, math.log10(hi / lo))
print('%.1f' % best)
PYSPAN
)
        if [ -n "$_span" ] && awk "BEGIN{exit !($_span > 4.0)}" 2>/dev/null; then
            recipe_issues=$((recipe_issues+1))
            echo "WARNING $bn: 对数轴跨了 $_span 个数量级 — 图边可能有一大片空白（曲线在那段只是平线）。"
            echo "         多为「零值地板设得远低于真实数据」所致。改法：real=v[v>1e-6]；"
            echo "         FLOOR=10**(floor(log10(real.min()))-0.5)，再让 lim 贴着地板给；"
            echo "         并把「N 个 =0 已并入端点」标出来（数据诚实）。数据真横跨这么多量级则可忽略。"
        fi
    fi
    # ⛔ 图例带灰框（显土的主要来源，实证：高分图去框 37% vs 平庸图 0%）
    if grep -q 'frameon=True' "$script" 2>/dev/null; then
        recipe_issues=$((recipe_issues+1))
        echo "WARNING $bn: 图例写了 frameon=True（带灰框显土）— 改成"
        echo "         legend(frameon=False, labelspacing=0.35, handlelength=1.6, ...)"
    fi
    # 检查是否有 auto_legend
    if grep -q 'ax\.legend\|plt\.legend' "$script" 2>/dev/null && ! grep -q 'auto_legend' "$script" 2>/dev/null; then
        echo "INFO $bn: 使用了 ax.legend() — 建议改用 auto_legend(ax) 自动选位（已默认去框）"
    fi
done
echo "配方检测: $recipe_issues 个问题"

# === 原生画布过大闸（治"坐标轴糊成一团 + 线条发虚"的真根因）===
# 实测坐实：国赛A题 fig_q4_snapshots 写 figsize=(10.4,10)，论文按 0.85\textwidth 引用 →
# 缩到 5.5in（比 0.53）→ 刻度 8.5pt 变 4.5pt、数据线 lw0.6 变 0.32pt → 肉眼就是"乱套+模糊"。
# 同工作区 13 张数据图有 7 张原生宽 >8.5in，是系统性问题，故加此闸。
# ⛔ 判据必须【按长宽比分档】，不能拿一个宽度一刀切：fig_include_size.py 按 r=高/宽 给
#    width 系数(r≤0.8→0.85 / ≤1.2→0.70 / ≤1.6→0.50 / >1.6→0.42)，上页显示宽差一倍多。
#    近方图(2×2、等比例几何图)只拿 0.70\textwidth=4.55in —— 写 7.2in 看着"没超7.5"，
#    实际仍被缩到 0.63、刻度 8.5pt 变 5.4pt（真踩过）。故按档比对"该写的原生宽"。
echo ""
echo "=== 原生画布尺寸体检（按长宽比分档，治缩放后字糊线虚）==="
_big_canvas=0
# ⛔ 路径口径必须与本脚本其他循环一致（figures/gen_fig*.py，从工作区根跑）：
#    SKILL 的调用是 `bash _utils/figure_check.sh`（cwd=工作区根）。曾误写成当前目录的
#    `gen_fig_*.py` → 实际使用时本闸静默不工作（在 figures/ 内测才"看起来正常"）。
for f in figures/gen_fig*.py; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    # 抓该脚本里"宽最大"的那个 figsize 的宽和高（多个 figsize / plt.figure 都算）
    _wh=$(grep -ohE 'figsize=\([0-9]+\.?[0-9]*[[:space:]]*,[[:space:]]*[0-9]+\.?[0-9]*' "$f" 2>/dev/null \
          | sed -E 's/figsize=\(//; s/[[:space:]]//g' | sort -t, -g -k1 | tail -1)
    _w=""; _h=""
    if [ -n "$_wh" ]; then
        _w=${_wh%%,*}; _h=${_wh##*,}
    fi
    # ⛔ 高度是变量/表达式（如 figsize=(11, _fig_h)、(7.0, max(4, n*0.25))，barh/甘特/时间线常见）：
    #    上面的正则抓不到高 → 绝不能整脚本跳过（旧版一刀切只看宽，这类反而能抓到，新版按档判会漏 → 回归）。
    #    兜底：只取宽度，按【最宽松的横图档】保守判（宁漏不误报），并在提示里说明高度未知。
    _hguess=0
    if [ -z "$_w" ]; then
        _w=$(grep -ohE 'figsize=\([0-9]+\.?[0-9]*' "$f" 2>/dev/null \
             | grep -oE '[0-9]+\.?[0-9]*' | sort -g | tail -1)
        [ -z "$_w" ] && continue
        _hguess=1
    fi
    # 宽度为 0 或非法 → 跳过，防除零
    awk "BEGIN{exit !($_w > 0)}" 2>/dev/null || continue
    # r=高/宽 → 分档给 (上页显示宽, 该写的原生宽, 档位名)
    if [ "$_hguess" = "1" ]; then
        _r="?"; _disp=5.53; _want=6.0; _tag="高度为变量→按最宽松横图档估"
    else
        _r=$(awk "BEGIN{printf \"%.4f\", $_h/$_w}")
        if   awk "BEGIN{exit !($_r <= 0.80)}"; then _disp=5.53; _want=6.0; _tag="横图(0.85tw)"
        elif awk "BEGIN{exit !($_r <= 1.20)}"; then _disp=4.55; _want=5.0; _tag="近方图(0.70tw)"
        elif awk "BEGIN{exit !($_r <= 1.60)}"; then _disp=3.25; _want=3.6; _tag="偏竖(0.50tw)"
        else                                        _disp=2.73; _want=3.0; _tag="瘦高(0.42tw)"
        fi
    fi
    _k=$(awk "BEGIN{printf \"%.2f\", $_disp/$_w}")
    # 只在"原生明显大于该档目标"时报（留 15% 余量，避免把 5.4 这类合理值也报）
    if awk "BEGIN{exit !($_w > $_want * 1.15)}" 2>/dev/null; then
        _big_canvas=$((_big_canvas+1))
        _fs=$(grep -ohE 'labelsize=[0-9]+\.?[0-9]*|FS_TICK[[:space:]]*=[[:space:]]*[0-9]+\.?[0-9]*' "$f" 2>/dev/null \
              | grep -oE '[0-9]+\.?[0-9]*' | sort -g | head -1)
        [ -z "$_fs" ] && _fs=8.5
        _onpage=$(awk "BEGIN{printf \"%.1f\", $_fs * $_k}")
        if [ "$_hguess" = "1" ]; then
            echo "WARNING $bn: figsize 宽=${_w}in（高度是变量/表达式，无法定档）→ $_tag，按 ${_disp}in 估"
        else
            echo "WARNING $bn: figsize=(${_w},${_h}) → r=$_r 属 $_tag，上页只显示 ${_disp}in"
        fi
        echo "         缩放比 $_k ，刻度 ${_fs}pt → 上页约 ${_onpage}pt$(awk "BEGIN{exit !($_onpage < 6.5)}" && echo " ⛔低于6.5pt可辨下限")"
        echo "         改法：该档原生宽写 ${_want}in 左右（原生宽≈上页显示宽，缩放比才落 0.9-1.1）。"
        echo "         ⛔ 别只看「没超 7.5」——近方图 7.2in 仍会被缩到 0.63。要信息量请加 panel 密度，别摊大画布。"
    fi
done
if [ "$_big_canvas" -eq 0 ]; then
    echo "  ✅ 各脚本原生画布宽都贴合其长宽比档位（缩放比 ~0.9-1.1，字号线宽不腰斩）"
else
    echo "  ⚠ $_big_canvas 个脚本画布相对其档位过大 — 缩放后字糊线虚的根因，按上面改法收窄"
fi

# === 图表能力体检（全局口径，不阻塞；治"图画得能跑但很平庸"）===
# 依据：对 94 张真实竞赛图逐图核对发现，高分图与平庸图的差距集中在
# 多 panel / 判据线 / 不确定性 / 图型丰富度，而不在图内文字多少。
# 故此处按【全篇合计】给建议，不逐图判定（单张简单图完全合理）。
echo ""
echo "=== 图表能力体检（全篇合计，仅建议不阻塞）==="
n_fig=0; n_multi=0; n_band=0; n_ref=0; n_adv=0; n_doc=0
for script in figures/gen_fig*.py; do
    [ -f "$script" ] || continue
    n_fig=$((n_fig+1))
    # 多 panel 识别：subplots(2,..) / subplots(1,2) 横向两栏 / add_subplot(gs..或 n,m) / GridSpec 都算。
    # ⛔ 必须排除 add_subplot(111) 与 add_subplot(1,1,1)：那是单 panel 的常见写法，
    #    误算成多 panel 会让「全篇无多 panel」这条建议永远不触发（假阴性）。
    if grep -qE 'subplots\([[:space:]]*[2-9]|subplots\([[:space:]]*[0-9]+[[:space:]]*,[[:space:]]*[2-9]|GridSpec|add_gridspec' "$script" 2>/dev/null \
        || grep -E 'add_subplot\(' "$script" 2>/dev/null \
           | grep -qvE 'add_subplot\([[:space:]]*(111|1[[:space:]]*,[[:space:]]*1[[:space:]]*,[[:space:]]*1)[[:space:]]*\)'; then
        n_multi=$((n_multi+1))
    fi
    grep -q 'fill_between\|errorbar\|yerr=' "$script" 2>/dev/null && n_band=$((n_band+1))
    grep -q 'axhline\|axvline\|axhspan\|axvspan' "$script" 2>/dev/null && n_ref=$((n_ref+1))
    grep -qE 'plot_surface|violinplot|hexbin|contourf|stackplot|boxplot|imshow|pcolormesh|barh|step\(|quiver|projection=' "$script" 2>/dev/null && n_adv=$((n_adv+1))
    # 查前 12 行（不止 5 行）：coding 声明 + 若干行注释后才写 docstring 的写法很常见，
    # 只看 5 行会漏判成「没写说明」
    head -12 "$script" 2>/dev/null | grep -q '"""' && n_doc=$((n_doc+1))
done
if [ "$n_fig" -gt 0 ]; then
    echo "  多 panel 图: $n_multi/$n_fig | 含不确定性(置信带/误差棒): $n_band/$n_fig"
    echo "  含判据线(阈值/上限/约束): $n_ref/$n_fig | 含进阶图型: $n_adv/$n_fig | 有文件级说明: $n_doc/$n_fig"
    # 阈值取"全篇几乎为零"才提示，避免误伤合理的简单图集
    if [ "$n_fig" -ge 5 ] && [ "$n_multi" -eq 0 ]; then
        echo "  ⚠ 全篇没有一张多 panel 图 — 相关的几件事（分布+与上限对照、主结果+残差诊断、"
        echo "     处理前‖处理后）合成 2-4 panel 一张图，读者能看到关联，档次明显高于分成多张孤图。"
    fi
    if [ "$n_fig" -ge 5 ] && [ "$n_ref" -eq 0 ]; then
        echo "  ⚠ 全篇没有任何判据线 — 题目若有阈值/上限/约束/合格线，画一条 axhline/axvline(虚线+短标签)，"
        echo "     让读者直接看到\"实测离限还有多远\"。这是\"有判据\"和\"只有一堆曲线\"的分水岭。"
    fi
    if [ "$n_fig" -ge 5 ] && [ "$n_band" -eq 0 ]; then
        echo "  ⚠ 全篇没有不确定性表达 — 有重复实验/置信区间/误差范围时用 fill_between 画带或 errorbar，"
        echo "     光溜一条均值线读者无法判断可信度。（确实无重复数据可忽略本条）"
    fi
    if [ "$n_fig" -ge 5 ] && [ "$n_adv" -eq 0 ]; then
        echo "  ⚠ 全篇只用了折线/柱状/散点 — 按数据形态挑更贴切的图型（三维响应面 plot_surface、"
        echo "     分布形态 violin/Rain Cloud、密集散点 hexbin、流向桑基、驱动因子 Tornado）。"
        echo "     详见 figure_style_guide.md 的决策表与「图表质量跃升清单」。"
    fi
    if [ "$n_fig" -ge 5 ] && [ "$n_doc" -eq 0 ]; then
        echo "  ⚠ 没有脚本写文件级说明 — 开头用三引号写明「本图讲什么+每个panel是什么+数据来源」，"
        echo "     写的过程会迫使先想清楚\"要让读者看到什么\"，是\"先想再画\"和\"边画边凑\"的分界。"
    fi
    echo "  （以上均为建议：按赛题实际需要挑用，不要为凑指标硬加不相关的图元）"
fi

# === 规划对照检测 ===
echo ""
echo "=== 规划对照检测 ==="
plan_file=""
for pf in TOPIC_PLAN.md PROBLEM_ANALYSIS.md PAPER_PLAN.md; do
    [ -f "$pf" ] && plan_file="$pf" && break
done
if [ -n "$plan_file" ]; then
    echo "规划文档: $plan_file"
    # 提取规划中的图表文件名
    planned=$(grep -oP 'fig_\w+' "$plan_file" 2>/dev/null | sort -u)
    generated=$(ls figures/gen_fig_*.py 2>/dev/null | sed 's|figures/gen_||;s|\.py||' | sort -u)
    plan_count=$(echo "$planned" | grep -c . 2>/dev/null || echo 0)
    gen_count=$(echo "$generated" | grep -c . 2>/dev/null || echo 0)
    echo "规划图表: $plan_count 个 | 已生成脚本: $gen_count 个"
    # 检查缺失
    missing=0
    for fig in $planned; do
        if ! ls figures/gen_${fig}*.py 2>/dev/null > /dev/null; then
            echo "MISSING: $fig — 规划中有但未生成脚本"
            missing=$((missing+1))
        fi
    done
    if [ "$missing" -eq 0 ]; then
        echo "✅ 所有规划图表都有对应脚本"
    else
        echo "❌ $missing 个规划图表缺失脚本"
    fi
else
    echo "⚠ 未找到规划文档（TOPIC_PLAN.md / PROBLEM_ANALYSIS.md / PAPER_PLAN.md）"
fi

# === 规划图型 vs 实际代码 内容级对账（治「规划写等高线、画出来是条形图」）===
# 上面只对到「图名有没有对应脚本」(文件级)；这里对「画的是不是规划要求的图型」(内容级)。
# 实测：某工作区 14 张图有 3 张跑偏（等高线→barh / 棒棒糖→plot / 收敛曲线→bar），
# 而两个高分工作区 32 张可判定图 0 误报 —— 信号强、误伤低。仅 WARNING，不进退出码。
_RA=""
for _p in _utils/recipe_audit.py skills/shared-scripts/recipe_audit.py \
          ../skills/shared-scripts/recipe_audit.py; do
    [ -f "$_p" ] && _RA="$_p" && break
done
if [ -n "$_RA" ]; then
    _PYA=""
    for _c in "$MH_PYTHON" python python3; do
        [ -z "$_c" ] && continue
        command -v "$_c" >/dev/null 2>&1 && _PYA="$_c" && break
    done
    if [ -n "$_PYA" ]; then
        echo ""
        # ⛔ 必须给 PYTHONIOENCODING=utf-8：Windows 下 python 往管道输出默认走 GBK，
        #    遇到 ⚠ · — 等字符会 UnicodeEncodeError 直接崩，只剩标题行（实测踩过）。
        PYTHONIOENCODING=utf-8 "$_PYA" "$_RA" 2>/dev/null || true
    fi
fi

total=$((violations + type_violations + recipe_issues))
echo ""
echo "=========================================="
echo "  总计: $violations 违规 + $type_violations 可升级 + $recipe_issues 配方问题"
echo "=========================================="
exit $violations
