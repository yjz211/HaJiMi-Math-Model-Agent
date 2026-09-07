#!/bin/bash
# compile_utils.sh — 编译前自动清理和修复
# 用法: bash _utils/compile_utils.sh paper/

PAPER_DIR="${1:-paper}"

# ⛔ 检测可用的 Python 解释器（Windows 上 python3 可能是 Microsoft Store stub）
# 1. 优先用 PATH 中的 python（Windows desktop runtime 注入的真 python）
# 2. fallback 到 python3
# 3. 都不行就用 py launcher
PYTHON=""
for _py in python python3 py; do
    if command -v "$_py" >/dev/null 2>&1; then
        # 验证能跑（排除 Microsoft Store stub：stub 不会真正执行）
        if "$_py" -c "import sys" 2>/dev/null; then
            PYTHON="$_py"
            break
        fi
    fi
done
if [ -z "$PYTHON" ]; then
    echo "⚠ Python not found (tried python, python3, py)" >&2
    PYTHON="python3"  # 兜底（保持原行为，错就报错）
fi

# ⛔ 在 \begin{document} 前注入一个 \usepackage{PKG}（若尚未存在）。
#    必须用 python 而非 sed：GNU sed 的 i/a 命令把 \u 当转义丢反斜杠、
#    \c 当 Ctrl 字符，会腐蚀 main.tex（\usepackage→usepackage）。
ensure_usepackage() {
    local pkg="$1"
    [ -f "$PAPER_DIR/main.tex" ] || return 0
    grep -q "usepackage.*$pkg" "$PAPER_DIR/main.tex" 2>/dev/null && return 0
    TARGET_FILE="$PAPER_DIR/main.tex" PKG="$pkg" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re
fp = os.environ['TARGET_FILE']; pkg = os.environ['PKG']
with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
    c = fh.read()
line = r'\usepackage{' + pkg + '}'
c = re.sub(r'(\\begin\{document\})', lambda m: line + '\n' + m.group(1), c, count=1)
with open(fp, 'w', encoding='utf-8') as fh:
    fh.write(c)
PYEOF
}

# ⛔ 强制 UTF-8 locale（关键修复）
# Step 1 的 sed 用了多字节 UTF-8 字符类（emoji/→/≤ 等）。若当前 shell 处于
# 单字节 locale（如 LANG 为空、LC_CTYPE=C），sed 会按单字节切割多字节汉字，
# 把 "符号说明" 之类的中文正文字节拦腰截断成乱码。这里选一个可用的 UTF-8
# locale 强制导出，保证全平台（含 Windows Git Bash 空 LANG 场景）不再破坏中文。
_pick_utf8_locale() {
    local avail
    avail="$(locale -a 2>/dev/null)"
    for _loc in C.UTF-8 C.utf8 en_US.UTF-8 en_US.utf8 zh_CN.UTF-8 zh_CN.utf8; do
        if printf '%s\n' "$avail" | grep -qix "$_loc"; then
            echo "$_loc"; return 0
        fi
    done
    echo "C.UTF-8"  # 兜底：多数环境即使 locale -a 没列也认
}
_UTF8_LOCALE="$(_pick_utf8_locale)"
export LANG="$_UTF8_LOCALE" LC_ALL="$_UTF8_LOCALE" LC_CTYPE="$_UTF8_LOCALE"

# ⛔ 强制 Python 的 stdout/stderr 用 UTF-8（关键修复）
# Windows 上 python 默认 stdout 编码随系统 ANSI 代码页（简中=GBK/cp936）。
# 脚本里多处内嵌 python 用 print 输出含 emoji（⛔ ✓ ⚠ 等）的进度日志，
# 在 GBK 下会抛 UnicodeEncodeError 直接崩掉整段 python，导致其后的截断/写文件
# 等逻辑全部不执行（且常被 2>/dev/null 吞掉，症状极隐蔽）。强制 UTF-8 io 编码。
export PYTHONIOENCODING="utf-8"
export PYTHONUTF8="1"

echo "=== 编译前清理 ($PAPER_DIR, using $PYTHON, locale $_UTF8_LOCALE) ==="

# 0. 杀掉残留的 XeLaTeX/pdflatex 进程（Windows 文件锁问题）
# 上一次编译可能没完全退出，导致字体文件被锁住 Permission denied
echo "--- 清理残留编译进程 ---"
if command -v taskkill &>/dev/null; then
    taskkill //F //IM xelatex.exe 2>/dev/null && echo "  killed xelatex.exe" || true
    taskkill //F //IM pdflatex.exe 2>/dev/null && echo "  killed pdflatex.exe" || true
elif command -v pkill &>/dev/null; then
    pkill -f xelatex 2>/dev/null || true
    pkill -f pdflatex 2>/dev/null || true
fi
sleep 1

# 1. 清理特殊 Unicode 字符（防止乱码）
echo "--- 清理特殊字符 ---"
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    # 删除 emoji 和特殊符号
    sed -i 's/[✅❌⚠️⛔🔥💡📊📋🎯🔧✓✗♪ſ]//g' "$f" 2>/dev/null
    # 删除零宽字符
    sed -i 's/[\xE2\x80\x8B\xE2\x80\x8C\xE2\x80\x8D\xEF\xBB\xBF]//g' "$f" 2>/dev/null
    # Unicode 数学符号 → LaTeX 命令
    sed -i 's/→/$\\rightarrow$/g; s/←/$\\leftarrow$/g' "$f" 2>/dev/null
    sed -i 's/≥/$\\geq$/g; s/≤/$\\leq$/g; s/×/$\\times$/g; s/±/$\\pm$/g' "$f" 2>/dev/null
done
echo "  done"

# 2.5 修复封面 \cline{N-N} 被当文本渲染的问题
# Claude 有时在封面 tabular 中把 \cline 写在文本位置而非行分隔符位置
echo "--- 修复封面 cline 问题 ---"
for f in "$PAPER_DIR"/main.tex "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    # 只修复没有反斜杠前缀的 clineN-N（纯文本残留，如 "cline2-2"）
    # ⛔ 不要删除正常的 \cline{N-N}（tabular 中的合法命令）
    if grep -qP '(?<!\\)cline[0-9]' "$f" 2>/dev/null; then
        sed -i 's/\([^\\]\)cline\([0-9]*-[0-9]*\)/\1/g' "$f" 2>/dev/null
        echo "  $(basename $f): removed text 'clineN-N' artifacts (preserved \\cline)"
    fi
done

# 2.6 修复 \listoffigures 出现在摘要之前的问题
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q '\\listoffigures' "$PAPER_DIR/main.tex" 2>/dev/null; then
        # 检查 \listoffigures 是否在 \begin{abstract} 之前
        LOF_LINE=$(grep -n '\\listoffigures' "$PAPER_DIR/main.tex" | head -1 | cut -d: -f1)
        ABS_LINE=$(grep -n '\\begin{abstract}\|摘.*要' "$PAPER_DIR/main.tex" | head -1 | cut -d: -f1)
        if [ -n "$LOF_LINE" ] && [ -n "$ABS_LINE" ] && [ "$LOF_LINE" -lt "$ABS_LINE" ]; then
            echo "  ⚠ \\listoffigures 在摘要之前，移除（不应出现在摘要前）"
            sed -i '/\\listoffigures/d' "$PAPER_DIR/main.tex"
            sed -i '/\\listoftables/d' "$PAPER_DIR/main.tex"
        fi
    fi
fi

# 2.7 MathorCup 封面格式检查：如果是 MathorCup 论文但有独立封面页（\maketitle），删掉
if [ -f "$PAPER_DIR/main.tex" ]; then
    # 只检查 \documentclass 行是否包含 MathorCup（不检查注释或正文）
    if grep -q '\\documentclass.*MathorCup' "$PAPER_DIR/main.tex" 2>/dev/null; then
        if grep -q '\\maketitle' "$PAPER_DIR/main.tex" 2>/dev/null; then
            echo "  ⚠ MathorCup 论文不应有 \\maketitle（官方格式无独立封面），移除"
            sed -i '/\\maketitle/d' "$PAPER_DIR/main.tex"
        fi
    fi
fi

# 2. 修复 figures/figures/ 双层嵌套
if [ -d "figures/figures" ]; then

# 2.9 修复 babel[english] 导致中文论文的 Figure/Table 标签变英文
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q 'ctex\|cumcmthesis\|gmcmthesis\|MathorCup\|xeCJK' "$PAPER_DIR/main.tex" 2>/dev/null; then
        if grep -q 'usepackage.*english.*babel\|usepackage\[english\]{babel}' "$PAPER_DIR/main.tex" 2>/dev/null; then
            echo "  ⚠ 中文论文加载了 babel[english]，移除（会导致 Figure/Table 变英文）"
            sed -i '/usepackage.*english.*babel/d' "$PAPER_DIR/main.tex" 2>/dev/null
            sed -i '/usepackage\[english\]{babel}/d' "$PAPER_DIR/main.tex" 2>/dev/null
        fi
        if ! grep -q 'renewcommand.*figurename' "$PAPER_DIR/main.tex" 2>/dev/null; then
            if ! grep -q 'cumcmthesis\|gmcmthesis' "$PAPER_DIR/main.tex" 2>/dev/null; then
                sed -i '/\\begin{document}/i \\renewcommand{\\figurename}{图}' "$PAPER_DIR/main.tex" 2>/dev/null
                sed -i '/\\begin{document}/i \\renewcommand{\\tablename}{表}' "$PAPER_DIR/main.tex" 2>/dev/null
                echo "  注入 figurename=图, tablename=表"
            fi
        fi
    fi
