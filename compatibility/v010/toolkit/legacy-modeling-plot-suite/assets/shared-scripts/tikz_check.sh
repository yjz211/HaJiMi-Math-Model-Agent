#!/bin/bash
# tikz_check.sh — TikZ 架构图质量自检
# 用法: bash _utils/tikz_check.sh figures/tikz_architecture_examples.tex

tikz_file="${1:-figures/tikz_architecture_examples.tex}"
[ -f "$tikz_file" ] || { echo "TikZ 文件不存在: $tikz_file，跳过"; exit 0; }

# ⛔ 解析可用 Python：优先用后端注入的 $MH_PYTHON（已排除 Windows 商店占位符 python3）。
# 直接裸用 python3 在 Win10/11 上会命中商店占位符——它不执行代码、-c 时非0退出，
# 导致下面的几何检测全空转还虚增 critical。所以挑一个能真正跑 import 的解释器。
PYTHON=""
for _cand in "$MH_PYTHON" python python3 "py -3"; do
    [ -z "$_cand" ] && continue
    if $_cand -c "import sys" >/dev/null 2>&1; then PYTHON="$_cand"; break; fi
done
[ -z "$PYTHON" ] && PYTHON=python

echo "=== TikZ 架构图质量自检: $tikz_file ==="
critical=0

# 模板配色检查（支持 rgb,255 与命名色两种方案）
# ⛔ 豁免场景：几何示意图(受力/光路/几何构造，模板 F/G/J)与 C 族黑白线稿本就该「黑白灰、
#    节点无彩色底填充」，硬要 ≥2 个 rgb,255 会与 tikz_rules.md 的几何图铁律 / SKILL 的
#    「默认黑白配色」正面对撞——几何图每轮必报此 CRITICAL，被逼反复改+重编直到耗尽轮次
#    或取巧用 rgb,255 声明白色。故先判定图种：几何图 / 纯黑白 / 已用命名色方案 → 跳过本检查
#    （彩虹、深色、多色由后面独立检查兜底，不受影响）。
has_rgb_style=$(grep -c 'rgb,255:red,' "$tikz_file" 2>/dev/null); has_rgb_style=${has_rgb_style:-0}
skip_palette=0
# (a) 几何图特征：\coordinate 声明 或 calc 库
grep -qE '\\coordinate|\\usetikzlibrary\{[^}]*calc' "$tikz_file" 2>/dev/null && skip_palette=1
# (b) 已用命名色浅填充方案（如 fill=blue!6 / green!5）——视为已选定配色，不强制 rgb,255
grep -qP 'fill=\w+!\d' "$tikz_file" 2>/dev/null && skip_palette=1
# (c) 纯黑白线稿：全图无任何命名彩色 / rgb,255 彩色
if ! grep -qP '(rgb,255:red|=\{?(red|orange|green|blue|cyan|violet|purple|brown|teal|indigo|olive|pink|lime|magenta|yellow)\b)' "$tikz_file" 2>/dev/null; then skip_palette=1; fi
if [ "$has_rgb_style" -lt 2 ] && [ "$skip_palette" = "0" ]; then
    echo "CRITICAL: 节点没有使用配色（rgb,255 或 命名色浅填充方案，见 tikz_rules.md 6 套方案）"; critical=$((critical+1))
elif [ "$skip_palette" = "1" ] && [ "$has_rgb_style" -lt 2 ]; then
    echo "INFO: 几何图/黑白线稿/命名色方案 — 跳过「节点成套 rgb,255 配色」检查（彩虹/深色仍照查）"
fi

