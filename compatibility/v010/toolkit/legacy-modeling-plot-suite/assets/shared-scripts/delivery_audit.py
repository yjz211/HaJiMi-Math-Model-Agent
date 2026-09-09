# -*- coding: utf-8 -*-
"""交付真实性 确定性审计 — 第 7 道闸（防"交付偷工/声称与产物不符/暗中抽样冒充全量"）。

那个外部 AI 戳中的病：流水线的验收是"表面达标"——只查文件在不在、图够不够，
不查"声称的产物是不是真产出了、抽样有没有瞒着说成全量"。本闸做两件机器能定的事：

  A) 交付对账：AI 在结果汇总时产出 DELIVERABLES.json（机器可读的声称清单），
     本闸逐条核对每个声称产物"真实存在且非空"。声称有、实际无/空 → HARD FAIL。
  B) 抽样透明：扫 code/*.py，若用了 sample()/nrows=/[:N] 截断，但 RESULTS.md 里
     找不到任何抽样声明（"抽样/仅用/subset/N of M"…）→ HARD FAIL（暗中抽样冒充全量）。

⛔ 设计铁律：宁可漏报，不可误报（与 claim_code_check / data_ingest_check 同一套哲学）。
  - 交付对账只判"声称了但文件不在/为空"这种零歧义铁证。
  - 抽样透明只在"确实出现抽样调用 且 RESULTS 完全无声明"时判 FAIL；有任何声明就放行。

用法：
  python _utils/delivery_audit.py [--codedir code] [--deliverables DELIVERABLES.json] [--results RESULTS.md]
退出码：0=通过（可能 WARN） 1=HARD FAIL（阻断） 2=无法检查（缺关键文件，跳过不阻断）

DELIVERABLES.json 约定格式：
  {"deliverables": [
     {"path": "figures/problem_1_results.json", "desc": "任务一：事件五元组抽取结果"},
     {"path": "output/predictions_test.csv",    "desc": "测试集预测产物"}
  ]}
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


def _strip_comment_lines(src: str) -> str:
    out = []
    for line in src.splitlines():
        out.append("" if line.strip().startswith("#") else line)
    return "\n".join(out)


# 抽样/截断调用（命中即"用了抽样"）
# ⛔ 只抓"用部分数据冒充全量"的真降采样/截断。刻意排除两类合法写法（否则几乎每个 ML 竞赛题都误 HARD FAIL 空转）：
#   1. train_test_split —— 训练/测试划分，全量都用了只是切分，不是"冒充全量"，不该抓
#   2. df.sample(frac=1) / frac=1.0 —— 全量洗牌(shuffle)，一行不丢，由下方 _SHUFFLE_OK_RE 二次豁免
_SAMPLE_RE = re.compile(r"\.sample\s*\(|\bnrows\s*=\s*\d|\.head\s*\(\s*\d{3,}|\[\s*:\s*\d{3,}\s*\]|\.iloc\s*\[\s*:\s*\d{3,}")
# 全量洗牌豁免：frac=1 / frac=1.0 / frac=1.00（不匹配 frac=0.1 等真降采样；sample 的 frac 不会 >1）
_SHUFFLE_OK_RE = re.compile(r"frac\s*=\s*1(?:\.0+)?(?![\.\d])")
# RESULTS 里的抽样声明（命中任一即"如实声明了"）
_DECLARE_RE = re.compile(r"抽样|采样|仅用|只用|子集|subset|sampl|抽取了|随机选|N\s*of\s*M|总量|全量的|占比|部分数据|下采样|降采样")


def _audit_deliverables(deliv_path: Path):
    """A) 交付对账：DELIVERABLES.json 里每个声称产物必须真实存在且非空。"""
    if not deliv_path.is_file():
        return None, [f"缺 {deliv_path.name} —— 结果汇总阶段应产出机器可读的交付清单，"
                      "否则'声称的产物是否都真产出'无从对账（退化成人工肉眼查）。"]
    try:
        data = json.loads(_read(deliv_path))
        items = data.get("deliverables", data) if isinstance(data, dict) else data
        if not isinstance(items, list):
            return [f"{deliv_path.name} 格式非法：deliverables 应为列表"], []
    except (json.JSONDecodeError, ValueError) as e:
        return [f"{deliv_path.name} 不是合法 JSON：{e}"], []

    hard, warn = [], []
    for it in items:
        rel = it.get("path") if isinstance(it, dict) else it
        desc = (it.get("desc", "") if isinstance(it, dict) else "") or ""
        if not rel:
            continue
        p = Path(rel)
        if not p.exists():
            hard.append(f"声称产出「{rel}」({desc}) —— 但工作区里根本不存在。声称与产物不符，"
                        "要么把它真产出来，要么从 DELIVERABLES.json 删掉这条声称。")
        elif p.is_file() and p.stat().st_size == 0:
            hard.append(f"声称产出「{rel}」({desc}) —— 文件存在但为空(0 字节)，等于没产出。")
    return hard, warn


def _audit_sampling(codedir: Path, results_path: Path):
    """B) 抽样透明：代码用了抽样/截断，RESULTS.md 必须有声明，否则暗中抽样冒充全量。"""
    if not codedir.is_dir():
        return [], []
    sampling_hits = []
    for f in sorted(codedir.rglob("*.py")):
        src = _strip_comment_lines(_read(f))
        lines = src.splitlines()
        for m in _SAMPLE_RE.finditer(src):
            ln = src.count("\n", 0, m.start()) + 1
            # .sample( 命中但同行是全量洗牌 frac=1 → 豁免（不是降采样）
            line_txt = lines[ln - 1] if 0 <= ln - 1 < len(lines) else ""
            if m.group().lstrip().startswith(".sample") and _SHUFFLE_OK_RE.search(line_txt):
                continue
            sampling_hits.append(f"{f.as_posix()}:{ln}")
    if not sampling_hits:
        return [], []
    results_txt = _read(results_path)
    if not results_txt.strip():
        return ([f"代码里有 {len(sampling_hits)} 处抽样/截断（{sampling_hits[0]} 等），"
                 "但没有 RESULTS.md 可核对声明——抽样必须在结果里如实降级声明"
                 "（'抽样 N / 总量 M'），否则等于暗中抽样冒充全量。"], [])
    if not _DECLARE_RE.search(results_txt):
        return ([f"代码里有 {len(sampling_hits)} 处抽样/截断（{sampling_hits[0]} 等），"
                 "但 RESULTS.md 里找不到任何抽样声明（'抽样/仅用/子集/总量'…）。"
                 "暗中抽样冒充全量是重大失真——请在 RESULTS.md 显式写明"
                 "'仅用 N 行 / 总量 M 行、为什么、对结论的影响'。"], [])
    return [], [f"检测到 {len(sampling_hits)} 处抽样/截断，RESULTS.md 已有抽样声明（通过）——"
                "仍请自查声明的 N/M 数值与 DATA_PROFILE.json 的总量一致。"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--codedir", default="code")
    ap.add_argument("--deliverables", default="DELIVERABLES.json")
    ap.add_argument("--results", default="RESULTS.md")
    args = ap.parse_args()

    d_hard, d_warn = _audit_deliverables(Path(args.deliverables))
    s_hard, s_warn = _audit_sampling(Path(args.codedir), Path(args.results))

    # 交付清单缺失：本闸核心输入没有 → 跳过不阻断（但抽样检查仍可独立跑）
    skip_deliv = d_hard is None
    hard = (s_hard or [])
    if not skip_deliv:
        hard = (d_hard or []) + hard
    warn = (d_warn or []) + (s_warn or [])

    for w in warn:
        print(f"  [WARN] {w}")
    if hard:
        print(f"❌ HARD FAIL {len(hard)} 条 —— 交付真实性存在问题：")
        for h in hard:
            print(f"  ✗ {h}")
        print("  修复后重跑本闸直到 0。")
        return 1
    if skip_deliv:
        print("[delivery_audit] 无 DELIVERABLES.json，只跑了抽样透明检查（通过）；"
              "建议结果汇总阶段补交付清单以启用交付对账。")
        return 2
    print("✅ 交付真实性检查通过：声称产物都真实存在且非空，抽样（如有）已如实声明。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