fi
    echo "--- 修复 figures/figures/ 双层嵌套 ---"
    mv figures/figures/*.pdf figures/figures/*.png figures/ 2>/dev/null
    rmdir figures/figures 2>/dev/null
    echo "  fixed"
fi

# 2.8 修复 caption 冒号问题（中文论文应该是空格分隔，不是冒号）
# ⛔ 跳过 cumcmthesis/gmcmthesis/MathorCup 等自带 caption 配置的 cls
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q 'ctexart\|ctexbook' "$PAPER_DIR/main.tex" 2>/dev/null; then
        # 只对 ctexart/ctexbook 文档类生效（这些没有自带 caption 配置）
        # cumcmthesis/gmcmthesis/MathorCup 等 cls 已内置 labelsep=quad，不要重复加
        if ! grep -q 'cumcmthesis\|gmcmthesis\|MathorCup\|yrdmcm\|neepumcm\|nemcmthesis\|JXUSTmodeling' "$PAPER_DIR/main.tex" 2>/dev/null; then
            if ! grep -q 'labelsep' "$PAPER_DIR/main.tex" 2>/dev/null; then
                echo "  ⚠ 中文论文缺少 labelsep 设置（图表标题会显示冒号），自动添加"
                # ⛔ 用 python 注入而非 sed：GNU sed 的 a/i 命令把 \c(aption) 当转义序列
                #    处理，会把 \captionsetup 腐蚀成 Ctrl-A(0x01)、\usepackage 丢反斜杠。
                TARGET_FILE="$PAPER_DIR/main.tex" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re
fp = os.environ['TARGET_FILE']
with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
    c = fh.read()
setup = r'\captionsetup{labelsep=quad}'
if re.search(r'\\usepackage(\[[^\]]*\])?\{caption\}', c):
    c = re.sub(r'(\\usepackage(?:\[[^\]]*\])?\{caption\})',
               lambda m: m.group(1) + '\n' + setup, c, count=1)
else:
    c = re.sub(r'(\\begin\{document\})',
               lambda m: r'\usepackage{caption}' + '\n' + setup + '\n' + m.group(1),
               c, count=1)
with open(fp, 'w', encoding='utf-8') as fh:
    fh.write(c)
PYEOF
            fi
        fi
    fi
fi

# 3. 检查 PDF 图片文件
echo "--- 检查 PDF 图片 ---"
PDF_COUNT=$(ls figures/*.pdf 2>/dev/null | wc -l)
echo "  PDF 图片: $PDF_COUNT 个"
if [ "$PDF_COUNT" -eq 0 ]; then
    echo "  ⚠ 没有 PDF 图片，尝试运行生成脚本..."
    for script in figures/gen_fig*.py; do
        [ -f "$script" ] || continue
        echo "  运行: $script"
        "$PYTHON" "$script" 2>&1 | tail -3
    done
    PDF_COUNT=$(ls figures/*.pdf 2>/dev/null | wc -l)
    echo "  重新检查: $PDF_COUNT 个"
fi

# 4. 修正图片路径（仅 sections/*.tex，不动 main.tex 的 \graphicspath）
echo "--- 修正图片路径 ---"
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    # 只替换 \includegraphics 中的路径，不动 \graphicspath 等声明
    if grep -q 'includegraphics.*{figures/' "$f" 2>/dev/null; then
        sed -i 's|\\includegraphics\(.*\){figures/|\\includegraphics\1{../figures/|g' "$f"
        echo "  $(basename $f): figures/ -> ../figures/"
    fi
    if grep -q 'includegraphics.*{../../figures/' "$f" 2>/dev/null; then
        sed -i 's|\\includegraphics\(.*\){../../figures/|\\includegraphics\1{../figures/|g' "$f"
        echo "  $(basename $f): ../../figures/ -> ../figures/"
    fi
done
# main.tex 单独处理：只修复 \includegraphics，不动 \graphicspath
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q 'includegraphics.*{../../figures/' "$PAPER_DIR/main.tex" 2>/dev/null; then
        sed -i 's|\\includegraphics\(.*\){../../figures/|\\includegraphics\1{../figures/|g' "$PAPER_DIR/main.tex"
        echo "  main.tex: ../../figures/ -> ../figures/"
    fi
fi

# 4.4 附录代码去指纹：抹掉工具自举头 __mh_autobootstrap_syspath__，防它印进论文 PDF
# ⛔ 两条路径都堵：(a) \lstinputlisting 引用的 code/*.py 带自举头 → 给该行加 firstline=N 跳过不显示
#    （不改源文件，本地照样能跑）；(b) 直接粘进正文的自举块 → 整块删除。只删这 5 行注入块，绝不碰真实代码。
echo "--- 附录代码去指纹（抹 __mh_autobootstrap_syspath__）---"
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    TARGET_FILE="$f" MH_PAPER_DIR="$PAPER_DIR" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re
fp = os.environ['TARGET_FILE']
paper_dir = os.environ['MH_PAPER_DIR']
try:
    content = open(fp, encoding='utf-8', errors='ignore').read()
except OSError:
    raise SystemExit(0)
orig = content
BOOT = ["# __mh_autobootstrap_syspath__",
        "import os as _mh_os, sys as _mh_sys",
        "_mh_here = _mh_os.path.dirname(_mh_os.path.abspath(__file__))",
        "if _mh_here and _mh_here not in _mh_sys.path:",
        "_mh_sys.path.insert(0, _mh_here)"]

# (a) \lstinputlisting[opts]{path}：引用文件带自举头 → 注入 firstline 跳过
def _firstline(pyrel):
    py = os.path.normpath(os.path.join(paper_dir, pyrel))
    try:
        lines = open(py, encoding='utf-8', errors='ignore').read().splitlines()
    except OSError:
        return None
    mi = next((i for i, l in enumerate(lines[:4]) if l.strip() == BOOT[0]), None)
    if mi is None or mi + 4 >= len(lines):
        return None
    for k in range(1, 5):
        if lines[mi + k].strip() != BOOT[k]:
            return None  # 后4行不符=块被改坏，宁可不切也不误删真实代码
    after = mi + 5
    if after < len(lines) and lines[after].strip() == "":
        after += 1
    return after + 1  # 0-based → 1-based

def _fix_inc(m):
    opts, path = m.group(1) or "", m.group(2)
    if "firstline" in opts:
        return m.group(0)  # 幂等：已有 firstline 不动
    fl = _firstline(path)
    if fl is None:
        return m.group(0)
    newopts = (opts[:-1] + ",firstline=%d]" % fl) if opts else "[firstline=%d]" % fl
    return "\\lstinputlisting" + newopts + "{" + path + "}"
content = re.sub(r"\\lstinputlisting(\[[^\]]*\])?\{([^}]*)\}", _fix_inc, content)

# (b) 直接粘进正文的自举块（精确 5 行 + 可选尾空行）→ 整块删
_boot_re = re.compile(
    r"^# __mh_autobootstrap_syspath__\n"
    r"import os as _mh_os, sys as _mh_sys\n"
    r"_mh_here = _mh_os\.path\.dirname\(_mh_os\.path\.abspath\(__file__\)\)\n"
    r"if _mh_here and _mh_here not in _mh_sys\.path:\n"
    r"    _mh_sys\.path\.insert\(0, _mh_here\)\n\n?",
    re.MULTILINE)
content = _boot_re.sub("", content)

if content != orig:
    open(fp, 'w', encoding='utf-8').write(content)
    print("  %s: 已去自举头指纹" % os.path.basename(fp))
PYEOF
done

# 4.5 规整图片宽度（防止 AI 把正常图写太小/太大）
# ⛔ 触发场景：AI 给正常横图写 width=0.6~0.75\textwidth → 正文里图小而挤、两边留白
#    或写 width=1.0\textwidth 撑满 → 过大。规则要求正常大小：区间 [0.8, 0.95]，越界纠偏。
#    只动 \includegraphics 的 width 系数，不碰 tikz_diagrams / 明确标了整页的图。
echo "--- 规整图片宽度 ---"
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    TARGET_FILE="$f" LI_FILE="$PAPER_DIR/../figures/latex_includes.tex" FIG_DIR="$PAPER_DIR/../figures" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re
fp = os.environ['TARGET_FILE']
with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()

LOWER, UPPER = 0.80, 0.95
FIX_LOW, FIX_HIGH = 0.85, 0.90
changed = []

# ⛔ 加固：未登记进 latex_includes 的图，也按真实 PDF 长宽比定宽（与 fig_include_size.py 同档），
#    避免竖高图走无脑 0.85 兜底被撑满页。读不到 PDF / 无 PyMuPDF → 返回 None，退回原纠偏，绝不崩。
_FIG_DIR = os.environ.get('FIG_DIR', '')
_BUCKETS = [(0.80, 0.85), (1.20, 0.70), (1.60, 0.50)]  # (高宽比上界, width系数)，与 fig_include_size 一致
_WIDTH_TALL = 0.42   # 高/宽 > 1.60 瘦高图
_HEIGHT_CAP = 0.80   # 统一限高
def _pdf_aspect(name):
    try:
        import fitz
    except Exception:
        return None
    try:
        doc = fitz.open(os.path.join(_FIG_DIR, name))
        if doc.page_count < 1:
            doc.close(); return None
        rect = doc.load_page(0).rect; doc.close()
        w, h = float(rect.width), float(rect.height)
        return (h / w) if (w > 0 and h > 0) else None
    except Exception:
        return None
def _width_for(r):
    for bound, wc in _BUCKETS:
        if r <= bound: return wc
    return _WIDTH_TALL
def _rewrite_by_aspect(opts, wc):
    # 丢弃旧 width/height，保留其它选项(trim/clip/angle 等)，keepaspectratio 必留
    kept = []
    for p in [x.strip() for x in opts.split(',') if x.strip()]:
        low = p.lower().replace(' ', '')
        if low.startswith('width=') or low.startswith('height=') or low == 'keepaspectratio':
            continue
        kept.append(p)
    return ','.join(['width=%g\\textwidth' % wc, 'height=%g\\textheight' % _HEIGHT_CAP, 'keepaspectratio'] + kept)

# ⛔ 权威尺寸表：fig_include_size.py 按每张图真实长宽比算好写进 latex_includes.tex。
#    竖高图（流程图 0.42、路线图 0.7）故意收窄，若被下方 [0.80,0.95] 纠偏撑到 0.85，
#    keepaspectratio 下高度顶格 → 撑满整页（"流程图又长又乱"的真根因）。
#    对策：登记过的图一律强制回填其权威 OPTS（写作步骤写错 0.85/0.9 也改回），跳过纠偏。
#    latex_includes 缺失/解析失败 → auth 空，全部退化为原纠偏行为，绝不崩。
AUTH = {}
try:
    with open(os.environ.get('LI_FILE', ''), 'r', encoding='utf-8', errors='ignore') as _lf:
        _litxt = _lf.read()
    for _m in re.finditer(r'\\includegraphics\[([^\]]*)\]\s*\{([^}]*)\}', _litxt):
        _base = _m.group(2).rsplit('/', 1)[-1]
        if _base:
            AUTH[_base] = _m.group(1)
except Exception:
    AUTH = {}

# ⛔ 真·并排图豁免：minipage / subfigure / subfloat 里的 \includegraphics 本就该用
#    小系数（如 0.48）占半栏，一律不碰——否则 0.48→0.85 会把并排图撑破换行成大图。
#    做法：先把这些环境整体替换成占位符，纠偏跑完再还原。
_masked = []
def _mask(m):
    _masked.append(m.group(0))
    return f'@@MHMASK{len(_masked)-1}@@'
_ENV_PAT = re.compile(
    r'\\begin\{(minipage|subfigure|subfloat)\}.*?\\end\{\1\}'
    r'|\\subfloat\b.*?\\includegraphics\[[^\]]*\]\{[^}]*\}'
    r'|\\subfigure\b.*?\\includegraphics\[[^\]]*\]\{[^}]*\}',
    re.DOTALL)
content = _ENV_PAT.sub(_mask, content)

def fix_opts(m):
    opts = m.group(1)
    _path = m.group(2)
    # ⛔ 权威回填（最高优先级）：登记过的图强制用 latex_includes 的权威 OPTS，跳过下方纠偏。
    #    也记一笔 changed 确保文件被写回（否则纯回填、无普通纠偏时 changed 为空不写回，回填失效）。
    _base = _path.rsplit('/', 1)[-1]
    if _base in AUTH and AUTH[_base] != opts:
        changed.append(('(权威回填 ' + _base + ')', AUTH[_base]))
        return '\\includegraphics[' + AUTH[_base] + ']{' + _path + '}'
    if _base in AUTH:  # 已与权威一致，原样返回不动
        return '\\includegraphics[' + opts + ']{' + _path + '}'
    # ⛔ 加固：未登记图先按真实 PDF 长宽比定宽（竖高图自动收窄，不再无脑 0.85 撑满页）。
    #    读到长宽比 → 按档重写 width+限高 0.8；读不到（无 PDF/无 fitz）→ 落到下方原纠偏兜底。
    _asp = _pdf_aspect(_base)
    if _asp is not None:
        _wc = _width_for(_asp)
        _newo = _rewrite_by_aspect(opts, _wc)
        if _newo != opts:
            changed.append(('(按长宽比 r=%.2f)' % _asp, 'width=%g\\textwidth,height=%g\\textheight' % (_wc, _HEIGHT_CAP)))
        return '\\includegraphics[' + _newo + ']{' + _path + '}'
    # 只处理 0.NN\textwidth / \linewidth / \columnwidth 形式的 width 系数
    def repl(wm):
        coef = float(wm.group(1)); unit = wm.group(2)
        if coef < LOWER:
            new = FIX_LOW
        elif coef > UPPER:
            new = FIX_HIGH
        else:
            return wm.group(0)
        changed.append((coef, new))
        return f'width={new}\\{unit}'
    new_opts = re.sub(r'width\s*=\s*([0-9]*\.?[0-9]+)\\(textwidth|linewidth|columnwidth)', repl, opts)
    # ⛔ 剥离写作期硬塞的过小限高：<0.5\textheight 视为「压图」（把图人为压小到半页以下）。
    #    keepaspectratio 下小 height 会先于 width 生效，把近方图/竖图卡成一小块 → 图变小、还挤成一堆。
    #    删掉该 height 子句退化为「无 height」，由下方 overflow guard 统一补 0.9\textheight。
    #    0.5\textheight 及以上（流程图 0.7、竖高图 0.9 等）视为上游有意为之，保留不动。
    def _strip_small_h(hm):
        if float(hm.group(1)) < 0.5:
            changed.append(('(-压图限高)', hm.group(1) + '\\textheight'))
            return ''
        return hm.group(0)
    new_opts = re.sub(r',?\s*height\s*=\s*([0-9]*\.?[0-9]+)\\textheight', _strip_small_h, new_opts)
    new_opts = re.sub(r',\s*,', ',', new_opts).strip().strip(',')
    # ⛔ 防「一张图占满整页」：给按 width 缩放的图补 height 溢出保护（overflow guard）
    #    只对"含 width=..\textwidth/linewidth/columnwidth 但没有任何 height="的图生效。
    #    横图/近方图按宽缩放后自然高度 < 0.9 页高 → cap 不触发，完全无影响；
    #    竖高图（堆叠子图/混淆矩阵/类别多的条形图）才会被限到 0.9 页高，避免独占一页。
    #    已显式设 height 的（如流程图 0.7\textheight）一律不动，尊重上游。
    if ('height=' not in new_opts) and re.search(r'width\s*=\s*[0-9.]+\\(textwidth|linewidth|columnwidth)', new_opts):
        add = ',height=0.9\\textheight'
        if 'keepaspectratio' not in new_opts:
            add += ',keepaspectratio'   # 加 height 必须配 keepaspectratio，否则图会被拉伸变形
        new_opts = new_opts + add
        changed.append(('(+height guard)', '0.9\\textheight'))
    return '\\includegraphics[' + new_opts + ']{' + _path + '}'

content2 = re.sub(r'\\includegraphics\[([^\]]*)\]\s*\{([^}]*)\}', fix_opts, content)
# 还原被豁免的 minipage/subfigure 区块
for i, seg in enumerate(_masked):
    content2 = content2.replace(f'@@MHMASK{i}@@', seg)
if changed:
    with open(fp, 'w', encoding='utf-8') as fh:
        fh.write(content2)
    base = os.path.basename(fp)
    for old, new in changed:
        # old/new 可能是纯 width 系数(0.6->0.85)，也可能是标记串+完整OPTS(权威回填/height guard)。
        # 纯系数才补 \textwidth 后缀，标记串原样打印，避免出现误导性的 "...keepaspectratio\textwidth"。
        if isinstance(old, float):
            print(f'  {base}: width {old}->{new}\\textwidth')
        else:
            print(f'  {base}: {old} -> {new}')
PYEOF
done

# 5. 添加 hidelinks + 修复 colorlinks 冲突
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q 'usepackage{hyperref}' "$PAPER_DIR/main.tex" 2>/dev/null; then
        if ! grep -q 'hidelinks' "$PAPER_DIR/main.tex" 2>/dev/null; then
            sed -i 's|\\usepackage{hyperref}|\\usepackage[hidelinks]{hyperref}|g' "$PAPER_DIR/main.tex"
            echo "  added hidelinks"
        fi
    fi
    # 修复 colorlinks=true 和 hidelinks 的冲突（colorlinks 会覆盖 hidelinks）
    if grep -q 'colorlinks=true' "$PAPER_DIR/main.tex" 2>/dev/null; then
        echo "  ⚠ 发现 colorlinks=true，与 hidelinks 冲突，正在修复..."
        sed -i 's/colorlinks=true/colorlinks=false/g' "$PAPER_DIR/main.tex"
        echo "  fixed: colorlinks=true -> colorlinks=false"
    fi
    # 修复 citecolor=blue（即使 colorlinks=false 也清理掉）
    if grep -q 'citecolor=blue' "$PAPER_DIR/main.tex" 2>/dev/null; then
        sed -i 's/citecolor=blue/citecolor=black/g' "$PAPER_DIR/main.tex"
        echo "  fixed: citecolor=blue -> citecolor=black"
    fi
fi

# 5.5 清除历史遗留的全文表格 \small 注入（旧策略：统一 \small；新策略：正文默认字号+省略列/行）
# ⛔ 旧版本会给所有表格环境套 \small 让字号偏小。现改为「正文不缩字，超宽/超长靠省略」，
#    这里主动清除历史论文残留的 AUTO-TABLE-FONT 注入块，避免正文表格仍然偏小。
if [ -f "$PAPER_DIR/main.tex" ] && grep -q 'AUTO-TABLE-FONT' "$PAPER_DIR/main.tex" 2>/dev/null; then
    echo "--- 清除历史遗留的表格 \\small 注入 ---"
    TARGET_FILE="$PAPER_DIR/main.tex" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re
fp = os.environ['TARGET_FILE']
with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()
# 删除注入块：从 AUTO-TABLE-FONT 注释行到最后一个 \AtBeginEnvironment{...}{\small} 行
lines = content.split('\n')
out = []
skip = False
for ln in lines:
    if 'AUTO-TABLE-FONT' in ln:
        skip = True
        continue
    if skip:
        # 跳过 etoolbox 注入相关行
        if ln.strip().startswith('\\usepackage{etoolbox}') or '\\AtBeginEnvironment' in ln and '\\small' in ln:
            continue
        skip = False
    out.append(ln)
new_content = '\n'.join(out)
if new_content != content:
    with open(fp, 'w', encoding='utf-8') as fh:
        fh.write(new_content)
    print('  ✓ 已清除历史 AUTO-TABLE-FONT \\small 注入')
PYEOF
fi

# 6. 修复 math_commands.tex 中的命令冲突
if [ -f "$PAPER_DIR/math_commands.tex" ]; then
    echo "--- 检查 math_commands.tex ---"
    for cmd in tanh sinh cosh sin cos tan log ln exp max min sup inf lim det dim ker; do
        if grep -q "\\\\DeclareMathOperator.*\\\\$cmd" "$PAPER_DIR/math_commands.tex" 2>/dev/null; then
            echo "  删除对 \\$cmd 的重定义"
            sed -i "/\\\\DeclareMathOperator.*\\\\$cmd/d" "$PAPER_DIR/math_commands.tex"
        fi
    done
fi

# 6.5 正文超宽表处理已并入 6.65（统一「省略列/省略行 + 完整版进附录」，不再缩字号）
# ⛔ 旧策略是给 >=6 列的表自动套 resizebox 缩放，会连带把字号缩小；新策略正文不缩字，
#    超宽表改为省略中间列（首列+前几列+⋯+末几列），完整表存附录。见 Step 6.65。

# 6.6 移除窄表（≤4列）上多余的 resizebox（防止窄表被拉伸→视觉上字号巨大占满一页）
# ⛔ 触发场景：AI 给 2-4 列的窄表加 \resizebox{\textwidth}{!}{...}
#    \resizebox 等比缩放：宽度被拉到 \textwidth 时，高度也按比例拉大 → 字号视觉巨大
#    用户反馈："单个表格文字很大占满一页" 就是这个 case
echo "--- 检查窄表 resizebox ---"
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex figures/*.tex; do
    [ -f "$f" ] || continue
    TARGET_FILE="$f" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re
fp = os.environ['TARGET_FILE']
with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()
changed = False
# 扩展匹配：支持 \textwidth / \linewidth / \columnwidth / 0.X\textwidth 等变体
# 也支持 \resizebox*{...}{...} 带星号变体
pattern = r'\\resizebox\*?\{[^}]*\}\{!\}\{%?\s*\n?(\\begin\{tabular[xX*]?\}\{([^}]*)\}.*?\\end\{tabular[xX*]?\})\s*\n?\}%?'
matches = list(re.finditer(pattern, content, re.DOTALL))
removed_count = 0
# 倒序处理避免位置偏移
for m in reversed(matches):
    col_spec = m.group(2)
    # 统计列字符（l/c/r/p/X/m/b/S/D 等都算一列）
    col_count = len(re.findall(r'[lcrpXmbSD]', col_spec))
    block = m.group(1)
    rows = [r for r in block.split(r'\\') if '&' in r]
    max_row_chars = max((len(r.strip()) for r in rows), default=0)
    # ⛔ 新判定：窄表 ≤4 列时无条件删（窄表绝不应该 resizebox）
    # 5 列时如果内容短（<80 chars/row）也删
    is_narrow = col_count <= 4
    is_borderline_narrow = (col_count == 5 and max_row_chars < 80)
    if is_narrow or is_borderline_narrow:
        print(f'  removing resizebox from {col_count}-col table ({max_row_chars} chars/row)')
        content = content[:m.start()] + m.group(1) + content[m.end():]
        removed_count += 1
        changed = True
    else:
        print(f'  keeping resizebox on {col_count}-col table ({max_row_chars} chars/row, wide enough)')
if changed:
    with open(fp, 'w', encoding='utf-8') as fh:
        fh.write(content)
    if removed_count > 0:
        print(f'  ✓ removed {removed_count} resizebox wrappers')
PYEOF
done

# 6.63 残留 resizebox 改「只缩不放」（根治表格忽大忽小）
# ⛔ 触发场景：AI 手写 \resizebox{\textwidth}{!}{表} 会把窄表也硬拉到页宽 → 字号被放大、占满一页
#    改成 max-width 写法：表自然宽 ≤ 页宽则保持原样，只有真超宽才缩到页宽。
#    与 6.5 生成的写法统一；幂等（已是 \ifdim 形式的不再匹配）。
echo "--- resizebox 改只缩不放 ---"
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex figures/*.tex; do
    [ -f "$f" ] || continue
    TARGET_FILE="$f" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re
fp = os.environ['TARGET_FILE']
with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()
# 只匹配把宽度写死为 \textwidth/\linewidth/\columnwidth 的 resizebox（含 * 变体）
pat = r'\\resizebox(\*?)\{\\(?:text|line|column)width\}\{!\}'
repl = r'\\resizebox\1{\\ifdim\\width>\\linewidth\\linewidth\\else\\width\\fi}{!}'
new, n = re.subn(pat, repl, content)
if n:
    with open(fp, 'w', encoding='utf-8') as fh:
        fh.write(new)
    print(f'  {os.path.basename(fp)}: {n} 处 resizebox 改为只缩不放')
PYEOF
done

# 6.64 正文长表格自动转 longtable（>15 行的 tabular 在 table[H] 里会导致标题和表格分页）
echo "--- 长表格 → longtable ---"
# ⛔ 按「每个 table 环境单独判定」处理：只把自身行数 >15 的表转 longtable，
#    caption 取该表自己的（不再全文用第一个 caption 覆盖），避免一文件多表时相互串味。
LONGTABLE_FIXES=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    # 跳过符号说明（已在 9.8 步单独处理）和附录
    echo "$bn" | grep -qi 'symbol\|appendix\|A_code\|A_tables' && continue
    grep -q '\\begin{tabular}' "$f" 2>/dev/null || continue
    N=$(TARGET_FILE="$f" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re, sys
fp = os.environ['TARGET_FILE']
with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()

def count_data_rows(body):
    n = 0
    for r in re.split(r'\\\\', body):
        if '&' in r and not re.search(r'(top|mid|bottom)rule', r):
            n += 1
    return n

def count_cols(colspec):
    # 数 tabular 列格式里的列符号（l/c/r/p/m/b/X/S），忽略 |@{}>{}<{} 等装饰
    n, i, L = 0, 0, len(colspec)
    while i < L:
        ch = colspec[i]
        if ch in 'lcrXS':
            n += 1; i += 1; continue
        if ch in 'pmb' and i + 1 < L and colspec[i+1] == '{':
            n += 1; depth = 0; i += 1
            while i < L:
                if colspec[i] == '{': depth += 1
                elif colspec[i] == '}':
                    depth -= 1
                    if depth == 0: i += 1; break
                i += 1
            continue
        if ch in '@>!<' and i + 1 < L and colspec[i+1] == '{':
            depth = 0; i += 1
            while i < L:
                if colspec[i] == '{': depth += 1
                elif colspec[i] == '}':
                    depth -= 1
                    if depth == 0: i += 1; break
                i += 1
            continue
        i += 1
    return n

def convert(block):
    # 剥掉 \begin{table}[..] / \end{table} / \centering
    inner = re.sub(r'\\begin\{table\}(\[[^\]]*\])?', '', block)
    inner = re.sub(r'\\end\{table\}', '', inner)
    inner = re.sub(r'^[ \t]*\\centering[ \t]*\n?', '', inner, flags=re.MULTILINE)
    # 抽出本表自己的 caption 行（含可选 \label）
    cap = ''
    m = re.search(r'^[ \t]*(\\caption\{[^}]*\}(?:[ \t]*\\label\{[^}]*\})?)[ \t]*$',
                  inner, flags=re.MULTILINE)
    if m:
        cap = m.group(1).strip()
        inner = inner[:m.start()] + inner[m.end():]
    # tabular → longtable
    inner = inner.replace(r'\begin{tabular}', r'\begin{longtable}')
    inner = inner.replace(r'\end{tabular}', r'\end{longtable}')
    # caption 移到第一个 \toprule 前（longtable caption 内部须用 \\ 结束）
    if cap:
        inner, k = re.subn(r'(^[ \t]*\\toprule)',
                           lambda mm: cap + r' \\' + '\n' + mm.group(1),
                           inner, count=1, flags=re.MULTILINE)
    return inner.strip('\n') + '\n'

fixed = 0
def repl(m):
    global fixed
    block = m.group(0)
    tab = re.search(r'\\begin\{tabular\}\{([^}]*)\}(.*?)\\end\{tabular\}', block, re.DOTALL)
    if not tab:
        return block
    n = count_data_rows(tab.group(2))
    # ⛔ 超宽表（>8 列）不转 longtable：longtable 不会自动缩列，15+ 列会横向溢出。
    #    留给 6.65 的 table_slim 省列 + 完整表进附录（resizebox），那里才处理得了宽度。
    if count_cols(tab.group(1)) > 8:
        return block
    # 只转 15 < n <= 20 的中长表；n > 20 留给 6.65 截断放附录（截断后变短，无需 longtable）
    if n <= 15 or n > 20:
        return block
    fixed += 1
    return convert(block)

new_content = re.sub(r'\\begin\{table\}(?:\[[^\]]*\])?.*?\\end\{table\}',
                     repl, content, flags=re.DOTALL)
if fixed > 0:
    with open(fp, 'w', encoding='utf-8') as fh:
        fh.write(new_content)
print(fixed)
PYEOF
)
    N=${N:-0}
    if [ "$N" -gt 0 ] 2>/dev/null; then
        echo "  $bn: $N 个长表格 → longtable（防止标题和表格分页）"
        LONGTABLE_FIXES=$((LONGTABLE_FIXES+N))
        ensure_usepackage longtable
    fi
done
[ "$LONGTABLE_FIXES" -gt 0 ] && echo "  共 $LONGTABLE_FIXES 个长表格转为 longtable" || echo "  无需转换"

# 6.65 正文超宽/超长表瘦身（超宽省列、超长省行，完整表按形态放附录）
# ⛔ 逻辑抽到独立脚本 table_slim.py，避免 bash 内嵌 Python 的多层转义地狱。
#    正文不缩字号；附录按形态选环境（landscape+longtable / longtable / resizebox）。
echo "--- 正文超宽/超长表瘦身 ---"
_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$_SCRIPT_DIR/table_slim.py" ]; then
    "$PYTHON" "$_SCRIPT_DIR/table_slim.py" "$PAPER_DIR" 2>&1 || echo "  ⚠ table_slim.py 执行异常（跳过，不影响后续）"
else
    echo "  ⚠ 未找到 table_slim.py（跳过表格瘦身）"
fi

# 6.7 修复数学环境错误（常见：反斜杠清理误伤导致 \X(t)$ 而非 $X(t)$）
# ⛔ 用单引号 heredoc（<<'PYEOF'）而非 -c "..."：双引号会被 bash 二次转义，
#    反斜杠语义极难对齐（历史上正是它把合法的 $\ell$ / $\to$ 腐蚀成 $$ell / $$to）。
#    heredoc 里反斜杠原样传给 Python，所见即所得。
echo "--- 修复数学环境错误 ---"
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    TARGET_FILE="$f" "$PYTHON" - <<'PYEOF' 2>/dev/null
import re, os
fp = os.environ['TARGET_FILE']
with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()
original = content
fixes = 0
# Pattern 1: 修 "文字\X(t)$" 这类缺开头 $ 的坏公式 -> "文字$X(t)$"
#   坏公式成因：早期反斜杠清理误把开头 $ 删了、又粘了个 \。
#   ⛔ 4 重守卫（宁可少改、绝不多改），避免误伤合法命令：
#   G1 命令名 <=3 且不在白名单（\ell \to \max \min \log \sin ... 属合法，跳过）
#   G2 整个匹配不跨行（真坏公式在一行内；跨行=贪婪吞了别的环境，跳过）
#   G3 匹配起点前、本行内未转义 $ 计数为偶（偶=文本模式=真坏公式；奇=已在 $...$ 内的合法命令，跳过）
#   G4 下标/上标部分不含反斜杠（真坏公式内部无命令；\displaystyle\max_{i} 内部有 \，跳过）
latex_cmds = {'alpha','beta','gamma','delta','epsilon','zeta','eta','theta','iota','kappa',
    'lambda','mu','nu','xi','pi','rho','sigma','tau','upsilon','phi','chi','psi','omega',
    'Delta','Gamma','Lambda','Sigma','Theta','Phi','Psi','Omega',
    'sum','prod','int','frac','sqrt','partial','nabla','infty','cdot','times','pm','mp',
    'leq','geq','neq','approx','sim','equiv','subset','supset','in','notin','to','mapsto',
    'left','right','big','Big','bigg','Bigg','text','mathrm','mathbf','mathcal','mathbb',
    'hat','bar','tilde','vec','dot','ddot','overline','underline',
    'max','min','sup','inf','lim','log','ln','exp','sin','cos','tan','cot','sec','csc',
    'det','dim','deg','gcd','arg','ker','Pr','Re','Im','ell','hbar','top','bot','mod','div',
    'begin','end','label','ref','cite','caption','textbf','textit','emph'}
pattern = re.compile(r'(?<!\\)\\([A-Za-z]+)([\(_\^][^$\n]*?)?\$')
def unescaped_dollars(s):
    # 数 s 中未被 \ 转义的 $ 个数
    n = 0; i = 0
    while i < len(s):
        if s[i] == '\\':
            i += 2; continue
        if s[i] == '$':
            n += 1
        i += 1
    return n
todo = []
for m in pattern.finditer(content):
    cmd = m.group(1)
    tail = m.group(2) or ''
    if cmd.lower() in latex_cmds or len(cmd) > 3:      # G1
        continue
    if '\n' in m.group(0):                              # G2
        continue
    ls = content.rfind('\n', 0, m.start()) + 1          # 本行起点
    if unescaped_dollars(content[ls:m.start()]) % 2 == 1:  # G3 奇=已在$...$内
        continue
    if '\\' in tail:                                    # G4
        continue
    todo.append(m)
# 从后往前替换，避免 span 位移
for m in reversed(todo):
    old = m.group(0)
    new = '$' + m.group(1) + (m.group(2) or '') + '$'
    content = content[:m.start()] + new + content[m.end():]
    fixes += 1
    print('  Fixed: {!r} -> {!r}'.format(old, new))
if content != original:
    with open(fp, 'w', encoding='utf-8') as fh:
        fh.write(content)
    if fixes:
        print('  Fixed {} math errors in {}'.format(fixes, os.path.basename(fp)))
PYEOF
done

# 6.75 确保 float 包已加载（[H] 需要 float 包，否则编译报错）
echo "--- 检查 float 包 ---"
if [ -f "$PAPER_DIR/main.tex" ]; then
    # 检查 main.tex 和 cls 文件中是否已有 float 包
    HAS_FLOAT=false
    if grep -q 'usepackage{float}\|usepackage\[.*\]{float}\|RequirePackage{float}' "$PAPER_DIR/main.tex" 2>/dev/null; then
        HAS_FLOAT=true
    fi
    # 检查 cls 文件
    for cls in "$PAPER_DIR"/*.cls; do
        [ -f "$cls" ] || continue
        if grep -q 'RequirePackage{float}' "$cls" 2>/dev/null; then
            HAS_FLOAT=true
            break
        fi
    done
    if [ "$HAS_FLOAT" = false ]; then
        echo "  ⚠ float 包缺失，自动注入（[H] 浮动符需要此包）"
        # 在 \usepackage{graphicx} 后面加，或在 \begin{document} 前加
        if grep -q 'usepackage{graphicx}\|usepackage\[.*\]{graphicx}' "$PAPER_DIR/main.tex" 2>/dev/null; then
            sed -i '/usepackage.*{graphicx}/a \\usepackage{float}' "$PAPER_DIR/main.tex"
        else
            sed -i '/\\begin{document}/i \\usepackage{float}' "$PAPER_DIR/main.tex"
        fi
        echo "  ✓ 已注入 \\usepackage{float}"
    else
        echo "  ✓ float 包已存在"
    fi
fi

# 6.76 受控浮动调参 + placeins[section]（防整页空白/一页一图；figure 已由 6.8 钉为 [H]，此处
#        参数主要作用于表格等残余浮动体 + placeins 节末屏障）
# placeins[section]：每个 \section 前自动 \FloatBarrier，图最多飘到本节末，跨不进下一节（防图文分离）
# floatpagefraction=0.72：单独浮动页必须填满≥72%，小图凑不满就不许独占整页（杀"一页一图"）
# ⚠ 幂等/防冲突：先探测 preamble 与 *.cls 是否已加载 placeins。竞赛模板多数已带
#   \usepackage[section]{placeins}，重复且同选项 LaTeX 会静默忽略，但若模板用了不同选项
#   （如无选项 placeins）再注入 [section] 会触发 Option clash 编译崩溃。故已有则只注入
#   浮动参数、跳过 placeins 行。
echo "--- 注入受控浮动调参 ---"
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q 'MH-FLOAT-TUNE' "$PAPER_DIR/main.tex" 2>/dev/null; then
        echo "  ✓ 浮动调参已存在（跳过，幂等）"
    else
        # 探测是否已加载 placeins（main.tex preamble 或任一 *.cls）
        HAS_PLACEINS=false
        if grep -qE '\\(usepackage|RequirePackage)(\[[^]]*\])?\{placeins\}' "$PAPER_DIR/main.tex" 2>/dev/null; then
            HAS_PLACEINS=true
        fi
        if [ "$HAS_PLACEINS" = false ]; then
            for cls in "$PAPER_DIR"/*.cls; do
                [ -f "$cls" ] || continue
                if grep -qE '\\(usepackage|RequirePackage)(\[[^]]*\])?\{placeins\}' "$cls" 2>/dev/null; then
                    HAS_PLACEINS=true
                    break
                fi
            done
        fi
        TUNE_FILE=$(mktemp)
        {
            echo '% MH-FLOAT-TUNE 受控浮动调参（防整页空白/一页一图）'
            if [ "$HAS_PLACEINS" = true ]; then
                echo '% placeins 已由模板/cls 加载，此处不重复注入（避免 Option clash）'
            else
                echo '\usepackage[section]{placeins}'
            fi
            echo '\renewcommand{\topfraction}{0.92}'
            echo '\renewcommand{\bottomfraction}{0.9}'
            echo '\renewcommand{\textfraction}{0.06}'
            echo '\renewcommand{\floatpagefraction}{0.72}'
            echo '\renewcommand{\dbltopfraction}{0.92}'
            echo '\renewcommand{\dblfloatpagefraction}{0.72}'
            echo '\setcounter{topnumber}{3}'
            echo '\setcounter{bottomnumber}{2}'
            echo '\setcounter{totalnumber}{4}'
        } > "$TUNE_FILE"
        # 插到第一个 \begin{document} 之前
        if grep -q '\\begin{document}' "$PAPER_DIR/main.tex" 2>/dev/null; then
            awk 'FNR==NR{buf=buf $0 ORS; next} /\\begin\{document\}/ && !done{printf "%s", buf; done=1} {print}' \
                "$TUNE_FILE" "$PAPER_DIR/main.tex" > "$PAPER_DIR/main.tex.tmp" \
                && mv "$PAPER_DIR/main.tex.tmp" "$PAPER_DIR/main.tex"
            if [ "$HAS_PLACEINS" = true ]; then
                echo "  ✓ 已注入浮动参数（placeins 模板已有，未重复注入）"
            else
                echo "  ✓ 已注入 placeins[section] + 浮动参数"
            fi
        else
            echo "  ⚠ main.tex 未找到 \\begin{document}，跳过浮动参数注入（请检查模板结构）"
        fi
        rm -f "$TUNE_FILE"
    fi
fi

# 6.8 受控浮动：figure → [H]（table/algorithm 也保持 [H]）
# 说明：figure 用 [H] 钉在引出文字正下方，从机制上杜绝"多图连排/浮动堆叠一页"（[htbp] 会让
#       LaTeX 把多张图攒到一页，实测最伤可读性）。代价：极少数"图接近整页高 + 恰好落在页面
#       底部"时，[H] 放不下就整块下移，上方留一段空白——但图已被限高在 0.9\textheight 内、
#       写作规范强制每张图前后都有引导/承接文字，此情形罕见，取舍上优于连排（用户已确认）。
#       6.76 的 placeins 节末屏障仍保留（防残余浮动体跨节，figure 钉死后对它无副作用）。
# ⛔ table 保持 [H]：表格配浮动符会被 placeins 的 \FloatBarrier 逼到节末，在表上方留半页空白
#    （符号表最常中招）。短表 [H] 就地、长表走 9.8 的 longtable 才是标准做法。
# ⛔ 符号说明/模型假设文件：仅当命中关键词【且文件内无 figure】才整文件跳过（交给 9.8 的
#    longtable/needspace 处理表）。若这类文件里混排了插图，仍需规范化那些 figure，不能整个跳过。
# ⛔ algorithm 保持 [H]（伪代码紧贴正文、体量小，不动）
# ⚠ figure*（双栏跨栏浮动）不受影响：正则 \{figure\} 不匹配 \begin{figure*}（} 前有 *）
echo "--- 受控浮动：figure → [H]（table/algorithm 保持 [H]）---"
FLOAT_FIXES=0
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    # 是否为符号说明/模型假设文件
    IS_SYMBOL_ASSUMPTION=false
    if echo "$bn" | grep -qi 'symbol\|assumption'; then
        IS_SYMBOL_ASSUMPTION=true
    elif grep -q '\\section{符号说明}\|\\section{模型假设}\|\\section.*假设\|\\section.*符号' "$f" 2>/dev/null; then
        IS_SYMBOL_ASSUMPTION=true
    fi
    # 只有"符号/假设文件 且 不含 figure"才整文件跳过；含图则继续往下规范化 figure
    if [ "$IS_SYMBOL_ASSUMPTION" = true ] && ! grep -q '\\begin{figure}' "$f" 2>/dev/null; then
        continue
    fi
    # figure: 任意浮动符（含 [htbp] 及早期变体）→ [H]（钉在引出文字正下方，杜绝连排）
    if grep -qP '\\begin\{figure\}\[(?!H\])[^\]]*\]' "$f" 2>/dev/null; then
        sed -i -E 's/\\begin\{figure\}\[[^]]*\]/\\begin{figure}[H]/g' "$f"
        echo "  $bn: figure 浮动符 → [H]"
        FLOAT_FIXES=$((FLOAT_FIXES+1))
    fi
    # 无方括号的 \begin{figure}（LaTeX 默认 [tbp]）→ 显式 [H]
    if grep -qP '\\begin\{figure\}[^[\n]' "$f" 2>/dev/null || grep -qP '\\begin\{figure\}$' "$f" 2>/dev/null; then
        sed -i 's/\\begin{figure}$/\\begin{figure}[H]/g' "$f"
        sed -i 's/\\begin{figure}\\centering/\\begin{figure}[H]\\centering/g' "$f"
        sed -i -E 's/\\begin\{figure\}([^[\n])/\\begin{figure}[H]\1/g' "$f"
        echo "  $bn: figure 无浮动符 → [H]"
        FLOAT_FIXES=$((FLOAT_FIXES+1))
    fi
    # table: 保持 [H]（就地固定，避免 placeins 把浮动表挤到节末留半页空白）
    if grep -qP '\\begin\{table\}\[(?!H\])[^\]]*\]' "$f" 2>/dev/null; then
        sed -i -E 's/\\begin\{table\}\[[^]]*\]/\\begin{table}[H]/g' "$f"
        echo "  $bn: table 浮动符 → [H]"
        FLOAT_FIXES=$((FLOAT_FIXES+1))
    fi
    # 无方括号的 \begin{table} → 显式 [H]
    if grep -qP '\\begin\{table\}[^[\n]' "$f" 2>/dev/null || grep -qP '\\begin\{table\}$' "$f" 2>/dev/null; then
        sed -i 's/\\begin{table}$/\\begin{table}[H]/g' "$f"
        sed -i -E 's/\\begin\{table\}([^[\n])/\\begin{table}[H]\1/g' "$f"
        echo "  $bn: table 无浮动符 → [H]"
        FLOAT_FIXES=$((FLOAT_FIXES+1))
    fi
    # algorithm 保持 [H]（algorithm2e 的伪代码紧贴正文）
    if grep -qP '\\begin\{algorithm\}\[(?!H\])[^\]]*\]' "$f" 2>/dev/null; then
        sed -i -E 's/\\begin\{algorithm\}\[[^]]*\]/\\begin{algorithm}[H]/g' "$f"
        echo "  $bn: algorithm 浮动符 → [H]"
        FLOAT_FIXES=$((FLOAT_FIXES+1))
    fi
done
[ "$FLOAT_FIXES" -gt 0 ] && echo "  $FLOAT_FIXES 个文件修复了浮动体" || echo "  无需修复"

# 6.85 受控浮动补漏：正文用 \input{...} 引进来的表格文件也要钉 [H]
# ⛔ 根因：6.8 的 [H] 转换只扫 sections/*.tex 和 main.tex，扫不到被 \input 引入的
#    ../tables/TABLE_*.tex / ../figures/TABLE_*.tex。约 30% 批次的 TABLE 生成成 [htbp]/[t]
#    浮动符，走 \input 路径就漏网 → 被 placeins 的 \FloatBarrier 逼到节末、表上方留半页空白。
# 做法：扫 sections+main 里的 \input{目标}，路径按主文档目录(PAPER_DIR)解析(LaTeX \input 语义)，
#    对目标文件里的 \begin{table}[...] 归一化成 [H]。longtable 不是浮动体、无 [H] 选项，一律不碰；
#    目标文件不存在/无表格/已是 [H] → 跳过，绝不崩、绝不误改。
echo "--- 受控浮动补漏：\\input 引入的表格 → [H] ---"
PAPER_DIR="$PAPER_DIR" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re, glob
paper_dir = os.environ.get('PAPER_DIR', 'paper').rstrip('/\\')
# 收集正文所有 \input{目标}（sections/*.tex + main.tex）
srcs = glob.glob(os.path.join(paper_dir, 'sections', '*.tex')) + [os.path.join(paper_dir, 'main.tex')]
targets = set()
for s in srcs:
    try:
        with open(s, 'r', encoding='utf-8', errors='ignore') as fh:
            for m in re.finditer(r'\\input\s*\{([^}]*)\}', fh.read()):
                targets.add(m.group(1).strip())
    except Exception:
        continue
fixed = 0
for t in targets:
    # LaTeX \input 路径以主文档目录(paper/)为基准解析；补 .tex 后缀
    name = t if t.lower().endswith('.tex') else t + '.tex'
    path = os.path.normpath(os.path.join(paper_dir, name))
    # 只处理 paper/ 外的表格文件(tables/ figures/)；sections/ 下的已由 6.8 扫过，跳过免重复
    if not os.path.isfile(path):
        continue
    rp = os.path.relpath(path, paper_dir).replace('\\', '/')
    if rp.startswith('sections/'):
        continue
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as fh:
            txt = fh.read()
    except Exception:
        continue
    # 只把浮动 table 环境的浮动符换成 [H]；longtable 不匹配(它没有 \begin{table})，天然豁免
    new = re.sub(r'\\begin\{table\}\[(?!H\])[^\]]*\]', r'\\begin{table}[H]', txt)   # [htbp]/[t] 等 → [H]
    new = re.sub(r'\\begin\{table\}(?=\s*\n|\s*\\centering|\s*%|\s*$)', r'\\begin{table}[H]', new)  # 无浮动符 → [H]
    if new != txt:
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(new)
        print('  %s: table 浮动符 → [H]' % rp)
        fixed += 1
print('  %d 个 \\input 表格文件已钉 [H]' % fixed if fixed else '  无需补漏(表格已 [H] 或无浮动表)')
PYEOF

# 6.9 检测连续图表（两个 figure/table/algorithm 之间正文过少）
# ⚠ 判据用"字符数"而非"行数"：中文论文常一整段物理上就是一行，行数会误报连排。
#    统计两浮动体之间的非空非注释正文字符数，<50 字视为连排（图前缺引导/图后缺承接）。
echo "--- 检测连续图表 ---"
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    "$PYTHON" -c "
import re
with open('$f', 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()
# 匹配 figure/table/algorithm 及其星号(双栏)变体
end_re = re.compile(r'\\\\end\{(figure|table|algorithm)\*?\}')
begin_re = re.compile(r'\\\\begin\{(figure|table|algorithm)\*?\}')
floats = list(end_re.finditer(content))
for i in range(len(floats)-1):
    end1 = floats[i].end()
    start2 = begin_re.search(content[end1:])
    if start2:
        between = content[end1:end1+start2.start()]
        # 去掉整行注释与空白，统计正文字符数
        lines = [l.strip() for l in between.split('\n') if l.strip() and not l.strip().startswith('%')]
        chars = len(''.join(lines))
        if chars < 50:
            line_num = content[:end1].count('\n') + 1
            print(f'  [连排] $bn line ~{line_num}: 连续图表之间正文仅 {chars} 字（需要 >=50 字的引导/承接文字）')
"
done

# 7. 检查竖线表格（应该用三线表）+ 修复表格换行符
echo "--- 检查表格格式 ---"
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex figures/*.tex; do
    [ -f "$f" ] || continue
    if grep -q '{|.*|}' "$f" 2>/dev/null; then
        echo "  ⚠ $(basename $f) 中发现竖线表格，建议改为三线表"
    fi
    # 修复表格中单个 \ 换行（应该是 \\）
    # 匹配：行末是 " \" 但不是 " \\"（在 tabular 环境中）
    if grep -qP ' \\$' "$f" 2>/dev/null; then
        sed -i 's/ \\$/\\\\/g' "$f" 2>/dev/null
        echo "  修复 $(basename $f): 表格行末 \\ → \\\\"
    fi
done

# 7.2 修复 \[ 被误用为换行（应该是 \\[）
# 只修复 \[数字em] 或 \[数字pt] 或 \[数字cm] 模式，不动正常的数学 \[...\]
echo "--- 修复 \\[ 误用 ---"
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    "$PYTHON" -c "
import re
with open('$f', 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()
# Match \[0.5em] or \[1pt] etc. but NOT \\[0.5em] (already correct)
# Also not \[ x^2 \] (math display mode)
pattern = r'(?<!\\\\)\\\\(?=\[\d+\.?\d*\s*(em|pt|cm|mm|ex)\])'
new_content = re.sub(pattern, r'\\\\\\\\', content)
if new_content != content:
    with open('$f', 'w', encoding='utf-8') as fh:
        fh.write(new_content)
    print(f'  Fixed \\\\[ -> \\\\\\\\[ in $(basename $f)')
" 2>/dev/null
done

# 7.5 检查中文论文是否错误使用 natbib（应该用 gbt7714）
echo "--- 检查引用格式 ---"
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q 'ctex\|xelatex\|ctexart\|ctexbook' "$PAPER_DIR/main.tex" 2>/dev/null; then
        # 中文论文
        if grep -q 'usepackage.*natbib' "$PAPER_DIR/main.tex" 2>/dev/null; then
            # Exception: stats competition template uses natbib with [numbers,square] or [numbers,square,super] — this is correct
            if grep -q 'numbers.*square\|square.*numbers' "$PAPER_DIR/main.tex" 2>/dev/null; then
                echo "  ✓ natbib with [numbers,square] (stats competition format)"
            elif ! grep -q 'gbt7714' "$PAPER_DIR/main.tex" 2>/dev/null; then
                echo "  ⚠ 中文论文使用了 natbib 而非 gbt7714，引用格式将是 [Author, Year] 而非上标 [1]"
                echo "  建议替换为: \\usepackage[super,sort&compress]{gbt7714}"
            fi
        fi
    fi
fi

# 8. 检查 ref/label 匹配
echo "--- 检查 ref/label ---"
grep -oh '\\ref{[^}]*}' "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null | sort -u > /tmp/_refs.txt
grep -oh '\\label{[^}]*}' "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null | sort -u > /tmp/_labels.txt
MISSING=$(comm -23 <(sed 's/\\ref/\\label/g' /tmp/_refs.txt) /tmp/_labels.txt 2>/dev/null)
if [ -n "$MISSING" ]; then
    echo "  ⚠ 缺失的 label:"
    echo "$MISSING"
else
    echo "  all refs have matching labels"
fi

# 9. 删除 \input{../figures/latex_includes*.tex} 行（禁止批量导入整个 latex_includes）
echo "--- 检查禁止的 \\input{figures} ---"
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    # 只删除批量导入 latex_includes 的行，不删除单个 TikZ 图的 \input
    if grep -q '\\input.*latex_includes' "$f" 2>/dev/null; then
        echo "  ⚠ $(basename $f) 中发现 \\input{latex_includes}，已删除"
        sed -i '/\\input.*latex_includes/d' "$f"
    fi
done

# 9.1 自动检测并报告未嵌入的图表（供 Claude 编译步骤修复）
echo "--- 未嵌入图表检测 ---"
UNEMBED_COUNT=0
UNEMBED_LIST=""
# 检查 figures/*.tex 中的 label 是否都在 sections 中出现
if ls figures/*.tex 1>/dev/null 2>&1; then
    for fig_tex in figures/*.tex; do
        [ -f "$fig_tex" ] || continue
        fig_labels=$(grep -oh '\\label{[^}]*}' "$fig_tex" 2>/dev/null)
        for lbl in $fig_labels; do
            if ! grep -rq "$lbl" "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null; then
                echo "  ⚠ UNEMBEDDED: $lbl (from $(basename $fig_tex)) — not found in any section"
                UNEMBED_COUNT=$((UNEMBED_COUNT + 1))
                UNEMBED_LIST="$UNEMBED_LIST $lbl"
            fi
        done
    done
fi
# 检查 figures/*.pdf 是否被 \includegraphics 引用
UNEMBED_PDFS=""
for pdf in figures/*.pdf; do
    [ -f "$pdf" ] || continue
    bn=$(basename "$pdf")
    if ! grep -rq "$bn" "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null; then
        echo "  ⚠ UNEMBEDDED: $bn — PDF not referenced by any \\includegraphics"
        UNEMBED_COUNT=$((UNEMBED_COUNT + 1))
        UNEMBED_PDFS="$UNEMBED_PDFS $bn"
    fi
done
if [ "$UNEMBED_COUNT" -gt 0 ]; then
    echo ""
    echo "  ============================================================"
    echo "  ACTION REQUIRED: $UNEMBED_COUNT unembedded figures/tables"
    echo "  ============================================================"
    echo "  The compile step MUST embed these before compilation."
    echo "  For each unembedded item:"
    echo "    1. Find the figure/table block in figures/*.tex (match by label)"
    echo "    2. Determine which section it belongs to (by label name or caption)"
    echo "    3. Copy the complete \\begin{figure}...\\end{figure} block into that section"
    echo "    4. Add 1-2 sentences of lead-in text before and 3-5 sentences of analysis after"
    echo ""
    echo "  Unembedded labels: $UNEMBED_LIST"
    echo "  Unembedded PDFs: $UNEMBED_PDFS"
    echo "  ============================================================"
else
    echo "  ✓ All figures/tables from figures/*.tex are embedded in sections"
fi

# 9.2 检测空 figure 环境（有 caption 但没有 \includegraphics 或 tikzpicture）
echo "--- 空图表环境检测 ---"
EMPTY_FIG_COUNT=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    "$PYTHON" -c "
import re
with open('$f', 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()
# Find all figure environments
fig_pattern = r'\\\\begin\{figure\}.*?\\\\end\{figure\}'
for m in re.finditer(fig_pattern, content, re.DOTALL):
    block = m.group()
    has_image = 'includegraphics' in block
    has_tikz = 'tikzpicture' in block
    has_tabular = 'tabular' in block
    if not has_image and not has_tikz and not has_tabular:
        # Extract caption for reporting
        cap = re.search(r'\\\\caption\{([^}]*)\}', block)
        cap_text = cap.group(1)[:50] if cap else '(no caption)'
        print(f'EMPTY_FIGURE in $bn: \"{cap_text}\" — has caption but no \\\\includegraphics or tikzpicture')
# Same for table environments
tab_pattern = r'\\\\begin\{table\}.*?\\\\end\{table\}'
for m in re.finditer(tab_pattern, content, re.DOTALL):
    block = m.group()
    if 'tabular' not in block and 'longtable' not in block:
        cap = re.search(r'\\\\caption\{([^}]*)\}', block)
        cap_text = cap.group(1)[:50] if cap else '(no caption)'
        print(f'EMPTY_TABLE in $bn: \"{cap_text}\" — has caption but no tabular content')
" 2>/dev/null | while read line; do
        echo "  ⚠ $line"
        EMPTY_FIG_COUNT=$((EMPTY_FIG_COUNT + 1))
    done
done
if [ "$EMPTY_FIG_COUNT" -gt 0 ]; then
    echo "  ACTION REQUIRED: Found empty figure/table environments."
    echo "  For each empty figure: find the matching PDF in figures/ (by caption/label name) and add \\includegraphics{../figures/xxx.pdf}"
    echo "  For each empty table: find the matching table code in figures/TABLE_*.tex and paste the tabular content"
fi

# 9.5 检查 sections/ 目录下的非 .tex 文件（不该存在）
echo "--- 检查 sections/ 杂文件 ---"
for f in "$PAPER_DIR"/sections/*; do
    [ -f "$f" ] || continue
    case "$f" in
        *.tex) ;;
        *) echo "  ⚠ sections/ 中发现非 .tex 文件: $(basename $f)，建议删除" ;;
    esac
done

# 9.6 检查并删除模板占位符残留
# ⛔ 注意：不能用 sed -i '/pattern/d' 删除整行，因为 \title{[论文标题]} 这种行
#    删掉整行会导致 \title 命令丢失，PDF 标题消失！
#    正确做法：只删除占位符文本，保留 LaTeX 命令结构
echo "--- 检查模板占位符 ---"
for f in "$PAPER_DIR"/main.tex "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    if grep -q '\[中文摘要内容\]\|\[English abstract\]\|\[论文标题\]\|\[关键词1\]' "$f" 2>/dev/null; then
        echo "  ⚠ $(basename $f) 中发现模板占位符残留，正在清理..."
        # 对于 \title{[论文标题]}：替换为 \title{}（保留命令，清空内容）
        sed -i 's/\[论文标题\]//g' "$f"
        # 对于 sections 中的独立占位符行：直接删除整行（这些不包含 LaTeX 命令）
        sed -i '/^\[中文摘要内容.*\]$/d; /^\[English abstract.*\]$/d' "$f"
        # 对于内联占位符：替换为空
        sed -i 's/\[中文摘要内容[^]]*\]//g; s/\[English abstract[^]]*\]//g' "$f"
        sed -i 's/\[关键词1\]//g; s/\[关键词2\]//g; s/\[关键词3\]//g' "$f"
    fi
    # stats 模板封面特有占位符检查（不自动清理，必须由 Claude 手动替换）
    if grep -q '\[学校名称\]\|\[队员1\]\|\[指导老师\]\|\[竞赛年份\]\|\[届数\]' "$f" 2>/dev/null; then
        echo "  ⚠ $(basename $f) 中发现 stats 封面占位符未替换：[学校名称]/[队员]/[指导老师]/[竞赛年份]"
        echo "    → 必须替换这些占位符，否则封面会显示方括号文字"
    fi
done

# 9.7 验证并自动修复 \title 命令（防止标题丢失）
# ⛔ 只对使用 \title{} + \maketitle 的模板生效
# 不处理：stats（手动排版标题）、dongsansheng（\ttle）、huashubei（\biaoti）、
#         diangongbei/changsanjiao（\mcmsetup{timu=}）、MathorCup（\timu）
echo "--- 检查 \\title 命令 ---"
if [ -f "$PAPER_DIR/main.tex" ]; then
    # 检测是否是使用 \title{} 的模板（排除不用 \title 的特殊模板）
    USES_TITLE_CMD=false
    if grep -q '\\documentclass.*cumcmthesis\|\\documentclass.*gmcmthesis\|\\documentclass.*ctexart\|\\documentclass.*article' "$PAPER_DIR/main.tex" 2>/dev/null; then
        # 但 stats 模板虽然用 ctexart，却不用 \title，而是手动排版
        # 通过检查是否有 \maketitle 来判断
        if grep -q '\\maketitle' "$PAPER_DIR/main.tex" 2>/dev/null; then
            USES_TITLE_CMD=true
        fi
        # cumcmthesis/gmcmthesis 必须有 \maketitle，如果被误删了也要修复
        if grep -q 'cumcmthesis\|gmcmthesis' "$PAPER_DIR/main.tex" 2>/dev/null; then
            USES_TITLE_CMD=true
        fi
    fi
    # default 模板也用 \title + \maketitle
    if grep -q '\\title{' "$PAPER_DIR/main.tex" 2>/dev/null; then
        USES_TITLE_CMD=true
    fi

    if [ "$USES_TITLE_CMD" = true ]; then
        if grep -q '\\title{' "$PAPER_DIR/main.tex" 2>/dev/null; then
            TITLE_CONTENT=$(grep '\\title{' "$PAPER_DIR/main.tex" | head -1 | sed 's/.*\\title{//;s/}.*//')
            # 去掉 \heiti\zihao{2} 等格式命令后再判断是否为空
            TITLE_CLEAN=$(echo "$TITLE_CONTENT" | sed 's/\\[a-zA-Z]*{[^}]*}//g; s/\\[a-zA-Z]*//g; s/[[:space:]]//g')
            if [ -z "$TITLE_CLEAN" ]; then
                echo "  ⛔ \\title{} 内容为空，尝试自动修复..."
                FALLBACK_TITLE=""
                if [ -f "CLAUDE.md" ]; then
                    FALLBACK_TITLE=$(grep -oP '(?<=题目|赛题|title)[：:]\s*\K.+' CLAUDE.md 2>/dev/null | head -1 | sed 's/[[:space:]]*$//')
                fi
                if [ -z "$FALLBACK_TITLE" ] && [ -f "PROBLEM_ANALYSIS.md" ]; then
                    FALLBACK_TITLE=$(head -5 PROBLEM_ANALYSIS.md | grep -oP '(?<=^# |^## ).+' | head -1)
                fi
                if [ -z "$FALLBACK_TITLE" ]; then
                    FALLBACK_TITLE="数学建模竞赛论文"
                fi
                # 保留原有格式命令，只填充标题文本
                if echo "$TITLE_CONTENT" | grep -q '\\heiti\|\\zihao'; then
                    # default 模板: \title{\heiti\zihao{2} }
                    sed -i "s|\\\\title{${TITLE_CONTENT}}|\\\\title{${TITLE_CONTENT}${FALLBACK_TITLE}}|" "$PAPER_DIR/main.tex"
                else
                    sed -i "s|\\\\title{}|\\\\title{$FALLBACK_TITLE}|" "$PAPER_DIR/main.tex"
                fi
                echo "  ✓ 已自动填充标题: $FALLBACK_TITLE"
            else
                echo "  ✓ \\title 存在: $TITLE_CONTENT"
            fi
        else
            echo "  ⛔ main.tex 中没有 \\title 命令，自动插入..."
            FALLBACK_TITLE="数学建模竞赛论文"
            if [ -f "CLAUDE.md" ]; then
                FT=$(grep -oP '(?<=题目|赛题|title)[：:]\s*\K.+' CLAUDE.md 2>/dev/null | head -1 | sed 's/[[:space:]]*$//')
                [ -n "$FT" ] && FALLBACK_TITLE="$FT"
            fi
            sed -i "/\\\\begin{document}/i \\\\title{$FALLBACK_TITLE}" "$PAPER_DIR/main.tex"
            echo "  ✓ 已自动插入: \\title{$FALLBACK_TITLE}"
        fi
        # 检查并修复 \maketitle（cumcmthesis/gmcmthesis 需要，但五一杯例外）
        if grep -q 'cumcmthesis\|gmcmthesis' "$PAPER_DIR/main.tex" 2>/dev/null; then
            if ! grep -q '\\maketitle' "$PAPER_DIR/main.tex" 2>/dev/null; then
                # 五一杯模板有手动承诺书+封面，不需要 \maketitle
                # 检测方式：五一杯模板有"承诺书"或"五一数学建模"字样
                if grep -q '承诺书\|五一数学建模\|五一杯' "$PAPER_DIR/main.tex" 2>/dev/null; then
                    echo "  ✓ 五一杯模板（手动封面），不需要 \\maketitle"
                else
                    echo "  ⛔ cumcmthesis/gmcmthesis 模板缺少 \\maketitle，自动插入..."
                    sed -i '/\\begin{document}/a \\\\maketitle' "$PAPER_DIR/main.tex"
                    echo "  ✓ 已在 \\begin{document} 后插入 \\maketitle"
                fi
            fi
        fi
    else
        echo "  ✓ 非 \\title 模板（stats/dongsansheng/huashubei/diangongbei 等），跳过"
    fi
