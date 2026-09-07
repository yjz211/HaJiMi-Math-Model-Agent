#!/usr/bin/env python3
"""Detect equation transcription drift between a technical baseline and a rewrite."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path


INPUT_RE = re.compile(r"\\(?:input|include)\{([^}]+)\}")
ENV_RE = re.compile(
    r"\\begin\{(equation|align|gather|multline|displaymath)(\*?)\}"
    r"(.*?)"
    r"\\end\{\1\2\}",
    re.S,
)
LABEL_RE = re.compile(r"\\label\{([^}]+)\}")


@dataclass(frozen=True)
class Equation:
    label: str
    canonical_label: str
    body: str
    source: Path


def strip_comments(text: str) -> str:
    return re.sub(r"(?<!\\)%.*", "", text)


def expand_inputs(path: Path, stack: tuple[Path, ...] = ()) -> str:
    resolved = path.resolve()
    if resolved in stack:
        raise ValueError(f"循环 input/include：{resolved}")
    text = path.read_text(encoding="utf-8")

    def replace(match: re.Match[str]) -> str:
        child = match.group(1)
        child_path = (path.parent / child)
        if child_path.suffix == "":
            child_path = child_path.with_suffix(".tex")
        if not child_path.exists():
            return match.group(0)
        return expand_inputs(child_path, stack + (resolved,))

    return INPUT_RE.sub(replace, text)


def canonical_label(label: str) -> str:
    value = label.lower()
    value = re.sub(r"^(?:eq|equation):", "", value)
    parts = re.split(r"[-_:]+", value)
    parts = [p for p in parts if not re.fullmatch(r"(?:q|v|ver)\d+", p)]
    return "-".join(parts)


def normalize_body(body: str) -> str:
    body = LABEL_RE.sub("", strip_comments(body))
    body = re.sub(r"\\(?:tag|notag|nonumber)\{?[^}\n]*\}?", "", body)
    body = re.sub(r"\s+", "", body)
    return body.rstrip(".,;，。；")


def extract(path: Path) -> list[Equation]:
    text = expand_inputs(path)
    equations: list[Equation] = []
    for match in ENV_RE.finditer(text):
        body = match.group(3)
        labels = LABEL_RE.findall(body)
        label = labels[0] if labels else ""
        equations.append(
            Equation(
                label=label,
                canonical_label=canonical_label(label) if label else "",
                body=normalize_body(body),
                source=path,
            )
        )
    return equations


def indexed(equations: list[Equation]) -> tuple[dict[str, Equation], list[str]]:
    grouped: dict[str, list[Equation]] = {}
    for eq in equations:
        if not eq.canonical_label:
            continue
        grouped.setdefault(eq.canonical_label, []).append(eq)
    ambiguous = sorted(key for key, values in grouped.items() if len(values) > 1)
    unique = {key: values[0] for key, values in grouped.items() if len(values) == 1}
    return unique, ambiguous


def main() -> int:
    parser = argparse.ArgumentParser(
        description="比较技术底稿与重写稿中带标签公式的 LaTeX 内容。"
    )
    parser.add_argument("baseline", type=Path)
    parser.add_argument("current", type=Path)
    parser.add_argument(
        "--require-all",
        action="store_true",
        help="把底稿中未能在重写稿匹配的公式也视为失败。",
    )
    parser.add_argument("--exact-labels", action="store_true", help="Require original stable labels, without canonical alias matching.")
    args = parser.parse_args()

    baseline = extract(args.baseline)
    current = extract(args.current)
    if args.exact_labels:
        baseline = [Equation(eq.label, eq.label, eq.body, eq.source) for eq in baseline]
        current = [Equation(eq.label, eq.label, eq.body, eq.source) for eq in current]
    base_index, base_dups = indexed(baseline)
    current_index, current_dups = indexed(current)

    failures: list[str] = []
    if args.exact_labels and args.require_all and not base_index:
        failures.append("Technical baseline has no labeled equations")
    warnings: list[str] = []
    if base_dups:
        warnings.append(
            f"技术底稿存在语义标签歧义，已跳过自动匹配：{', '.join(base_dups)}"
        )
    if current_dups:
        warnings.append(
            f"重写稿存在语义标签歧义，已跳过自动匹配：{', '.join(current_dups)}"
        )

    if args.exact_labels and (base_dups or current_dups):
        failures.append("Duplicate stable equation labels prevent verification")

    common = sorted(set(base_index) & set(current_index))
    changed = [
        key for key in common if base_index[key].body != current_index[key].body
    ]
    for key in changed:
        failures.append(
            f"公式发生转写漂移：{key} "
            f"（{base_index[key].label} -> {current_index[key].label}）"
        )

    missing = sorted(set(base_index) - set(current_index))
    added = sorted(set(current_index) - set(base_index))
    if missing:
        message = f"底稿公式未在重写稿中匹配：{', '.join(missing[:20])}"
        (failures if args.require_all else warnings).append(message)
    if added:
        warnings.append(f"重写稿新增或改名公式：{', '.join(added[:20])}")

    unlabeled_base = sum(not eq.label for eq in baseline)
    unlabeled_current = sum(not eq.label for eq in current)
    if unlabeled_base or unlabeled_current:
        warnings.append(
            f"无标签公式：底稿 {unlabeled_base} 个，重写稿 {unlabeled_current} 个；"
            "无法自动逐式匹配"
        )
    if baseline and current and not common:
        failures.append("两稿没有可匹配的稳定公式标签，无法证明数学层未被改写")

    print(
        f"EQUATION_DRIFT: baseline={len(baseline)}, current={len(current)}, "
        f"matched={len(common)}, changed={len(changed)}"
    )
    for item in warnings:
        print(f"WARN: {item}")
    for item in failures:
        print(f"FAIL: {item}")
    if failures:
        return 1
    print("EQUATION_DRIFT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
