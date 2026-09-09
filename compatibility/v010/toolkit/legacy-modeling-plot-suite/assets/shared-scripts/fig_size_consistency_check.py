# -*- coding: utf-8 -*-
r"""图尺寸一致性闸 —— 正文 sections 的 \includegraphics 尺寸 vs latex_includes.tex 基准。

治的问题：制图阶段 fig_include_size.py 已按每张图【真实长宽比】把 width/height 算好写进
latex_includes.tex（竖长条流程图窄、横图宽）；但 comp-paper 把图嵌进正文时，可能被
「图片宽度下限 0.8」这类规则诱导，擅自把 width 改成 0.85 → keepaspectratio 下高度顶到
上限、竖长条图被【撑满整页】（真实翻过车：国赛 A 题 5 张流程图全被 0.5→0.85 改大）。

做法（确定性、通用、零题目常量）：
  1. 从 latex_includes.tex 抽每张图的 (width系数, height系数) 作基准。
  2. 递归扫 paper/ 下所有 *.tex，抽正文实际用的尺寸。
  3. 同名图两边都明确给了同一维度、数值不一致 → FAIL（正文擅自改了，必须改回）。

⛔ 全软失败：latex_includes/正文目录不存在或读不出 → 退出 2（跳过、不阻塞）。
   只在【基准有该图 + 正文也引了该图 + 同维度确凿不等】时判 1。防误报：
   - 正文没引的图 → 跳过；某维度一边没写 → 不评判该维度；只认 .pdf 图。
退出码：0=一致  1=检出被改(必修)  2=无据可查(跳过，不阻塞)
用法：python _utils/fig_size_consistency_check.py [--latex figures/latex_includes.tex] [--paperdir paper]
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

# 匹配一条 \includegraphics[opts]{path}，捕获 opts 与 path（与 fig_include_size 同源口径）
_INC_RE = re.compile(r'\\includegraphics(\[[^\]]*\])?(\{[^}]*\})')
# 从 opts 里取 width= / height= 的系数（\textwidth/\textheight 前的数字；允许无数字如纯 \textwidth）
_W_RE = re.compile(r'width\s*=\s*([\d.]*)\s*\\(?:text|line|column)?width', re.I)
_H_RE = re.compile(r'height\s*=\s*([\d.]*)\s*\\(?:text)?height', re.I)


def _strip_braces(s: str) -> str:
    return s[1:-1] if len(s) >= 2 and s[0] in '[{' and s[-1] in ']}' else s


def _norm(coef) -> str:
    """宽/高系数规整成可比字符串：空(如纯 \\textwidth 前无数字)=1.0；'0.50'/'0.5' 归一。"""
    s = (coef or "").strip()
    if s == "":
        return "1.0"
    try:
        return f"{float(s):.4g}"
    except ValueError:
        return s


def _basename(path: str) -> str:
    """取图文件名(去 {}、去目录、去 ../figures/ 前缀)，作跨文件配对键。"""
    p = _strip_braces(path).replace("\\", "/").rstrip("/")
    return p.split("/")[-1].strip()


def _parse_sizes(text: str) -> dict:
    """从 LaTeX 文本抽 {图文件名: (width系数, height系数)}。同名图只记首个。"""
    out = {}
    for m in _INC_RE.finditer(text):
        opts, path = m.group(1) or "", m.group(2) or ""
        name = _basename(path)
        if not name or not name.lower().endswith(".pdf"):
            continue
        wm = _W_RE.search(opts)
        hm = _H_RE.search(opts)
        w = _norm(wm.group(1)) if wm else None
        h = _norm(hm.group(1)) if hm else None
        out.setdefault(name, (w, h))
    return out


def _read(p: Path):
    try:
        return p.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description="图尺寸一致性闸(正文 vs latex_includes)")
    ap.add_argument("--latex", default="figures/latex_includes.tex")
    ap.add_argument("--paperdir", default="paper")
    args = ap.parse_args()

    latex_path = Path(args.latex)
    paper_dir = Path(args.paperdir)
    base_text = _read(latex_path) if latex_path.is_file() else None
    if not base_text:
        print(f"⚠ 尺寸一致性闸：未找到/读不出 {latex_path}，跳过(不阻塞)。")
        return 2
    if not paper_dir.is_dir():
        print(f"⚠ 尺寸一致性闸：未找到正文目录 {paper_dir}，跳过(不阻塞)。")
        return 2

    base = _parse_sizes(base_text)
    if not base:
        print("⚠ 尺寸一致性闸：latex_includes 里没有 .pdf 的 \\includegraphics，无可比，跳过。")
        return 2

    body, body_where = {}, {}
    for tf in sorted(paper_dir.rglob("*.tex")):
        t = _read(tf)
        if not t:
            continue
        for name, wh in _parse_sizes(t).items():
            if name not in body:
                body[name] = wh
                body_where[name] = tf.name

    fails, checked = [], 0
    for name, (bw, bh) in base.items():
        if name not in body:
            continue
        checked += 1
        pw, ph = body[name]
        if bw is not None and pw is not None and bw != pw:
            fails.append((name, "width", bw, pw, body_where.get(name, "?")))
        if bh is not None and ph is not None and bh != ph:
            fails.append((name, "height", bh, ph, body_where.get(name, "?")))

    print("=== 图尺寸一致性闸(正文 vs latex_includes) ===")
    print(f"基准图 {len(base)} 张，正文引用并可比 {checked} 张。")
    if not fails:
        print("✅ PASS — 正文所有图尺寸与 latex_includes 一致(没被擅自改大)。")
        return 0
    print(f"❌ 检出 {len(fails)} 处尺寸被改(必修)：")
    for name, dim, bv, pv, where in fails:
        print(f"   · {name} 的 {dim}：latex_includes={bv} 但正文={pv}（{where}）")
    print("⛔ 正文必须照抄 latex_includes.tex 的 width/height(按真实长宽比算好的)；改回基准值。"
          "竖长条流程图/TikZ 图改大会 keepaspectratio 撑满整页。")
    return 1


if __name__ == "__main__":
    sys.exit(main())

