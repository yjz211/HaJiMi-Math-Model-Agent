#!/usr/bin/env python3
"""Check the applicable main-text page limits for a modeling paper PDF."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

try:
    import pymupdf as fitz
except ImportError as exc:  # pragma: no cover - environment guidance
    raise SystemExit("缺少 PyMuPDF；请先安装 pymupdf 后再检查 PDF 页数。") from exc


APPENDIX_HEADING = re.compile(
    r"(?m)^\s*附\s*录(?:\s*[A-Za-zＡ-Ｚａ-ｚ0-9一二三四五六七八九十])?"
    r"(?:\s+[^\n]{1,40})?\s*$"
)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="正文从摘要至参考文献结束须为 22--30 页；论文结束于参考文献。"
    )
    parser.add_argument("pdf", type=Path)
    parser.add_argument(
        "--min-pages",
        type=int,
        default=22,
        help="正文最低页数；默认 22。",
    )
    parser.add_argument("--max-pages", type=int, default=30)
    args = parser.parse_args()

    if args.min_pages < 22:
        parser.error("--min-pages 不得低于用户规定的 22 页。")
    if args.max_pages > 30:
        parser.error("--max-pages 不得高于用户规定的 30 页。")
    if args.max_pages < 1:
        parser.error("--max-pages 必须为正整数。")
    if args.min_pages is not None and args.min_pages > args.max_pages:
        parser.error("--min-pages 不得大于 --max-pages。")

    reader = fitz.open(str(args.pdf))
    appendix_page = None
    for page_number, page in enumerate(reader, start=1):
        text = page.get_text("text") or ""
        if APPENDIX_HEADING.search(text):
            appendix_page = page_number
            break

    main_pages = len(reader)
    appendix_note = (
        f"，第 {appendix_page} 页存在附录；论文应结束于参考文献" if appendix_page else ""
    )
    lower_ok = main_pages >= args.min_pages
    passed = lower_ok and main_pages <= args.max_pages and appendix_page is None
    status = "PASS" if passed else "FAIL"
    requirement = f"{args.min_pages}--{args.max_pages} 页"
    print(
        f"PDF_PAGE_GATE: {status}；正文 {main_pages} 页"
        f"（要求 {requirement}）{appendix_note}。"
    )
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
