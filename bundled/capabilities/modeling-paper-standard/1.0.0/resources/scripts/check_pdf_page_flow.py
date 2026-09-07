#!/usr/bin/env python3
"""Flag PDF page-flow risks for mandatory full-size visual review."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import pymupdf as fitz


CONTINUATION_START = re.compile(r"^[的了与和及而但或案]")


def clean_lines(text: str) -> list[str]:
    lines = [re.sub(r"\s+", " ", line).strip() for line in text.splitlines()]
    lines = [line for line in lines if line and not re.fullmatch(r"\d{1,3}", line)]
    return lines


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--min-chars", type=int, default=220)
    args = parser.parse_args()

    reader = fitz.open(str(args.pdf))
    warnings: list[str] = []
    failures: list[str] = []

    for page_no, page in enumerate(reader, start=1):
        text = page.get_text("text") or ""
        lines = clean_lines(text)
        joined = "".join(lines)
        if len(joined) < args.min_chars:
            warnings.append(
                f"第 {page_no} 页可提取正文仅 {len(joined)} 字符；"
                "检查是否为合理图表页或存在大面积留白"
            )
        if lines:
            first = lines[0]
            if len(first) <= 10 and CONTINUATION_START.match(first):
                warnings.append(f"第 {page_no} 页疑似以残句开头：“{first}”")
            last = lines[-1]
            if len(last) <= 8 and not re.match(
                r"^(?:图|表|式|附录|参考文献|关键词)", last
            ):
                warnings.append(f"第 {page_no} 页疑似以短残句结尾：“{last}”")

        reference_count = len(re.findall(r"参考文献", text))
        if reference_count > 1:
            failures.append(
                f"第 {page_no} 页出现“参考文献”{reference_count} 次，疑似重复标题"
            )

    print(f"PDF_PAGE_FLOW: pages={len(reader)}")
    for item in warnings:
        print(f"WARN: {item}")
    for item in failures:
        print(f"FAIL: {item}")
    if failures:
        return 1
    print("PDF_PAGE_FLOW: PASS_WITH_REVIEW" if warnings else "PDF_PAGE_FLOW: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
