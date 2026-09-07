# -*- coding: utf-8 -*-
"""声称↔代码 确定性静态扫描 — 第 3 道闸（红线一/三的确定性突破）。

两层，都是"代码有没有背叛建模声称"的方向无关核对：

  (A) 通用合同（主）：读 MODELING_REPORT 里的 <!-- METHOD_CLAIMS_MACHINE ... --> 块，
      每条声称由建模阶段填 must（必须出现的实现铁证）/ forbid（禁止出现的降级签名）。
      脚本零方向知识，只执行建模者写的签名——数模/NLP/CV/RL/时序 全靠同一引擎，
      加新方向不改脚本、不堆规则库。must 缺 或 forbid 命中 → HARD FAIL。
  (B) 内置安全网（兜底）：整数规划 / 随机仿真两条通用灾难级降级，建模阶段就算
      没写合同也兜住。仅此两条，不按方向扩充（扩充是 A 的活）。

⛔ 设计铁律：宁可漏报，不可误报。
  - must：至少命中一个即算实现（need_any 语义）；forbid：命中任一即铁证降级。
  - 建模者把签名写弱了 → 核得弱（同能力清单"漏列即漏核"的天花板），但远胜无机器核，
    且逼建模阶段把"何为忠实实现"想清楚。绝不替建模者猜方向，避免扫描器自成新 bug 源。

用法：
  python _utils/claim_code_check.py [--modeling MODELING_REPORT.md] [--codedir code]
退出码：0=无 HARD FAIL（可能有 WARN） 1=有 HARD FAIL（阻断） 2=无法检查（缺文件，跳过不阻断）
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


def _load_code(codedir: Path) -> str:
    """把 code/ 下所有 .py 拼成一坨源码文本（去掉注释行，避免注释里的词造成误判）。"""
    buf = []
    if not codedir.is_dir():
        return ""
    for f in sorted(codedir.rglob("*.py")):
        for line in _read(f).splitlines():
            s = line.strip()
            if s.startswith("#"):        # 整行注释跳过（防注释里写 poisson 骗过检测）
                continue
            buf.append(line)
    return "\n".join(buf)


# ---- 规则库：每条 = (声称触发词, 该方法必备的 API 标记集, 反证标记, 人话说明) ----
# claim_kw: 在声称文本里出现任一即触发该规则
# need_any: 代码里必须至少命中一个（铁证）；全 0 → HARD FAIL
# 只收录"命中即铁证、缺失即铁证"的强规则，模糊的不进这里（留给第 4 层）。
RULES = [
    {
        "name": "整数规划(整数决策变量)",
        "claim_kw": [r"整数规划", r"混合整数", r"\bMILP\b", r"\bMIP\b", r"integer program"],
        "need_any": [r"LpInteger", r"cat\s*=\s*['\"]Integer['\"]", r"GRB\.INTEGER",
                     r"vtype\s*=\s*['\"]?I", r"integrality\s*=", r"cp_model", r"NewIntVar",
                     r"Bool(ean)?Var", r"LpBinary", r"cat\s*=\s*['\"]Binary['\"]"],
        "hint": "声称整数规划，但代码里找不到任何整数/0-1 变量标记"
                "（LpInteger/cat=Integer/GRB.INTEGER/integrality=/NewIntVar 等）。"
                "若实际用 scipy.optimize.linprog 且变量全连续 → 名不副实，改代码或改声称。",
    },
    {
        "name": "随机仿真(泊松到达/指数服务/蒙特卡洛/排队)",
        # ⛔ 裸词 排队/泊松/Poisson 会被论文背景+文献综述误命中（"交通排队现象""数据服从泊松分布"）
        #   → 方法明明是确定性优化却被判"声称随机仿真但没实现" HARD FAIL。收紧成带方法意图的词组，
        #   强信号词（蒙特卡洛/M/M//离散事件/随机仿真/到达过程）保留（背景里罕见）。宁漏勿误。
        "claim_kw": [r"蒙特卡洛", r"Monte\s*Carlo", r"\bM/M/", r"离散事件", r"随机仿真", r"到达过程",
                     r"泊松到达", r"泊松过程", r"[Pp]oisson\s*(?:arrival|process|到达|过程)",
                     r"排队(?:仿真|模型|系统|网络|论)"],
        # ⛔ 铁证只认"到达过程 + 队列/事件结构"，故意不收 exponential/expovariate——
        #   因为"给固定值加一点指数噪声"也用 exponential，收了它就会把红线三放过去。
        #   真排队/离散事件仿真必然有：泊松到达采样 或 队列/事件堆 或 到达时刻推进。
        "need_any": [r"\.poisson\s*\(", r"rng\.poisson", r"np\.random\.poisson",
                     r"\bqueue\b", r"heapq", r"simpy", r"interarrival",
                     r"到达时刻", r"到达间隔", r"arrival_time", r"event_list", r"SimTime"],
        "hint": "声称泊松/排队/蒙特卡洛仿真，但代码里找不到到达过程采样或队列/事件结构"
                "（poisson 到达 / queue / heapq / 到达时刻推进）。"
                "若只是给固定响应时间加一点指数噪声（如 base + exponential(0.3)）→ 不是仿真，"
                "必须补真到达采样+队列状态，或把声称改成'解析近似/敏感性扰动'。",
    },
]

# 反误判：need_any 里 exponential/queue 等词太常见，需配合"确实声称了随机仿真"才判。
# 已由 claim_kw 门控（先声称才检查），此处不再额外放宽。


def _hit_any(patterns, text) -> int:
    return sum(1 for p in patterns if re.search(p, text, re.IGNORECASE))


def _safe_search(pat: str, text: str) -> bool:
    """按正则搜；正则非法则退化为字面量搜（防建模者写的模式编译报错拖垮整闸）。"""
    try:
        return re.search(pat, text, re.IGNORECASE) is not None
    except re.error:
        return re.search(re.escape(pat), text, re.IGNORECASE) is not None


def _parse_contract(claim_text: str):
    """解析 MODELING_REPORT 里的机器可核合同块（方向无关，执行建模者自己写的签名）。

    格式（写在 MODELING_REPORT.md 任意处）：
      <!-- METHOD_CLAIMS_MACHINE
      M1 | must: LpInteger, GRB.INTEGER | forbid: 就近配车, p_median
      M2 | must: from_pretrained | forbid: LogisticRegression
      -->
    语义：must = 至少命中一个（need_any，防误判）；forbid = 命中任一即降级铁证 → FAIL。
    返回 [{id, must:[...], forbid:[...]}]；无合同块返回 []。
    """
    m = re.search(r"<!--\s*METHOD_CLAIMS_MACHINE\s*(.*?)-->", claim_text, re.DOTALL | re.IGNORECASE)
    if not m:
        return []
    rows = []
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = [p.strip() for p in line.split("|")]
        cid = parts[0] if parts else "?"
        must, forbid = [], []
        for seg in parts[1:]:
            low = seg.lower()
            if low.startswith("must:"):
                must = [x.strip() for x in seg[5:].split(",") if x.strip()]
            elif low.startswith("forbid:"):
                forbid = [x.strip() for x in seg[7:].split(",") if x.strip()]
        if must or forbid:
            rows.append({"id": cid, "must": must, "forbid": forbid})
    return rows


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--modeling", default="MODELING_REPORT.md")
    ap.add_argument("--codedir", default="code")
    args = ap.parse_args()

    modeling = Path(args.modeling)
    codedir = Path(args.codedir)

    claim_text = _read(modeling)
    # 声称来源：优先 MODELING_REPORT.md；再并入 RESULTS.md / paper/sections 里的方法声称
    for extra in ["RESULTS.md"]:
        claim_text += "\n" + _read(Path(extra))
    sec = Path("paper/sections")
    if sec.is_dir():
        for f in sorted(sec.glob("*.tex")):
            claim_text += "\n" + _read(f)

    code_text = _load_code(codedir)

    if not claim_text.strip() or not code_text.strip():
        print("[claim_code_check] 缺 MODELING_REPORT/RESULTS 或 code/*.py，跳过（不阻断）")
        return 2

    hard_fails, warns, checked = [], [], 0
    for rule in RULES:
        claimed = _hit_any(rule["claim_kw"], claim_text)
        if not claimed:
            continue                      # 没声称这类方法 → 不检查（宁漏勿误的第一道门）
        checked += 1
        evidence = _hit_any(rule["need_any"], code_text)
        if evidence == 0:
            hard_fails.append((rule["name"], rule["hint"]))
        else:
            # 有铁证，但仍打一行信息（供第 4 层 AI 参考证据强度）
            print(f"  [OK] {rule['name']}: 声称已触发，代码命中 {evidence} 处必备标记")

    print(f"[claim_code_check] 内置安全网检查了 {checked} 类方法声称")

    # ---- 通用合同核对（方向无关，执行建模阶段自己写的 must/forbid 签名）----
    contract = _parse_contract(claim_text)
    c_fails = []
    for c in contract:
        # must：至少命中一个（宁漏勿误，与内置 need_any 同语义）
        if c["must"] and not any(_safe_search(p, code_text) for p in c["must"]):
            c_fails.append((c["id"], "must",
                            f"声称需实现但代码找不到任一必备签名：{c['must']}"))
        # forbid：命中任一 = 用了建模明令禁止的降级范式（铁证）
        hit_forbid = [p for p in c["forbid"] if _safe_search(p, code_text)]
        if hit_forbid:
            c_fails.append((c["id"], "forbid",
                            f"代码出现建模报告明令禁止的降级签名：{hit_forbid}"))
    if contract:
        print(f"[claim_code_check] 通用合同核对了 {len(contract)} 条 METHOD_CLAIMS 签名")
    else:
        print("  （MODELING_REPORT 无 METHOD_CLAIMS_MACHINE 合同块 —— 仅内置安全网生效，"
              "建议建模阶段补机器可核签名以覆盖本题特有方法）")

    for name, _ in warns:
        print(f"  [WARN] {name}")
    if hard_fails or c_fails:
        total = len(hard_fails) + len(c_fails)
        print(f"❌ HARD FAIL {total} 条 —— 声称的方法与代码实现脱钩（名不副实/降级冒充）：")
        for name, hint in hard_fails:
            print(f"  ✗ [内置] {name}")
            print(f"    → {hint}")
        for cid, kind, msg in c_fails:
            print(f"  ✗ [合同 {cid}·{kind}] {msg}")
        print("  修复：要么把代码补成真正实现该方法，要么把建模报告/正文的声称改成代码真做的事。"
              "（合同 must/forbid 签名由建模阶段针对本题所填，方向无关）")
        return 1
    if checked == 0 and not contract:
        print("  （未触发内置强规则、也无合同签名，本闸未拦截）")
    else:
        print("✅ 内置安全网 + 通用合同：所有声称都与代码实现一致")
    return 0


if __name__ == "__main__":
    sys.exit(main())