# ⛔ 裸颜色名覆盖填充检测（"图例框渲染成纯黑块"的根因）
# TikZ 里裸颜色名(如 black / red)等价于 color=，会【同时设 draw 和 fill】。当 node 选项里
# fill=<浅色> 之后又跟一个裸颜色名(AI 想设文字色却裸写 black)，裸色会把浅色填充覆盖掉：
#   \node[fill=gray!8,...,black]{图例}  → 黑底 + 黑字 = 一整条纯黑块（图例文字全看不见）
# 正确写法：设文字色用 text=black（不碰 fill）。此检测抓 fill= 之后的裸颜色名。
# ⛔ 用 quoted heredoc（'PYEOF'）原样喂 Python，避开 python -c 双引号里 \node \d \{ 的转义地狱；
#    文件路径经环境变量 MH_TIKZ_FILE 传入（不拼进代码，防路径含特殊字符/注入）。
legend_black=$(MH_TIKZ_FILE="$tikz_file" $PYTHON 2>/dev/null << 'PYEOF'
import re, os
tex = open(os.environ['MH_TIKZ_FILE'], encoding='utf-8', errors='ignore').read()
BARE = re.compile(r'^(black|white|red|blue|green|gray|grey|cyan|magenta|yellow|orange|violet|purple|brown|teal|indigo|olive|pink|lime)(!\d+(!\w+)?)?$')
bad = 0
for m in re.finditer(r'\\node\[((?:[^\][]|\{[^}]*\})*)\]', tex, re.S):
    items = [i.strip() for i in m.group(1).split(',') if i.strip()]
    fi = [k for k, it in enumerate(items) if it.startswith('fill=') and not it.startswith('fill=none')]
    if not fi:
        continue
    ci = [k for k, it in enumerate(items) if '=' not in it and BARE.match(it)]
    if any(k > min(fi) for k in ci):
        bad += 1
print(bad)
PYEOF
)
legend_black=${legend_black:-0}
if [ "$legend_black" -gt 0 ]; then
    echo "CRITICAL: $legend_black 个 node 在 fill=<浅色> 之后裸写颜色名(如 black) — 裸色=color=会覆盖填充→整块变纯黑(黑底黑字)。修：设文字色改用 text=black，不要裸写颜色名"
    critical=$((critical+1))
fi

# 检查是否每个阶段用了不同颜色（应该统一用一套 main+sub 两色）
unique_fills=$(grep -oP 'fill=\{rgb,255:red,\d+;green,\d+;blue,\d+\}' "$tikz_file" 2>/dev/null | sort -u | wc -l)
if [ "$unique_fills" -gt 4 ]; then
    echo "CRITICAL: 发现 $unique_fills 种不同 rgb 填充色，应统一用一套配色方案（main+sub 两色 + dashbox 灰色）"; critical=$((critical+1))
fi
# Also check for named color rainbow (blue, red, green, orange, etc.)
named_fills=$(grep -oP 'fill=\w+!?\d*' "$tikz_file" 2>/dev/null | grep -v 'fill=none\|fill=white\|fill=gray\|fill=black' | sort -u | wc -l)
if [ "$named_fills" -gt 4 ]; then
    echo "CRITICAL: 发现 $named_fills 种不同命名填充色 — 彩虹效果！应统一用 Template 4 的双色方案"; critical=$((critical+1))
fi

# 禁止项检查
if grep -q '\\fill\[.*rgb.*rounded corners' "$tikz_file" 2>/dev/null; then
    echo "CRITICAL: 发现灰色大背景 \\fill，必须删除"; critical=$((critical+1))
fi
if grep -q 'on background layer' "$tikz_file" 2>/dev/null; then
    echo "CRITICAL: 发现 on background layer，必须删除"; critical=$((critical+1))
fi
if grep -q 'fit=(' "$tikz_file" 2>/dev/null; then
    echo "CRITICAL: 发现 fit=()，必须改用手动坐标 dashbox"; critical=$((critical+1))
fi
if grep -qP 'fill=(blue|red|green|black|gray![7-9]0|gray!100|dark)(?!\!)' "$tikz_file" 2>/dev/null; then
    echo "CRITICAL: 发现深色填充"; critical=$((critical+1))
fi

# 浅色文字（多种写法都要抓）
light_gray=$(grep -cP 'color=gray![3-6]0|text=gray![3-6]0|\\color\{gray![3-6]0\}|\\textcolor\{gray![3-6]0\}' "$tikz_file" 2>/dev/null); light_gray=${light_gray:-0}
# 裸 \color{gray} / text=gray 不带感叹号深度也算（默认是 gray 中等灰）
bare_gray=$(grep -cP '\\color\{gray\}|text=gray[^!]|\\textcolor\{gray\}\{' "$tikz_file" 2>/dev/null); bare_gray=${bare_gray:-0}
note_style=$(grep -c 'note/.style' "$tikz_file" 2>/dev/null); note_style=${note_style:-0}
[ "$light_gray" -gt 0 ] && { echo "CRITICAL: $light_gray 处浅色文字(gray!30~60 各种写法)"; critical=$((critical+1)); }
[ "$bare_gray" -gt 0 ] && { echo "CRITICAL: $bare_gray 处裸 gray 文字 (无 !60+ 深度修饰)"; critical=$((critical+1)); }
[ "$note_style" -gt 0 ] && { echo "CRITICAL: 发现 note/.style，禁止浅色注释"; critical=$((critical+1)); }