fi

# 9.8 符号说明/模型假设分页处理
# 策略：
#   - 模型假设（assumption）：用 \needspace{20\baselineskip}，够放就不换页
#   - 符号说明（symbol）：用 \needspace{15\baselineskip}，确保标题和表格在同一页
echo "--- 修复符号说明/模型假设分页 ---"
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    is_assumption=false
    is_symbol=false

    if echo "$bn" | grep -qi 'assumption'; then
        is_assumption=true
    elif grep -q '\\section{模型假设}\|\\section.*假设' "$f" 2>/dev/null; then
        is_assumption=true
    fi

    if echo "$bn" | grep -qi 'symbol'; then
        is_symbol=true
    elif grep -q '\\section{符号说明}\|\\section.*符号' "$f" 2>/dev/null; then
        is_symbol=true
    fi

    if [ "$is_assumption" = true ]; then
        # 模型假设：移除 \clearpage，改用 \needspace（防标题孤立）
        if grep -q '\\clearpage' "$f" 2>/dev/null; then
            echo "  $bn: 移除 \\clearpage，改用 \\needspace"
            sed -i '/\\clearpage/d' "$f" 2>/dev/null
        fi
        if ! grep -B2 '\\section{' "$f" 2>/dev/null | grep -q '\\needspace'; then
            echo "  $bn: 在 \\section 前添加 \\needspace{8\\baselineskip}"
            # ⛔ 用 python 插入字面量：sed 的 i/a 命令在部分环境会把开头 \n 当转义吃掉，
            #    导致产出裸 "eedspace/opagebreak"（真实翻车）。python 逐行处理零转义歧义。
            #    ⛔ 8\baselineskip（不是 20）：够挡"标题孤悬页底"，又不至于把大半页推空
            #    （20 行会在剩余空间不足时硬翻页 → 前页大片空白，正是用户反馈的空白页）。
            "$PYTHON" - "$f" <<'PYEOF' 2>/dev/null || true
