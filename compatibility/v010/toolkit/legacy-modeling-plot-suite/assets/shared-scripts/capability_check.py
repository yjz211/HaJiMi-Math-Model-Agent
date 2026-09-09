# -*- coding: utf-8 -*-
"""能力清单 结构校验 — 第 9 道闸地基（题型无关验收的"契约"本体）。

背景：平台原有的验收铁律(error_prevention 按题型分章、HARD_CONSTRAINTS 清单)全是
数模专属——物理约束/几何/双算法。用到 NLP/金融科技题就"语义失明"：题目要五元组抽取/
NER/测试集预测，验收却只查图够不够、页够不够，于是任务退化成小样本分类也能过关。

解法：题目解析阶段产出题型无关的 CAPABILITY_CHECKLIST.json——把每个子问题拆成
**可判定的交付能力项**，每项标注"怎么判"：machine(挂确定性闸自动核)或 semantic(留考官AI)。
本脚本只做**结构校验**(清单本身拆得全不全、字段合不合法)，不判"能力做没做"——
那是第 3 批语义校验器(machine 项跑闸、semantic 项考官)的事。

⛔ 宁可漏报，不可误报：只判"清单结构非法/漏拆子问题"这种零歧义铁证。

用法：
  python _utils/capability_check.py [--checklist CAPABILITY_CHECKLIST.json] [--analysis PROBLEM_ANALYSIS.md]
退出码：0=结构合法 1=结构非法/漏拆 2=无清单（跳过不阻断，但会提示补）

CAPABILITY_CHECKLIST.json 约定：
  {"problem_id": "2024C",
   "n_subproblems": 4,
   "capabilities": [
     {"id":"P1-C1","subproblem":1,"name":"事件五元组抽取","judge":"machine",
      "criterion":"产物每条含(主体,事件类型,客体,时间,地点)五字段且非空",
      "required_output":"output/events.json","machine_check":"delivery"},
     {"id":"P1-C2","subproblem":1,"name":"指代消解","judge":"semantic",
      "criterion":"代词/简称正确回指到实体，非字符串匹配",
      "falsifiable_check":"抽取结果带 span 起止位置且抽取器非纯 str.find 词典；否则判不成立"}
   ]}

falsifiable_check（可证伪断言，方向无关，comp-code 据此生成 validate_capability 运行时硬断言）：
  用一句话写清"代码里怎样算真做到、什么情况判不成立、不成立就 raise"。方向无关，由本题作者写：
    - NLP 真伪判别："去泄漏后独立测试 AUC 显著>0.5，且标签不来自 file_id/文件名；否则判不成立"
    - 优化题："该硬约束进了求解器模型(非事后配平)，最优解满足全部约束；越界则判不成立"
    - CV 分割："输出为逐像素 mask 且 IoU 在留出集>阈值；只输出分类标签则判不成立"
  semantic 项 + 非 delivery 的 machine 项必填（降维高发区）；delivery 项可不填。
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

_VALID_JUDGE = {"machine", "semantic"}
# machine 项允许挂的闸（与已部署的确定性闸对应）
_VALID_CHECK = {"delivery", "leakage", "ingest", "constraint", "facts", "custom"}


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _detect_n_subproblems(analysis_path: Path):
    """从 PROBLEM_ANALYSIS.md 抓'本赛题共 X 个子问题'的声明，用于交叉核对清单是否漏拆。
    抓不到返回 None（不据此判 FAIL，只在能抓到时做一致性校验）。"""
    txt = _read(analysis_path)
    if not txt.strip():
        return None
    m = re.search(r"本赛题共\s*([0-9一二三四五六七八九十]+)\s*个子问题", txt)
    if not m:
        return None
    s = m.group(1)
    if s.isdigit():
        return int(s)
    cn = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
          "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
    return cn.get(s)


# 要出活的句子类型：这些句子意味着题目要求某项能力，必须被能力清单认领
_DELIVER_TYPES = ("决策", "目标", "机制")


def _parse_deliver_sentences(analysis_path: Path):
    """从 Step 5.6 逐句拆解表抓"决策/目标/机制"类句子的句号(S1/S2…)。
    这些是"题目要求交付某能力"的句子，必须被能力清单 source_sentence 认领。
    抓不到（无表/格式不符）返回 None —— 不据此判 FAIL（宁漏勿误），只在能抓到时核认领。"""
    txt = _read(analysis_path)
    if not txt.strip():
        return None
    deliver = set()
    found_table = False
    for line in txt.splitlines():
        if "|" not in line:
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 3:
            continue
        # 句号列形如 S1/S12（容忍全角空格）；类型列含 决策/目标/机制
        sid = cells[0].replace("　", "")
        m = re.fullmatch(r"[Ss](\d+)", sid)
        if not m:
            continue
        found_table = True
        type_cell = cells[2]
        if any(t in type_cell for t in _DELIVER_TYPES):
            deliver.add(f"S{m.group(1)}")
    return deliver if found_table else None


def _validate(data: dict, analysis_path: Path):
    """结构校验，返回 (hard_fails, warns)。"""
    hard, warn = [], []
    caps = data.get("capabilities")
    if not isinstance(caps, list) or not caps:
        return ["CAPABILITY_CHECKLIST.json 缺 capabilities 列表或为空——"
                "至少要把每个子问题拆出 1 条可判定能力项。"], []

    seen_ids = set()
    subs_covered = set()
    for i, c in enumerate(caps):
        tag = c.get("id", f"#{i}") if isinstance(c, dict) else f"#{i}"
        if not isinstance(c, dict):
            hard.append(f"能力项 {tag} 不是对象")
            continue
        # 必填字段
        for f in ("id", "subproblem", "name", "judge", "criterion"):
            if not c.get(f) and c.get(f) != 0:
                hard.append(f"能力项 {tag} 缺必填字段「{f}」")
        # id 唯一
        cid = c.get("id")
        if cid in seen_ids:
            hard.append(f"能力项 id「{cid}」重复")
        seen_ids.add(cid)
        # judge 合法
        judge = c.get("judge")
        if judge not in _VALID_JUDGE:
            hard.append(f"能力项 {tag} 的 judge=「{judge}」非法，只能是 machine/semantic")
        # machine 项必须指明挂哪个闸 + 交付产物
        mc = None
        if judge == "machine":
            mc = c.get("machine_check")
            if mc not in _VALID_CHECK:
                hard.append(f"能力项 {tag} 标了 machine 却没写合法 machine_check"
                            f"（{'/'.join(sorted(_VALID_CHECK))}），无法挂到确定性闸")
            if mc == "delivery" and not c.get("required_output"):
                hard.append(f"能力项 {tag} 用 delivery 闸核，必须写 required_output（产物路径）")
        # falsifiable_check：可证伪断言（方向无关，comp-code 据此生成 validate_capability）。
        #   semantic 项 + 非 delivery 的 machine 项必须有——它们靠"判断/算法"验，是降维冒充高发区；
        #   delivery 项（产物存在性已够硬）可不填。缺失即 FAIL，逼"何为真做到"在源头写死。
        if (judge == "semantic" or (judge == "machine" and mc != "delivery")) \
                and not c.get("falsifiable_check"):
            hard.append(f"能力项 {tag} 缺 falsifiable_check（可证伪断言）——"
                        "这类能力最易被代理指标/降维冒充，必须写清'代码里怎样算真做到、"
                        "什么情况判不成立'，供 comp-code 生成 validate_capability 运行时硬断言。")
        # subproblem 归一化：必填校验接受字符串"1"，覆盖统计也必须接受，否则 "1"(字符串)
        # 必填过关却不计入覆盖 → 误报"子问题一条能力项都没有" HARD FAIL，且 AI 看必填没问题查不出原因（死循环）。
        sp = c.get("subproblem")
        if isinstance(sp, bool):
            pass
        elif isinstance(sp, int):
            subs_covered.add(sp)
        elif isinstance(sp, float) and sp.is_integer():
            subs_covered.add(int(sp))
        elif isinstance(sp, str):
            m = re.search(r"\d+", sp)     # "1" / "问题1" / "S1" / "子问题3" 都能归一
            if m:
                subs_covered.add(int(m.group()))

    # 逐句认领核对：Step 5.6 里"决策/目标/机制"类句子必须被能力清单 source_sentence 认领
    deliver_sents = _parse_deliver_sentences(analysis_path)
    if deliver_sents:                       # 抓到了逐句拆解表且有要出活的句子才核（宁漏勿误）
        claimed = set()
        for c in caps:
            if not isinstance(c, dict):
                continue
            src = c.get("source_sentence")
            if isinstance(src, str):
                claimed.update(re.findall(r"[Ss](\d+)", src))
            elif isinstance(src, list):
                for s in src:
                    claimed.update(re.findall(r"[Ss](\d+)", str(s)))
        claimed = {f"S{n}" for n in claimed}
        orphan = sorted(deliver_sents - claimed, key=lambda x: int(x[1:]))
        if orphan:
            hard.append(
                f"题面逐句拆解里这些'决策/目标/机制'句 {orphan} 没有任何能力项认领"
                "（能力项的 source_sentence 没引用它们）——意味着题目明确要出活的要求漏进了能力清单，"
                "正是'任务降维/漏做'的源头。请为每个漏认领的句子补出对应能力项，"
                "或在该句确属背景时把逐句表里的类型改对。")

    # 与 PROBLEM_ANALYSIS 声明的子问题数交叉核对（能抓到才校验）
    n_decl = data.get("n_subproblems")
    n_from_analysis = _detect_n_subproblems(analysis_path)
    n_expected = n_from_analysis or n_decl
    if isinstance(n_expected, int) and n_expected > 0:
        missing = [k for k in range(1, n_expected + 1) if k not in subs_covered]
        if missing:
            hard.append(f"子问题 {missing} 在能力清单里一条能力项都没有——"
                        f"题目共 {n_expected} 个子问题，每个都必须至少拆出 1 条可判定能力。"
                        "漏拆的子问题下游无法验收，极易被做成'最小演示'蒙混。")
    if n_from_analysis and n_decl and n_from_analysis != n_decl:
        warn.append(f"清单 n_subproblems={n_decl} 与 PROBLEM_ANALYSIS 声明的 {n_from_analysis} 不一致，请核对。")
    return hard, warn


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--checklist", default="CAPABILITY_CHECKLIST.json")
    ap.add_argument("--analysis", default="PROBLEM_ANALYSIS.md")
    args = ap.parse_args()

    clpath = Path(args.checklist)
    if not clpath.is_file():
        print(f"[capability_check] 无 {clpath.name} —— 建议题目解析阶段产出能力清单，"
              "否则验收退化成只查图/页/文件数，看不见'题目要的能力做没做'。跳过（不阻断）")
        return 2
    try:
        data = json.loads(_read(clpath))
    except (json.JSONDecodeError, ValueError) as e:
        print(f"❌ {clpath.name} 不是合法 JSON：{e}")
        return 1
    if not isinstance(data, dict):
        print(f"❌ {clpath.name} 顶层应为对象 {{problem_id, capabilities:[...]}}")
        return 1

    hard, warn = _validate(data, Path(args.analysis))
    n_caps = len(data.get("capabilities", []))
    n_machine = sum(1 for c in data.get("capabilities", [])
                    if isinstance(c, dict) and c.get("judge") == "machine")

    for w in warn:
        print(f"  [WARN] {w}")
    if hard:
        print(f"❌ HARD FAIL {len(hard)} 条 —— 能力清单结构不合格：")
        for h in hard:
            print(f"  ✗ {h}")
        print("  修复后重跑本闸直到 0。能力清单是题型无关验收的契约，结构不合格下游没法逐项验收。")
        return 1
    print(f"✅ 能力清单结构合格：{n_caps} 条能力项（machine {n_machine} / semantic {n_caps - n_machine}），"
          "每个子问题都有覆盖。machine 项将由确定性闸自动核，semantic 项交严格模式考官逐条判。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