# ⛔ opacity 滥用检测（用户图里"等弦长追踪..."灰透明字的根因）
# 节点 / 文字 / 标签元素如果 opacity < 0.6 → 视觉上接近隐形
# 注意：fill opacity 用于半透明色块是合法的（区域填充），所以排除带 "fill " 前缀的
# regex 改用 (?<![a-z]) 排除前面是字母（避免 fill opacity 误报）
faded_any=$(grep -oP '(?<![a-z])opacity=0\.[0-5]' "$tikz_file" 2>/dev/null | wc -l | head -1 | tr -d ' ')
faded_any=${faded_any:-0}
if [ "$faded_any" -gt 2 ]; then
    echo "CRITICAL: $faded_any 处 opacity ≤ 0.5 — 文字/线条几乎隐形（公式说明、辅助标签必须 opacity >= 0.85）"
    echo "         (fill opacity 用于色块填充是合法的，本检测仅抓裸 opacity)"
    critical=$((critical+1))
fi

# ⛔ 彩虹原色检测（\draw 颜色多样：用户图里蓝紫螺线 + 橙节点 + 红弦长 + 绿 Δφ）
draw_colors=$(grep -oP '\\draw\[[^\]]*?(color=|draw=)?\b(red|orange|yellow|green|blue|cyan|magenta|violet|purple|brown|teal|indigo|olive|pink|lime)\b' "$tikz_file" 2>/dev/null | grep -oP '(red|orange|yellow|green|blue|cyan|magenta|violet|purple|brown|teal|indigo|olive|pink|lime)' | sort -u | wc -l | head -1 | tr -d ' ')
draw_colors=${draw_colors:-0}
if [ "$draw_colors" -gt 3 ]; then
    echo "CRITICAL: \draw 命令用了 $draw_colors 种不同命名色 — 彩虹效果！同张图主体色 ≤ 3 种（含黑灰）"
    critical=$((critical+1))
fi

# ⛔ 几何示意图错把红色当装饰（红应保留给"强调/警示/关键点"）
# 检测 \node[color=red]{文字}、\node[text=red]{文字} 等纯红色普通标注
# 排除 red!50, red!70!black 等已调过的版本（color=red 后面如果是 !，是合法的调色）
red_labels=$(grep -cE '\\node\[[^]]*(color=red|text=red)[^!]' "$tikz_file" 2>/dev/null)
red_labels=${red_labels:-0}
# 同时检查 \node[red] 简写
red_short=$(grep -cE '\\node\[red[,\] ]' "$tikz_file" 2>/dev/null)
red_short=${red_short:-0}
red_total=$((red_labels + red_short))
if [ "$red_total" -gt 2 ]; then
    echo "WARNING: $red_total 处文字用纯红色 — 红色应保留给\"强调/关键点\"，普通几何标注用 black 或 black!80"
fi

# ⛔ 同锚点多标签聚集检测（"第27.5"、"第2孔"、"∅5.5"挤一处的根因）
# 检查 1: 同一节点被 above of / below of / left of / right of 引用 ≥ 3 次
# 支持 positioning 库 3 种写法：above of=X, above=4pt of X, above right=4pt and 4pt of X
# 注意 bash ERE 不支持 \b 和 \s，用空格 + 字符类替代
anchor_dup=$(grep -oE '(above|below|left|right)[^,]*of +[a-zA-Z][a-zA-Z0-9_]*' "$tikz_file" 2>/dev/null \
             | grep -oE 'of +[a-zA-Z][a-zA-Z0-9_]*' \
             | awk '{print $2}' | sort | uniq -c | awk '$1 >= 3 {print $2 " (" $1 "次)"}')