import re,sys
p=sys.argv[1]
lines=open(p,encoding="utf-8").read().split("\n")
out=[]
for ln in lines:
    if re.search(r'\\section\{.*假设.*\}', ln) and not (out and 'needspace' in out[-1]):
        out.append(r'\needspace{8\baselineskip}')
    out.append(ln)
open(p,"w",encoding="utf-8").write("\n".join(out))
PYEOF
        fi
        # ⛔ 不再插入 \nopagebreak[4]：① sed 的 a 命令在部分环境把开头 \n 当转义吃掉，
        #    产出裸 "opagebreak[4]" 混进正文（真实翻车，见用户反馈）；② 第 10 步注释已定论
        #    "nopagebreak 弊大于利、会导致空白页"。故此处彻底不加，与第 10 步移除逻辑一致。
        #    防标题孤立靠上面的 \needspace 即可（needspace 用 printf 安全写入，见下）。
        :
    fi

    if [ "$is_symbol" = true ]; then
        # 符号说明：用 longtable 替代 table+tabular，自动跨页
        # longtable 天然支持跨页，标题永远在表格开头，不存在分离问题
        
        # 移除之前可能加的分页控制
        sed -i '/\\clearpage/d' "$f" 2>/dev/null
        sed -i '/\\needspace.*baselineskip/d' "$f" 2>/dev/null
        sed -i '/\\nopagebreak/d' "$f" 2>/dev/null
        
        # 删引导文字
        sed -i '/本文所用主要符号/d' "$f" 2>/dev/null
        sed -i '/本文.*符号.*含义.*表/d' "$f" 2>/dev/null
        sed -i '/主要符号.*如.*所示/d' "$f" 2>/dev/null
        
        # table+tabular → longtable（简单可靠的 sed 方案）
        if grep -q '\\begin{table}' "$f" 2>/dev/null; then
            echo "  $bn: table+tabular → longtable"
            # 删 \begin{table}[任何参数] 和 \end{table}
            sed -i '/\\begin{table}/d' "$f" 2>/dev/null
            sed -i '/\\end{table}/d' "$f" 2>/dev/null
            # 删 \centering（longtable 自带居中）
            sed -i '/\\centering/d' "$f" 2>/dev/null
            # \begin{tabular} → \begin{longtable}
            sed -i 's/\\begin{tabular}/\\begin{longtable}/g' "$f" 2>/dev/null
            # \end{tabular} → \end{longtable}
            sed -i 's/\\end{tabular}/\\end{longtable}/g' "$f" 2>/dev/null
            # \caption 移到 \toprule 前面（longtable 的 caption 必须在表格内部第一行）
            # ⛔ 用 python 而不是 sed：sed 的 i 命令会吃掉 \caption / \label 的反斜杠
            #    （sed 把 \c \l 当转义序列处理，导致输出 caption{...}label{...} 无效 LaTeX）
            CAPTION_LINE=$(grep '\\caption{' "$f" 2>/dev/null | head -1)
            if [ -n "$CAPTION_LINE" ]; then
                # 通过环境变量传值 + 单引号 heredoc 保护，避免反斜杠丢失
                CAPTION_LINE="$CAPTION_LINE" TARGET_FILE="$f" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re
