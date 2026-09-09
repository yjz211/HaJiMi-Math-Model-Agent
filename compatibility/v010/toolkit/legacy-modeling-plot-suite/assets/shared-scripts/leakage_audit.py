# -*- coding: utf-8 -*-
"""标签泄漏/循环论证 确定性静态审计 — 第 8 道闸（防"虚高指标冒充真本事"）。

那个案例的病：用可信度公式 C 生成弱标签，又拿 C 去算 AUC，得 roc_auc=0.994——
循环论证的虚高值，去泄漏后真实 AUC 仅 0.377（还不如瞎猜）。这不是训练/测试切分
泄漏（error_prevention 第十二章模板管那个），是"标签源回流评估"，静态难 100% 判，
但有一个几乎零误报的铁证入口：**报了 ≥0.99 的性能指标，却拿不出去泄漏的举证**。

本闸做两件机器能定的事：
  A) 高分举证闸（HARD FAIL，可靠）：扫结果 JSON 里白名单性能指标(auc/accuracy/f1/r2…)，
     只要有 ≥0.99（或 ≥99 百分数），就要求全局能找到去泄漏举证标记（去泄漏/holdout/
     嵌套CV/独立测试集/deleaked…）。找不到 → HARD FAIL，逼作者举证或改。
  B) 弱标签回流提醒（WARN，有误报风险故不阻断）：代码/RESULTS 出现"弱标签/伪标签/
     weak label"生成，却没有"生成弱标签的特征未进入评估"这类声明 → WARN。

⛔ 宁可漏报，不可误报：
  - ≥0.99 本身不等于作弊（有些任务真能到），故不判"作弊"，只判"必须举证"——这几乎零误报。
  - "哪列是标签源"静态判不准，故弱标签回流只 WARN，交严格模式考官/人工看。

用法：
  python _utils/leakage_audit.py [--codedir code] [--results RESULTS.md]
退出码：0=通过（可能WARN） 1=HARD FAIL（高分无举证） 2=无可查内容（跳过不阻断）
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

# 只认这些"分类/判别性能指标"键，避免把 p_value=0.99 / threshold=0.99 这类误当高分。
# ⛔ 故意不收 r2/r_squared/拟合优度：数模曲线拟合/插值题 R²=0.999 是正常拟合优度、
#    无训练测试划分、无泄漏概念，收了会误杀正常拟合题。若 ML 预测题真泄漏，
#    auc/accuracy/f1 会一起虚高、照样被抓，不漏（宁漏勿误：保准确、不误伤拟合题）。
# ⛔ 同名撞车防误伤（宁漏勿误的延伸）：数模/物理题里大量希腊字母转写与英文缩写会与分类
#    指标同名，若裸收会误判 HARD FAIL 逼无谓返工。故：
#    - `kappa` 收紧成只认 Cohen's kappa 明确写法（cohen(s)_kappa / kappa_score /
#      kappa_coef(ficient) / cohen_k），不认裸 `kappa`——后者常是几何曲率 κ=1/R、
#      条件数、绝热指数等物理量（实测 curvature 的 kappa_max=0.996 被误杀）。
#    - 不收裸 `acc`：它常是加速度 acceleration（acc_max 等力学量）；分类准确率用全词
#      `accuracy` 已覆盖，漏不掉。
#    - 不收裸 `ap`/`map`：`map` 常是贝叶斯 MAP（最大后验估计，无量纲后验概率可近 1）、
#      映射/地图量；`ap` 常是接受概率 acceptance probability 等——都是无量纲、单位后缀
#      豁免救不了的真误伤源。目标检测 AP/mAP 指标改用明确写法认（average_precision /
#      ap_score / 带阈值的 ap50·map@50·mean_ap 等），既抓真指标又不误伤 MAP 估计。
_METRIC_KEYS = re.compile(
    r"^(.*_)?("
    r"auc|roc_auc|auroc|auc_pr|"
    r"accuracy|balanced_accuracy|f1|f1_score|precision|recall|"
    r"average_precision|ap_score|mean_ap|m?ap[@_]?\d+|"       # AP/mAP 明确写法(ap50/map@50/map_50)
    r"cohens?_kappa|kappa_score|kappa_coef(?:ficient)?|cohen_k"
    r")(_.*)?$", re.IGNORECASE)

# 物理量单位后缀：带这些后缀的键是"有量纲物理量"，分类性能指标恒为无量纲，故一律豁免，
# 从根上挡住"曲率 1/m、加速度 m/s²、频率 Hz…数值落进 [0.99,1] 被误当高分指标"。
_PHYS_UNIT_SUFFIX = re.compile(
    r"(_1?_?per_[a-z]|_m_per_s|_per_s|_per_m|_m$|_mm$|_cm$|_km$|_s$|_ms$|_hz$|_khz$|"
    r"_rad$|_deg$|_kg$|_n$|_pa$|_kpa$|_mpa$|_j$|_w$|_v$|_a$|_k$|_mol$|"
    r"_1_per_m$|_per_m2$|_m2$|_m3$|_m_per_s2$)", re.IGNORECASE)

# 去泄漏/严谨评估的举证标记（全局出现任一即认为"举了证"）
_JUSTIFY = re.compile(
    r"去泄漏|去除泄漏|防泄漏|deleaked|de-leaked|leak.?free|无泄漏|"
    r"holdout|hold-out|留出|嵌套交叉|nested.?cv|独立测试集|外部测试|out.?of.?sample|"
    r"时序切分|时间切分|滚动预测|walk.?forward|真实标签|人工标注|ground.?truth", re.IGNORECASE)

# 弱标签生成信号
_WEAK_LABEL = re.compile(r"弱标签|伪标签|weak.?label|pseudo.?label|自动打标|规则打标|公式.*标签", re.IGNORECASE)
# 弱标签"已隔离"声明
_WEAK_OK = re.compile(r"未进入.*(评估|模型|特征)|不参与.*评估|标签源.*(剔除|排除|未用)|"
                      r"生成.*标签.*特征.*(剔除|排除|未进)", re.IGNORECASE)


def _read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def _walk_metrics(obj, path=""):
    """递归遍历 JSON，产出 (键路径, 数值) —— 只要数值型叶子。"""
    if isinstance(obj, dict):
        for k, v in obj.items():
            yield from _walk_metrics(v, f"{path}.{k}" if path else str(k))
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from _walk_metrics(v, f"{path}[{i}]")
    elif isinstance(obj, bool):
        return                      # 布尔别当数值
    elif isinstance(obj, (int, float)):
        yield path, float(obj)


def _leaf_key(path: str) -> str:
    """取键路径最后一段（去掉 list 下标），用于匹配指标名。"""
    seg = path.split(".")[-1]
    return re.sub(r"\[\d+\]$", "", seg)


def _high_metric(val: float, key: str) -> bool:
    """判定一个数值是否是"≥0.99 的性能指标"。支持 0.994 与 99.4 两种量纲。
    ⛔ 带物理单位后缀的键（曲率 1/m、加速度 m/s²、频率 Hz…）一律豁免：分类性能指标恒为
    无量纲，有量纲量落进 [0.99,1] 纯属巧合，不能当高分作弊。"""
    if _PHYS_UNIT_SUFFIX.search(key):
        return False
    if not _METRIC_KEYS.match(key):
        return False
    if 0.99 <= val <= 1.0:
        return True
    if 99.0 <= val <= 100.0:        # 百分数写法
        return True
    return False


def _scan_json_metrics(codedir: Path):
    """扫工作区所有结果 JSON，收集"高分性能指标"命中。返回 [(文件, 键, 值)]。"""
    hits = []
    roots = [Path("."), Path("figures"), codedir, codedir / ".." / "figures"]
    seen = set()
    for root in roots:
        if not root.is_dir():
            continue
        for jf in root.glob("*.json"):
            rp = jf.resolve()
            if rp in seen:
                continue
            seen.add(rp)
            try:
                data = json.loads(_read(jf))
            except (json.JSONDecodeError, ValueError):
                continue
            for path, val in _walk_metrics(data):
                if _high_metric(val, _leaf_key(path)):
                    hits.append((jf.as_posix(), path, val))
    return hits


def _gather_text(codedir: Path, results_path: Path) -> str:
    """把 RESULTS.md + 代码 + 建模报告拼一坨，用于全局找举证/弱标签声明。"""
    buf = [_read(results_path), _read(Path("MODELING_REPORT.md"))]
    if codedir.is_dir():
        for f in sorted(codedir.rglob("*.py")):
            buf.append(_read(f))
    return "\n".join(buf)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--codedir", default="code")
    ap.add_argument("--results", default="RESULTS.md")
    args = ap.parse_args()
    codedir = Path(args.codedir)
    results_path = Path(args.results)

    text = _gather_text(codedir, results_path)
    json_hits = _scan_json_metrics(codedir)

    if not text.strip() and not json_hits:
        print("[leakage_audit] 无 RESULTS/代码/结果JSON 可查，跳过（不阻断）")
        return 2

    justified = bool(_JUSTIFY.search(text))
    hard, warn = [], []

    # A) 高分举证闸：结果 JSON 里有 ≥0.99 性能指标，却全局无去泄漏举证 → HARD FAIL
    if json_hits and not justified:
        top = sorted(json_hits, key=lambda x: -x[2])[:5]
        detail = "; ".join(f"{f}::{k}={v:.4g}" for f, k, v in top)
        hard.append(
            f"结果里有 {len(json_hits)} 处 ≥0.99 的性能指标（{detail}），"
            "但 RESULTS/代码/建模报告里找不到任何去泄漏举证标记"
            "（去泄漏/holdout/嵌套CV/独立测试集/真实标签…）。"
            "近乎满分极可能是标签泄漏/循环论证（如用生成弱标签的公式又去算该指标）。"
            "请补：①用去泄漏后的独立评估重算该指标并写进结果；"
            "②在 RESULTS.md 说明评估为何无泄漏。二者缺一不可。")

    # B) 弱标签回流提醒：出现弱标签生成、却无"标签源未进评估"声明 → WARN
    if _WEAK_LABEL.search(text) and not _WEAK_OK.search(text):
        warn.append(
            "检测到弱标签/伪标签生成，但没找到'生成弱标签所用的特征未进入评估模型'这类声明。"
            "务必确认：算指标用的模型没有吃到生成标签的那些列，否则就是循环论证虚高。"
            "（此项静态难判准，仅提醒；严格模式请重点核对。）")

    # 有高分且已举证：给一行确认信息（供严格模式参考）
    if json_hits and justified:
        warn.append(f"有 {len(json_hits)} 处 ≥0.99 高分指标，但已找到去泄漏举证标记（通过）——"
                    "仍建议自查举证是否针对这些高分指标本身。")

    for w in warn:
        print(f"  [WARN] {w}")
    if hard:
        print(f"❌ HARD FAIL {len(hard)} 条 —— 疑似标签泄漏/循环论证：")
        for h in hard:
            print(f"  ✗ {h}")
        print("  修复后重跑本闸直到 0。")
        return 1
    print("✅ 泄漏审计通过：无'≥0.99 高分却零去泄漏举证'的情形。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