if [ -n "$anchor_dup" ]; then
    echo "CRITICAL: 同一锚点被相对定位引用 ≥ 3 次（标签必重叠）："
    echo "$anchor_dup" | sed 's/^/    /'
    echo "  → 改用引线散射: \\draw[gray!60, thin] (P) -- ++(1.0, 0.6) node[right] {标签}"
    critical=$((critical+1))
fi

# 检查 2: 一条 \draw / \path 路径挂 ≥ 3 个 node 标签（节点重叠风险）
many_path_labels=$(grep -cE '\\(draw|path)[^;]*node\[[^]]*\][^{;]*\{[^}]*\}[^;]*node\[[^]]*\][^{;]*\{[^}]*\}[^;]*node\[' "$tikz_file" 2>/dev/null)
many_path_labels=${many_path_labels:-0}
if [ "$many_path_labels" -gt 0 ]; then
    echo "WARNING: $many_path_labels 条 \\draw/\\path 路径上挂 ≥ 3 个 node 标签 — 短路径密集标签易遮挡"
fi

# 检查 3: above/below/left/right 偏移 < 6pt（中文标签框 ~7-8pt 高，6pt 以下必溢出覆盖）
tiny_offset=$(grep -cE '(above|below|left|right)=[0-5](pt|\.[0-9]+pt)' "$tikz_file" 2>/dev/null)
tiny_offset=${tiny_offset:-0}
if [ "$tiny_offset" -gt 3 ]; then
    echo "WARNING: $tiny_offset 处 above/below/left/right=<6pt 偏移过小 — 中文标签框约 7-8pt 高，会溢出覆盖锚点"
    echo "  → 改用 above=4pt 或 above=0.15cm 起步，多标签场景用 above=8pt+"
fi

# 检查 4: 节点密度过高（粗略指标：≥ 8 个绝对坐标节点 = 重叠风险高）
# 注：精确"同坐标"检测在 git-bash on Windows 下管道易出问题，改用粗略密度提示
n_coords=$(grep -oE 'at *\( *-?[0-9]+\.?[0-9]* *, *-?[0-9]+\.?[0-9]* *\)' "$tikz_file" 2>/dev/null | wc -l | tr -d ' ')
n_coords=${n_coords:-0}
if [ "$n_coords" -ge 8 ]; then
    echo "INFO: $n_coords 个绝对坐标 \\node at(x,y) — 节点密度较高，建议人工/Vision 复查标签重叠"
fi

# 白色文字
grep -q 'text=white' "$tikz_file" 2>/dev/null && echo "WARNING: 发现白色文字"

# 旋转文字
grep -q 'rotate=90' "$tikz_file" 2>/dev/null && echo "WARNING: 发现 rotate=90，建议水平文字"

# 粗箭头
grep -q 'bigarrow\|line width=1.8pt\|line width=2pt' "$tikz_file" 2>/dev/null || echo "WARNING: 没有粗箭头"

# 圆角
grep -q 'rounded corners' "$tikz_file" 2>/dev/null || echo "WARNING: 没有圆角"