fp = os.environ['TARGET_FILE']
caption = os.environ.get('CAPTION_LINE', '').strip()
if not caption:
    raise SystemExit(0)
with open(fp, 'r', encoding='utf-8') as fh:
    content = fh.read()
# 1. 删除原 caption 行（行首到 \caption{...} + 可选 \label{...}，再到行尾）
content = re.sub(
    r'^[ \t]*\\caption\{[^}]*\}(?:[ \t]*\\label\{[^}]*\})?[ \t]*\n',
    '',
    content,
    flags=re.MULTILINE,
)
# 2. 在 \toprule 前插入 caption + 行尾的 \\（longtable caption 内部必须用 \\ 结束）
# ⛔ 用 lambda 让 caption 当字面字符串，避免 re.sub 把 \c \l 当反向引用报 bad escape
new_caption_line = caption + r' \\'
new_content, n = re.subn(
    r'(^[ \t]*\\toprule)',
    lambda m: new_caption_line + '\n' + m.group(1),
    content,
    count=1,
    flags=re.MULTILINE,
)
if n > 0:
    with open(fp, 'w', encoding='utf-8') as fh:
        fh.write(new_content)
PYEOF
            fi
            # 确保 main.tex 有 longtable 包
            ensure_usepackage longtable
        fi
        echo "  $bn: 符号说明修复完成（longtable 自动跨页）"
    fi
