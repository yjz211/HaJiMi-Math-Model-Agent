#!/bin/bash
# compile_check.sh — Post-compilation quality checks
# Usage: bash _utils/compile_check.sh paper/
# Checks: PDF exists, undefined refs, TOC, abstracts, bibliography, unused figures, figure stacking

PAPER_DIR="${1:-paper}"
EXIT_CODE=0

# ⛔ 检测可用 Python（Windows 上 python3 常是 Microsoft Store stub：不执行代码、退出码非0）。
#   历史 bug：本脚本裸用 python3 跑内嵌检查，stub 环境下检查没真跑却因退出码非0 触发 EXIT_CODE=1，
#   且 2>/dev/null 吞掉 stub 提示 → AI 看到 "(see above)" 后空无一物 → 死循环。与 compile_utils.sh 对齐。
PYTHON=""
for _py in "$MH_PYTHON" python python3 py; do
    [ -z "$_py" ] && continue
    if command -v "$_py" >/dev/null 2>&1 && "$_py" -c "import sys" >/dev/null 2>&1; then
        PYTHON="$_py"
        break
    fi
done
[ -z "$PYTHON" ] && PYTHON="python3"   # 兜底（保持原行为）

echo "=== Post-compile checks ($PAPER_DIR) ==="

# 1. PDF existence and size
if [ -f "$PAPER_DIR/main.pdf" ]; then
    pdf_size=$(wc -c < "$PAPER_DIR/main.pdf")
    echo "  OK: main.pdf exists ($pdf_size bytes)"
    [ "$pdf_size" -lt 100000 ] && echo "  FAIL: PDF is small (<100KB), compilation likely failed" && EXIT_CODE=1
else
    echo "  FAIL: main.pdf not found" && EXIT_CODE=1
fi

# 2. Undefined references
undef_refs=$(grep -c '\[?\]' "$PAPER_DIR/main.log" 2>/dev/null || echo 0)
echo "  Undefined references: $undef_refs"
[ "$undef_refs" -gt 0 ] && echo "  FAIL: $undef_refs undefined references — PDF shows [?]" && EXIT_CODE=1

# 2.5 LaTeX compilation errors (CRITICAL — must fix before accepting)
echo "--- LaTeX errors ---"
LATEX_ERRORS=0
if [ -f "$PAPER_DIR/main.log" ]; then
    # Bad math environment delimiter
    bad_math=$(grep -c 'Bad math environment delimiter\|Missing \$ inserted\|Display math should end\|begin{document} ended by' "$PAPER_DIR/main.log" 2>/dev/null || echo 0)
    [ "$bad_math" -gt 0 ] && echo "  CRITICAL: $bad_math math environment errors — fix \$...\$ delimiters in .tex files" && LATEX_ERRORS=$((LATEX_ERRORS + bad_math))

    # Not allowed in LR mode (usually math in wrong context)
    lr_mode=$(grep -c 'Not allowed in LR mode\|Not in outer par mode' "$PAPER_DIR/main.log" 2>/dev/null || echo 0)
    [ "$lr_mode" -gt 0 ] && echo "  CRITICAL: $lr_mode LR mode errors — check math/float placement" && LATEX_ERRORS=$((LATEX_ERRORS + lr_mode))

    # Undefined control sequence (missing package or typo)
    undef_cs=$(grep -c 'Undefined control sequence' "$PAPER_DIR/main.log" 2>/dev/null || echo 0)
    [ "$undef_cs" -gt 0 ] && echo "  WARN: $undef_cs undefined control sequences"

    # Missing package
    missing_pkg=$(grep -oP 'File .* not found\.|LaTeX Error: File .* not found' "$PAPER_DIR/main.log" 2>/dev/null | head -5)
    [ -n "$missing_pkg" ] && echo "  CRITICAL: missing packages:" && echo "$missing_pkg" | sed 's/^/    /' && LATEX_ERRORS=$((LATEX_ERRORS + 1))

    # Font not found
    font_err=$(grep -c 'Font.*not found\|cannot find font' "$PAPER_DIR/main.log" 2>/dev/null || echo 0)
    [ "$font_err" -gt 0 ] && echo "  WARN: $font_err font errors (check fc-list)"

    # Extract specific error locations for Claude to fix
    if [ "$LATEX_ERRORS" -gt 0 ]; then
        echo ""
        echo "  ============================================================"
        echo "  CRITICAL: $LATEX_ERRORS LaTeX errors found — MUST FIX"
        echo "  ============================================================"
        echo "  Error locations (from main.log):"
        grep -B1 'Bad math\|Missing \$ inserted\|begin{document} ended\|Not allowed in LR mode' "$PAPER_DIR/main.log" 2>/dev/null | grep -E '^\./|^l\.' | head -20 | sed 's/^/    /'
        echo "  ============================================================"
        echo ""
        EXIT_CODE=1
    fi
