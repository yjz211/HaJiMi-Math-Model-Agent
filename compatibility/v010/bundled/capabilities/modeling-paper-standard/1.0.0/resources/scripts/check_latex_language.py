#!/usr/bin/env python3
"""Check hard language requirements in Chinese modeling-paper LaTeX."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


INTERNAL_PATTERNS = {
    "内部阶段号": r"阶段[一二三四五六七八九十0-9]+",
    "评价器": r"评价器",
    "事实审计": r"事实审计",
    "冻结结果": r"冻结结果",
    "正式候选": r"正式候选",
    "程序断言": r"程序断言",
    "运行命令": r"运行命令",
    "哈希清单": r"哈希(?:清单)?|SHA-?256",
}

SOFT_TERMS = {
    "审计": "改写为具体检查对象和动作",
    "证据链": "直接写公式、结果、检验或适用边界",
    "字典序": "先写目标的实际优先顺序，再给术语",
    "首线相位": "先写第一条覆盖带从边界何处开始",
    "未检出": "说明在什么分辨率或范围内没有发现什么",
    "可追溯": "正文写具体证据，追溯管理移入支撑材料",
}

# These terms were verified in practice_009 as reader-facing compression of
# several hidden actions or conditions.  They may remain in code/review notes,
# but not in the competition paper's visible prose.
HIGH_COMPRESSION_PATTERNS = {
    "冻结模型/预测": (
        r"冻结(?:模型|预测|结果|参数|证据)",
        "改写为在查看测试结果前确定了什么",
    ),
    "支持域与域内外": (
        r"(?:训练|联合|局部|样本)?支持域|联合域外|(?<!定)域内|(?<!定)域外|跨域",
        "改写为有相近实测数据的范围、在该范围内或超出该范围",
    ),
    "拒识与门控": (
        r"拒识|(?:距离|批次|支持|发布|代理)?门控",
        "改写为给出预测、转入校准或按具体条件进入下一步",
    ),
    "正式层/探索层": (
        r"正式层|探索层",
        "改写为实测方案选择或下一批试验建议",
    ),
    "回填": (
        r"回填",
        "改写为用完整试验结果更新早期判断",
    ),
    "发布门槛": (
        r"(?:代理)?发布门槛|代理发布",
        "改写为模型优于简单基准后再提出新方案",
    ),
    "模型头": (
        r"(?:寿命|轨迹|预测)头",
        "直接写寿命预测模型、容量变化模型或对应任务",
    ),
    "内部证据分层": (
        r"证据层级|证据等级|允许支持的结论|正式候选",
        "直接写结果、适用范围或下一步行动",
    ),
}

EXPLAIN_REQUIRED_TERMS = {
    "序贯": "先写按轮次提出方案、完成试验并更新模型",
    "代理模型": "先写用少量实测点估计未测试方案的结果",
    "泛化": "先写模型在新样本、新策略或新批次上的表现",
    "鲁棒": "直接写参数变化后结果是否稳定以及变化幅度",
    "正则化": "先写限制系数过大或降低过拟合的具体作用",
    "分布迁移": "直接写新批次的数据范围或规律发生变化",
    "不确定性": "说明具体是误差范围、波动还是预测区间",
}

DEFENSIVE_PATTERNS = {
    "否定式边界": (
        r"(?:不能|不可|不应|不得)(?:据此|直接|简单地?|完全|一概|轻易|"
        r"称为|写成|解释为|理解为|证明|说明|保证|替代|代替|用于|给出)"
    ),
    "防御性转折": r"并不(?:表示|意味着|等于)|并非|不代表|未必|不一定",
    "限制式结论": (
        r"(?:只|仅)能(?:说明|表示|支持|用于|视为)|"
        r"尚不足以|不足以(?:说明|证明|支持)|"
        r"暂不(?:下定论|判断|推荐|给出)"
    ),
    "许可式写法": (
        r"只允许|才允许|不允许(?:据此|将|把|直接)?|"
        r"不(?:用于|进入|采用|报告|推荐|外推|发布|称为|称作)"
    ),
}

FIGURE_META_PATTERNS = {
    "图表用途元话语": (
        r"这张图(?:要回答|的用途是|分别回答)",
        r"图\\ref\{[^}]+\}(?:的用途是|专门展示|用于把|的任务是)",
    ),
}

EMPTY_BACKGROUND_PATTERNS = {
    "万能背景句": r"随着(?:社会|时代|科学技术|科技|经济)(?:的)?(?:不断)?(?:发展|进步)",
    "空泛意义句": r"具有(?:十分|非常|极其)?重要的(?:理论|现实|实践|社会|经济)?意义",
}

GENERIC_METHOD_TERMS = re.compile(
    r"(?:算法|模型|聚类|回归|神经网络|随机森林|遗传算法|模拟退火|"
    r"粒子群|迭代|目标函数|约束条件|相关系数)"
)


def _read_source_graph(root: Path) -> list[tuple[Path, str]]:
    r"""Read a main TeX file and local ``\input``/``\include`` dependencies."""
    items: list[tuple[Path, str]] = []
    seen: set[Path] = set()

    def visit(file: Path) -> None:
        resolved = file.resolve()
        if resolved in seen or not resolved.is_file():
            return
        seen.add(resolved)
        text = resolved.read_text(encoding="utf-8")
        items.append((resolved, text))
        for target in re.findall(r"\\(?:input|include)\{([^}]+)\}", text):
            child = resolved.parent / target
            if child.suffix.lower() != ".tex":
                child = child.with_suffix(".tex")
            visit(child)

    visit(root)
    return items


def read_sources(path: Path) -> tuple[str, list[tuple[Path, str]]]:
    if path.is_file():
        items = _read_source_graph(path)
        files = [file for file, _ in items]
    else:
        files = sorted(
            file
            for file in path.rglob("*.tex")
            if not {"build", "final", "tmp"}.intersection(
                part.lower() for part in file.parts
            )
        )
        items = [(file, file.read_text(encoding="utf-8")) for file in files]
    if not files:
        raise FileNotFoundError(f"未找到 LaTeX 文件：{path}")
    return "\n".join(text for _, text in items), items


def strip_comments(text: str) -> str:
    return re.sub(r"(?<!\\)%.*", "", text)


def extract_abstract(text: str) -> str:
    match = re.search(
        r"\\begin\{abstract\}(.*?)\\end\{abstract\}", text, flags=re.S
    )
    return match.group(1) if match else ""


def line_findings(items: list[tuple[Path, str]], pattern: str) -> list[str]:
    regex = re.compile(pattern)
    findings: list[str] = []
    for file, text in items:
        stem = file.stem.lower()
        if stem.startswith("99_") or "appendix" in stem:
            continue
        for line_no, line in enumerate(text.splitlines(), start=1):
            if regex.search(strip_comments(line)):
                findings.append(f"{file}:{line_no}")
    return findings


def body_items(items: list[tuple[Path, str]]) -> list[tuple[Path, str]]:
    return [
        (file, text)
        for file, text in items
        if not (
            file.stem.lower().startswith("99_")
            or "appendix" in file.stem.lower()
        )
    ]


def high_compression_findings(
    items: list[tuple[Path, str]],
) -> list[tuple[str, str, list[str]]]:
    findings: list[tuple[str, str, list[str]]] = []
    visible_items = body_items(items)
    for label, (pattern, advice) in HIGH_COMPRESSION_PATTERNS.items():
        locations = line_findings(visible_items, pattern)
        if locations:
            findings.append((label, advice, locations))
    return findings


def defensive_style_findings(
    items: list[tuple[Path, str]],
) -> tuple[list[str], list[str], int]:
    """Return occurrences, paragraphs with repeated defenses, and text budget."""
    visible_items = body_items(items)
    occurrences: list[str] = []
    clusters: list[str] = []
    combined = re.compile("|".join(f"(?:{p})" for p in DEFENSIVE_PATTERNS.values()))

    for file, text in visible_items:
        for line_no, line in enumerate(text.splitlines(), start=1):
            clean_line = strip_comments(line)
            for match in combined.finditer(clean_line):
                occurrences.append(f"{file}:{line_no}（{match.group(0)}）")

        paragraph: list[tuple[int, str]] = []
        for line_no, raw in enumerate(text.splitlines() + [""], start=1):
            line = strip_comments(raw).strip()
            boundary = not line or re.match(
                r"\\(?:chapter|section|subsection|subsubsection|begin|end)\b",
                line,
            )
            if not boundary:
                paragraph.append((line_no, line))
                continue
            if paragraph:
                joined = " ".join(piece for _, piece in paragraph)
                count = len(combined.findall(joined))
                if count >= 2:
                    clusters.append(f"{file}:{paragraph[0][0]}（{count} 处）")
                paragraph = []

    prose = "\n".join(strip_comments(text) for _, text in visible_items)
    cjk_count = len(re.findall(r"[\u3400-\u9fff]", prose))
    allowance = max(2, (cjk_count + 2499) // 2500)
    return occurrences, clusters, allowance


def topic_anchor_findings(
    items: list[tuple[Path, str]], topic_terms: list[str]
) -> list[str]:
    """Flag long, method-heavy paragraphs that never name the problem object."""
    if not topic_terms:
        return []
    findings: list[str] = []
    for file, text in items:
        stem = file.stem.lower()
        if stem.startswith("99_") or "appendix" in stem:
            continue
        lines = text.splitlines()
        paragraph: list[tuple[int, str]] = []
        for line_no, raw in enumerate(lines + [""], start=1):
            line = strip_comments(raw).strip()
            boundary = not line or re.match(
                r"\\(?:chapter|section|subsection|subsubsection|begin|end)\b",
                line,
            )
            if not boundary:
                paragraph.append((line_no, line))
                continue
            if paragraph:
                joined = " ".join(piece for _, piece in paragraph)
                visible = re.sub(r"\\[A-Za-z@]+(?:\[[^\]]*\])?", "", joined)
                visible = re.sub(r"[{}$]", "", visible)
                if (
                    len(visible) >= 90
                    and len(GENERIC_METHOD_TERMS.findall(visible)) >= 2
                    and not any(term in visible for term in topic_terms)
                ):
                    findings.append(f"{file}:{paragraph[0][0]}")
                paragraph = []
    return findings


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path, help="LaTeX 文件或包含 .tex 的目录")
    parser.add_argument(
        "--topic-term",
        action="append",
        default=[],
        help="本题对象词，可重复提供；用于检查脱题式通用算法段落",
    )
    args = parser.parse_args()

    all_text, items = read_sources(args.path)
    clean = strip_comments(all_text)
    hard: list[str] = []
    warnings: list[str] = []

    abstract = extract_abstract(clean)
    if abstract:
        math_patterns = (
            r"(?<!\\)\$",
            r"\\\(",
            r"\\\[",
            r"\\begin\{(?:equation|align|gather|multline|math|displaymath)\*?\}",
        )
        if any(re.search(pattern, abstract) for pattern in math_patterns):
            hard.append("摘要中发现公式或数学环境")

    for label, pattern in INTERNAL_PATTERNS.items():
        locations = line_findings(items, pattern)
        if locations:
            hard.append(f"{label}侵入正文：{', '.join(locations[:8])}")

    figure_labels = re.findall(r"\\label\{(fig:[^}]+)\}", clean)
    for label in figure_labels:
        refs = len(re.findall(rf"\\ref\{{{re.escape(label)}\}}", clean))
        if refs == 0:
            hard.append(f"图 {label} 未被正文显式引用")

    for term, advice in SOFT_TERMS.items():
        count = clean.count(term)
        if count:
            warnings.append(f"{term}：{count} 次；{advice}")

    for label, advice, locations in high_compression_findings(items):
        hard.append(
            f"高压缩表达“{label}”：{', '.join(locations[:12])}；{advice}"
        )

    for term, advice in EXPLAIN_REQUIRED_TERMS.items():
        locations = line_findings(body_items(items), re.escape(term))
        if locations:
            warnings.append(
                f"专业词“{term}”：{', '.join(locations[:8])}；{advice}，"
                "并人工确认首次出现处先解释后命名"
            )

    defensive, defensive_clusters, allowance = defensive_style_findings(items)
    if defensive:
        warnings.append(
            "防御性句式："
            f"{len(defensive)} 处；优先改写为观察事实、肯定的适用条件或下一步行动；"
            f"位置：{', '.join(defensive[:12])}"
        )
    if len(defensive) > allowance:
        hard.append(
            f"防御性句式共 {len(defensive)} 处，超过当前文本允许上限 {allowance}；"
            "边界应集中、直白并使用肯定写法"
        )
    if defensive_clusters:
        hard.append(
            "同一段堆叠两处及以上防御性否定："
            f"{', '.join(defensive_clusters[:12])}"
        )

    for label, patterns in FIGURE_META_PATTERNS.items():
        count = sum(len(re.findall(pattern, clean)) for pattern in patterns)
        if count >= 3:
            hard.append(
                f"{label}重复 {count} 次；逐图解释必须自然融入论证，"
                "不得批量复用固定引导句"
            )

    for label, pattern in EMPTY_BACKGROUND_PATTERNS.items():
        locations = line_findings(items, pattern)
        if locations:
            warnings.append(
                f"{label}：{', '.join(locations[:8])}；请改为本题具体情境、矛盾与任务"
            )

    unanchored = topic_anchor_findings(items, args.topic_term)
    if unanchored:
        hard.append(
            "模型段缺少题目对象锚点："
            f"{', '.join(unanchored[:12])}；遮住标题后无法辨认正在解决的题目"
        )

    if warnings:
        print("LANGUAGE_CHECK: WARNINGS")
        for item in warnings:
            print(f"- {item}")

    if hard:
        print("LANGUAGE_CHECK: FAIL")
        for item in hard:
            print(f"- {item}")
        return 1

    print("LANGUAGE_CHECK: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
