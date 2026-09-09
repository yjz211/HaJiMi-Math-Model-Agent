# -*- coding: utf-8 -*-
"""论文声称核对 — 全链合同第 3 环（启下：论文不许吹没做成的能力）。

论文是最终交付物，最该防"把没做到/做砸的能力，在正文里吹成做到了"。本闸读编码阶段
产出的 CAPABILITY_AUDIT.md（逐项验收总账），做两件事：
  A) 验收闸门（HARD FAIL）：总账里存在未通过(FAIL/PENDING)的能力项，却已进入论文阶段
     —— 说明带着"没验收通过的能力"在写论文，必须回去把它做到 PASS 再写。
  B) 吹嘘提醒（WARN）：未通过能力项的名字出现在论文正文里 —— 疑似把没做成的写成做成了
     （也可能是在"局限/未来工作"里如实提及，故降级 WARN，人工确认）。

⛔ 宁可漏报，不可误报：A 只认总账里明确的 FAIL/PENDING 记录（零歧义）；
  "正文是不是在吹" 靠关键词命中，有误报（可能在讲局限），故只 WARN 不阻断。

用法：
  python _utils/paper_claim_check.py [--audit CAPABILITY_AUDIT.md] [--sections paper/sections] [--fast 0|1]
退出码：0=通过 1=有能力项未通过却来写论文(阻断) 2=无总账(跳过不阻断)
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


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _parse_audit(audit_path: Path):
    """解析 CAPABILITY_AUDIT.md（capability_audit.py 产出）逐项状态。
    行形如：- ❌ **P2-C1** [semantic] FAIL — ...  /  - ⏳ **P3-C1** [semantic] PENDING — ...
    返回 [(id, status, name_hint)]。"""
    rows = []
    for line in _read(audit_path).splitlines():
        m = re.match(r"\s*-\s*[✅❌⏳]\s*\*\*([^*]+)\*\*.*?\b(PASS|FAIL|PENDING)\b", line)
        if m:
            rows.append((m.group(1).strip(), m.group(2)))
    return rows


def _paper_text(sections_dir: Path) -> str:
    """把论文正文拼一坨（sections/*.tex + 常见主文件），用于扫吹嘘。"""
    buf = []
    if sections_dir.is_dir():
        for f in sorted(sections_dir.rglob("*.tex")):
            buf.append(_read(f))
    for main in ("paper/main.tex", "main.tex", "RESULTS.md"):
        p = Path(main)
        if p.is_file():
            buf.append(_read(p))
    return "\n".join(buf)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audit", default="CAPABILITY_AUDIT.md")
    ap.add_argument("--checklist", default="CAPABILITY_CHECKLIST.json")
    ap.add_argument("--sections", default="paper/sections")
    ap.add_argument("--fast", default="0")
    args = ap.parse_args()
    fast = str(args.fast).strip() == "1"

    audit_path = Path(args.audit)
    if not audit_path.is_file():
        print("[paper_claim_check] 无 CAPABILITY_AUDIT.md（编码阶段能力验收总账），跳过（不阻断）。"
              "建议先在 comp-code Step7.6 跑 capability_audit.py 产出验收总账。")
        return 2
    rows = _parse_audit(audit_path)
    if not rows:
        print("[paper_claim_check] CAPABILITY_AUDIT.md 无可解析的能力项状态，跳过（不阻断）")
        return 2

    fails = [cid for cid, st in rows if st == "FAIL"]
    pendings = [cid for cid, st in rows if st == "PENDING"]
    not_pass = fails + pendings

    # B) 吹嘘提醒：未通过能力名出现在论文正文（用能力清单的 name 匹配）
    import json
    names = {}
    try:
        data = json.loads(_read(Path(args.checklist)))
        for c in data.get("capabilities", []):
            if isinstance(c, dict) and c.get("id") and c.get("name"):
                names[c["id"]] = c["name"]
    except (json.JSONDecodeError, ValueError, OSError):
        pass
    paper = _paper_text(Path(args.sections))
    boasted = []
    for cid in not_pass:
        nm = names.get(cid, "")
        if nm and nm in paper:
            boasted.append((cid, nm))

    n = len(rows)
    print(f"[paper_claim_check] 能力验收总账 {n} 条：PASS {n-len(not_pass)} / FAIL {len(fails)} / PENDING {len(pendings)}")
    for cid, nm in boasted:
        print(f"  [WARN] 未通过能力「{cid} {nm}」的名字出现在论文正文——"
              "请确认不是把没做成的写成做到了（若在'局限/未来工作'里如实提及可忽略）。")

    # A) 验收闸门
    if fails:
        print(f"❌ HARD FAIL —— {len(fails)} 条能力项验收未通过(FAIL)却已进入论文阶段：{fails}")
        print("  论文是最终交付物，不能把没做到/做砸的能力写成成果。回到 comp-code 把这些能力"
              "修到 PASS（真做出来），再写论文。")
        return 1
    if pendings and not fast:
        print(f"❌ 严格模式 HARD FAIL —— {len(pendings)} 条能力项还是 PENDING(未判定)：{pendings}")
        print("  写论文前必须先让考官逐条判定（补 CAPABILITY_VERDICT.json 重跑 capability_audit.py），"
              "否则论文可能声称了未经验收的能力。")
        return 1
    if pendings and fast:
        print(f"⚠ 快速模式：{len(pendings)} 条 PENDING 未判定，降级不阻断；论文里勿把它们写成确定成果。")
    print("✅ 论文声称核对通过：所有能力项均已验收通过，论文可如实书写这些成果。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
