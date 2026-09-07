#!/usr/bin/env python3
"""Block pages dominated by one isolated figure, table, or flowchart."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    import fitz
except ImportError as exc:  # pragma: no cover - environment guidance
    raise SystemExit("缺少 PyMuPDF；请先安装 pymupdf 后再检查孤立大图表页。") from exc


APPENDIX_HEADING = re.compile(r"(?m)^\s*附\s*录\s*$")


def union_rect(rects: list[fitz.Rect]) -> fitz.Rect | None:
    if not rects:
        return None
    merged = fitz.Rect(rects[0])
    for rect in rects[1:]:
        merged |= rect
    return merged


def clean_text(value: str) -> str:
    return re.sub(r"\s+", "", value)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="检测被单个大型图、表或流程图主导且缺少同页正文解释的页面。"
    )
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--min-height-ratio", type=float, default=0.32)
    parser.add_argument("--min-area-ratio", type=float, default=0.18)
    parser.add_argument("--min-outside-chars", type=int, default=120)
    args = parser.parse_args()

    document = fitz.open(args.pdf)
    failures: list[str] = []
    checked_pages = 0

    for page_number, page in enumerate(document, start=1):
        if APPENDIX_HEADING.search(page.get_text()):
            break
        checked_pages += 1
        page_rect = page.rect
        visual_rects: list[fitz.Rect] = []

        for drawing in page.get_drawings():
            rect = fitz.Rect(drawing["rect"])
            if rect.width >= 5 and rect.height >= 5:
                visual_rects.append(rect)

        for image in page.get_images(full=True):
            for rect in page.get_image_rects(image[0]):
                if rect.width >= 5 and rect.height >= 5:
                    visual_rects.append(fitz.Rect(rect))

        visual = union_rect(visual_rects)
        if visual is None:
            continue

        height_ratio = visual.height / page_rect.height
        area_ratio = visual.get_area() / page_rect.get_area()
        if (
            height_ratio < args.min_height_ratio
            or area_ratio < args.min_area_ratio
        ):
            continue

        outside_chars = 0
        expanded = visual + (-6, -6, 6, 6)
        for block in page.get_text("blocks"):
            block_rect = fitz.Rect(block[:4])
            text = clean_text(str(block[4]))
            if not text or re.fullmatch(r"\d{1,3}", text):
                continue
            intersection = block_rect & expanded
            overlap = (
                intersection.get_area() / block_rect.get_area()
                if block_rect.get_area() > 0
                else 0
            )
            if overlap < 0.5:
                outside_chars += len(text)

        if outside_chars < args.min_outside_chars:
            failures.append(
                f"第 {page_number} 页疑似由单个大型图表主导："
                f"视觉区域高占比 {height_ratio:.1%}、面积占比 {area_ratio:.1%}，"
                f"区域外正文仅 {outside_chars} 字符"
            )

    print(
        f"PDF_LARGE_FLOAT: checked_main_pages={checked_pages}, "
        f"total_pages={len(document)}"
    )
    for item in failures:
        print(f"FAIL: {item}")
    if failures:
        return 1
    print("PDF_LARGE_FLOAT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
