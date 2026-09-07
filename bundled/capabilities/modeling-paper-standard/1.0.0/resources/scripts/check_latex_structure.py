#!/usr/bin/env python3
"""Check the fixed visible section order in a Chinese modeling-paper LaTeX source."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from check_latex_layout_risks import expand_inputs


STANDARD_HEADINGS = [
    "问题重述",
    "问题分析",
    "模型假设",
    "符号说明",
    "模型建立与求解",
    "模型检验",
    "模型优缺点评价",
    "参考文献",
]

DATA_ANALYSIS_HEADINGS = [
    "问题重述",
    "问题分析",
    "模型假设",
    "符号说明",
    "数据处理与概览",
    "模型建立与求解",
    "模型检验",
    "模型优缺点评价",
    "参考文献",
]

CHINESE_QUESTION_NUMERALS = "一二三四五六七八九十"


def strip_comments(text: str) -> str:
    return re.sub(r"(?<!\\)%.*", "", text)


def compact(text: str) -> str:
    return re.sub(r"\s+", "", text)


def is_bold_phrase(source: str, phrase: str) -> bool:
    escaped = re.escape(phrase)
    textbf = rf"\\textbf\{{[^{{}}]*{escaped}[^{{}}]*\}}"
    bfseries = rf"\{{\\bfseries[^{{}}]*{escaped}[^{{}}]*\}}"
    paperkey = rf"\\paperkey\{{[^{{}}]*{escaped}[^{{}}]*\}}"
    defined_key = r"\\newcommand\{\\paperkey\}\[1\]\{\{\\heiti\\bfseries\s*#1\}\}"
    return bool(re.search(textbf, source) or re.search(bfseries, source) or (re.search(defined_key, source) and re.search(paperkey, source)))


def question_model_block(
    source: str, idx: int, model_chapter: int, next_major_title: str
) -> str | None:
    """Return one question-model block, excluding its parent title."""
    if idx < 1 or idx > len(CHINESE_QUESTION_NUMERALS):
        return None
    q = CHINESE_QUESTION_NUMERALS[idx - 1]
    title_prefix = f"{model_chapter}.{idx}问题{q}"
    match = re.search(re.escape(title_prefix), source)
    if match is None:
        return None
    body_start = match.end()
    end_candidates = [
        pos
        for marker in (
            (
                f"{model_chapter}.{idx + 1}问题{CHINESE_QUESTION_NUMERALS[idx]}"
                if idx < len(CHINESE_QUESTION_NUMERALS)
                else ""
            ),
            next_major_title,
        )
        if marker and (pos := source.find(marker, body_start)) >= 0
    ]
    body_end = min(end_candidates) if end_candidates else len(source)
    return source[body_start:body_end]


def heading_position(source: str, phrases: tuple[str, ...]) -> int:
    """Find a semantic phrase inside a LaTeX subheading, not ordinary prose."""
    alternatives = "|".join(re.escape(phrase) for phrase in phrases)
    pattern = (
        rf"\\(?:ThirdTitle|(?:paper)?(?:subsubsection|paragraph|subparagraph))\*?"
        rf"\{{[^{{}}]*(?:{alternatives})[^{{}}]*\}}"
    )
    match = re.search(pattern, source)
    return match.start() if match else -1


def internal_marker_position(
    source: str, step: int, phrases: tuple[str, ...]
) -> int:
    """Find a bold body marker inside a third-level section."""
    alternatives = "|".join(re.escape(phrase) for phrase in phrases)
    step_guard = rf"(?=[^{{}}]*Step{step}(?:[:：、.]|\\quad)?)"
    patterns = (
        rf"\\textbf\{{{step_guard}[^{{}}]*(?:{alternatives})[^{{}}]*\}}",
        rf"\{{\\bfseries{step_guard}[^{{}}]*(?:{alternatives})[^{{}}]*\}}",
    )
    positions = [
        match.start()
        for pattern in patterns
        if (match := re.search(pattern, source, flags=re.IGNORECASE)) is not None
    ]
    return min(positions) if positions else -1


def count_optimization_constraint_rows(summary: str) -> int:
    """Approximate the row count after s.t. in a compact LaTeX summary block."""
    if "s.t." not in summary.lower():
        return 0
    constraint_source = summary.lower().split("s.t.", 1)[1]
    return len(re.findall(r"\\\\", constraint_source)) + 1


def semantic_group_count(source: str, groups: tuple[tuple[str, ...], ...]) -> int:
    """Count how many required semantic groups have at least one visible signal."""
    return sum(
        any(re.search(pattern, source, re.IGNORECASE) for pattern in group)
        for group in groups
    )


def has_math_definition(source: str) -> bool:
    """Detect a displayed/inline mathematical definition without imposing formula counts."""
    return bool(
        re.search(
            r"\\begin\{(?:equation|align|aligned|gather|cases|array)\}|"
            r"\\\[|\\in|\\leq?|\\geq?|(?<![<>])=(?!=)",
            source,
            re.IGNORECASE,
        )
    )


def optimization_content_findings(
    idx: int,
    decision: str,
    objective: str,
    constraints: str,
    solve: str,
    result: str,
) -> list[str]:
    """Audit information coverage, not word count, for one optimization question."""
    findings: list[str] = []

    decision_groups = (
        (r"索引", r"集合", r"下标", r"[ijk]\s*\\in"),
        (r"连续", r"整数", r"0[-—]?1", r"二元", r"布尔", r"取值", r"定义域", r"上界", r"下界", r"非负"),
        (r"单位", r"量纲", r"维度"),
        (r"方案", r"决策", r"选择", r"安排", r"分配", r"调度", r"路径", r"顺序", r"布局"),
    )
    if not has_math_definition(decision):
        findings.append(f"优化类问题 {idx} 的 Step 1 缺少可定位的变量数学定义或取值域")
    if semantic_group_count(decision, decision_groups) < 3:
        findings.append(
            f"优化类问题 {idx} 的 Step 1 信息过薄：应说明索引/集合、变量类型与范围、"
            "单位/维度以及变量如何组成可执行方案（至少覆盖其中三类）"
        )

    objective_groups = (
        (r"组成", r"分解", r"目标项", r"成本", r"收益", r"利润", r"风险", r"距离", r"时间", r"面积", r"能耗", r"误差", r"损失", r"惩罚"),
        (r"含义", r"来源", r"根据", r"题意", r"由.+得到", r"计算"),
        (r"单位", r"量纲", r"权重", r"系数", r"归一化", r"标准化", r"优先级", r"罚项"),
    )
    if not re.search(r"\\(?:min|max)(?:_|\b)|最小化|最大化", objective, re.IGNORECASE):
        findings.append(f"优化类问题 {idx} 的 Step 2 缺少明确的优化方向与目标表达")
    if semantic_group_count(objective, objective_groups) < 2:
        findings.append(
            f"优化类问题 {idx} 的 Step 2 信息过薄：应拆解目标组成，解释各项来源/含义，"
            "并说明单位、权重、系数或量纲处理（按本题适用项覆盖）"
        )

    constraint_groups = (
        (r"题目", r"实际", r"规则", r"要求", r"限制", r"保证", r"必须"),
        (r"表示", r"说明", r"含义", r"因为", r"因此", r"对应"),
        (r"索引", r"所有", r"任意", r"范围", r"边界", r"上界", r"下界", r"定义域"),
        (r"资源", r"容量", r"物理", r"几何", r"时间", r"顺序", r"逻辑", r"互斥", r"指派", r"启停", r"安全", r"业务", r"守恒", r"路径", r"覆盖", r"连通"),
    )
    if not has_math_definition(constraints):
        findings.append(f"优化类问题 {idx} 的 Step 3 缺少约束公式")
    if semantic_group_count(constraints, constraint_groups) < 3:
        findings.append(
            f"优化类问题 {idx} 的 Step 3 信息过薄：每类约束应形成“现实规则—数学表达—"
            "索引/单位—边界含义”的本题化解释"
        )

    solve_groups = (
        (r"适合", r"选择理由", r"模型结构", r"问题规模", r"由于"),
        (r"编码", r"映射", r"输入", r"输出", r"变量传入", r"方案复原", r"还原"),
        (r"初始化", r"初始", r"参数", r"随机种子", r"容差", r"求解器设置"),
        (r"可行", r"修复", r"投影", r"约束处理", r"惩罚"),
        (r"停止", r"终止", r"收敛", r"迭代次数", r"时间上限", r"最优性", r"上下界"),
    )
    if semantic_group_count(solve, solve_groups) < 4:
        findings.append(
            f"优化类问题 {idx} 的模型求解信息过薄：应覆盖算法适配理由、模型/变量映射、"
            "初始化或参数、可行性处理、停止/收敛条件中的至少四类"
        )

    result_required = (
        (r"方案", r"决策变量", r"安排", r"选择", r"路径", r"分配", r"调度", r"布局"),
        (r"目标值", r"目标函数", r"成本", r"收益", r"利润", r"距离", r"时间", r"面积", r"能耗", r"误差", r"HPWL"),
        (r"约束", r"可行", r"松弛", r"边界", r"满足", r"余量"),
    )
    result_optional = (
        (r"基线", r"候选", r"相比", r"比较", r"提升", r"降低", r"差异"),
        (r"敏感", r"稳定", r"多次", r"范围", r"运行时间", r"最优性", r"下界", r"上界", r"边界"),
    )
    if semantic_group_count(result, result_required) < 3:
        findings.append(
            f"优化类问题 {idx} 的结果分析信息过薄：必须同时报告可执行方案、目标值/组成和约束满足情况"
        )
    if semantic_group_count(result, result_optional) < 1:
        findings.append(
            f"优化类问题 {idx} 的结果分析缺少基线/候选比较或敏感性、稳定性、最优性边界中的至少一类证据"
        )

    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("tex", type=Path)
    parser.add_argument("--questions", type=int, default=None)
    parser.add_argument(
        "--paper-type",
        choices=("standard", "data-analysis"),
        default="standard",
        help="Use the dedicated data-analysis chapter route when requested.",
    )
    parser.add_argument(
        "--optimization-question",
        type=int,
        action="append",
        default=[],
        help=(
            "Repeat for each optimization subquestion whose model-chapter structure "
            "should be audited, for example: --optimization-question 2"
        ),
    )
    parser.add_argument(
        "--optimization-constraint-min",
        action="append",
        default=[],
        metavar="QUESTION:COUNT",
        help=(
            "Minimum number of constraint rows expected in one optimization "
            "summary, derived from its verified constraint-coverage matrix; "
            "repeat as needed, for example: 2:6"
        ),
    )
    args = parser.parse_args()

    optimization_constraint_min: dict[int, int] = {}
    for item in args.optimization_constraint_min:
        match = re.fullmatch(r"(\d+):(\d+)", item)
        if match is None or int(match.group(2)) < 1:
            parser.error(
                "--optimization-constraint-min must use QUESTION:COUNT with "
                "positive integers, for example 2:6"
            )
        optimization_constraint_min[int(match.group(1))] = int(match.group(2))

    raw_source = strip_comments(expand_inputs(args.tex))
    source = compact(raw_source)
    findings: list[str] = []

    data_route = args.paper_type == "data-analysis"
    fixed_headings = DATA_ANALYSIS_HEADINGS if data_route else STANDARD_HEADINGS
    model_chapter = 6 if data_route else 5
    validation_chapter = 7 if data_route else 6
    evaluation_chapter = 8 if data_route else 7
    reference_chapter = 9 if data_route else 8

    data_heading_titles = (
        "五、数据处理与概览",
        "五、数据处理",
        "五、数据预处理",
        "五、数据侧写",
        "五、数据概览",
    )
    data_heading_title = next(
        (title for title in data_heading_titles if title in source), None
    )

    positions: list[int] = []
    for heading in fixed_headings:
        if data_route and heading == "数据处理与概览":
            pos = source.find(data_heading_title) if data_heading_title else -1
        else:
            pos = source.find(heading)
        if pos < 0:
            findings.append(f"缺少固定板块：{heading}")
        positions.append(pos)

    present = [p for p in positions if p >= 0]
    if present != sorted(present):
        findings.append("固定板块顺序与模板不一致")

    required_visible = [
        "一、问题重述",
        "二、问题分析",
        "三、模型假设",
        "四、符号说明",
    ]
    if data_route:
        required_visible.extend(
            [
                "六、模型建立与求解",
                "七、模型检验",
                "八、模型优缺点评价",
                "九、参考文献",
            ]
        )
        if data_heading_title is None:
            findings.append("源码中未发现显式可见的数据类第五章标题")
    else:
        required_visible.extend(
            [
                "五、模型建立与求解",
                "六、模型检验",
                "七、模型优缺点评价",
                "八、参考文献",
            ]
        )
    for title in required_visible:
        if title not in source:
            findings.append(f"源码中未发现显式可见标题：{title}")

    for title in ("1.1问题背景", "1.2问题提出"):
        if title not in source:
            findings.append(f"问题重述缺少固定二级标题：{title}")

    if args.questions is not None:
        chinese = CHINESE_QUESTION_NUMERALS
        for idx in range(1, args.questions + 1):
            if idx > len(chinese):
                findings.append("检查器暂不支持十问以上的小问中文编号")
                break
            q = chinese[idx - 1]
            analysis_label = f"2.{idx}问题{q}的分析"
            legacy_analysis_label = f"1.{idx}问题{q}的分析"
            if analysis_label not in source:
                findings.append(f"缺少逐问标题：{analysis_label}")
            model_label = f"{model_chapter}.{idx}问题{q}"
            if data_route:
                if model_label not in source:
                    findings.append(f"缺少逐问标题前缀：{model_label}")
            else:
                full_model_label = f"{model_label}模型的建立与求解"
                if full_model_label not in source:
                    findings.append(f"缺少逐问标题：{full_model_label}")
            if legacy_analysis_label in source:
                findings.append(
                    f"问题分析小标题沿用了模板局部笔误，应将"
                    f"{legacy_analysis_label}改为{analysis_label}"
                )

            abstract_lead = f"针对问题{q}"
            if abstract_lead not in source:
                findings.append(f"摘要缺少显式逐问引导语：{abstract_lead}")
            elif not is_bold_phrase(source, abstract_lead):
                findings.append(f"摘要逐问引导语未使用黑体加粗：{abstract_lead}")

    establishment_steps = [
        (("决策变量",), "决策变量"),
        (("目标函数",), "目标函数"),
        (("约束条件", "模型约束"), "约束条件"),
        (("模型汇总", "完整模型"), "模型汇总"),
    ]
    for idx in args.optimization_question:
        if idx < 1 or idx > len(CHINESE_QUESTION_NUMERALS):
            findings.append(f"优化小问编号超出检查器支持范围：{idx}")
            continue
        if args.questions is not None and idx > args.questions:
            findings.append(f"优化小问编号 {idx} 超过题目小问总数 {args.questions}")
            continue
        block = question_model_block(
            source,
            idx,
            model_chapter,
            f"{CHINESE_QUESTION_NUMERALS[validation_chapter - 1]}、模型检验",
        )
        if block is None:
            findings.append(
                f"无法定位优化类问题 {idx} 的第 {model_chapter} 章正文"
            )
            continue

        if idx not in optimization_constraint_min:
            findings.append(
                f"优化类问题 {idx} 未提供 --optimization-constraint-min；"
                "应先由题面—公式—变量—代码—证据覆盖矩阵确定期望约束行数"
            )

        peer_steps = [
            (("模型建立", "优化模型的建立"), "模型建立"),
            (("模型求解", "求解方法", "求解算法"), "模型求解"),
            (("结果分析", "求解结果"), "结果分析"),
        ]
        peer_positions: list[int] = []
        for phrases, label in peer_steps:
            pos = heading_position(block, phrases)
            peer_positions.append(pos)
            if pos < 0:
                findings.append(f"优化类问题 {idx} 缺少三级标题：{label}")
        present_peers = [pos for pos in peer_positions if pos >= 0]
        if present_peers != sorted(present_peers):
            findings.append(
                f"优化类问题 {idx} 的三级标题顺序应为：模型建立、模型求解、结果分析"
            )

        model_start, solve_start, result_start = peer_positions
        if model_start >= 0:
            model_end_candidates = [
                pos for pos in (solve_start, result_start) if pos > model_start
            ]
            model_end = min(model_end_candidates) if model_end_candidates else len(block)
            establishment = block[model_start:model_end]
            internal_positions: list[int] = []
            for step, (phrases, label) in enumerate(establishment_steps, start=1):
                pos = internal_marker_position(establishment, step, phrases)
                internal_positions.append(pos)
                if pos < 0:
                    findings.append(
                        f"优化类问题 {idx} 的“模型建立”内部缺少正文步骤："
                        f"Step {step} {label}"
                    )
                if heading_position(establishment, phrases) >= 0:
                    findings.append(
                        f"优化类问题 {idx} 的 Step {step} {label} "
                        "不得写成额外标题层级"
                    )
            present_internal = [pos for pos in internal_positions if pos >= 0]
            if present_internal != sorted(present_internal):
                findings.append(
                    f"优化类问题 {idx} 的“模型建立”内部顺序应为："
                    "决策变量、目标函数、约束条件、模型汇总"
                )
            if len(internal_positions) >= 4 and internal_positions[3] >= 0:
                summary = establishment[internal_positions[3] :]
                if not re.search(r"\\(?:min|max)(?:_|\\b)", summary):
                    findings.append(
                        f"优化类问题 {idx} 的模型汇总未重列 min/max 目标函数"
                    )
                if "s.t." not in summary.lower():
                    findings.append(
                        f"优化类问题 {idx} 的模型汇总缺少 s.t. 约束标记"
                    )
                if "\\left\\{" not in summary and "\\begin{cases}" not in summary:
                    findings.append(
                        f"优化类问题 {idx} 的模型汇总未使用大左括号集中约束"
                    )
                expected_rows = optimization_constraint_min.get(idx)
                if expected_rows is not None and "s.t." in summary.lower():
                    observed_rows = count_optimization_constraint_rows(summary)
                    if observed_rows < expected_rows:
                        findings.append(
                            f"优化类问题 {idx} 的模型汇总仅检测到约 {observed_rows} 行约束，"
                            f"低于约束覆盖矩阵要求的 {expected_rows} 行"
                        )

        validation_pos = heading_position(block, ("模型检验", "局部检验"))
        if validation_pos >= 0 and result_start >= 0 and validation_pos < result_start:
            findings.append(
                f"优化类问题 {idx} 的可选模型检验应位于结果分析之后"
            )

        if (
            model_start >= 0
            and solve_start > model_start
            and result_start > solve_start
            and len(internal_positions) == 4
            and all(pos >= 0 for pos in internal_positions)
            and internal_positions == sorted(internal_positions)
        ):
            decision = establishment[internal_positions[0] : internal_positions[1]]
            objective = establishment[internal_positions[1] : internal_positions[2]]
            constraints = establishment[internal_positions[2] : internal_positions[3]]
            solve = block[solve_start:result_start]
            result_end = (
                validation_pos
                if validation_pos > result_start
                else len(block)
            )
            result = block[result_start:result_end]
            findings.extend(
                optimization_content_findings(
                    idx, decision, objective, constraints, solve, result
                )
            )

    if data_route:
        data_start = source.find(data_heading_title) if data_heading_title else -1
        model_start = source.find("六、模型建立与求解")
        if data_start >= 0 and model_start > data_start:
            data_block = source[data_start:model_start]
            if not re.search(r"描述性?统计|数据概览|数据侧写|分布特征", data_block):
                findings.append("数据类公共数据章缺少描述性统计或数据概览")
            if not re.search(
                r"合并|查询|透视|筛选|聚合|缺失|异常|重复|编码|量纲|单位",
                data_block,
            ):
                findings.append("数据类公共数据章缺少实际数据整合或质量处理")

        if args.questions is not None:
            for idx in range(1, args.questions + 1):
                block = question_model_block(
                    source, idx, model_chapter, "七、模型检验"
                )
                if block is None:
                    continue
                if not re.search(
                    r"数据|样本|变量|指标|特征|字段|时间窗|标签|筛选|聚合|输入",
                    block,
                ):
                    findings.append(f"数据分析类问题 {idx} 未交代本问数据或输入口径")
                if not re.search(rf"{model_chapter}\.{idx}\.\d+", block):
                    findings.append(f"数据分析类问题 {idx} 缺少本题方法/子任务三级标题")
                if not re.search(
                    r"中间结果|结果分析|求解结果|本问结果|结果如|结果见|由表|由图|可知|得到",
                    block,
                ):
                    findings.append(f"数据分析类问题 {idx} 缺少就地结果或分析")
                if re.search(
                    rf"{model_chapter}\.{idx}\.\d+\.\d+", block
                ) or re.search(r"\\(?:paragraph|subparagraph)\*?\{", block):
                    findings.append(f"数据分析类问题 {idx} 出现四级或更深标题")

    for label in (
        f"{evaluation_chapter}.1模型的优点",
        f"{evaluation_chapter}.2模型的缺点",
        f"{evaluation_chapter}.3模型的改进",
    ):
        if label not in source:
            findings.append(f"缺少评价小节：{label}")

    if re.search(r"\\tableofcontents\b", source):
        findings.append("模板禁止论文目录，但发现了 \\tableofcontents")

    keyword_match = re.search(
        r"关键词[：:](.*?)(?:\\end\{abstract\}|\\clearpage|\\newpage|\Z)",
        source,
    )
    if keyword_match and re.search(r"[；;]", keyword_match.group(1)):
        findings.append("关键词之间不得使用分号，必须只用空格分隔")

    if findings:
        print("STRUCTURE_CHECK: FAIL")
        for item in findings:
            print(f"- {item}")
        return 1

    print("STRUCTURE_CHECK: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
