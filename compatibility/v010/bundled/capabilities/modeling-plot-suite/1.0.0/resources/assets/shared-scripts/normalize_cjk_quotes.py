#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""把中文正文里误用的 ASCII 直引号 " 成对规范成中文弯引号 “ ”。

为什么需要：AI 写中文论文正文时常打成 ASCII 直引号 "词"，在 xelatex 竞赛模板
（\setmainfont{Times New Roman}）下会渲染成西文直立引号（两个一模一样的竖引号），
而非中文全角弯引号“词”。本脚本在编译前规范化，双保险（另有 SKILL 硬规矩）。

安全设计（只碰中文正文，绝不动代码/数学/命令）：
  1. 先把这些区域挖出来用占位符保护：lstlisting/verbatim/minted 环境、行内 \verb、
     数学 $...$ / \[...\] / \(...\)、\url{}/\href{} 第一参数。
  2. 只转「CJK 上下文」的 ASCII 直引号：紧邻一侧是中文字符（U+4E00–U+9FFF 等）。
     纯英文里的 "word"（前后非中文）与代码里的 "str" 一律不动。
  3. CJK 上下文的直引号按段落内出现顺序成对：奇数→左引号 U+201C，偶数→右引号 U+201D。
  4. 还原占位符。

用法：
  python normalize_cjk_quotes.py <file.tex> [file2.tex ...]   # 原地规范化
  python normalize_cjk_quotes.py --dry-run <file.tex>          # 只报告不改写
幂等：已是弯引号的不受影响；重复跑结果不变。
"""
import re
import sys

_CJK = (
    '\u4e00-\u9fff'      # CJK 统一表意
    '\u3400-\u4dbf'      # 扩展 A
    '\uff00-\uffef'      # 全角符号（含全角标点）
    '\u3000-\u303f'      # CJK 标点（。，、等）
)
_CJK_RE = re.compile(f'[{_CJK}]')

# 需要整体保护、内部引号不碰的区域
_PROTECT_PATTERNS = [
    re.compile(r'\\begin\{(lstlisting|verbatim|minted|Verbatim|lstlisting\*)\}.*?\\end\{\1\}', re.S),
    re.compile(r'\\verb\*?(.).*?\1'),          # \verb|...| / \verb!...!
    re.compile(r'\$\$.*?\$\$', re.S),          # 显示公式 $$...$$
    re.compile(r'(?<!\\)\$.*?(?<!\\)\$', re.S), # 行内 $...$（不含转义 \$）
    re.compile(r'\\\[.*?\\\]', re.S),          # \[...\]
    re.compile(r'\\\(.*?\\\)', re.S),          # \(...\)
    re.compile(r'\\(?:url|href)\{[^}]*\}'),    # \url{...}/\href{...}
]

_PLACEHOLDER = '\x00MHQP{}\x00'  # 保护占位符（含 NUL，正文绝不会出现）


def _protect(text):
    """把保护区替换成占位符，返回 (masked_text, restore_list)。"""
    store = []
    def repl(m):
        store.append(m.group(0))
        return _PLACEHOLDER.format(len(store) - 1)
    for pat in _PROTECT_PATTERNS:
        text = pat.sub(repl, text)
    return text, store


def _restore(text, store):
    for i, seg in enumerate(store):
        text = text.replace(_PLACEHOLDER.format(i), seg)
    return text


def normalize_text(text):
    """核心：规范化一段文本里的 CJK 上下文 ASCII 直引号。返回 (新文本, 改动数)。"""
    masked, store = _protect(text)
    chars = list(masked)
    n = len(chars)
    changed = 0
    # 每个自然段（以空行分隔）内独立配对，避免跨段错位
    depth_open = False  # 当前段内是否已开引号未闭合
    para_open = False
    for i, ch in enumerate(chars):
        if ch != '"':
            continue
        left = chars[i - 1] if i > 0 else ''
        right = chars[i + 1] if i + 1 < n else ''
        # 只处理紧邻至少一侧是中文的直引号
        if not (_CJK_RE.match(left) or _CJK_RE.match(right)):
            continue
        # 方向判定：优先看语义位置，兜底用配对状态
        if not para_open:
            chars[i] = '\u201c'; para_open = True          # 开引号
        else:
            chars[i] = '\u201d'; para_open = False          # 闭引号
        changed += 1
    result = _restore(''.join(chars), store)
    return result, changed


def _reset_para_state(text):
    """按空行分段分别规范化，段间重置配对状态（防跨段错位）。"""
    parts = re.split(r'(\n\s*\n)', text)
    out = []
    total = 0
    for seg in parts:
        if seg.strip() == '':
            out.append(seg); continue
        new, c = normalize_text(seg)
        out.append(new); total += c
    return ''.join(out), total


def main():
    args = [a for a in sys.argv[1:] if a != '--dry-run']
    dry = '--dry-run' in sys.argv
    if not args:
        print('用法: python normalize_cjk_quotes.py [--dry-run] <file.tex> ...'); sys.exit(1)
    grand = 0
    for path in args:
        try:
            src = open(path, encoding='utf-8').read()
        except Exception as e:
            print(f'跳过 {path}: {e}'); continue
        new, c = _reset_para_state(src)
        grand += c
        if c and not dry:
            open(path, 'w', encoding='utf-8', newline='').write(new)
        tag = '(dry-run)' if dry else ('已改写' if c else '无需改')
        print(f'{path}: {c} 处直引号→弯引号 {tag}')
    print(f'总计 {grand} 处')


if __name__ == '__main__':
    main()