done

echo "=== 清理完成 ==="

# ============================================================
# 编译后检查（编译完成后执行）
# ============================================================

# 10. 检查目录是否生成
echo "--- 检查目录 ---"
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q 'tableofcontents' "$PAPER_DIR/main.tex" 2>/dev/null; then
        if [ ! -f "$PAPER_DIR/main.toc" ]; then
            echo "  ⚠ main.tex 有 \\tableofcontents 但 main.toc 不存在，目录可能未生成（需要编译两遍）"
        elif [ ! -s "$PAPER_DIR/main.toc" ]; then
            echo "  ⚠ main.toc 为空，目录未正确生成（需要完整 4 步编译）"
        else
            echo "  ✓ main.toc 存在"
        fi
    fi
fi

# 11. 检查中英文摘要是否都存在（中文论文）
echo "--- 检查摘要 ---"
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q 'ctex\|ctexart\|ctexbook' "$PAPER_DIR/main.tex" 2>/dev/null; then
        ZH_ABSTRACT=$(grep -rl '摘.*要' "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null | wc -l)
        EN_ABSTRACT=$(grep -rl 'Abstract' "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null | wc -l)
        [ "$ZH_ABSTRACT" -gt 0 ] && echo "  ✓ 中文摘要存在" || echo "  ⚠ 未找到中文摘要"
        [ "$EN_ABSTRACT" -gt 0 ] && echo "  ✓ 英文摘要存在" || echo "  ⚠ 未找到英文摘要"
    fi
fi

# 12. 检查 \bibliography{references} 是否存在
echo "--- 检查参考文献配置 ---"
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q '\\bibliography' "$PAPER_DIR/main.tex" 2>/dev/null; then
        echo "  ✓ \\bibliography 命令存在"
    else
        echo "  ⚠ main.tex 中没有 \\bibliography 命令，参考文献不会出现在 PDF 中！"
    fi
    if [ -f "$PAPER_DIR/references.bib" ]; then
        BIB_ENTRIES=$(grep -c '^@' "$PAPER_DIR/references.bib" 2>/dev/null)
        echo "  ✓ references.bib 存在（$BIB_ENTRIES 条）"
    else
        echo "  ⚠ references.bib 不存在！"
    fi
fi

# 13. 检查生成的 PDF 图是否都被正文引用
echo "--- 检查未引用的 PDF 图 ---"
UNUSED_FIGS=0
for pdf in figures/*.pdf; do
    [ -f "$pdf" ] || continue
    basename=$(basename "$pdf")
    if ! grep -rq "$basename" "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null; then
        echo "  ⚠ $basename 未被正文引用"
        UNUSED_FIGS=$((UNUSED_FIGS + 1))
    fi
done
[ "$UNUSED_FIGS" -eq 0 ] && echo "  ✓ 所有 PDF 图都已引用" || echo "  共 $UNUSED_FIGS 个 PDF 图未引用"

echo "=== 全部检查完成 ==="

# 图片宽度统一化（防止图大小不一致）
# 规则：单图 \includegraphics 的 width 统一为 0.85（满宽 \textwidth/\linewidth 撑页面不好看）
# ⛔ minipage/subfigure/subfloat 内的并排图一律豁免（0.48 等半栏系数是故意的，不能改）
echo "--- 图片宽度统一化（满宽兜底，含并排豁免）---"
FIG_WIDTH_FIXES=0
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex figures/latex_includes.tex; do
    [ -f "$f" ] || continue
    bn="$(basename "$f")" TARGET_FILE="$f" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re
fp = os.environ['TARGET_FILE']; bn = os.environ.get('bn', fp)
with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()

# 豁免并排环境（与 4.5 段同款掩码）
_masked = []
def _mask(m):
    _masked.append(m.group(0)); return f'@@MHW{len(_masked)-1}@@'
_ENV = re.compile(
    r'\\begin\{(minipage|subfigure|subfloat)\}.*?\\end\{\1\}'
    r'|\\subfloat\b.*?\\includegraphics\[[^\]]*\]\{[^}]*\}'
    r'|\\subfigure\b.*?\\includegraphics\[[^\]]*\]\{[^}]*\}',
    re.DOTALL)
content = _ENV.sub(_mask, content)

hit = [0]
def fix(m):
    opts = m.group(1)
    # 满宽 \textwidth/\linewidth/\columnwidth（无系数）→ 0.85，并补 height guard
    def repl(wm):
        unit = wm.group(1)
        hit[0] += 1
        return f'width=0.85\\{unit}'
    new = re.sub(r'width\s*=\s*\\(textwidth|linewidth|columnwidth)', repl, opts)
    # 同 4.5 段：剥离 <0.5\textheight 的写作期压图限高，退化为无 height 再由下方补 0.9
    def _strip_small_h(hm):
        if float(hm.group(1)) < 0.5:
            hit[0] += 1
            return ''
        return hm.group(0)
    new = re.sub(r',?\s*height\s*=\s*([0-9]*\.?[0-9]+)\\textheight', _strip_small_h, new)
    new = re.sub(r',\s*,', ',', new).strip().strip(',')
    if new != opts and 'height=' not in new:
        add = ',height=0.9\\textheight'
        if 'keepaspectratio' not in new:
            add += ',keepaspectratio'
        new = new + add
    return '\\includegraphics[' + new + ']'

content = re.sub(r'\\includegraphics\[([^\]]*)\]', fix, content)
for i, seg in enumerate(_masked):
    content = content.replace(f'@@MHW{i}@@', seg)
if hit[0]:
    with open(fp, 'w', encoding='utf-8') as fh:
        fh.write(content)
    print(f'  {bn}: 满宽图片 width → 0.85（{hit[0]} 处，已跳过并排环境）')
PYEOF
    [ $? -eq 0 ] && FIG_WIDTH_FIXES=$((FIG_WIDTH_FIXES+1))
done
echo "  图片宽度统一化完成（并排图已豁免）"

# TikZ resizebox auto-wrap (prevent tikzpicture from exceeding page width/height)
echo "--- TikZ resizebox check ---"

# 先修复浅色注释文字（gray!30~gray!70 改成 black）
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex figures/*.tex; do
    [ -f "$f" ] || continue
    if grep -qP 'color=gray![3-6]0' "$f" 2>/dev/null; then
        echo "  Fixing light gray text in $(basename $f) -> black"
        sed -i 's/color=gray![3-6]0/color=black/g' "$f" 2>/dev/null
    fi
    # 也修复 note 样式定义中的浅色
    if grep -q 'note/.style.*color=gray' "$f" 2>/dev/null; then
        echo "  Fixing note style in $(basename $f) -> black"
        sed -i 's/\(note\/\.style.*\)color=gray![0-9]*/\1color=black/' "$f" 2>/dev/null
    fi
    # 删除 on background layer（会导致黑底）
    if grep -q 'on background layer' "$f" 2>/dev/null; then
        echo "  Removing 'on background layer' from $(basename $f)"
        sed -i '/begin{scope}\[on background layer\]/d' "$f" 2>/dev/null
        sed -i '/end{scope}.*background/d' "$f" 2>/dev/null
        # 清理残留的空 scope（删了 begin 和 end 后可能留下孤立的 end{scope}）
    fi
done

for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex figures/*.tex; do
    [ -f "$f" ] || continue
    if grep -q '\\begin{tikzpicture}' "$f" 2>/dev/null; then
        if ! grep -q 'adjustbox{max width' "$f" 2>/dev/null; then
            echo "  Wrapping tikzpicture in $(basename $f) with adjustbox"
            sed -i 's/\\begin{tikzpicture}/\\adjustbox{max width=\\textwidth}{%\n\\begin{tikzpicture}/' "$f" 2>/dev/null
            sed -i 's/\\end{tikzpicture}/\\end{tikzpicture}\n}%/' "$f" 2>/dev/null
        fi
    fi
done
# Ensure adjustbox package is loaded
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q 'adjustbox' "$PAPER_DIR"/sections/*.tex 2>/dev/null && ! grep -q 'usepackage.*adjustbox' "$PAPER_DIR/main.tex" 2>/dev/null; then
        echo "  Adding \\usepackage{adjustbox} to main.tex"
        sed -i '/\\begin{document}/i \\\\usepackage{adjustbox}' "$PAPER_DIR/main.tex" 2>/dev/null
    fi
fi

# TikZ library auto-inject
echo "--- TikZ library check ---"
MAIN_TEX="$PAPER_DIR/main.tex"
if [ -f "$MAIN_TEX" ]; then
    # Check if any section uses tikzpicture
    has_tikz=$(grep -rl 'tikzpicture\|\\begin{tikzpicture}' "$PAPER_DIR"/sections/*.tex 2>/dev/null | wc -l)
    if [ "$has_tikz" -gt 0 ]; then
        # Ensure tikz package is loaded
        if ! grep -q 'usepackage{tikz}' "$MAIN_TEX" 2>/dev/null; then
            echo "  Adding \\usepackage{tikz} to main.tex"
            sed -i '/\\begin{document}/i \\\\usepackage{tikz}\n\\\\usetikzlibrary{arrows.meta, positioning, shapes.geometric, calc, decorations.pathreplacing, shadows, fit, backgrounds}' "$MAIN_TEX" 2>/dev/null
        fi
        # Ensure tikz libraries are loaded
        if ! grep -q 'usetikzlibrary' "$MAIN_TEX" 2>/dev/null; then
            echo "  Adding \\usetikzlibrary to main.tex"
            sed -i '/usepackage{tikz}/a \\\\usetikzlibrary{arrows.meta, positioning, shapes.geometric, calc, decorations.pathreplacing, shadows, fit, backgrounds}' "$MAIN_TEX" 2>/dev/null
        fi
        # Ensure backgrounds and fit libraries are present (may have been injected without them)
        if grep -q 'usetikzlibrary' "$MAIN_TEX" 2>/dev/null; then
            if ! grep -q 'backgrounds' "$MAIN_TEX" 2>/dev/null; then
                echo "  Adding missing 'backgrounds' library"
                sed -i 's/\\usetikzlibrary{/\\usetikzlibrary{backgrounds, fit, /' "$MAIN_TEX" 2>/dev/null
            elif ! grep -q '\bfit\b' "$MAIN_TEX" 2>/dev/null; then
                echo "  Adding missing 'fit' library"
                sed -i 's/\\usetikzlibrary{/\\usetikzlibrary{fit, /' "$MAIN_TEX" 2>/dev/null
            fi
        fi
        echo "  TikZ libraries ensured"
    else
        echo "  No TikZ content found, skipping"
    fi
fi

# 10. 移除所有 section 文件中的 \nopagebreak（实践证明弊大于利，会导致空白页）
# ⛔ 跳过符号说明和模型假设文件（9.8 步刚加了 \nopagebreak[4]）
echo "--- 移除 nopagebreak ---"
NOPAGEBREAK_FIXES=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    # 跳过符号说明和模型假设（9.8 步需要保留 \nopagebreak[4]）
    if echo "$bn" | grep -qi 'symbol\|assumption'; then
        continue
    fi
    if grep -q '\\section{符号说明}\|\\section{模型假设}\|\\section.*假设\|\\section.*符号' "$f" 2>/dev/null; then
        continue
    fi
    if grep -q '\\nopagebreak' "$f" 2>/dev/null; then
        sed -i '/\\nopagebreak/d' "$f" 2>/dev/null
        echo "  removed nopagebreak from $(basename $f)"
        NOPAGEBREAK_FIXES=$((NOPAGEBREAK_FIXES + 1))
    fi
done
[ "$NOPAGEBREAK_FIXES" -gt 0 ] && echo "  $NOPAGEBREAK_FIXES 个文件移除了 nopagebreak" || echo "  无需修复"

# 10.5 兜底：清理"裸坏字符"——历史/边缘情况下 sed 吃掉反斜杠或 \n，会把
#      \nopagebreak[4] / \needspace{...} 变成正文里的裸 "opagebreak[4]" / "eedspace{...}"
#      （用户反馈真实翻车）。这些命令名裸露成正文，必须整行删掉（它们本就不该出现在正文）。
echo "--- 清理裸坏字符(opagebreak/eedspace) ---"
BADCHAR_FIXES=0
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    # 只删"独占一行、纯坏命令名"的行（行首可有空白）——避免误伤正文里正常提到这些词的句子。
    # 覆盖两种损坏模式：\n 被吃→"opagebreak"，仅反斜杠被吃→"nopagebreak"(n 还在)；needspace 同理。
    # 用 n? / n?eedspace 兼容两者；关键是"独占整行"约束保证不误伤正文句子。
    if grep -qE '^[[:space:]]*(n?opagebreak(\[[0-9]\])?|n?eedspace\{[^}]*\})[[:space:]]*$' "$f" 2>/dev/null; then
        sed -i -E '/^[[:space:]]*n?opagebreak(\[[0-9]\])?[[:space:]]*$/d; /^[[:space:]]*n?eedspace\{[^}]*\}[[:space:]]*$/d' "$f" 2>/dev/null
        echo "  cleaned bare (n)opagebreak/(n)eedspace from $(basename "$f")"
        BADCHAR_FIXES=$((BADCHAR_FIXES + 1))
    fi
done
[ "$BADCHAR_FIXES" -gt 0 ] && echo "  $BADCHAR_FIXES 个文件清理了裸坏字符" || echo "  无裸坏字符"

# 11. 移除正文中多余的 \newpage 和 \clearpage（section 文件内部不应有手动分页）
# ⛔ 跳过符号说明和模型假设文件（9.8 步刚加了 \clearpage）
echo "--- 移除正文多余 newpage/clearpage ---"
NEWPAGE_FIXES=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    # 跳过符号说明和模型假设（有 \needspace 需要保留）
    if echo "$bn" | grep -qi 'symbol\|assumption'; then
        continue
    fi
    if grep -q '\\section{符号说明}\|\\section{模型假设}' "$f" 2>/dev/null; then
        continue
    fi
    if grep -q '\\newpage\|\\clearpage' "$f" 2>/dev/null; then
        sed -i '/\\newpage/d; /\\clearpage/d' "$f" 2>/dev/null
        echo "  removed newpage/clearpage from $bn"
        NEWPAGE_FIXES=$((NEWPAGE_FIXES + 1))
    fi
done
[ "$NEWPAGE_FIXES" -gt 0 ] && echo "  $NEWPAGE_FIXES 个文件移除了 newpage/clearpage" || echo "  无需修复"

# 11.5 检测章节末尾空白（最后一页内容太少）
echo "--- 检测章节末尾空白 ---"
THIN_ENDINGS=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    echo "$bn" | grep -qi 'symbol\|assumption\|appendix\|A_code' && continue
    chars=$(wc -c < "$f" 2>/dev/null || echo 0)
    est_pages=$((chars / 900))
    tail_content=$(tail -c 300 "$f" 2>/dev/null | grep -v '^\s*$' | grep -v '^\\' | wc -c)
    if [ "$est_pages" -ge 2 ] && [ "$tail_content" -lt 50 ]; then
        echo "  ⚠ $bn: 章节末尾可能有空白（最后300字节实质内容仅 ${tail_content} 字节）"
        echo "    → 建议在章节末尾添加'本章小结'段落（2-3句话总结本章并预告下章）"
        THIN_ENDINGS=$((THIN_ENDINGS+1))
    fi
done
[ "$THIN_ENDINGS" -gt 0 ] && echo "  $THIN_ENDINGS 个章节末尾可能有空白" || echo "  无需修复"

echo "=== compile_utils.sh done ==="
