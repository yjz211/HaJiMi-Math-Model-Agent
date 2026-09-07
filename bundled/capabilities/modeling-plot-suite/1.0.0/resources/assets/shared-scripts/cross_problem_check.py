# -*- coding: utf-8 -*-
"""跨子问题一致性终检 —— 竞赛链专用，补"横向割裂"的真空。

背景：竞赛链纵向(题目→能力→建模→代码→论文)焊得很死，但横向(Q1↔Q2↔Q3↔Q4)
只传数据字段、不传"结论/约束"，且 audit_subproblem_isolation 还在主动"防串台"。
后果：Q1 得出的关键结论(如振打峰值 6~12 mg/Nm3)没有作为约束流进 Q2/Q4，
各问在自己的约束下独立最优，没有任何一步负责发现"Q1 的结论与 Q2 的解自相矛盾"。
这个脚本就是那道"没人负责的跨问对撞"闸。

数据来源(建模阶段产出，comp-modeling Step5.5 写)：
  CROSS_PROBLEM_LEDGER.json —— 各问登记"关键结论"和"对下游问题的约束"。

⛔ 全软失败：读不到 ledger / 字段缺 → 退出码 2(跳过、不阻塞)，绝不误判为失败(1)。
   只有"登记齐全 + 检出确凿矛盾"才退出 1。防老工作流/登记没填全被误杀。

退出码：0=通过  1=检出矛盾(必修)  2=无据可查(跳过，不阻塞)
用法：python _utils/cross_problem_check.py [--ledger CROSS_PROBLEM_LEDGER.json] [--figdir figures]
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

# 数值比较容差(相对)：避免浮点噪声误报
_REL_TOL = 1e-6
# 同名量跨问差异告警阈值(相对)：超过即 WARN(不阻塞)
_CROSS_DIFF_WARN = 0.05


def _load_json(path: Path):
    """读 JSON，任何异常返回 None(软失败)。"""
    try:
        if not path.exists() or not path.is_file():
            return None
        return json.loads(path.read_text(encoding="utf-8", errors="ignore"))
    except Exception:
        return None


def _as_float(x):
    """尽力转 float，失败返回 None。"""
    try:
        if isinstance(x, bool):
            return None
        return float(x)
    except (TypeError, ValueError):
        return None


def check_downstream_constraints(ledger: dict) -> list:
    """核对：上游问题登记的"对下游约束"是否被下游的解满足。

    ledger 结构(建模阶段产出，字段缺失一律软跳过该条，不误报)：
    {
      "problems": [
        {"id": "Q1",
         "conclusions": [
           {"quantity": "振打峰值出口浓度", "value": 12.02, "unit": "mg/Nm3",
            "kind": "peak",                       # peak/steady/bound/...
            "imposes": {"on": ["Q2","Q4"], "must_le": 10.0,
                        "note": "峰值也须≤排放限值，非只稳态"}}
         ]},
        {"id": "Q2",
         "observed": {"振打峰值出口浓度": 12.02, "稳态出口浓度": 9.95}}
      ]
    }
    只在"约束齐全 + 下游有对应观测值 + 确凿越界"时判 FAIL。
    """
    fails = []
    probs = ledger.get("problems")
    if not isinstance(probs, list):
        return fails
    # 建下游观测索引：{problem_id: {quantity: value}}
    observed = {}
    for p in probs:
        if not isinstance(p, dict):
            continue
        pid = str(p.get("id", "?"))
        obs = p.get("observed")
        if isinstance(obs, dict):
            observed[pid] = obs
    # 逐条上游约束核对
    for p in probs:
        if not isinstance(p, dict):
            continue
        up = str(p.get("id", "?"))
        for c in (p.get("conclusions") or []):
            if not isinstance(c, dict):
                continue
            imp = c.get("imposes")
            if not isinstance(imp, dict):
                continue  # 没登记约束 → 跳过
            targets = imp.get("on") or []
            if not isinstance(targets, list):
                continue
            qty = c.get("quantity")
            note = imp.get("note", "")
            for tgt in targets:
                tgt = str(tgt)
                tobs = observed.get(tgt)
                if not isinstance(tobs, dict) or qty not in tobs:
                    continue  # 下游没有对应观测值 → 软跳过，不误报
                val = _as_float(tobs.get(qty))
                if val is None:
                    continue
                lim_le = _as_float(imp.get("must_le"))
                lim_ge = _as_float(imp.get("must_ge"))
                if lim_le is not None and val > lim_le * (1 + _REL_TOL):
                    fails.append(
                        f"[{up}→{tgt}] {up} 结论「{qty}={c.get('value')}」要求 {tgt} 满足 ≤{lim_le}，"
                        f"但 {tgt} 实际 {qty}={val:g} 越界。{('（'+note+'）') if note else ''}")
                if lim_ge is not None and val < lim_ge * (1 - _REL_TOL):
                    fails.append(
                        f"[{up}→{tgt}] {up} 结论「{qty}={c.get('value')}」要求 {tgt} 满足 ≥{lim_ge}，"
                        f"但 {tgt} 实际 {qty}={val:g} 不足。{('（'+note+'）') if note else ''}")
    return fails


def check_shared_quantity_drift(fig_dir: Path) -> list:
    """通用兜底(不依赖 ledger)：扫各问 results.json 顶层同名标量，跨问差异过大就 WARN。
    只告警不阻塞——同名量在不同问取值差很多，往往是口径漂移或结论不一致的信号。"""
    warns = []
    keys = {}   # quantity -> [(problem_file, value)]
    try:
        cands = sorted(fig_dir.glob("problem_*_results.json"))
    except Exception:
        return warns
    for f in cands:
        d = _load_json(f)
        if not isinstance(d, dict):
            continue
        for k, v in d.items():
            fv = _as_float(v)
            if fv is None:
                continue
            keys.setdefault(k, []).append((f.name, fv))
    for k, lst in keys.items():
        if len(lst) < 2:
            continue
        vals = [v for _, v in lst]
        lo, hi = min(vals), max(vals)
        base = max(abs(lo), abs(hi), 1e-12)
        if (hi - lo) / base > _CROSS_DIFF_WARN:
            src = ", ".join(f"{n}={v:g}" for n, v in lst)
            warns.append(f"[跨问同名量差异] 「{k}」在各问取值不一致({src}) —— 请确认是否应一致。")
    return warns


def main() -> int:
    ap = argparse.ArgumentParser(description="跨子问题一致性终检")
    ap.add_argument("--ledger", default="CROSS_PROBLEM_LEDGER.json",
                    help="跨问结论/约束登记表(建模阶段产出)")
    ap.add_argument("--figdir", default="figures", help="各问 results.json 所在目录")
    args = ap.parse_args()

    ledger = _load_json(Path(args.ledger))
    fig_dir = Path(args.figdir)
    drift_warns = check_shared_quantity_drift(fig_dir) if fig_dir.is_dir() else []

    if not isinstance(ledger, dict) or not ledger.get("problems"):
        print("⚠ 跨问一致性终检：未找到有效 CROSS_PROBLEM_LEDGER.json，跳过硬对撞(不阻塞)。")
        print("  提示：建模阶段(comp-modeling Step5.5)登记各问关键结论+对下游约束后，本闸才能对撞。")
        for w in drift_warns:
            print("  " + w)
        return 2

    fails = check_downstream_constraints(ledger)
    print("=== 跨子问题一致性终检 ===")
    if drift_warns:
        print("— 同名量差异(WARN，不阻塞)：")
        for w in drift_warns:
            print("   " + w)
    if fails:
        print("❌ 检出跨问矛盾 %d 处(必修)：" % len(fails))
        for f in fails:
            print("   " + f)
        print("⛔ 请回 comp-modeling/comp-code：把上游问题的结论作为约束纳入下游，或修正矛盾结论。")
        return 1
    print("✅ PASS — 各问登记的下游约束均被满足，无跨问矛盾。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