# 节点重叠检测
echo "--- 重叠检测 ---"
$PYTHON -c "
import re
with open('$tikz_file', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()
BS = chr(92)

# 从显式尺寸或文字内容估算节点实际渲染宽高(cm)。宽度按实际排版估(不是'需要宽度'),
# 偏保守以免相邻正常节点误报；说明/公式框砸到节点时重叠幅度远超误差, 仍能抓到。
def est_wh(style, text):
    w = None; h = None
    wm = re.search(r'minimum width=(\d+\.?\d*)cm', style)
    hm = re.search(r'minimum height=(\d+\.?\d*)cm', style)
    sm = re.search(r'minimum size=(\d+\.?\d*)cm', style)
    twm = re.search(r'text width=(\d+\.?\d*)cm', style)
    if sm: w = h = float(sm.group(1))
    if wm: w = float(wm.group(1))
    if twm and w is None: w = float(twm.group(1))
    if hm: h = float(hm.group(1))
    t = text or ''
    lines = t.split(BS+BS) if (BS+BS) in t else [t]
    if w is None:
        maxw = 0.0
        for ln in lines:
            cn = len([c for c in ln if '\\u4e00' <= c <= '\\u9fff'])
            en = len([c for c in ln if c.isascii() and (c.isalnum() or c in '+-=/*(),.^_')])
            maxw = max(maxw, cn*0.37 + en*0.18 + 0.4)
        w = maxw if maxw > 0 else 2.0
    if h is None:
        h = 0.35 + 0.40*len(lines)
    return w, h

# 一次扫描抓所有 \node: 可选名字 + 坐标(数字或相对锚点如 S.north east) + 可选文字(含一层花括号)
NODE = re.compile(r'\\\\node\[([^\]]*)\]\s*(?:\(([^)]*)\))?\s*at\s*\(([^)]+)\)\s*(?:\{((?:[^{}]|\{[^{}]*\})*)\})?')
raw = []
for m in NODE.finditer(content):
    style = m.group(1); name = (m.group(2) or '').strip()
    coord = m.group(3).strip(); text = m.group(4) or ''
    w, h = est_wh(style, text)
    raw.append({'name':name,'coord':coord,'w':w,'h':h,'box':('dash' in style)})

# 名字→绝对中心表(只登记纯数字坐标的), 供相对锚点解析
NUM = re.compile(r'^\s*(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)\s*$')
centers = {}
for n in raw:
    mm = NUM.match(n['coord'])
    if mm and n['name']:
        centers[n['name']] = (float(mm.group(1)), float(mm.group(2)), n['w'], n['h'])

# 把坐标解析成绝对中心: 数字直接用; 'name'/'name.anchor' 查表 + 锚点方向偏移半个尺寸
def resolve(coord):
    mm = NUM.match(coord)
    if mm: return float(mm.group(1)), float(mm.group(2))
    parts = coord.split('.')
    base = parts[0].strip()
    if base not in centers: return None
    bx, by, bw, bh = centers[base]
    if len(parts) == 1: return bx, by
    anch = parts[1].strip().lower()
    dx = dy = 0.0
    if 'north' in anch: dy = bh/2
    if 'south' in anch: dy = -bh/2
    if 'east' in anch: dx = bw/2
    if 'west' in anch: dx = -bw/2
    return bx+dx, by+dy

all_nodes = []
for n in raw:
    p = resolve(n['coord'])
    if p is None: continue
    all_nodes.append({'x':p[0],'y':p[1],'w':n['w'],'h':n['h'],'box':n['box']})

# 相交测试各边内缩 SH, 吸收文字估尺寸的误差, 只有真压上去(远超边缘)才判重叠
SH = 0.12
def half(v):
    return max(0.05, v/2 - SH)
overlaps = 0
for i in range(len(all_nodes)):
    a = all_nodes[i]
    for j in range(i+1, len(all_nodes)):
        b = all_nodes[j]
        if a['box'] != b['box']: continue
        if (a['x']-half(a['w']) < b['x']+half(b['w']) and b['x']-half(b['w']) < a['x']+half(a['w']) and
            a['y']-half(a['h']) < b['y']+half(b['h']) and b['y']-half(b['h']) < a['y']+half(a['h'])):
            label = '虚线框' if a['box'] else '节点/说明框'
            print(f'CRITICAL: {label}重叠! ({a[\"x\"]:.2f},{a[\"y\"]:.2f}) vs ({b[\"x\"]:.2f},{b[\"y\"]:.2f})')
            overlaps += 1
if overlaps == 0 and all_nodes: print(f'OK: {len(all_nodes)} 个节点无重叠')
elif not all_nodes: print('INFO: 未检测到节点')
else: exit(1)
" 2>/dev/null
[ $? -ne 0 ] && critical=$((critical+1))

# 中文节点宽度检测（防文字溢出）
echo "--- 中文节点宽度检测 ---"
$PYTHON -c "
import re
with open('$tikz_file', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()
issues = 0
# 匹配 \node[...]{文字内容}
for m in re.finditer(r'\\\\node\[([^\]]*)\]\s*(?:\([^)]*\)\s*)?(?:at\s*\([^)]*\)\s*)?\{([^}]*)\}', content):
    style = m.group(1)
    text = m.group(2).strip()
    if not text or text == '': continue
    # 跳过纯 LaTeX 命令节点
    if text.startswith('\\\\') and len(text) < 5: continue
    # 计算中文字符数
    cn_chars = len([c for c in text if '\\u4e00' <= c <= '\\u9fff' or '\\u3000' <= c <= '\\u303f'])
    en_chars = len([c for c in text if c.isascii() and c.isalpha()])
    if cn_chars == 0: continue
    # 需要的最小宽度
    needed_w = cn_chars * 0.7 + en_chars * 0.35 + 1.0
    # 提取实际 minimum width
    wm = re.search(r'minimum width=(\d+\.?\d*)cm', style)
    twm = re.search(r'text width=(\d+\.?\d*)cm', style)
    actual_w = float(wm.group(1)) if wm else (float(twm.group(1)) if twm else 2.0)
    if actual_w < needed_w - 0.3:
        clean_text = text[:20].replace('\\\\\\\\', '/').replace('\\\\', '')
        print(f'WARNING: \"{clean_text}\" ({cn_chars}中+{en_chars}英) 需要 {needed_w:.1f}cm 但只有 {actual_w:.1f}cm')
        issues += 1
if issues == 0: print('OK: 中文节点宽度检查通过')
" 2>/dev/null

# 连线穿过节点检测（近似：检测 \draw 路径中间是否经过其他节点的坐标区域）
echo "--- 连线路径检测 ---"
$PYTHON -c "
import re, math
with open('$tikz_file', 'r', encoding='utf-8', errors='ignore') as f:
    content = f.read()
# 收集所有节点位置
nodes = {}
for m in re.finditer(r'\\\\node\[([^\]]*)\]\s*\(([^)]*)\)\s*at\s*\(([^,]+),\s*([^)]+)\)', content):
    name = m.group(2).strip()
    try:
        x, y = float(m.group(3).strip()), float(m.group(4).strip())
        style = m.group(1)
        wm = re.search(r'minimum width=(\d+\.?\d*)cm', style)
        w = float(wm.group(1)) if wm else 2.0
        nodes[name] = (x, y, w/2)
    except: pass
# 检测 \draw 中的 -- 连接是否穿过中间节点
issues = 0
for m in re.finditer(r'\\\\draw.*?\(([^)]+)\).*?--.*?\(([^)]+)\)', content):
    src_name = m.group(1).strip().split('.')[0]
    dst_name = m.group(2).strip().split('.')[0]
    if src_name not in nodes or dst_name not in nodes: continue
    sx, sy, _ = nodes[src_name]
    dx, dy, _ = nodes[dst_name]
    # 检查是否有其他节点在连线路径上
    for name, (nx, ny, nr) in nodes.items():
        if name == src_name or name == dst_name: continue
        # 点到线段的距离
        line_len = math.sqrt((dx-sx)**2 + (dy-sy)**2)
        if line_len < 0.1: continue
        t = max(0, min(1, ((nx-sx)*(dx-sx) + (ny-sy)*(dy-sy)) / (line_len**2)))
        closest_x = sx + t * (dx - sx)
        closest_y = sy + t * (dy - sy)
        dist = math.sqrt((nx - closest_x)**2 + (ny - closest_y)**2)
        if dist < nr + 0.3 and 0.1 < t < 0.9:
            print(f'CRITICAL: 连线 {src_name}→{dst_name} 可能穿过节点 {name} (距离={dist:.2f}cm)')
            issues += 1
if issues == 0 and nodes: print(f'OK: {len(nodes)} 个节点，连线路径无穿过')
elif not nodes: print('INFO: 未检测到带名称的节点')
" 2>/dev/null
[ $? -ne 0 ] && critical=$((critical+1))

# 编译 overfull 检测（如果 .log 文件存在）
echo "--- Overfull 检测 ---"
log_file="${tikz_file%.tex}.log"
main_log="paper/main.log"
for lf in "$log_file" "$main_log"; do
    [ -f "$lf" ] || continue
    overfull=$(grep -c 'Overfull.*hbox\|Overfull.*vbox' "$lf" 2>/dev/null); overfull=${overfull:-0}
    if [ "$overfull" -gt 0 ]; then
        echo "WARNING: $overfull 个 Overfull 警告 (in $(basename $lf)) — 可能有文字溢出节点"
        grep 'Overfull' "$lf" 2>/dev/null | head -5
    else
        echo "OK: 无 Overfull 警告 (in $(basename $lf))"
    fi
    break
done

echo "=== 自检完成: $critical 个 CRITICAL ==="
exit $critical
