# -*- coding: utf-8 -*-
"""能力清单验收编排 — 第 9 道闸完整体（题型无关的"语义达标"验收，缓解层）。

读 CAPABILITY_CHECKLIST.json，逐条能力项核对"做没做"，把验收从"表面达标"(图够页够
文件在)升级成"语义达标"(题目要的每项能力都真做出来了)。

⛔⛔ 天花板（诚实写死，勿当万能）：
  1. 清单漏列的能力，本闸核不出来——完备性 = 解析 AI 理解力上限。
  2. semantic 项的"做没做"由考官 AI 判，考官与答题同源、有共同盲区。本闸**不自己判语义**
     （避免脚本变新 bug 源），只做两件确定的事：a) machine 项按凭证自动核；
     b) 强制每条能力项都有明确结论、无漏无 FAIL，把"考官逐条判"固化进流程。

职责分工（脚本只判确定的，语义交考官）：
  - machine + delivery 项：脚本自动核 required_output 存在且非空（确定性）。
  - 其余 machine 项 + 所有 semantic 项：必须在 CAPABILITY_VERDICT.json 里有该 id 的
    结论且 verdict==PASS；缺结论 / FAIL → 阻断（严格模式）。语义结论由考官 AI 填，
    脚本只校验完整性，绝不替考官判"五元组是不是真抽了"。

用法：
  python _utils/capability_audit.py [--checklist ...] [--verdict CAPABILITY_VERDICT.json] [--fast 0|1]
退出码：0=全部能力项通过 1=有能力项未达标/缺结论(阻断) 2=无清单(跳过不阻断)
产物：SEMANTIC_REVIEW_TODO.md（待考官逐条判的清单）、CAPABILITY_AUDIT.md（逐项总账）

CAPABILITY_VERDICT.json 约定（考官 AI 严格模式下填）：
  {"P1-C2": {"verdict":"PASS","evidence":"code/coref.py:40-88 用指代消解模型","note":"抽检20条正确"},
   "P4-C1": {"verdict":"FAIL","evidence":"problem4.py 按新闻行预警","note":"未按事件簇,需返工"}}
"""
from __future__ import annotations
import sys
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


def _load_json(p: Path):
    try:
        return json.loads(_read(p)) if p.is_file() else None
    except (json.JSONDecodeError, ValueError):
        return "ERR"


def _audit_one(cap: dict, verdicts: dict):
    """核一条能力项，返回 (status, reason)。status ∈ PASS/FAIL/PENDING。
    - machine+delivery：脚本自动核产物（确定性）。
    - 其余：查 verdict 结论。缺结论=PENDING（严格模式阻断），有结论按 PASS/FAIL。"""
    cid = cap.get("id", "?")
    judge = cap.get("judge")
    mc = cap.get("machine_check")

    # machine + delivery：脚本自动核 required_output 存在且非空
    if judge == "machine" and mc == "delivery":
        out = cap.get("required_output")
        if not out:
            return "FAIL", "delivery 项没写 required_output，无法自动核"
        p = Path(out)
        if not p.exists():
            return "FAIL", f"声称产物 {out} 不存在（能力未交付）"
        if p.is_file() and p.stat().st_size == 0:
            return "FAIL", f"产物 {out} 为空(0字节)，等于没做"
        return "PASS", f"产物 {out} 已产出（{p.stat().st_size} bytes）"

    # 其余 machine 项 + 所有 semantic 项：必须有考官/闸结论
    v = verdicts.get(cid) if isinstance(verdicts, dict) else None
    if not isinstance(v, dict) or not v.get("verdict"):
        kind = "闸凭证" if judge == "machine" else "考官结论"
        return "PENDING", f"缺{kind}：CAPABILITY_VERDICT.json 里没有 {cid} 的 verdict"
    vd = str(v.get("verdict", "")).upper()
    if vd == "PASS":
        return "PASS", f"结论 PASS —— {v.get('evidence','(无证据)')}"
    return "FAIL", f"结论 {vd} —— {v.get('evidence','')} / {v.get('note','')}"