fi

# 3. Overfull hbox
overfull=$(grep -c 'Overfull.*hbox' "$PAPER_DIR/main.log" 2>/dev/null || echo 0)
echo "  Overfull hbox: $overfull"

# 3.5 Overfull vbox (table/figure overflow — content cut off at page bottom)
overfull_v=$(grep -c 'Overfull.*vbox' "$PAPER_DIR/main.log" 2>/dev/null || echo 0)
if [ "$overfull_v" -gt 0 ]; then
    echo "  FAIL: $overfull_v overfull vbox — tables/figures cut off at page bottom"
    echo "  Fix: use longtable for tall tables, or split into smaller tables"
    EXIT_CODE=1
fi

# 3.6 Tall table detection (tables with many rows that might overflow)
echo "--- Tall table check ---"
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    echo "$bn" | grep -qi 'appendix\|附录\|A_code' && continue
    "$PYTHON" -c "
import re, sys
with open('$f', 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()
fail = False
for m in re.finditer(r'\\\\begin\{tabular\}.*?\\\\end\{tabular\}', content, re.DOTALL):
    block = m.group()
    rows = block.count('\\\\\\\\')
    if rows > 20:
        start = max(0, m.start() - 200)
        before = content[start:m.start()]
        cap = re.search(r'\\\\caption\{([^}]{0,50})', before)
        cap_text = cap.group(1) if cap else '(unknown)'
        print(f'  FAIL: $bn has {rows}-row table \"{cap_text}\" — must truncate to top5+bottom3, full table in appendix')
        fail = True
sys.exit(1 if fail else 0)
" 2>/dev/null
    [ $? -ne 0 ] && EXIT_CODE=1
done

# 4. TOC generation
if grep -q 'tableofcontents' "$PAPER_DIR/main.tex" 2>/dev/null; then
    [ -s "$PAPER_DIR/main.toc" ] && echo "  OK: TOC generated" || { echo "  FAIL: TOC empty or missing"; EXIT_CODE=1; }
fi

# 5. Abstract check — skipped (requirements vary by competition: Chinese-only, English-only, or both)

# 6. Bibliography
if [ -f "$PAPER_DIR/main.tex" ]; then
    # 5.5 Template integrity check — auto-detect template type and check its specific features
    echo "--- Template integrity (auto-detect) ---"

    # Detect template type from documentclass
    TMPL_TYPE="unknown"
    grep -q 'cumcmthesis' "$PAPER_DIR/main.tex" 2>/dev/null && TMPL_TYPE="cumcm"
    grep -q 'gmcmthesis' "$PAPER_DIR/main.tex" 2>/dev/null && TMPL_TYPE="huawei"
    grep -q 'MathorCupmodeling' "$PAPER_DIR/main.tex" 2>/dev/null && TMPL_TYPE="mathorcup"
    grep -q 'JXUSTmodeling' "$PAPER_DIR/main.tex" 2>/dev/null && TMPL_TYPE="huashubei"
    grep -q 'yrdmcm' "$PAPER_DIR/main.tex" 2>/dev/null && TMPL_TYPE="changsanjiao"
    grep -q 'neepumcm' "$PAPER_DIR/main.tex" 2>/dev/null && TMPL_TYPE="diangongbei"
    grep -q 'nemcmthesis' "$PAPER_DIR/main.tex" 2>/dev/null && TMPL_TYPE="dongsansheng"
    grep -q 'mcmthesis' "$PAPER_DIR/main.tex" 2>/dev/null && [ "$TMPL_TYPE" = "unknown" ] && TMPL_TYPE="mcm"
    grep -q 'apmcmthesis' "$PAPER_DIR/main.tex" 2>/dev/null && TMPL_TYPE="apmcm"
    grep -qi '统计建模\|natbib.*numbers.*square.*super\|listoftables' "$PAPER_DIR/main.tex" 2>/dev/null && TMPL_TYPE="stats"
    # 五一杯：cumcmthesis + withoutpreface + 承诺书
    if [ "$TMPL_TYPE" = "cumcm" ] && grep -q 'withoutpreface' "$PAPER_DIR/main.tex" 2>/dev/null && grep -q '五一' "$PAPER_DIR/main.tex" 2>/dev/null; then
        TMPL_TYPE="wuyi"
    fi
    # 华中杯：cumcmthesis + withoutpreface（无五一杯标识）
    if [ "$TMPL_TYPE" = "cumcm" ] && grep -q 'withoutpreface' "$PAPER_DIR/main.tex" 2>/dev/null && ! grep -q '五一' "$PAPER_DIR/main.tex" 2>/dev/null; then
        TMPL_TYPE="huazhong"
    fi
    echo "  Detected template: $TMPL_TYPE"

    # --- Package conflict check (all templates) ---
    echo "--- Package conflict check ---"
    if grep -q '\\usepackage{cite}' "$PAPER_DIR/main.tex" 2>/dev/null && grep -q '\\usepackage.*{natbib}' "$PAPER_DIR/main.tex" 2>/dev/null; then
        echo "  CRITICAL: cite + natbib both loaded — these packages CONFLICT, remove \\usepackage{cite}"
        EXIT_CODE=1
    fi
    # Check for packages duplicated between main.tex and cls
    for pkg in subcaption float graphicx booktabs caption; do
        if grep -q "\\\\usepackage.*{.*$pkg.*}" "$PAPER_DIR/main.tex" 2>/dev/null; then
            case "$TMPL_TYPE" in
                cumcm|wuyi|huazhong) # cumcmthesis.cls loads subcaption, float, graphicx, booktabs
                    case "$pkg" in subcaption|float|graphicx|booktabs)
                        echo "  WARN: $pkg duplicated (cls already loads it)" ;;
                    esac ;;
                huashubei) # JXUSTmodeling.cls loads subcaption, caption, booktabs, multirow, graphicx, placeins
                    case "$pkg" in subcaption|caption|booktabs|graphicx)
                        echo "  WARN: $pkg duplicated (cls already loads it)" ;;
                    esac ;;
                changsanjiao|diangongbei) # yrdmcm/neepumcm.cls loads graphicx, booktabs, colortbl, xcolor
                    case "$pkg" in graphicx|booktabs)
                        echo "  WARN: $pkg duplicated (cls already loads it)" ;;
                    esac ;;
            esac
        fi
    done

    # --- Per-template specific checks ---
    case "$TMPL_TYPE" in
        wuyi)
            echo "--- 五一杯 specific checks ---"
            grep -q '承诺书' "$PAPER_DIR/main.tex" && echo "  OK: 承诺书页存在" || { echo "  CRITICAL: 五一杯缺少承诺书页"; EXIT_CODE=1; }
            grep -q 'image2' "$PAPER_DIR/main.tex" && echo "  OK: 封面 logo (image2) 存在" || { echo "  CRITICAL: 五一杯缺少封面 logo"; EXIT_CODE=1; }
            grep -q '关键词' "$PAPER_DIR/main.tex" && echo "  OK: 关键词位置存在" || { echo "  CRITICAL: 五一杯缺少关键词"; EXIT_CODE=1; }
            grep -q 'withoutpreface' "$PAPER_DIR/main.tex" && echo "  OK: withoutpreface 选项存在" || { echo "  CRITICAL: 缺少 withoutpreface（会出现国赛承诺书）"; EXIT_CODE=1; }
            grep -q '\\maketitle' "$PAPER_DIR/main.tex" && { echo "  CRITICAL: 五一杯不应有 \\maketitle（会和手写承诺书冲突）"; EXIT_CODE=1; } || echo "  OK: 无 \\maketitle"
            grep -q '五一数学建模竞赛' "$PAPER_DIR/main.tex" && echo "  OK: 五一杯标题存在" || { echo "  CRITICAL: 缺少'五一数学建模竞赛'标题 — main.tex 可能被重写了"; EXIT_CODE=1; }
            # 检查 image2 文件是否存在
            if [ -f "$PAPER_DIR/image2.png" ] || [ -f "$PAPER_DIR/image2.jpg" ] || [ -f "figures/image2.png" ]; then
                echo "  OK: image2 图片文件存在"
            else
                echo "  CRITICAL: image2 图片文件不存在 — 封面 logo 会显示为空"
                EXIT_CODE=1
            fi
            ;;
        huazhong)
            echo "--- 华中杯 specific checks ---"
            grep -q 'cumcmthesis' "$PAPER_DIR/main.tex" && echo "  OK: 使用 cumcmthesis cls" || { echo "  CRITICAL: 华中杯未使用 cumcmthesis"; EXIT_CODE=1; }
            grep -q 'withoutpreface' "$PAPER_DIR/main.tex" && echo "  OK: withoutpreface 选项存在" || { echo "  CRITICAL: 缺少 withoutpreface"; EXIT_CODE=1; }
            grep -q '\\begin{abstract}' "$PAPER_DIR/main.tex" && echo "  OK: 使用 abstract 环境" || echo "  WARN: 华中杯应使用 \\begin{abstract} 环境"
            grep -q 'thebibliography' "$PAPER_DIR/main.tex" && echo "  OK: 使用 thebibliography" || echo "  WARN: 华中杯应使用 thebibliography 环境"
            ;;
        mathorcup)
            echo "--- MathorCup specific checks ---"
            grep -q 'MathorCupmodeling' "$PAPER_DIR/main.tex" && echo "  OK: 使用 MathorCupmodeling cls" || { echo "  CRITICAL: MathorCup 未使用正确 cls"; EXIT_CODE=1; }
            grep -q '\\bianhao\|\\tihao\|\\timu' "$PAPER_DIR/main.tex" && echo "  OK: 队伍信息命令存在" || { echo "  CRITICAL: MathorCup 缺少队伍信息"; EXIT_CODE=1; }
            grep -q '\\maketitle' "$PAPER_DIR/main.tex" && { echo "  CRITICAL: MathorCup 不应有独立封面 \\maketitle"; EXIT_CODE=1; } || echo "  OK: 无独立封面"
            ;;
        stats)
            echo "--- 统计建模 specific checks ---"
            grep -q 'listoftables' "$PAPER_DIR/main.tex" && echo "  OK: \\listoftables present" || { echo "  CRITICAL: \\listoftables missing — template was rewritten!"; EXIT_CODE=1; }
            grep -q 'listoffigures' "$PAPER_DIR/main.tex" && echo "  OK: \\listoffigures present" || { echo "  CRITICAL: \\listoffigures missing — template was rewritten!"; EXIT_CODE=1; }
            grep -q 'cline{2-2}' "$PAPER_DIR/main.tex" && echo "  OK: cover page \\cline present" || echo "  WARN: cover page \\cline missing"
            if grep -P '^(表|图)\d+\.' "$PAPER_DIR/main.tex" 2>/dev/null | head -3 | grep -q '.'; then
                echo "  CRITICAL: hand-written figure/table list detected — must use \\listoftables/\\listoffigures"
                EXIT_CODE=1
            fi
            ;;
        dongsansheng)
            echo "--- 东三省 specific checks ---"
            grep -q 'nemcmthesis' "$PAPER_DIR/main.tex" && echo "  OK: 使用 nemcmthesis cls" || { echo "  CRITICAL: 未使用 nemcmthesis"; EXIT_CODE=1; }
            grep -q '\\ttle\|\\title' "$PAPER_DIR/main.tex" && echo "  OK: 标题命令存在" || echo "  WARN: 缺少标题"
            grep -q '\\makecoverpage' "$PAPER_DIR/main.tex" && echo "  OK: 封面生成命令存在" || echo "  WARN: 缺少 \\makecoverpage"
            ;;
        huawei)
            echo "--- 华为杯 specific checks ---"
            grep -q 'gmcmthesis' "$PAPER_DIR/main.tex" && echo "  OK: 使用 gmcmthesis cls" || { echo "  CRITICAL: 华为杯未使用 gmcmthesis"; EXIT_CODE=1; }
            ;;
        *)
            echo "  (no template-specific checks for $TMPL_TYPE)"
            ;;
    esac

    # ⛔ 同时认两种文献写法：\bibliography{...} 外部 .bib，或 inline \begin{thebibliography}
    #    （cumcmthesis/gmcmthesis 等国赛模板标配 inline thebibliography）。只认前者会对
    #    inline 写法假阳性 FAIL → 若退出码计入门禁会逼 AI 死循环"修"一个本就正确的文献区。
    grep -qE '\\bibliography\{|\\begin\{thebibliography\}' "$PAPER_DIR/main.tex" 2>/dev/null && echo "  OK: bibliography present (\\bibliography 或 thebibliography)" || { echo "  FAIL: no \\bibliography / thebibliography in main.tex"; EXIT_CODE=1; }
    # ⛔ 按文献流程分流校验"文献非空"，避免对 inline 写法假阳性：
    #   · inline \begin{thebibliography}（国赛 cumcmthesis/gmcmthesis 标配）：文献直接写在
    #     main.tex，不跑 bibtex、不生成 references.bib / main.bbl。此时数 main.tex 里的
    #     \bibitem 即可，绝不能要求 references.bib 或 main.bbl（那会恒 FAIL → 计入门禁则死循环）。
    #   · 外部 \bibliography{...} + bibtex 流程：才要求 references.bib 存在 + main.bbl 非空。
    if grep -q '\\begin{thebibliography}' "$PAPER_DIR/main.tex" 2>/dev/null; then
        inline_items=$(grep -c '\\bibitem' "$PAPER_DIR/main.tex" 2>/dev/null || echo 0)
        [ "$inline_items" -gt 0 ] && echo "  OK: inline thebibliography ($inline_items entries)" || { echo "  FAIL: inline thebibliography 为空（无 \\bibitem）"; EXIT_CODE=1; }
    else
        if [ -f "$PAPER_DIR/references.bib" ]; then
            bib_entries=$(grep -c '^@' "$PAPER_DIR/references.bib" 2>/dev/null || echo 0)
            echo "  OK: references.bib ($bib_entries entries)"
        else
            echo "  FAIL: references.bib not found" && EXIT_CODE=1
        fi
        bbl_entries=$(grep -c '\\bibitem' "$PAPER_DIR/main.bbl" 2>/dev/null || echo 0)
        echo "  Bibliography entries in PDF: $bbl_entries"
        [ "$bbl_entries" -eq 0 ] && echo "  FAIL: bibliography is empty in compiled PDF" && EXIT_CODE=1
    fi
