#!/usr/bin/env python3
"""Check deterministic LaTeX source risks that commonly survive compilation."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


INPUT_RE = re.compile(r"\\(?:input|include)\{([^}]+)\}")


def strip_comments(text: str) -> str:
    return re.sub(r"(?<!\\)%.*", "", text)


def expand_inputs(path: Path, stack: tuple[Path, ...] = ()) -> str:
    resolved = path.resolve()
    if resolved in stack:
        raise ValueError(f"循环 input/include：{resolved}")
    text = path.read_text(encoding="utf-8")

    def replace(match: re.Match[str]) -> str:
        child_path = path.parent / match.group(1)
        if child_path.suffix == "":
            child_path = child_path.with_suffix(".tex")
        if not child_path.exists():
            return match.group(0)
        return expand_inputs(child_path, stack + (resolved,))

    return INPUT_RE.sub(replace, text)


def strip_structured_environments(text: str) -> str:
    names = (
        "tabular",
        "tabularx",
        "longtable",
        "array",
        "align",
        "gather",
        "multline",
        "equation",
    )
    pattern = re.compile(
        rf"\\begin\{{(?:{'|'.join(names)})\*?\}}.*?"
        rf"\\end\{{(?:{'|'.join(names)})\*?\}}",
        re.S,
    )
    return pattern.sub("", text)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("tex", type=Path, help="LaTeX 主入口")
    args = parser.parse_args()

    source = strip_comments(expand_inputs(args.tex))
    compact = re.sub(r"\s+", "", source)
    failures: list[str] = []
    warnings: list[str] = []

    section_titles = re.findall(r"\\section\*?\{([^{}]+)\}", source)
    duplicates = sorted({title for title in section_titles if section_titles.count(title) > 1})
    if duplicates:
        failures.append(f"重复一级标题：{', '.join(duplicates)}")

    manual_reference = "八、参考文献" in compact
    bibliography_env = bool(re.search(r"\\begin\{thebibliography\}", source))
    suppress_refname = bool(
        re.search(
            r"\\(?:renewcommand|def)\s*\{?\\refname\}?\s*\{\s*\}",
            source,
        )
    )
    if manual_reference and bibliography_env and not suppress_refname:
        failures.append(
            "手工“八、参考文献”与 thebibliography 自动标题并存；"
            "需显式抑制 \\refname 或改用不自动出标题的文献列表"
        )

    labels = re.findall(r"\\label\{([^}]+)\}", source)
    duplicate_labels = sorted({label for label in labels if labels.count(label) > 1})
    if duplicate_labels:
        failures.append(f"重复 LaTeX 标签：{', '.join(duplicate_labels[:20])}")

    floats = len(re.findall(r"\\begin\{(?:figure|table)\}", source))
    forced = len(re.findall(r"\\begin\{(?:figure|table)\}\[H\]", source))
    if forced >= 4 and floats and forced / floats >= 0.5:
        warnings.append(
            f"强制原位浮动体 {forced}/{floats} 个；需检查孤行、大面积留白和页面节奏"
        )

    explicit_breaks = len(re.findall(r"\\(?:newpage|clearpage|pagebreak)\b", source))
    if explicit_breaks > 2:
        warnings.append(f"发现 {explicit_breaks} 个人工分页命令；需逐个说明必要性")

    prose_source = strip_structured_environments(source)
    hard_linebreaks = len(
        re.findall(r"(?<!\\)\\\\(?:\[[^\]]*\])?\s*(?:\n|$)", prose_source)
    )
    if hard_linebreaks > 12:
        warnings.append(
            f"发现较多正文硬换行候选（{hard_linebreaks} 处）；需排除人为控制段落分页"
        )

    print(
        f"LATEX_LAYOUT_RISKS: sections={len(section_titles)}, "
        f"floats={floats}, forced_H={forced}, labels={len(labels)}"
    )
    for item in warnings:
        print(f"WARN: {item}")
    for item in failures:
        print(f"FAIL: {item}")
    if failures:
        return 1
    print("LATEX_LAYOUT_RISKS: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
