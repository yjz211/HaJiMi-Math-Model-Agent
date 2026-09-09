# -*- coding: utf-8 -*-
r"""AI 工具使用声明 —— 往 paper/main.tex 精准插入 \input 行（不重写模板）。

治的问题：竞赛第十条/AI声明要求在【参考文献之前】加「AI工具使用声明」章节，
【附录内】加「AI工具使用详情」。本脚本只往 main.tex 插两行 \input（skill 铁律
允许改 \input 行，指纹校验只比对前 20 行 preamble，插在正文区不触发），绝不重写
preamble、不动模板结构。开关不开时本脚本根本不被调用 = 对现有出稿零影响。

做法（行级、确定性、通用）：
  1. 声明章节：在 \begin{thebibliography} 或 \bibliography{ 之前插 \input{sections/<Z>}。
     找不到参考文献锚点 → 降级插在 \end{document} 之前。
  2. 附录详情（仅 mode=used）：在 \begin{appendices} 之后第一行插 \input{sections/<B>}。
     找不到 appendices/\appendix 锚点 → 跳过详情（不报错，只警告）。
  3. 幂等：已含对应 \input 行则跳过该行的插入（防断点续跑重复插）。

退出码：0=成功或已优雅降级  1=真错误（main.tex 不存在/读写失败/无 \end{document}）
用法：python _utils/inject_ai_disclosure.py --main paper/main.tex --mode used|none
      [--disclosure Z_ai_disclosure] [--detail B_ai_detail]
"""
from __future__ import annotations
import sys
import argparse
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def _find_line(lines, needles):
    """返回第一个包含任一 needle 的行索引；找不到返回 -1。"""
    for i, ln in enumerate(lines):
        for nd in needles:
            if nd in ln:
                return i
    return -1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--main", default="paper/main.tex", help="主文件路径")
    ap.add_argument("--mode", choices=["used", "none"], required=True)
    ap.add_argument("--disclosure", default="Z_ai_disclosure",
                    help="声明章节文件名（不含 sections/ 前缀和 .tex 后缀）")
    ap.add_argument("--detail", default="B_ai_detail",
                    help="附录详情文件名（同上，仅 used 模式插入）")
    ap.add_argument("--detail-dir", default="appendix",
                    help="附录详情所在目录前缀（默认 appendix/，不计入正文页数预检）")
    args = ap.parse_args()

    mp = Path(args.main)
    if not mp.is_file():
        print(f"[ERR] main not found: {mp}")
        return 1
    try:
        text = mp.read_text(encoding="utf-8")
    except Exception as e:
        print(f"[ERR] read failed: {e}")
        return 1
    # 保留原换行风格
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.split(nl)

    # 声明章节在正文流（参考文献前），归 sections/；附录详情是附录内容，归 appendix/
    #（appendix/ 不计入正文页数预检，与模板附录约定一致）。
    disc_input = "\\input{sections/%s}" % args.disclosure
    detail_input = "\\input{%s/%s}" % (args.detail_dir, args.detail)
    changed = False
    warns = []

    # --- 1. 声明章节：插在参考文献之前 ---
    if disc_input in text:
        print("[SKIP] disclosure input already present")
    else:
        idx = _find_line(lines, ["\\begin{thebibliography}", "\\bibliography{"])
        anchor = "before-references"
        if idx < 0:
            idx = _find_line(lines, ["\\end{document}"])
            anchor = "before-end-document (降级：未找到参考文献锚点)"
        if idx < 0:
            print("[ERR] neither references nor \\end{document} found")
            return 1
        lines.insert(idx, "% === AI 工具使用声明（自动插入）===")
        lines.insert(idx + 1, disc_input)
        changed = True
        print(f"[OK] inserted disclosure at line {idx + 1} ({anchor})")

    # --- 2. 附录详情：仅 used 模式，插在 appendices 内 ---
    if args.mode == "used":
        if detail_input in text:
            print("[SKIP] detail input already present")
        else:
            # 主锚点：标准 appendices / 华数杯自定义 appendixx / \appendix 命令
            aidx = _find_line(lines, ["\\begin{appendices}", "\\begin{appendixx}", "\\appendix"])
            if aidx >= 0:
                lines.insert(aidx + 1, detail_input)
                changed = True
                print(f"[OK] inserted detail after appendix env at line {aidx + 2}")
            else:
                # fallback：无附录环境（如 dongsansheng 直接 \input A_code）→ 插在附录代码那行之后
                cidx = _find_line(lines, ["A_code}", "A_code "])
                if cidx >= 0:
                    lines.insert(cidx + 1, detail_input)
                    changed = True
                    print(f"[OK] inserted detail after A_code input at line {cidx + 2}")
                else:
                    warns.append("未找到附录锚点（appendices/appendixx/\\appendix/A_code），跳过附录详情插入")

    if changed:
        try:
            mp.write_text(nl.join(lines), encoding="utf-8")
        except Exception as e:
            print(f"[ERR] write failed: {e}")
            return 1
        print("[DONE] main.tex updated")
    else:
        print("[DONE] no change needed")
    for w in warns:
        print(f"[WARN] {w}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

