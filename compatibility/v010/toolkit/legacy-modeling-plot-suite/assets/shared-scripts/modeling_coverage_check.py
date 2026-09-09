# -*- coding: utf-8 -*-
"""建模覆盖核对 — 全链合同第 2 环（承上：建模阶段必须认领每条能力项）。

能力清单在赛题分析阶段定为"合同"，但建模阶段若把某条能力悄悄简化/无视（那个案例
正是建模时就把"五元组抽取"降成了分类），下游全歪。本闸让建模报告"认领"每条能力项：
MODELING_REPORT.md 必须为 CAPABILITY_CHECKLIST.json 的每条能力项 id 给出对应建模着落
（在讲该能力对应的模型/方法处标注其 id）。整条能力在建模报告里找不到 → HARD FAIL。

⛔ 宁可漏报，不可误报：只判"能力项 id 在建模报告里完全找不到"这种零歧义铁证
  （= 该能力在建模阶段被整条无视）。"方案给得对不对/够不够"是语义判断，留严格模式
  的方法对账与第 9 闸考官，本脚本不碰。

用法：
  python _utils/modeling_coverage_check.py [--checklist CAPABILITY_CHECKLIST.json] [--modeling MODELING_REPORT.md]
退出码：0=每条能力项都被建模报告认领 1=有能力项无着落(阻断) 2=无清单/无报告(跳过不阻断)
"""
from __future__ import annotations
import sys
import re
import json
import argparse
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checklist", default="CAPABILITY_CHECKLIST.json")
    ap.add_argument("--modeling", default="MODELING_REPORT.md")
    args = ap.parse_args()

    clpath, mdpath = Path(args.checklist), Path(args.modeling)
    if not clpath.is_file() or not mdpath.is_file():
        print("[modeling_coverage] 缺 CAPABILITY_CHECKLIST.json 或 MODELING_REPORT.md，跳过（不阻断）")
        return 2
    try:
        data = json.loads(_read(clpath))
    except (json.JSONDecodeError, ValueError):
        print("[modeling_coverage] 能力清单非法（先跑 capability_check.py），跳过")
        return 2
    caps = [c for c in data.get("capabilities", []) if isinstance(c, dict) and c.get("id")]
    if not caps:
        print("[modeling_coverage] 能力清单无有效能力项，跳过")
        return 2

    md_text = _read(mdpath)
    missing = []
    for c in caps:
        cid = c.get("id")
        # 建模报告里出现该能力 id（原样整词）即认为已认领——id 唯一，零误报
        if not re.search(r"(?<![\w-])" + re.escape(cid) + r"(?![\w-])", md_text):
            missing.append((cid, c.get("name", "")))

    n = len(caps)
    print(f"[modeling_coverage] 能力项 {n} 条，建模报告已认领 {n - len(missing)} 条")
    if missing:
        print(f"❌ HARD FAIL —— {len(missing)} 条能力项在 MODELING_REPORT.md 里找不到着落（建模阶段被整条无视）：")
        for cid, name in missing:
            print(f"  ✗ {cid} {name}")
        print("  修复：在建模报告里为每条能力项写清对应的模型/方法，并标注其能力 id（如"
              "『针对能力 P1-C1 事件五元组抽取，采用……模型』）。禁止在建模阶段把题目要求的能力"
              "悄悄简化或跳过——那会一路歪到编码和论文。补全后重跑本闸直到 0。")
        return 1
    print("✅ 建模覆盖核对通过：每条能力项都在建模报告里有对应建模方案（承接了赛题分析的合同）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