def _write_todo(pendings, caps_by_id):
    """把待考官逐条判的项写成任务单。"""
    lines = ["# 语义验收待办（考官 AI 严格模式逐条判，结论写进 CAPABILITY_VERDICT.json）", "",
             "> 铁律：不许问自己'我做了吗'（会自证）。拿客观证据当锚——指出哪几行代码/哪个产物支撑，",
             "> 对照判定标准逐条给 verdict(PASS/FAIL) + evidence(代码位置/产物) + note。", ""]
    for cid in pendings:
        c = caps_by_id.get(cid, {})
        lines.append(f"- [ ] **{cid}** 子问题{c.get('subproblem','?')} · {c.get('name','')}")
        lines.append(f"      判定标准：{c.get('criterion','(未写)')}")
        if c.get("required_output"):
            lines.append(f"      相关产物：{c['required_output']}")
    Path("SEMANTIC_REVIEW_TODO.md").write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checklist", default="CAPABILITY_CHECKLIST.json")
    ap.add_argument("--verdict", default="CAPABILITY_VERDICT.json")
    ap.add_argument("--fast", default="0")
    args = ap.parse_args()
    fast = str(args.fast).strip() == "1"

    data = _load_json(Path(args.checklist))
    if data is None:
        print(f"[capability_audit] 无 {args.checklist}，跳过（不阻断）。建议题目解析阶段产出能力清单。")
        return 2
    if data == "ERR" or not isinstance(data, dict) or not isinstance(data.get("capabilities"), list):
        print(f"❌ {args.checklist} 非法或缺 capabilities（先跑 capability_check.py 修结构）")
        return 1

    verdicts = _load_json(Path(args.verdict))
    if verdicts in (None, "ERR"):
        verdicts = {}
    caps = [c for c in data["capabilities"] if isinstance(c, dict)]
    caps_by_id = {c.get("id"): c for c in caps}

    rows, pendings, fails = [], [], []
    for c in caps:
        st, reason = _audit_one(c, verdicts)
        rows.append((c.get("id"), c.get("judge"), st, reason))
        if st == "PENDING":
            pendings.append(c.get("id"))
        elif st == "FAIL":
            fails.append((c.get("id"), reason))

    # 逐项总账落盘
    audit_lines = ["# 能力清单验收总账（逐项）", ""]
    for cid, judge, st, reason in rows:
        mark = {"PASS": "✅", "FAIL": "❌", "PENDING": "⏳"}[st]
        audit_lines.append(f"- {mark} **{cid}** [{judge}] {st} — {reason}")
    Path("CAPABILITY_AUDIT.md").write_text("\n".join(audit_lines), encoding="utf-8")

    if pendings:
        _write_todo(pendings, caps_by_id)

    n = len(rows)
    n_pass = sum(1 for r in rows if r[2] == "PASS")
    print(f"[capability_audit] {n} 条能力项：PASS {n_pass} / FAIL {len(fails)} / PENDING {len(pendings)}")
    print("  逐项总账见 CAPABILITY_AUDIT.md")

    if fails:
        print(f"❌ HARD FAIL —— {len(fails)} 条能力项未达标（题目要求的能力没做到/做降维了）：")
        for cid, reason in fails:
            print(f"  ✗ {cid}: {reason}")

    if pendings:
        if fast:
            print(f"⚠ 快速模式：{len(pendings)} 条能力项缺结论（见 SEMANTIC_REVIEW_TODO.md），"
                  "快速模式降级为提示、不阻断；但强烈建议严格模式补判，否则可能带降维交付。")
        else:
            print(f"❌ 严格模式：{len(pendings)} 条能力项缺考官/闸结论（见 SEMANTIC_REVIEW_TODO.md）——"
                  "考官 AI 必须逐条判、把 verdict 写进 CAPABILITY_VERDICT.json，再重跑本闸。")

    if fails:
        return 1
    if pendings and not fast:
        return 1
    if pendings and fast:
        return 0
    print("✅ 所有能力项达标：题目要求的每项能力都已验收通过（machine 自动核 + semantic 考官判）。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
