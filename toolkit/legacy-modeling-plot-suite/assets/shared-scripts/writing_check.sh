#!/bin/bash
# writing_check.sh — Post-writing quality checks
# Usage: bash _utils/writing_check.sh paper/
# Checks: figure stacking, missing analysis, references, page estimate, unused figures

PAPER_DIR="${1:-paper}"
EXIT_CODE=0

echo "=== Writing quality checks ($PAPER_DIR) ==="

# 1. Figure-text interleaving: detect consecutive figures/tables without text
echo "--- Figure stacking check ---"
total_stacking=0
total_no_analysis=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")

    # Detect consecutive figure/table environments with <3 lines of text between them
    s=$(awk '/\\end\{(figure|table)\}/{a=1;t=0;next} a&&/\\begin\{(figure|table)\}/{if(t<3)c++;a=0;next} a&&/[a-zA-Z\x80-\xff]{3,}/{t++} a&&t>=3{a=0} END{print c+0}' "$f")

    # Detect figures/tables followed by <3 lines of analysis text
    n=$(awk '/\\end\{(figure|table)\}/{e=1;t=0;next} e&&/[a-zA-Z\x80-\xff]{10,}/{t++} e&&t>=3{e=0} e&&/\\(section|subsection|chapter|begin\{figure|begin\{table)/{if(t<3)c++;e=0} END{if(e&&t<3)c++;print c+0}' "$f")

    [ "$s" -gt 0 ] && echo "  FAIL $bn: $s figure stacking violations" && EXIT_CODE=1
    [ "$n" -gt 0 ] && echo "  FAIL $bn: $n figures/tables missing analysis text" && EXIT_CODE=1
    total_stacking=$((total_stacking + s))
    total_no_analysis=$((total_no_analysis + n))
done
echo "  Total: $total_stacking stacking, $total_no_analysis missing analysis"
[ "$total_stacking" -eq 0 ] && [ "$total_no_analysis" -eq 0 ] && echo "  OK: figure-text interleaving passed"

# 2. References check
echo "--- References check ---"
if [ -f "$PAPER_DIR/references.bib" ]; then
    bib_count=$(grep -c '^@' "$PAPER_DIR/references.bib" 2>/dev/null); bib_count=${bib_count:-0}
    echo "  references.bib: $bib_count entries"
    [ "$bib_count" -eq 0 ] && echo "  FAIL: references.bib is empty" && EXIT_CODE=1
else
    echo "  FAIL: references.bib not found" && EXIT_CODE=1
fi

# Collect cited keys
mkdir -p _tmp
grep -roh '\\cite[tp]*{[^}]*}' "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null \
  | grep -oP '\{[^}]+\}' | tr -d '{}' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort -u > _tmp/_cited_keys.txt 2>/dev/null
cited_count=$(wc -l < _tmp/_cited_keys.txt 2>/dev/null || echo 0)
echo "  Cited keys in text: $cited_count"

