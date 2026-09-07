# -*- coding: utf-8 -*-
r"""按图的真实长宽比，自动为 latex_includes.tex 里每张图定 \includegraphics 宽度。

治的问题：竖长条图(如流程图)和横图套同一个 width，竖图按页宽拉伸后高度撑满整页、
显得巨大。规范做法是按图自身长宽比给约束——竖长的收窄 width、横的放宽。

做法(确定性、通用、零题目常量)：
  1. 读 figures/*.pdf 每张的真实宽高(PyMuPDF)。
  2. 按 r = 高/宽 分档给 width；height 统一上限，防任何图撑满页。
  3. 只重写 latex_includes.tex 里每个 \includegraphics 的 width/height 参数，
     keepaspectratio、图路径、caption、label 一律不动。

长宽比分档(r = 高/宽)：
  r <= 0.80  横图/方图      -> width 0.85\textwidth
  r <= 1.20  近方           -> width 0.70\textwidth
  r <= 1.60  偏竖           -> width 0.50\textwidth
  r  > 1.60  瘦高           -> width 0.42\textwidth
  一律 height 上限 0.80\textheight（keepaspectratio 下只压不放，防撑满页）

⛔ 全软失败：PDF 读不到 / 无 PyMuPDF / 某块解析不了 → 该块保持原样，绝不破坏文件。
   latex_includes.tex 不存在 → 退出 2(跳过，不阻塞)。
退出码：0=已按长宽比规整  1=(保留,当前不产生)  2=无文件可处理/依赖缺失(跳过)
用法：python _utils/fig_include_size.py [--figdir figures] [--latex figures/latex_includes.tex] [--dry-run]
"""
from __future__ import annotations
import sys
import re
import argparse
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

# (阈值上界 r, width 系数) —— r=高/宽；从小到大匹配第一个满足 r<=界 的档
_BUCKETS = [
    (0.80, 0.85),
    (1.20, 0.70),
    (1.60, 0.50),
]
_WIDTH_TALL = 0.42          # r > 1.60 瘦高图
_HEIGHT_CAP = 0.80          # height 上限(\textheight)


def _pdf_aspect(pdf_path: Path):
    """返回 PDF 第一页 高/宽 比值 r；读不到返回 None(软失败)。"""
    try:
        import fitz  # PyMuPDF
    except Exception:
        return None
    try:
        doc = fitz.open(str(pdf_path))
        if doc.page_count < 1:
            doc.close()
            return None
        rect = doc.load_page(0).rect
        doc.close()
        w, h = float(rect.width), float(rect.height)
        if w <= 0 or h <= 0:
            return None
        return h / w
    except Exception:
        return None


def _width_for(r: float) -> float:
    for bound, wcoef in _BUCKETS:
        if r <= bound:
            return wcoef
    return _WIDTH_TALL


# 匹配一条 \includegraphics[可选opts]{路径}，捕获 opts 与 path
_INC_RE = re.compile(r'(\\includegraphics)(\[[^\]]*\])?(\{[^}]*\})')


def _rewrite_opts(opts: str, w_coef: float) -> str:
    """把 opts([...] 含中括号)里的 width/height 改成按长宽比算的值，keepaspectratio 保留。
    opts 可能为空('' 或 None)→ 生成一份新的。"""
    body = opts[1:-1] if (opts and opts.startswith('[') and opts.endswith(']')) else ''
    parts = [p.strip() for p in body.split(',') if p.strip()]
    kept = []
    has_keep = False
    for p in parts:
        low = p.lower().replace(' ', '')
        if low.startswith('width=') or low.startswith('height='):
            continue  # 丢弃旧的 width/height，稍后统一加
        if low == 'keepaspectratio':
            has_keep = True
            continue
        kept.append(p)  # 其它选项(如 trim/clip/angle)原样保留
    new = [f"width={w_coef:g}\\textwidth", f"height={_HEIGHT_CAP:g}\\textheight", "keepaspectratio"]
    _ = has_keep  # keepaspectratio 无论原来有无都补上(必须有)
    return '[' + ','.join(new + kept) + ']'


def process(latex_path: Path, fig_dir: Path, dry_run: bool):
    text = latex_path.read_text(encoding='utf-8', errors='ignore')
    changes = []
    skips = []

    def _sub(m):
        cmd, opts, pathbrace = m.group(1), m.group(2), m.group(3)
        inner = pathbrace[1:-1].strip()  # 去 {}
        # 只处理 .pdf 图；取文件名去 figures/ 前缀，在 fig_dir 找
        name = inner.split('/')[-1].split('\\')[-1]
        if not name.lower().endswith('.pdf'):
            return m.group(0)
        pdf = fig_dir / name
        r = _pdf_aspect(pdf)
        if r is None:
            skips.append(name)
            return m.group(0)  # 软失败：该块原样不动
        wc = _width_for(r)
        new_opts = _rewrite_opts(opts or '', wc)
        changes.append((name, round(r, 2), wc))
        return cmd + new_opts + pathbrace

    new_text = _INC_RE.sub(_sub, text)
    print("=== fig_include_size：按长宽比规整 \\includegraphics 宽度 ===")
    for name, r, wc in changes:
        tag = "横/方" if r <= 0.8 else ("近方" if r <= 1.2 else ("偏竖" if r <= 1.6 else "瘦高"))
        print(f"  {name}: 高/宽={r} ({tag}) -> width={wc:g}\\textwidth, height<={_HEIGHT_CAP:g}\\textheight")
    for name in skips:
        print(f"  ⚠ {name}: PDF 读不到/无 PyMuPDF，保持原样(软跳过)")
    if not changes and not skips:
        print("  (latex_includes 里没有 .pdf 的 \\includegraphics，无改动)")
    if dry_run:
        print("  [dry-run] 未写盘。去掉 --dry-run 才实际写入。")
        return 0
    if new_text != text:
        latex_path.write_text(new_text, encoding='utf-8')
        print(f"  ✅ 已更新 {latex_path}（{len(changes)} 张按长宽比规整）")
    else:
        print("  尺寸已符合，无需改动。")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="按图长宽比自动定 includegraphics 宽度")
    ap.add_argument("--figdir", default="figures")
    ap.add_argument("--latex", default="figures/latex_includes.tex")
    ap.add_argument("--dry-run", action="store_true", help="只打印不写盘")
    args = ap.parse_args()
    latex_path = Path(args.latex)
    fig_dir = Path(args.figdir)
    if not latex_path.is_file():
        print(f"⚠ 未找到 {latex_path}，跳过(不阻塞)。")
        return 2
    if not fig_dir.is_dir():
        print(f"⚠ 未找到图目录 {fig_dir}，跳过(不阻塞)。")
        return 2
    return process(latex_path, fig_dir, args.dry_run)


if __name__ == "__main__":
    sys.exit(main())
