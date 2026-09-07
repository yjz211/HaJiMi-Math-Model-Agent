#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""正文超宽/超长表瘦身：超宽省列、超长省行，完整表按形态放附录。

策略（对齐用户决策）：
- 正文不缩字号：超宽表（数据列 > WIDE_COLS）省略中间列（首列+前几列+⋯+末几列）；
  超长表（数据行 > LONG_ROWS）省略中间行（前 5 + ⋮ + 末 3）。
- 完整表存附录，按形态选环境：
  * 又宽又长 → landscape + longtable + \\footnotesize（横排跨页，仅附录内缩字）
  * 仅超长   → longtable（跨页，默认字号，修「长表被页底挡」）
  * 仅超宽   → table[H] + resizebox（缩到页宽，仅附录内缩放）

用法：python table_slim.py <PAPER_DIR>
"""
import os
import re
import sys

WIDE_COLS = 8    # 数据列 > 8 → 超宽
LONG_ROWS = 20   # 数据行 > 20 → 超长

try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass


def parse_colspec(spec):
    """把 tabular 列格式解析成单列符号列表（忽略 | @{} >{} <{} 等装饰）。"""
    cols = []
    i, n = 0, len(spec)
    while i < n:
        ch = spec[i]
        if ch in '| \t':
            i += 1
            continue
        if ch in '@><!':
            i += 1
            if i < n and spec[i] == '{':
                depth = 0
                while i < n:
                    if spec[i] == '{':
                        depth += 1
                    elif spec[i] == '}':
                        depth -= 1
                        if depth == 0:
                            i += 1
                            break
                    i += 1
            continue
        if ch in 'pmb':
            j = i + 1
            if j < n and spec[j] == '{':
                depth, k = 0, j
                while k < n:
                    if spec[k] == '{':
                        depth += 1
                    elif spec[k] == '}':
                        depth -= 1
                        if depth == 0:
                            k += 1
                            break
                    k += 1
                cols.append(spec[i:k])
                i = k
                continue
            cols.append(ch)
            i += 1
            continue
        if ch in 'lcrXS':
            cols.append(ch)
            i += 1
            continue
        i += 1
    return cols


def split_cells(row_text):
    """按未转义的 & 拆单元格（跳过 \\&）。"""
    cells, buf, i, n = [], [], 0, len(row_text)
    while i < n:
        ch = row_text[i]
        if ch == '\\' and i + 1 < n:
            buf.append(row_text[i:i+2])
            i += 2
            continue
        if ch == '&':
            cells.append(''.join(buf))
            buf = []
            i += 1
            continue
        buf.append(ch)
        i += 1
    cells.append(''.join(buf))
    return cells


_RULE_RE = re.compile(
    r'(\\(?:top|mid|bottom)rule(?:\[[^\]]*\])?'
    r'|\\cmidrule(?:\([^)]*\))?(?:\{[^}]*\})?(?:\{[^}]*\})?'
    r'|\\hline|\\midrule)')


def split_rows(body):
    """把 tabular body 拆成行元素，返回 (rows, data_rows)。

    ⛔ 先按 \\\\ 拆物理行，再把每行里粘连的规则命令（\\toprule/\\midrule/
       \\bottomrule/\\cmidrule/\\hline）拆成独立元素，避免表头/首数据行
       与规则命令粘在一起被误判为规则行而漏处理。rows 拼接 == 原 body。
    """
    parts = re.split(r'(\\\\)', body)
    coarse, i = [], 0
    while i < len(parts):
        if i + 1 < len(parts) and parts[i+1] == r'\\':
            coarse.append(parts[i] + parts[i+1])
            i += 2
        else:
            coarse.append(parts[i])
            i += 1
    rows = []
    for c in coarse:
        # 把粘连的规则命令拆出来成独立元素
        rows.extend([seg for seg in _RULE_RE.split(c) if seg != ''])

    def is_data(r):
        return ('&' in r and 'toprule' not in r and 'midrule' not in r
                and 'bottomrule' not in r and 'cmidrule' not in r
                and 'hline' not in r and 'vdots' not in r)
    data = [r for r in rows if is_data(r)]
    return rows, data


def is_rule_or_blank(r):
    s = r.strip()
    return (s == '' or 'toprule' in s or 'midrule' in s or 'bottomrule' in s
            or 'cmidrule' in s or 'hline' in s)


def omit_columns(cols, rows, keep_front=3, keep_back=2):
    """省略中间列：保留前 keep_front + ⋯ + 末 keep_back。返回 (新colspec, 新rows)。"""
    ncol = len(cols)
    keep_idx = list(range(keep_front)) + list(range(ncol - keep_back, ncol))
    new_cols = cols[:keep_front] + ['c'] + cols[ncol - keep_back:]
    new_colspec = ''.join(new_cols)
    new_rows = []
    for r in rows:
        if is_rule_or_blank(r) or '&' not in r:
            new_rows.append(r)
            continue
        m = re.search(r'\\\\\s*$', r)
        tail = m.group(0) if m else ''
        core = r[:m.start()] if m else r
        cells = split_cells(core)
        if len(cells) < ncol:
            new_rows.append(r)
            continue
        kept = [cells[k] for k in keep_idx[:keep_front]]
        kept.append(r' $\cdots$ ')
        kept += [cells[k] for k in range(ncol - keep_back, ncol)]
        new_rows.append(' & '.join(kept) + tail)
    return new_colspec, new_rows


def omit_rows(rows, data_rows, ncol, keep_head=5, keep_tail=3):
    """省略中间行：前 keep_head + ⋮ + 末 keep_tail。

    ⛔ 表头行（第一个 \\midrule 之前的含 & 行）始终保留，且不占 keep_head 名额，
       否则 keep_head=5 会被表头吃掉一个 → 正文只剩 4 行数据。
    """
    bottom = data_rows[-keep_tail:]
    out, count, seen_midrule = [], 0, False
    for r in rows:
        if 'midrule' in r or 'hline' in r:
            seen_midrule = True
            out.append(r)
            continue
        if '&' in r and not is_rule_or_blank(r) and 'vdots' not in r:
            if not seen_midrule:
                out.append(r)  # 表头，始终保留、不计数
                continue
            count += 1
            if count <= keep_head:
                out.append(r)
            elif count == keep_head + 1:
                out.append('\n' + r'\multicolumn{' + str(ncol) + r'}{c}{$\vdots$} \\')
                if r in bottom:
                    out.append(r)
            elif r in bottom:
                out.append(r)
        else:
            out.append(r)
    return out


def build_appendix_entry(full_block, colspec, cap_text, label, is_wide, is_long):
    """按形态生成附录完整表：又宽又长→landscape+longtable；仅长→longtable；仅宽→resizebox。"""
    cap_line = r'\caption{' + cap_text + r'（完整数据）}\label{' + label + '}'
    if is_long:
        # longtable：caption 须在环境内、以 \\ 结束；把 tabular→longtable
        inner = full_block
        lt_begin = r'\begin{longtable}{' + colspec + '}'
        inner = re.sub(r'\\begin\{tabular\}', lambda mm: lt_begin, inner, count=1)
        # 上一步把原 colspec 留在后面，清掉紧跟的 {原spec}
        inner = re.sub(r'(\\begin\{longtable\}\{[^}]*\})\{[^}]*\}', lambda mm: mm.group(1), inner, count=1)
        inner = inner.replace(r'\end{tabular}', r'\end{longtable}')
        # caption 插到第一个 \toprule 前（用 lambda 替换串，避免 \c 被当转义）
        cap_prefix = cap_line + r' \\' + '\n'
        inner, k = re.subn(r'\\toprule', lambda mm: cap_prefix + r'\toprule', inner, count=1)
        if k == 0:
            inner = inner.replace(r'\begin{longtable}{' + colspec + '}',
                                  r'\begin{longtable}{' + colspec + '}\n' + cap_line + r' \\', 1)
        if is_wide:
            return ('\\begin{landscape}\n\\footnotesize\n' + inner.strip('\n')
                    + '\n\\normalsize\n\\end{landscape}\n')
        return inner.strip('\n') + '\n'
    # 仅宽：table[H] + resizebox
    return ('\\begin{table}[H]\n\\centering\n' + cap_line + '\n'
            + '\\resizebox{\\textwidth}{!}{%\n' + full_block + '\n}\n\\end{table}\n')


def nearest_caption(content, table_start):
    before = content[max(0, table_start - 400):table_start]
    caps = re.findall(r'\\caption\{([^}]*)\}', before)
    return caps[-1] if caps else '完整结果'


def process_file(fp, label_counter):
    """处理单个 section 文件，返回 (改动后是否写盘, [附录条目], 用到landscape, 用到longtable)。"""
    with open(fp, 'r', encoding='utf-8', errors='ignore') as fh:
        content = fh.read()
    original = content
    entries = []
    used_landscape = used_longtable = False
    bn = os.path.basename(fp)
    safe = re.sub(r'[^a-zA-Z0-9]', '_', bn.replace('.tex', ''))

    tab_re = re.compile(r'(\\begin\{tabular\}\{)([^}]*)(\})(.*?)(\\end\{tabular\})', re.DOTALL)
    while True:
        target = None
        for m in tab_re.finditer(content):
            # ⛔ 已被 resizebox 包裹的表（本轮兜底缩放过、或 6.63 处理过）跳过，
            #    否则含合并表头的宽表会被反复选中 → 死循环。
            if 'resizebox' in content[max(0, m.start() - 40):m.start()]:
                continue
            cols = parse_colspec(m.group(2))
            rows, data = split_rows(m.group(4))
            if len(cols) > WIDE_COLS or len(data) > LONG_ROWS:
                target = m
                break
        if target is None:
            break
        colspec_raw = target.group(2)
        cols = parse_colspec(colspec_raw)
        rows, data = split_rows(target.group(4))
        is_wide = len(cols) > WIDE_COLS
        is_long = len(data) > LONG_ROWS
        # ⛔ 含 \multicolumn/\multirow 的跨列表头无法安全省列（省列后 colspec 与
        #    跨列声明对不齐 → LaTeX "Extra alignment tab" 硬崩）。检测到就禁用省列，
        #    宽度问题改由 resizebox 整体缩放兜底（对齐用户"能省则省、不能省再缩"的取舍）。
        body = target.group(4)
        has_span = ('\\multicolumn' in body) or ('\\multirow' in body)
        can_omit_cols = is_wide and not has_span
        full_block = target.group(0)
        # ⛔ 直接用 match 的绝对位置，不再 content.find() 二次定位（位置算错会把文件切烂）
        t_start, t_end = target.start(), target.end()
        cap_text = nearest_caption(content, t_start)
        label = 'tab:full_%s_%d' % (safe, label_counter[0])
        label_counter[0] += 1

        # 正文瘦身：能省列先省列，再按需省行；不能省列的宽表用 resizebox 兜底。
        new_cols_list = cols
        work_rows = rows
        if can_omit_cols:
            new_colspec, work_rows = omit_columns(cols, rows)
            new_cols_list = parse_colspec(new_colspec)
        else:
            new_colspec = colspec_raw
        ncol_body = len(new_cols_list)
        if is_long:
            _, work_data = split_rows(''.join(work_rows))
            work_rows = omit_rows(work_rows, work_data, ncol_body)

        # 判断正文是否已「瘦身」（省列或省行）——决定是否需要附录完整表 + 改 caption。
        body_slimmed = can_omit_cols or is_long
        core_block = (target.group(1) + new_colspec + target.group(3)
                      + ''.join(work_rows) + target.group(5))
        if is_wide and not can_omit_cols:
            # 宽但不能省列（含合并表头）：正文整体缩到页宽，避免横向溢出。
            new_block = ('\\resizebox{\\textwidth}{!}{%\n' + core_block + '\n}')
        else:
            new_block = core_block

        # 附录完整表：仅当正文确实瘦身了才需要（resizebox 缩放的正文已含完整数据）。
        if body_slimmed:
            entries.append(build_appendix_entry(full_block, colspec_raw, cap_text,
                                                 label, can_omit_cols, is_long))
            if can_omit_cols and is_long:
                used_landscape = True
            if is_long:
                used_longtable = True

        # 找「本表前最近」的 caption 的绝对位置（在 t_start 之前的窗口内）
        # ⛔ 仅当正文确实瘦身（进了附录）才改 caption 引用附录，否则 resizebox 兜底表
        #    会引用一个不存在的 label → 悬空 \ref。
        win_start = max(0, t_start - 400)
        caps = list(re.finditer(r'\\caption\{([^}]*)\}', content[win_start:t_start]))
        cap_abs = None
        if body_slimmed and caps and '部分' not in caps[-1].group(1):
            cm = caps[-1]
            cap_abs = (win_start + cm.start(), win_start + cm.end(),
                       r'\caption{' + cm.group(1)
                       + r'（部分，完整结果见附录表\ref{' + label + r'}）}')

        # 从右往左替换：先换表体（[t_start:t_end]），再换 caption（在其前），位置不失效
        content = content[:t_start] + new_block + content[t_end:]
        if cap_abs:
            cs, ce, new_cap = cap_abs
            content = content[:cs] + new_cap + content[ce:]

    if content != original:
        with open(fp, 'w', encoding='utf-8') as fh:
            fh.write(content)
    return (content != original), entries, used_landscape, used_longtable


def write_appendix(appendix_file, entries):
    """按 label 去重后追加到附录文件。返回新增条数。"""
    existing = set()
    if os.path.exists(appendix_file):
        with open(appendix_file, 'r', encoding='utf-8', errors='ignore') as af:
            existing = set(re.findall(r'\\label\{([^}]*)\}', af.read()))

    def lab(e):
        mm = re.search(r'\\label\{([^}]*)\}', e)
        return mm.group(1) if mm else None

    fresh = [e for e in entries if lab(e) not in existing]
    if not fresh:
        return 0
    mode = 'a' if os.path.exists(appendix_file) else 'w'
    with open(appendix_file, mode, encoding='utf-8') as af:
        if mode == 'w':
            af.write('\\section{完整结果表格}\n\n')
        for e in fresh:
            af.write(e + '\n')
    return len(fresh)


def ensure_package(content, pkg):
    if re.search(r'\\usepackage(\[[^\]]*\])?\{' + re.escape(pkg) + r'\}', content):
        return content, False
    m = re.search(r'\\begin\{document\}', content)
    if not m:
        return content, False
    return content[:m.start()] + '\\usepackage{' + pkg + '}\n' + content[m.start():], True


def inject_input(content):
    if re.search(r'\\input\{sections/A_tables\}', content):
        return content, False
    inject = r'\input{sections/A_tables}'
    if re.search(r'\\input\{sections/A_code\}', content):
        return re.sub(r'(\\input\{sections/A_code\})', inject + '\n' + r'\1',
                      content, count=1), True
    inputs = list(re.finditer(r'\\input\{[^}]*\}', content))
    if inputs:
        last = inputs[-1]
        return content[:last.end()] + '\n' + inject + content[last.end():], True
    m = re.search(r'\\end\{document\}', content)
    if m:
        return content[:m.start()] + inject + '\n' + content[m.start():], True
    return content, False


def main():
    paper_dir = sys.argv[1] if len(sys.argv) > 1 else 'paper'
    sections = os.path.join(paper_dir, 'sections')
    main_tex = os.path.join(paper_dir, 'main.tex')
    appendix_file = os.path.join(sections, 'A_tables.tex')
    if not os.path.isdir(sections):
        return

    label_counter = [0]
    all_entries = []
    any_landscape = any_longtable = False
    for name in sorted(os.listdir(sections)):
        if not name.endswith('.tex'):
            continue
        low = name.lower()
        if re.search(r'appendix|a_code|a_tables|附录', name) or 'appendix' in low:
            continue
        fp = os.path.join(sections, name)
        changed, entries, lsc, ltb = process_file(fp, label_counter)
        if changed:
            print('  slimmed: %s (%d 个完整表移入附录)' % (name, len(entries)))
        all_entries.extend(entries)
        any_landscape = any_landscape or lsc
        any_longtable = any_longtable or ltb

    if not all_entries:
        return
    added = write_appendix(appendix_file, all_entries)
    print('  附录新增 %d 个完整表' % added)

    if os.path.exists(main_tex):
        with open(main_tex, 'r', encoding='utf-8', errors='ignore') as fh:
            mc = fh.read()
        touched = False
        mc, t = ensure_package(mc, 'longtable'); touched = touched or t
        mc, t = ensure_package(mc, 'float'); touched = touched or t
        if any_landscape:
            mc, t = ensure_package(mc, 'pdflscape'); touched = touched or t
        mc, t = inject_input(mc); touched = touched or t
        if touched:
            with open(main_tex, 'w', encoding='utf-8') as fh:
                fh.write(mc)
            print('  main.tex：已注入宏包/附录引用')


if __name__ == '__main__':
    main()