fi

# 7. Citation count in body
# ⛔ 必须同时数 \cite{ 与 \upcite{（及 \citep/\citet 等 natbib 变体）：国赛 gbt7714 上标引用
#    正文统一用 \upcite{}，其 cite 前是字母 p 不是反斜杠，纯 '\cite{' 模式匹配不到 → 全上标
#    引用的论文会被误判 "no citations" 假阳性。退出码计入门禁时这会逼 AI 死循环。
#    用 \\(up|cite)*cite{ 的宽松口径：匹配 \cite{ / \upcite{ / \citep{ / \citet{ 等。
cite_count=$(grep -rohE '\\[a-z]*cite[a-z]*\{' "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null | wc -l)
echo "  Citations in body: $cite_count"
[ "$cite_count" -eq 0 ] && echo "  FAIL: no citations in body text" && EXIT_CODE=1

# 7.5 Citation format check (上标/顺序)
echo "--- Citation format check ---"
# 7.5.1 检查是否有 \cite{} 被标点符号包围但没有上标（GB/T 7714 要求上标）
# 中文论文要求引用用上标，所以 \cite{} 前面应该是 \upcite{} 或 \textsuperscript{\cite{}}
# 检查 main.tex 的 bibliographystyle 和 \cite 用法
if grep -q '\\bibliographystyle{gbt7714\|plainnat.*super\|natbib.*super' "$PAPER_DIR/main.tex" 2>/dev/null; then
    echo "  OK: 使用上标引用样式 (gbt7714-numerical / natbib super)"
elif grep -q '\\bibliographystyle{plainnat}\|\\bibliographystyle{plain}\|\\bibliographystyle{unsrt}' "$PAPER_DIR/main.tex" 2>/dev/null; then
    # 非上标样式 - 检查是否手动用 \upcite 或 \textsuperscript
    upcite_count=$(grep -roh '\\upcite{\|\\textsuperscript{\\cite' "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null | wc -l)
    plain_cite_count=$(grep -roh '[^t]\\cite{' "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null | wc -l)
    if [ "$upcite_count" -eq 0 ] && [ "$plain_cite_count" -gt 0 ]; then
        echo "  FAIL: $plain_cite_count citations not using superscript format"
        echo "  Fix: 改用 \\bibliographystyle{gbt7714-numerical} 或把 \\cite{x} 改为 \\upcite{x} / \\textsuperscript{\\cite{x}}"
        EXIT_CODE=1
    else
        echo "  OK: citations use superscript ($upcite_count superscript, $plain_cite_count plain)"
    fi
fi

# 7.5.2 单处多引用检查（[1,3,5] 是否按顺序 + 是否合并）
echo "--- Citation order and merging ---"
"$PYTHON" -c "
import re, sys
from pathlib import Path

paper_dir = Path('$PAPER_DIR')
tex_files = list(paper_dir.glob('sections/*.tex')) + [paper_dir / 'main.tex']

all_errors = []
cite_warns = []
cite_order_global = []  # 记录全文 cite 首次出现顺序（这就是最终编号顺序）

# 第一遍：收集所有 cite key 的全局首次出现顺序（这就是它们的最终编号）
for f in tex_files:
    if not f.exists(): continue
    try:
        content = f.read_text(encoding='utf-8', errors='ignore')
    except: continue
    for m in re.finditer(r'\\\\(up)?cite\{([^}]+)\}', content):
        keys = [k.strip() for k in m.group(2).split(',')]
        for k in keys:
            if k not in cite_order_global:
                cite_order_global.append(k)

# 第二遍：检查每处 \cite 的内部顺序 + 编号全局递增跳跃
prev_max_num = 0
for f in tex_files:
    if not f.exists(): continue
    try:
        content = f.read_text(encoding='utf-8', errors='ignore')
    except: continue
    
    for m in re.finditer(r'\\\\(up)?cite\{([^}]+)\}', content):
        keys = [k.strip() for k in m.group(2).split(',')]
        nums = [cite_order_global.index(k)+1 if k in cite_order_global else 999 for k in keys]
        line_num = content[:m.start()].count('\n') + 1
        snippet = m.group(0)
        
        # 检查1: 多引用内部必须升序（如 [1,2,5] 不能写成 [5,1,2]）
        if len(nums) > 1 and nums != sorted(nums):
            all_errors.append(f'  FAIL {f.name}:{line_num}: 多引用编号不是升序 {nums}: {snippet}')
        
        # 检查2: 新引用编号真跳跃（中间跳过了没引用的号，如 prev=3 突然出现[8]）
        # ⛔ 判据修正：首个 \cite{a,b}=[1,2] 或任意一次引入连续多篇新文献(新号最小==prev+1)不是跳跃。
        #   旧判据 cur_max>prev+1 会把"首次就引两篇"误判为跳跃 → 硬失败死循环。
        # ⛔ 且这本是 WARN(提示)，不该混进 all_errors 触发 sys.exit(1)——单独打印，不阻断。
        cur_max = max(nums) if nums else 0
        new_nums = [n for n in nums if n > prev_max_num]
        if new_nums and min(new_nums) > prev_max_num + 1:
            cite_warns.append(f'  WARN {f.name}:{line_num}: 引用编号跳跃 (之前最大={prev_max_num}, 新引用最小={min(new_nums)}): {snippet}')
        prev_max_num = max(prev_max_num, cur_max)

if cite_warns:
    print('\n'.join(cite_warns[:10]))
if all_errors:
    print('\n'.join(all_errors[:15]))
    if len(all_errors) > 15:
        print(f'  ... and {len(all_errors)-15} more')
    sys.exit(1)
else:
    print('  OK: 引用编号全局递增且多引用内部升序')
" 2>/dev/null
[ $? -ne 0 ] && echo "  (see above)" && EXIT_CODE=1

# 7.5.3 连续单引用合并检查（如 \cite{a}\cite{b} 应合并为 \cite{a,b}）
echo "--- Consecutive citation merging ---"
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    # 检查 \cite{x}\cite{y} 或 \cite{x} \cite{y} 这种相邻引用
    consec=$(grep -oE '\\(up)?cite\{[^}]+\}[[:space:]]*\\(up)?cite\{[^}]+\}' "$f" 2>/dev/null | wc -l)
    if [ "$consec" -gt 0 ]; then
        echo "  WARN $bn: $consec consecutive \\cite{} should merge to \\cite{a,b}"
    fi
done

# 8. Unused PDF figures
echo "--- Unused figures ---"
unused=0
for pdf in figures/*.pdf; do
    [ -f "$pdf" ] || continue
    bn=$(basename "$pdf")
    grep -rq "$bn" "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null || { echo "  WARN: $bn not referenced"; unused=$((unused + 1)); }
done
[ "$unused" -eq 0 ] && echo "  OK: all figures referenced"

# 8.5 Missing figure files (referenced but not found)
echo "--- Missing figure files ---"
missing=0
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    grep -oP '\\includegraphics\[[^\]]*\]\{([^}]+)\}' "$f" 2>/dev/null | grep -oP '\{[^}]+\}' | tr -d '{}' | while read -r figpath; do
        resolved=""
        for try_path in "$PAPER_DIR/$figpath" "$figpath" "figures/$(basename $figpath)"; do
            [ -f "$try_path" ] && resolved="$try_path" && break
        done
        if [ -z "$resolved" ]; then
            echo "  FAIL $bn: missing figure: $figpath"
            missing=$((missing + 1))
            EXIT_CODE=1
        fi
    done
done
[ "$missing" -eq 0 ] && echo "  OK: all referenced figures exist"

# 8.6 Empty figure/table environments
echo "--- Empty figure/table environments ---"
for f in "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    "$PYTHON" -c "
import re
with open('$f', 'r', encoding='utf-8', errors='ignore') as fh:
    content = fh.read()
for m in re.finditer(r'\\\\begin\{figure\}.*?\\\\end\{figure\}', content, re.DOTALL):
    block = m.group()
    if 'includegraphics' not in block and 'tikzpicture' not in block and '\\\\input' not in block:
        cap = re.search(r'\\\\caption\{([^}]{0,50})', block)
        cap_text = cap.group(1) if cap else '(no caption)'
        print(f'  FAIL $bn: empty figure \"{cap_text}\"')
for m in re.finditer(r'\\\\begin\{table\}.*?\\\\end\{table\}', content, re.DOTALL):
    block = m.group()
    if 'tabular' not in block and 'longtable' not in block and '\\\\input' not in block:
        cap = re.search(r'\\\\caption\{([^}]{0,50})', block)
        cap_text = cap.group(1) if cap else '(no caption)'
        print(f'  FAIL $bn: empty table \"{cap_text}\"')
" 2>/dev/null
done

# 9. Figure stacking (same check as writing_check.sh)
echo "--- Figure stacking ---"
total_stacking=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    count=$(awk '/\\end\{(figure|table)\}/{a=1;t=0;next} a&&/\\begin\{(figure|table)\}/{if(t<3){c++}a=0;next} a&&/[a-zA-Z\x80-\xff]{3,}/{t++} a&&t>=3{a=0} END{print c+0}' "$f")
    [ "$count" -gt 0 ] && echo "  FAIL: $bn has $count figure stacking violations — add analysis text between figures" && EXIT_CODE=1
    total_stacking=$((total_stacking + count))
done
[ "$total_stacking" -eq 0 ] && echo "  OK: no figure stacking"

# 9.5 Subfigure abuse and small figure width detection
echo "--- Subfigure / small figure check ---"
subfig_abuse=0
small_width=0
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    # Check for subfigure usage (forbidden in competition papers)
    sf_count=$(grep -c '\\begin{subfigure}' "$f" 2>/dev/null || echo 0)
    if [ "$sf_count" -gt 0 ]; then
        echo "  FAIL: $bn uses subfigure ($sf_count times) — competition papers must use independent figure environments, not subfigure"
        subfig_abuse=$((subfig_abuse + sf_count))
        EXIT_CODE=1
    fi
    # Check for small figure widths (< 0.7\textwidth)
    small=$(grep -oP 'width\s*=\s*0\.\d+\\textwidth' "$f" 2>/dev/null | grep -oP '0\.\d+' | awk '$1 < 0.7 {print}' | wc -l)
    if [ "$small" -gt 0 ]; then
        echo "  FAIL: $bn has $small figures with width < 0.7\\textwidth — figures too small, use ≥ 0.85\\textwidth"
        small_width=$((small_width + small))
        EXIT_CODE=1
    fi
done
[ "$subfig_abuse" -eq 0 ] && [ "$small_width" -eq 0 ] && echo "  OK: no subfigure abuse or small figures"

# 10. TikZ architecture diagram check (against plan)
tikz_exists=$([ -s figures/tikz_architecture_examples.tex ] && echo "YES" || echo "NO")
echo "  TikZ architecture diagram: $tikz_exists"
if [ "$tikz_exists" = "NO" ]; then
    for plan in PAPER_PLAN.md PROBLEM_ANALYSIS.md TOPIC_PLAN.md; do
        if [ -f "$plan" ] && grep -qi 'tikz\|架构图\|技术路线\|研究框架\|流程图\|关系图\|architecture.*diagram\|roadmap\|framework.*diagram' "$plan" 2>/dev/null; then
            echo "  WARN: plan mentions TikZ diagrams but figures/tikz_architecture_examples.tex not found"
            break
        fi
    done
fi

echo "=== Compile checks done (exit code: $EXIT_CODE) ==="

# 11. Title existence check
echo "--- Title check ---"
if [ -f "$PAPER_DIR/main.tex" ]; then
    if grep -q '\\title{' "$PAPER_DIR/main.tex" 2>/dev/null; then
        TITLE_CONTENT=$(grep '\\title{' "$PAPER_DIR/main.tex" | head -1 | sed 's/.*\\title{//;s/}.*//')
        TITLE_CLEAN=$(echo "$TITLE_CONTENT" | sed 's/\\[a-zA-Z]*{[^}]*}//g; s/\\[a-zA-Z]*//g; s/[[:space:]]//g')
        if [ -z "$TITLE_CLEAN" ]; then
            echo "  FAIL: \\title{} is empty — PDF has no title" && EXIT_CODE=1
        else
            echo "  OK: title present"
        fi
    elif grep -q '\\timu{\|\\ttle{\|\\biaoti{' "$PAPER_DIR/main.tex" 2>/dev/null; then
        echo "  OK: title present (non-standard command)"
    elif grep -q 'MathorCup\|nemcmthesis\|JXUSTmodeling\|neepumcm' "$PAPER_DIR/main.tex" 2>/dev/null; then
        echo "  OK: special template (title in cls-specific command)"
    else
        echo "  FAIL: no \\title command found — PDF has no title" && EXIT_CODE=1
    fi
fi

# 12. Symbol table / assumptions needspace check
echo "--- Symbol/assumptions page break ---"
for f in "$PAPER_DIR"/sections/*.tex; do
    [ -f "$f" ] || continue
    bn=$(basename "$f")
    is_target=false
    echo "$bn" | grep -qi 'symbol\|assumption' && is_target=true
    grep -q '\\section{符号说明}\|\\section{模型假设}' "$f" 2>/dev/null && is_target=true
    if [ "$is_target" = true ]; then
        # 符号说明：检查 \clearpage（确保从新页开始）
        if grep -q '\\section{符号说明}\|\\section.*符号' "$f" 2>/dev/null; then
            if grep -B2 '\\section{' "$f" 2>/dev/null | grep -q '\\clearpage'; then
                echo "  OK: $bn has \\clearpage before \\section"
            else
                echo "  WARN $bn: missing \\clearpage before symbol section — title and table may split. Re-run compile_utils.sh."
            fi
            # 检查表格不是 [H]（[H] 会导致分页）
            if grep -q '\\begin{table}\[H\]' "$f" 2>/dev/null; then
                echo "  WARN $bn: table uses [H] — may cause title-table split. Should be [htbp]."
            fi
        fi
        # 模型假设：检查 \needspace + \nopagebreak
        if grep -q '\\section{模型假设}\|\\section.*假设' "$f" 2>/dev/null; then
            if grep -B2 '\\section{' "$f" 2>/dev/null | grep -q '\\needspace\|\\clearpage'; then
                echo "  OK: $bn has page break control before \\section"
            else
                echo "  WARN $bn: missing \\needspace before assumption section. Re-run compile_utils.sh."
            fi
            if grep -A1 '\\section{' "$f" 2>/dev/null | grep -q '\\nopagebreak'; then
                echo "  OK: $bn has \\nopagebreak after \\section"
            else
                echo "  WARN $bn: missing \\nopagebreak after assumption section."
            fi
        fi
    fi
done

# N. 重复 \label 检测（同名 label 出现≥2次 → LaTeX 静默取最后一个 → 图/表号错乱且不报错）
#    根因：图块从 latex_includes 复制进正文时被贴了两遍。这是"静默错号"，必须硬失败拦截。
echo "--- 重复 label 检测 ---"
DUP_LABELS=$(PAPER_DIR="$PAPER_DIR" "$PYTHON" - <<'PYEOF' 2>/dev/null
import os, re, glob
from collections import Counter
paper_dir = os.environ.get('PAPER_DIR', 'paper').rstrip('/\\')
files = glob.glob(os.path.join(paper_dir, 'sections', '*.tex')) + [os.path.join(paper_dir, 'main.tex')]
labels = []
for f in files:
    try:
        with open(f, encoding='utf-8', errors='ignore') as fh:
            labels += re.findall(r'\\label\s*\{([^}]*)\}', fh.read())
    except Exception:
        continue
for name, c in sorted(Counter(labels).items()):
    if c >= 2:
        print('%s (x%d)' % (name, c))
PYEOF
)
if [ -n "$DUP_LABELS" ]; then
    echo "  FAIL: 重复 label（同一个 \\label 贴了多次，会导致图/表号静默错乱）:"
    echo "$DUP_LABELS" | sed 's/^/    /'
    echo "    修复：每个图/表块只嵌入一次，删掉重复的 \\begin{figure}/\\begin{table} 块。"
    EXIT_CODE=1
else
    echo "  OK: 无重复 label"
fi

# N+1. 禁用 \cref/\Cref/\autoref（模板对 figure 定义了 \crefformat/\crefname，用 \cref 会输出"图 图1"前缀重复）
#    只匹配"命令名后紧跟 {"的调用，绝不误伤 cls 里的 \crefformat{}/\crefname{} 定义（命令名不同）。
echo "--- 禁用 \\cref（防"图 图1"前缀重复）---"
CREF_HITS=$(grep -rnoE '\\(cref|Cref|autoref)\{' "$PAPER_DIR"/sections/*.tex "$PAPER_DIR"/main.tex 2>/dev/null)
if [ -n "$CREF_HITS" ]; then
    echo "  FAIL: 正文用了 \\cref/\\Cref/\\autoref（模板会自动补"图"字 → 输出"图 图1"）:"
    echo "$CREF_HITS" | sed 's/^/    /'
    echo "    修复：全部改成 \\ref{}，"图/表"字手写在前面（如 图~\\ref{fig:x}）。"
    EXIT_CODE=1
else
    echo "  OK: 正文未使用 \\cref（前缀由手写"图/表"+\\ref 保证，无重复）"
fi

echo "=== All checks done (exit code: $EXIT_CODE) ==="
exit $EXIT_CODE