cite_in_body=$(grep -roh '\\cite' "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null | wc -l)
[ "$cite_in_body" -eq 0 ] && echo "  FAIL: no \\cite{} found in body text" && EXIT_CODE=1

# 2b. 参考文献真实性核验（防编造 BibTeX）—— 只在有 .bib 时跑；保守判定，仅高置信度铁证 HARD FAIL。
#     核心：若工作区有检索留档 _tmp/refs_raw.jsonl（scholar_fetch 输出），核对 .bib 每条是否真检索过；
#     对不上且无 DOI/arXiv 的 = 编造 → FAIL。无留档则只做结构+DOI核验，不误伤合法无 DOI 的书籍。
if [ -f "$PAPER_DIR/references.bib" ]; then
    _BIBCHK=""
    for _c in _utils/bib_authenticity_check.py skills/shared-scripts/bib_authenticity_check.py; do
        [ -f "$_c" ] && { _BIBCHK="$_c"; break; }
    done
    if [ -n "$_BIBCHK" ]; then
        _PY=""; for _p in "$MH_PYTHON" python python3; do [ -z "$_p" ] && continue; command -v "$_p" >/dev/null 2>&1 && { _PY="$_p"; break; }; done; [ -z "$_PY" ] && _PY=python
        echo "--- References authenticity ---"
        "$_PY" "$_BIBCHK" --bib "$PAPER_DIR/references.bib" 2>&1
        [ $? -eq 1 ] && { echo "  FAIL: 参考文献真实性核验发现疑似编造条目（见上）"; EXIT_CODE=1; }
    fi
fi

# 3. Section character counts + page estimate
echo "--- Section sizes ---"
total_chars=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    chars=$(wc -c < "$f")
    total_chars=$((total_chars + chars))
    echo "  $(basename $f): $chars chars"
done
echo "  Total: $total_chars chars"

# 4. Unused PDF figures
echo "--- Unused figures ---"
unused=0
for pdf in figures/*.pdf; do
    [ -f "$pdf" ] || continue
    bn=$(basename "$pdf")
    grep -rq "$bn" "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null || { echo "  WARN: $bn not referenced"; unused=$((unused + 1)); }
done
[ "$unused" -eq 0 ] && echo "  OK: all PDF figures referenced"

# 5. Placeholder check
echo "--- Placeholder check ---"
placeholders=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    if grep -qi 'PLACEHOLDER\|待补充\|TODO\|待续写' "$f" 2>/dev/null; then
        echo "  WARN: $(basename $f) contains placeholder markers"
        placeholders=$((placeholders + 1))
    fi
done
[ "$placeholders" -eq 0 ] && echo "  OK: no placeholders found"

# 6. Forbidden patterns
echo "--- Forbidden patterns ---"
# \input{...figures/...}：表格按规范就是 \input{../figures/TABLE_*.tex}，合法、放过；
# 图必须把 figure 代码块复制进 sections（caption 要过手精简+译中文），
# 整体 \input latex_includes.tex 会把未精简的长图注直通 PDF，禁止。
# ★ 早期正则是 '\\input{.*figures'，把合法的表 \input 也判 FAIL，每次都要在报告里解释
#   一遍「这是误报」——AI 因此养成忽略本项 FAIL 的习惯，表注超长才会一路漏到成品。
bad_input=$(grep -rn '\\input{[^}]*figures' "$PAPER_DIR"/sections/*.tex 2>/dev/null | grep -v 'TABLE_[^}]*\.tex' || true)
if [ -n "$bad_input" ]; then
    echo "$bad_input"
    echo "  FAIL: \\input{figures/...} 只允许 TABLE_*.tex；图请复制 \\begin{figure} 代码块进 sections"
    EXIT_CODE=1
fi
grep -rn 'colorlinks=true' "$PAPER_DIR"/*.tex "$PAPER_DIR"/sections/*.tex 2>/dev/null && echo "  FAIL: colorlinks=true found" && EXIT_CODE=1

# 7. AI writing pattern detection (itemize/enumerate in body text)
echo "--- AI writing patterns ---"
ai_patterns=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    # Skip appendix files
    echo "$bn" | grep -qi 'appendix\|附录\|code' && continue
    # Count itemize environments
    item_count=$(grep -c '\\begin{itemize}' "$f" 2>/dev/null); item_count=${item_count:-0}
    enum_count=$(grep -c '\\begin{enumerate}' "$f" 2>/dev/null); enum_count=${enum_count:-0}
    total_list=$((item_count + enum_count))
    if [ "$total_list" -gt 0 ]; then
        echo "  WARN $bn: $total_list bullet/numbered lists (itemize=$item_count, enumerate=$enum_count) — convert to flowing prose"
        ai_patterns=$((ai_patterns + total_list))
    fi
done
if [ "$ai_patterns" -gt 3 ]; then
    echo "  FAIL: $ai_patterns total lists in body text — strong AI writing signal, must convert to paragraphs"
    EXIT_CODE=1
elif [ "$ai_patterns" -gt 0 ]; then
    echo "  WARN: $ai_patterns lists found — consider converting to prose"
fi

# 7b. Figure-as-subject detection (段落以"图X展示了"开头 = AI 痕迹)
echo "--- Figure-as-subject check ---"
fig_subject=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    echo "$bn" | grep -qi 'appendix\|附录\|code\|symbol' && continue
    # 检测以图/表引用开头的段落（中文）
    hits=$(grep -cP '^\s*(如图|由图|从图|图\s*\\|图\d|如表|由表|从表|表\s*\\|表\d)' "$f" 2>/dev/null); hits=${hits:-0}
    # 检测英文 "Figure X shows/presents/illustrates" 开头
    hits_en=$(grep -ciP '^\s*(Figure|Table|Fig\.|Tab\.)\s*\\' "$f" 2>/dev/null); hits_en=${hits_en:-0}
    total_hits=$((hits + hits_en))
    if [ "$total_hits" -ge 3 ]; then
        echo "  WARN $bn: $total_hits 段以图/表引用开头 — 图表应作旁证融入论证，不要做段落主语"
        fig_subject=$((fig_subject + total_hits))
    fi
done
if [ "$fig_subject" -ge 5 ]; then
    echo "  FAIL: $fig_subject 处图表做主语 — 严重 AI 写作痕迹，需重写图文衔接"
    EXIT_CODE=1
elif [ "$fig_subject" -gt 0 ]; then
    echo "  WARN: $fig_subject 处图表做主语 — 建议改为括号旁注形式"
fi

# 7b2. 相邻图号开头检测（相邻两段分析文字都以"图N…/表N…"起句 = 最刺眼的 AI 痕迹）
echo "--- 相邻图号开头检测 ---"
PY=python; command -v $PY >/dev/null 2>&1 || PY=python3
adj_out=$(PYTHONIOENCODING=utf-8 $PY -c "
import re, os, sys
paper_dir = '$PAPER_DIR'
sec_dir = os.path.join(paper_dir, 'sections')
if not os.path.isdir(sec_dir):
    sys.exit(0)
# 直接以图/表编号(或\\ref)起句的模式；不含'如图/由图/从图'这类可接受的带出式
open_re = re.compile(r'^(图|表)\s*[\d\\\\]|^(Figure|Table|Fig|Tab)\b')
viol = 0
tot_open, tot_ref = 0, 0
for fn in sorted(os.listdir(sec_dir)):
    if not fn.endswith('.tex'):
        continue
    if re.search(r'appendix|附录|code|symbol', fn, re.I):
        continue
    with open(os.path.join(sec_dir, fn), 'r', encoding='utf-8', errors='ignore') as fh:
        content = fh.read().replace('\r\n', '\n')
    paras = re.split(r'\n\s*\n', content)
    flags = []  # (是否散文分析段, 是否以图号起句)
    for p in paras:
        s = p.strip()
        if not s:
            continue
        first = s[0]
        # 跳过 LaTeX 环境/命令/纯符号块，只看散文段
        if first in '\\\\%{}\$&#' or len(s) < 15:
            continue
        flags.append(bool(open_re.match(s)))
        # 分母：引用了图/表的散文段（图号在段内任意位置，含 \ref）
        if re.search(r'(图|表)\s*[\d\\\\]|(Figure|Table|Fig|Tab)\b', s):
            tot_ref += 1
    tot_open += sum(flags)
    # 相邻两个散文段都以图号起句 → 违规
    file_pairs = 0
    for i in range(len(flags) - 1):
        if flags[i] and flags[i + 1]:
            file_pairs += 1
    if file_pairs > 0:
        print(f'  FAIL {fn}: {file_pairs} 处相邻段落都以图号/表号起句 — 把图号沉到句中或句末括号')
        viol += file_pairs
# 全文普遍性：图号起句段占"所有引用图表的散文段"比例过高 = 通篇一个套路（拦"隔开但普遍"）
ratio = (tot_open / tot_ref) if tot_ref else 0
if tot_ref >= 5 and ratio > 0.35:
    print(f'  FAIL 全文 {tot_open}/{tot_ref} 段以图号/表号起句（{ratio:.0%}>35%）— 通篇一个套路，即便彼此隔开也太单调')
    viol += 1
if viol > 0:
    print(f'  共 {viol} 处图号起句问题（相邻/全文普遍）— 违反图文衔接铁律，改用括号旁注/动词引导/后置印证')
    sys.exit(3)
else:
    print('  OK: 无相邻图号开头，全文起句句式多样')
" 2>/dev/null)
adj_rc=$?
echo "$adj_out"
if [ "$adj_rc" -eq 3 ]; then
    EXIT_CODE=1
elif [ "$adj_rc" -ne 0 ]; then
    echo "  (Python 不可用，跳过相邻图号开头检测)"
fi

# 7b3. 图注/表注超长检测（caption 只写简短标签：中文 >20 字 / 英文 >14 词 = 违规，判据/参数/结论移入正文）
#      LaTeX 侧：以 main.tex + sections/*.tex 为根，递归跟随 \input/\include —— 表格是
#      \input{../figures/TABLE_*.tex} 直通 PDF，不递归就整批漏检。docx 侧：main.md 的 ![alt](path)。
echo "--- 图注/表注超长检测 ---"
cap_out=$(PYTHONIOENCODING=utf-8 $PY - "$PAPER_DIR" 2>/dev/null <<'PYEOF'
import re, os, sys
# ★ 必须规范化：usage 是 `writing_check.sh paper/`（带尾斜杠），而 os.path.dirname('paper/')
#   返回 'paper' 而非 ''，会让 resolve_input 的第三容错基准退化成第一基准、白丢一层容错。
paper_dir = os.path.normpath(sys.argv[1])
ZH, EN = 20, 14
bad = []

def check_caption(body_zh_en):
    cn = re.findall(r'[一-鿿]', body_zh_en)
    if cn:                                   # 判为中文 caption：数汉字
        if len(cn) > ZH:
            return (len(cn), '字', ''.join(cn)[:30])
    else:                                    # 英文 caption：数单词
        words = re.findall(r'[A-Za-z][A-Za-z-]*', body_zh_en)
        if len(words) > EN:
            return (len(words), 'words', ' '.join(words[:12]))
    return None

def strip_comments(s):
    """去掉 LaTeX 注释（未转义的 % 到行尾），保留 \\%。
    必须先剥注释：否则被注释掉的 \\input 会被误跟随。"""
    out = []
    for line in s.split('\n'):
        k, cut = 0, None
        while k < len(line):
            if line[k] == '\\':
                k += 2                       # 跳过转义序列，使 \\% 不被当注释
                continue
            if line[k] == '%':
                cut = k; break
            k += 1
        out.append(line if cut is None else line[:cut])
    return '\n'.join(out)

def rel(p):
    try:
        return os.path.relpath(p, paper_dir).replace('\\', '/')
    except ValueError:                       # 跨盘符（Windows）relpath 会抛
        return p

def resolve_input(raw, cur_file):
    """\\input{...} 路径解析。LaTeX 真实语义以主文件目录(paper/)为基准，
    故 \\input{../figures/x.tex} 指向工作区根的 figures/；另留两个容错基准。"""
    raw = raw.strip().strip('"')
    if not raw or raw.endswith('/'):
        return None
    names = (raw,) if raw.lower().endswith('.tex') else (raw + '.tex', raw)
    for base in (paper_dir, os.path.dirname(cur_file), os.path.dirname(paper_dir)):
        for name in names:
            c = os.path.normpath(os.path.join(base, name))
            if os.path.isfile(c):
                return c
    return None

def scan_captions(s, display):
    """平衡括号提取 \\caption{...}，剥掉 label/ref/公式/命令后判长度"""
    i = 0
    while True:
        m = re.search(r'\\caption\*?\s*(\[[^\]]*\]\s*)?\{', s[i:])
        if not m:
            break
        start = i + m.end(); depth = 1; j = start
        while j < len(s) and depth:
            if s[j] == '{': depth += 1
            elif s[j] == '}': depth -= 1
            j += 1
        inner = s[start:j-1]; i = j
        t = re.sub(r'\\(label|ref|cite|footnote)\{[^}]*\}', '', inner)
        t = re.sub(r'\$[^$]*\$', '', t)
        t = re.sub(r'\\[a-zA-Z]+\*?', '', t)
        r = check_caption(t)
        if r:
            bad.append((display, *r))

# --- LaTeX：以 main.tex + sections/*.tex 为根，递归跟随 \input / \include ---
#     ★ 必须递归：表格按规范写成 \input{../figures/TABLE_*.tex} 直通 PDF，
#       caption 物理上不在 sections/ 里。只列 sections 目录会整批漏检
#       （实测某工作区漏 6 张表，平均 391 字、最长 546 字，全部进了成品 PDF）。
SKIP_RE = re.compile(r'appendix|附录|code|symbol', re.I)
MAX_DEPTH = 6

roots = []
mt = os.path.join(paper_dir, 'main.tex')
if os.path.isfile(mt):
    roots.append(mt)
sec = os.path.join(paper_dir, 'sections')
if os.path.isdir(sec):
    roots += [os.path.join(sec, fn) for fn in sorted(os.listdir(sec)) if fn.endswith('.tex')]

visited = set()
queue = [(f, 0) for f in roots]
while queue:
    f, d = queue.pop(0)
    key = os.path.normcase(os.path.abspath(f))
    if key in visited:                       # 去重：main.tex 通常也会 \input sections/*.tex
        continue
    visited.add(key)
    # 附录/代码/符号表：整棵子树跳过。但 TABLE_*.tex 是正文表格源文件，
    # 文件名里恰好带 code/symbol（如 TABLE_code_stats.tex）不该让整张表的表注逃过闸；
    # 真正位于附录目录下的才跳过（附录允许放完整长表）。
    _bn = os.path.basename(f)
    # ★ 关键词只在「直接父目录 + 文件名」两段里判：更上层的目录名与本文件内容无关，
    #   拿它跳过会漏检（实测工作区叫 mycode、或 relpath 回退成绝对路径含 code 时，
    #   ../../mycode/shared/extra_figs.tex 整个文件被静默跳过）。
    _scope = '/'.join(rel(f).replace('\\', '/').split('/')[-2:])
    _in_appendix = re.search(r'appendix|附录', _scope, re.I)
    if _in_appendix or (SKIP_RE.search(_scope) and not _bn.upper().startswith('TABLE_')):
        continue
    try:
        s = strip_comments(open(f, encoding='utf-8', errors='ignore').read())
    except OSError:
        continue
    scan_captions(s, rel(f))
    if d < MAX_DEPTH:                        # 深度上限 + visited 双保险，杜绝循环 \input 死循环
        for m in re.finditer(r'\\(?:input|include)\s*\{([^{}]*)\}', s):
            nxt = resolve_input(m.group(1), f)
            if nxt:
                queue.append((nxt, d + 1))

# --- docx：main.md 的 ![alt](path)，剥"图 N：/Figure N:"前缀 ---
md = os.path.join(paper_dir, 'main.md')
if os.path.isfile(md):
    try:
        text = open(md, encoding='utf-8', errors='ignore').read()
    except OSError:
        text = ''
    m2 = re.search(r'(?m)^##\s*(附录|Appendix|参考文献|References)', text)
    body = text[:m2.start()] if m2 else text
    for alt in re.findall(r'!\[([^\]]*)\]\([^)]*\)', body):
        stripped = re.sub(r'^\s*(图|表|Figure|Fig\.?|Table|Tab\.?)\s*\d+\s*[:：.．、]?\s*', '', alt, flags=re.I)
        r = check_caption(stripped)
        if r:
            bad.append(('main.md', *r))

# --- docx：figures/TABLE_*.md 的表标题（单独成行的 **...**），剥「表 N：」前缀 ---
#     只扫源文件、不扫 main.md：表格按规范由 cat figures/TABLE_*.md 拼入，源头合规则产物合规；
#     而 main.md 里单独成行的粗体还可能是小标题，扫了会误报。
#     表内加粗的最优值都在 | ... | 行里，fullmatch 不会命中；再用 break 只取首个作标题。
figdir = None
for _c in (os.path.join(os.path.dirname(paper_dir) or '.', 'figures'),
           'figures', os.path.join(paper_dir, '..', 'figures')):
    if os.path.isdir(_c):
        figdir = _c
        break
if figdir:
    try:
        _tfs = sorted(fn for fn in os.listdir(figdir)
                      if fn.startswith('TABLE_') and fn.lower().endswith('.md'))
    except OSError:
        _tfs = []
    for fn in _tfs:
        try:
            _lines = open(os.path.join(figdir, fn), encoding='utf-8', errors='ignore').read().split('\n')
        except OSError:
            continue
        for ln in _lines:
            m3 = re.fullmatch(r'\*\*(.+?)\*\*', ln.strip())
            if not m3:
                continue
            st = re.sub(r'^\s*(表|Table|Tab\.?)\s*\d*\s*[:：.．、]?\s*', '', m3.group(1), flags=re.I)
            r = check_caption(st)
            if r:
                bad.append(('figures/' + fn, *r))
            break

if bad:
    for fn, n, unit, preview in bad:
        print(f'  FAIL {fn}: caption {n} {unit}（超上限，中文≤20字/英文≤14词）: {preview}...')
    print(f'  共 {len(bad)} 处图注/表注过长 — caption 只写简短标签，判据/参数/结论移入正文')
    if any(('figures/' in fn) or fn.startswith('../') for fn, *_ in bad):
        print('  ★ 落在 figures/ 的表注要改那个源文件本身，没有"中间副本"可改：')
        print('    PDF 模式它被 \\input{../figures/TABLE_*.tex} 直通成品，改 sections/ 无效；')
        print('    docx 模式它被 cat figures/TABLE_*.md 拼进 main.md，改 main.md 会被下次覆盖。')
        print('    统计口径/结论/数据来源搬进正文（docx 也可放表下方的「> 注：」行）。')
    sys.exit(3)
# ★ 区分「扫过且合规」与「压根没扫到」：后者输出 OK 会被误读成检查通过
if not roots and not os.path.isfile(os.path.join(paper_dir, 'main.md')):
    print('  WARN: 未找到 main.tex / sections/*.tex / main.md — caption 未检查（不是合规，是没扫到）')
else:
    print('  OK: 图注/表注长度合规（已递归跟随 \\input）')
PYEOF
)
cap_rc=$?
echo "$cap_out"
if [ "$cap_rc" -eq 3 ]; then
    EXIT_CODE=1
elif [ "$cap_rc" -ne 0 ]; then
    echo "  (Python 不可用，跳过图注超长检测)"
fi

# 7c. Meta-content leak detection (内部指令/文件名泄露到论文正文)
echo "--- Meta-content leak check ---"
meta_leaks=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    leaks=$(grep -ciP 'RESULTS\.md|CLAUDE\.md|MODELING_REPORT|PROBLEM_ANALYSIS|figures/\*\.json|latex_includes|参赛者|参赛队伍|参赛选手' "$f" 2>/dev/null); leaks=${leaks:-0}
    if [ "$leaks" -gt 0 ]; then
        echo "  FAIL $bn: $leaks 处内部指令/文件名泄露到正文"
        meta_leaks=$((meta_leaks + leaks))
        EXIT_CODE=1
    fi
done
[ "$meta_leaks" -eq 0 ] && echo "  OK: 无元叙述泄露"

# 8. Citation format check (Chinese papers: one cite per \cite{}, no multi-cite stacking)
echo "--- Citation format ---"
multi_cite=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    # Detect \cite{key1,key2,key3} — multiple keys in one cite
    mc=$(grep -oP '\\cite\{[^}]*,[^}]*\}' "$f" 2>/dev/null | wc -l)
    if [ "$mc" -gt 0 ]; then
        echo "  WARN $bn: $mc multi-cite instances (\\cite{a,b,c}) — split into separate \\cite{a}\\cite{b}\\cite{c}"
        multi_cite=$((multi_cite + mc))
    fi
done
[ "$multi_cite" -eq 0 ] && echo "  OK: all citations are single-key"

# 9. Symbol/assumptions page break check
echo "--- Symbol/assumptions page break ---"
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    is_target=false
    echo "$bn" | grep -qi 'symbol\|assumption' && is_target=true
    grep -q '\\section{符号说明}\|\\section{模型假设}' "$f" 2>/dev/null && is_target=true
    if [ "$is_target" = true ]; then
        # 符号说明：检查 \clearpage
        if grep -q '\\section{符号说明}\|\\section.*符号' "$f" 2>/dev/null; then
            if grep -B2 '\\section{' "$f" 2>/dev/null | grep -q '\\clearpage'; then
                echo "  OK $bn: has \\clearpage before symbol section"
            else
                echo "  WARN $bn: missing \\clearpage — compile_utils.sh will auto-fix"
            fi
        fi
        # 模型假设：检查 \needspace + \nopagebreak
        if grep -q '\\section{模型假设}\|\\section.*假设' "$f" 2>/dev/null; then
            if grep -B2 '\\section{' "$f" 2>/dev/null | grep -q '\\needspace\|\\clearpage'; then
                echo "  OK $bn: has page break control"
            else
                echo "  WARN $bn: missing \\needspace — compile_utils.sh will auto-fix"
            fi
        fi
    fi
done

echo "=== Writing checks done (exit code: $EXIT_CODE) ==="

# ==================== 新增检查（图表质量 + 数据一致性） ====================

# 10. 图片尺寸检查（太大溢出 / 太小看不清）
echo "--- 图片尺寸检查 ---"
size_issues=0
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    python3 -c "
import re
with open('$f', 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()
for m in re.finditer(r'\\\\includegraphics\[([^\]]*)\]\{([^}]*)\}', content):
    opts, path = m.group(1), m.group(2)
    # 检查 width
    w = re.search(r'width\s*=\s*([\d.]+)\\\\textwidth', opts)
    if w:
        val = float(w.group(1))
        if val > 1.0:
            print(f'  WARN $bn: {path} width={val}\\\\textwidth > 1.0 — 图片溢出页面')
        elif val < 0.3:
            print(f'  WARN $bn: {path} width={val}\\\\textwidth < 0.3 — 图片可能太小')
    # 检查 scale
    s = re.search(r'scale\s*=\s*([\d.]+)', opts)
    if s:
        val = float(s.group(1))
        if val > 1.2:
            print(f'  WARN $bn: {path} scale={val} > 1.2 — 图片可能溢出')
" 2>/dev/null
done

# 11. 图片文件存在性检查
echo "--- 图片文件存在性检查 ---"
missing_figs=0
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    grep -oP '\\includegraphics\[[^\]]*\]\{([^}]+)\}' "$f" 2>/dev/null | grep -oP '\{[^}]+\}' | tr -d '{}' | while read -r figpath; do
        # 尝试从 paper/ 目录和根目录解析路径
        resolved=""
        for try_path in "$PAPER_DIR/$figpath" "$figpath" "figures/$(basename $figpath)"; do
            [ -f "$try_path" ] && resolved="$try_path" && break
        done
        if [ -z "$resolved" ]; then
            echo "  FAIL $bn: 引用的图片不存在: $figpath"
            missing_figs=$((missing_figs + 1))
        fi
    done
done
[ "$missing_figs" -eq 0 ] && echo "  OK: 所有引用的图片文件都存在"

# 12. 空的 figure/table 环境检查（有 caption 但没有 includegraphics/tabular）
echo "--- 空图表环境检查 ---"
empty_envs=0
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    python3 -c "
import re
with open('$f', 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()
# 检查 figure 环境
for m in re.finditer(r'\\\\begin\{figure\}.*?\\\\end\{figure\}', content, re.DOTALL):
    block = m.group()
    has_image = 'includegraphics' in block
    has_tikz = 'tikzpicture' in block
    has_input = '\\\\input' in block
    if not has_image and not has_tikz and not has_input:
        cap = re.search(r'\\\\caption\{([^}]{0,50})', block)
        cap_text = cap.group(1) if cap else '(no caption)'
        print(f'  FAIL $bn: 空 figure 环境 \"{cap_text}\" — 缺少 includegraphics')
# 检查 table 环境
for m in re.finditer(r'\\\\begin\{table\}.*?\\\\end\{table\}', content, re.DOTALL):
    block = m.group()
    has_tabular = 'tabular' in block or 'longtable' in block
    has_input = '\\\\input' in block
    if not has_tabular and not has_input:
        cap = re.search(r'\\\\caption\{([^}]{0,50})', block)
        cap_text = cap.group(1) if cap else '(no caption)'
        print(f'  FAIL $bn: 空 table 环境 \"{cap_text}\" — 缺少 tabular')
" 2>/dev/null
done

# 13. 图表浮动位置检查（数模竞赛必须用 [H] 或 [htbp]，不能没有位置参数）
echo "--- 图表浮动位置检查 ---"
float_issues=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    # 检查 \begin{figure} 后面没有 [H] 或 [htbp] 的情况
    no_pos=$(grep -cP '\\begin\{figure\}\s*$' "$f" 2>/dev/null); no_pos=${no_pos:-0}
    if [ "$no_pos" -gt 0 ]; then
        echo "  WARN $bn: $no_pos 个 figure 环境没有位置参数 — 建议加 [H] 或 [htbp]"
        float_issues=$((float_issues + no_pos))
    fi
    no_pos_t=$(grep -cP '\\begin\{table\}\s*$' "$f" 2>/dev/null); no_pos_t=${no_pos_t:-0}
    if [ "$no_pos_t" -gt 0 ]; then
        echo "  WARN $bn: $no_pos_t 个 table 环境没有位置参数 — 建议加 [H] 或 [htbp]"
        float_issues=$((float_issues + no_pos_t))
    fi
done
[ "$float_issues" -eq 0 ] && echo "  OK: 所有图表都有浮动位置参数"

# 14. Caption 长度检查 —— 已合并到上面第 7b3 段「图注超长检测」（平衡括号版）。
#     第 7b3 更强：深度计数正确处理嵌套 	extbf{}、剥离 label/ref/cite/公式/命令再算长度、
#     同时覆盖 LaTeX \caption 与 docx main.md 图注，阈值中文≤20字/英文≤14词。
#     此处旧的单层正则版（\caption{[^}]+}、英文≤12词）是它的弱子集，且阈值矛盾（12 vs 14），
#     同一件事查两遍会逼 AI 反复改，故删除。图注长度检查完全由第 7b3 段负责，覆盖不降。

# 15. 图文数值一致性检查
echo "--- 图文数值一致性检查 ---"
consistency_issues=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    fig_claims=$(grep -n '\\ref{fig' "$f" 2>/dev/null | grep -oP '\d+\.\d+' | head -20)
    if [ -n "$fig_claims" ]; then
        not_found=0
        for num in $fig_claims; do
            if ! grep -rq "$num" RESULTS.md figures/*.json 2>/dev/null; then
                not_found=$((not_found+1))
            fi
        done
        if [ "$not_found" -gt 0 ]; then
            echo "  WARN $bn: $not_found 个数值在 \\ref{fig} 附近但不在 RESULTS.md/JSON 中"
            consistency_issues=$((consistency_issues + not_found))
        fi
    fi
done
[ "$consistency_issues" -eq 0 ] && echo "  OK: 图文数值一致性通过"

# === NEW: 数值一致性检查 ===
echo "--- 数值一致性检查 ---"
if [ -f figures/all_results.json ]; then
    python3 -c "
import json, re, sys, os

# 读取 JSON 结果
with open('figures/all_results.json', 'r', encoding='utf-8') as f:
    results = json.load(f)

# 提取 JSON 中的所有数值（递归）
def extract_numbers(obj, prefix=''):
    nums = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            nums.update(extract_numbers(v, f'{prefix}.{k}'))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            nums.update(extract_numbers(v, f'{prefix}[{i}]'))
    elif isinstance(obj, (int, float)) and not isinstance(obj, bool):
        if abs(obj) > 0.001 and abs(obj) < 1e10:  # 忽略极小和极大值
            nums[prefix] = obj
    return nums

json_nums = extract_numbers(results)
if not json_nums:
    print('  (JSON 中无有效数值，跳过)')
    sys.exit(0)

# 扫描论文中的数字
paper_dir = '$PAPER_DIR'
paper_nums = set()
for tex_file in sorted(os.listdir(os.path.join(paper_dir, 'sections'))):
    if not tex_file.endswith('.tex'):
        continue
    with open(os.path.join(paper_dir, 'sections', tex_file), 'r', encoding='utf-8', errors='ignore') as f:
        text = f.read()
    # 提取所有小数（如 0.023, 95.6, 12345）
    for m in re.finditer(r'(?<![a-zA-Z])(\d+\.?\d+)(?![a-zA-Z_{}])', text):
        try:
            paper_nums.add(float(m.group(1)))
        except ValueError:
            pass

# 检查关键 JSON 数值是否在论文中出现
missing = 0
for key, val in json_nums.items():
    # 检查精确匹配或近似匹配（±1%）
    found = False
    for pn in paper_nums:
        if abs(pn - val) < abs(val) * 0.01 + 0.001:
            found = True
            break
    if not found and 'round' not in key.lower() and 'time' not in key.lower():
        # 只报告可能重要的数值（跳过时间、轮次等）
        if any(kw in key.lower() for kw in ['rmse', 'r2', 'mse', 'accuracy', 'f1', 'auc', 'objective', 'optimal', 'best', 'result', 'score']):
            print(f'  ⚠ JSON {key}={val} 未在论文中找到匹配数值')
            missing += 1

if missing > 0:
    print(f'  共 {missing} 个关键数值可能不一致')
else:
    print('  ✅ 关键数值一致性检查通过')
" 2>/dev/null || echo "  (Python 不可用，跳过数值一致性检查)"
else
    echo "  (figures/all_results.json 不存在，跳过)"
fi

# === NEW: 过度声称检测 ===
echo "--- 过度声称检测 ---"
OVERCLAIM=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    # 检测中文过度声称
    for word in "首次提出" "首次发现" "完美" "最优的" "最好的" "证明了" "无可比拟" "前所未有" "开创性" "革命性"; do
        count=$(grep -c "$word" "$f" 2>/dev/null); count=${count:-0}
        if [ "$count" -gt 0 ]; then
            echo "  ⚠ $bn: 发现过度声称 \"$word\" ($count 次) — 建议改为更谨慎的表述"
            OVERCLAIM=$((OVERCLAIM + count))
        fi
    done
done
[ "$OVERCLAIM" -eq 0 ] && echo "  ✅ 无过度声称"

# === NEW: 内容覆盖度检查 ===
echo "--- 内容覆盖度检查 ---"
if [ -f PROBLEM_ANALYSIS.md ]; then
    # 统一口径：优先用共享计数脚本（只数标题行，支持中文/阿拉伯/英文编号）；
    # 脚本不在时回退到旧 grep（兼容未复制 _utils 的环境）
    if [ -f _utils/count_subproblems.sh ]; then
        PROB_COUNT=$(bash _utils/count_subproblems.sh PROBLEM_ANALYSIS.md)
    else
        PROB_COUNT=$(grep -c '问题[一二三四五六七八九十]' PROBLEM_ANALYSIS.md 2>/dev/null); PROB_COUNT=${PROB_COUNT:-0}
    fi
    # 检查论文是否每个子问题都有对应章节
    # ⛔ 只提示不硬拦：真实论文章节多用描述性学术标题（"螺距对终止时刻的影响""调头空间半径与限速"），
    #   字面几乎不含"问题N" → 按"问题N"数章节必然远少于子问题数 → 旧版 EXIT_CODE=1 高频误报，
    #   逼 AI 把专业标题改成呆板"问题一"降质，或死循环。子问题覆盖的硬核对交给 capability_check /
    #   facts_audit（它们按能力项/字段判，可靠）。这里仅在"完全没有任何子问题章节"时给软提示。
    CHAPTER_COUNT=0
    for f in "$PAPER_DIR"/sections/*.tex; do
        [ -f "$f" ] || continue
        grep -q '\\section{.*问题[一二三四五六七八九十0-9]\|\\section{.*Problem' "$f" 2>/dev/null && CHAPTER_COUNT=$((CHAPTER_COUNT + 1))
    done
    echo "  赛题子问题数: $PROB_COUNT, 字面含【问题N】的章节数: $CHAPTER_COUNT（描述性标题不计入属正常，不阻断）"
    [ "$CHAPTER_COUNT" -lt "$PROB_COUNT" ] && echo "  ℹ 提示：字面含'问题N'的章节少于子问题数——若用了描述性标题属正常；请自查每个子问题都有对应章节（硬核对见 capability_check）"
fi

# === NEW: 引用完整性检查 ===
echo "--- 引用完整性检查 ---"
if [ -f "$PAPER_DIR/references.bib" ]; then
    # 提取论文中所有 \cite{} 的 key
    CITED_KEYS=$(grep -roh '\\cite{[^}]*}' "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null | grep -oP '\{[^}]+\}' | tr -d '{}' | tr ',' '\n' | sed 's/^ *//;s/ *$//' | sort -u)
    # 提取 bib 文件中所有条目 key
    BIB_KEYS=$(grep -oP '^\s*@\w+\{([^,]+)' "$PAPER_DIR/references.bib" 2>/dev/null | sed 's/.*{//' | sort -u)
    MISSING_BIB=0
    for key in $CITED_KEYS; do
        if ! echo "$BIB_KEYS" | grep -qx "$key" 2>/dev/null; then
            echo "  ⚠ \\cite{$key} 在 references.bib 中无对应条目"
            MISSING_BIB=$((MISSING_BIB + 1))
        fi
    done
    [ "$MISSING_BIB" -eq 0 ] && echo "  ✅ 所有引用都有对应 bib 条目"
elif [ -f "$PAPER_DIR/main.tex" ] && grep -q 'thebibliography' "$PAPER_DIR/main.tex" 2>/dev/null; then
    echo "  (使用 thebibliography 环境，跳过 bib 文件检查)"
else
    echo "  ⚠ 未找到 references.bib"
fi

echo ""
echo "=== Writing check complete (exit=$EXIT_CODE) ==="
exit $EXIT_CODE
