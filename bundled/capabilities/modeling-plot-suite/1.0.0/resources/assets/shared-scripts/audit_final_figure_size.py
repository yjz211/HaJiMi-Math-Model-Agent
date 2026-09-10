# -*- coding: utf-8 -*-
"""Audit PDF figure text at its final LaTeX insertion size.

Exit codes: 0=pass/review, 1=hard failure, 2=not auditable.
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

MM_PER_PT = 25.4 / 72.0
INCLUDE_RE = re.compile(r"\\includegraphics(?:\[([^\]]*)\])?\{([^}]+)\}")
WIDTH_RE = re.compile(
    r"width\s*=\s*([0-9]*\.?[0-9]*)\s*\\(textwidth|linewidth|columnwidth)", re.I
)
HEIGHT_RE = re.compile(
    r"height\s*=\s*([0-9]*\.?[0-9]*)\s*\\textheight", re.I
)


def coefficient(raw: str) -> float:
    return float(raw) if raw else 1.0


def profile_defaults(profile: str) -> tuple[float, float]:
    return (0.0, 8.5) if profile == "modeling" else (5.0, 7.0)


def detect_profile(script: Path) -> str:
    return "modeling" if "modeling-plot-suite" in str(script).lower() else "research"


def placements(tex_root: Path | None) -> dict[str, list[dict]]:
    if tex_root is None:
        return {}
    files = [tex_root] if tex_root.is_file() else sorted(tex_root.rglob("*.tex"))
    found: dict[str, list[dict]] = {}
    for tex in files:
        try:
            content = tex.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        for match in INCLUDE_RE.finditer(content):
            opts, raw_path = match.group(1) or "", match.group(2).strip()
            name = Path(raw_path.replace("\\", "/")).name
            if not Path(name).suffix:
                name += ".pdf"
            found.setdefault(name.lower(), []).append(
                {"tex": str(tex), "options": opts, "raw_path": raw_path}
            )
    return found


def pdf_metrics(pdf: Path) -> dict:
    try:
        import fitz
    except ImportError as exc:
        raise RuntimeError("PyMuPDF is required") from exc
    doc = fitz.open(str(pdf))
    if doc.page_count != 1:
        doc.close()
        raise RuntimeError(f"expected one-page figure PDF, found {doc.page_count}")
    page = doc[0]
    page_rect = page.rect
    sizes: list[float] = []
    boxes = []
    raw = page.get_text("dict")
    for block in raw.get("blocks", []):
        if block.get("type") == 0:
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    if span.get("text", "").strip():
                        sizes.append(float(span.get("size", 0)))
                        boxes.append(fitz.Rect(span["bbox"]))
        elif block.get("bbox"):
            boxes.append(fitz.Rect(block["bbox"]))
    for drawing in page.get_drawings():
        rect = drawing.get("rect")
        if rect and not rect.is_infinite and not rect.is_empty:
            boxes.append(rect)
    ratio = 0.0
    if boxes:
        union = boxes[0]
        for box in boxes[1:]:
            union |= box
        ratio = max(0.0, min(1.0, union.width / page_rect.width))
    result = {
        "source_width_mm": page_rect.width * MM_PER_PT,
        "source_height_mm": page_rect.height * MM_PER_PT,
        "text_sizes_pt": sizes,
        "content_width_ratio": ratio,
    }
    doc.close()
    return result


def target_scale(place: dict | None, metrics: dict, args) -> tuple[float | None, float | None, str | None]:
    if args.target_width_mm is not None:
        width_mm = args.target_width_mm
    elif place is not None:
        match = WIDTH_RE.search(place["options"])
        if not match:
            width_mm = metrics["source_width_mm"]
        else:
            base_name = match.group(2).lower()
            bases = {
                "textwidth": args.textwidth_mm,
                "columnwidth": args.columnwidth_mm,
                "linewidth": args.linewidth_mm,
            }
            base = bases[base_name]
            if base is None:
                return None, None, f"missing --{base_name}-mm"
            width_mm = coefficient(match.group(1)) * base
    else:
        return None, None, "no target width or matching LaTeX placement"

    scale = width_mm / metrics["source_width_mm"]
    if place is not None:
        match = HEIGHT_RE.search(place["options"])
        if match:
            if args.textheight_mm is None:
                return None, None, "height cap present but --textheight-mm is missing"
            height_cap = coefficient(match.group(1)) * args.textheight_mm
            scale = min(scale, height_cap / metrics["source_height_mm"])
            width_mm = metrics["source_width_mm"] * scale
    return width_mm, scale, None


def audit(pdf: Path, place: dict | None, args) -> dict:
    metrics = pdf_metrics(pdf)
    width_mm, scale, reason = target_scale(place, metrics, args)
    item = {
        "figure": str(pdf),
        "placement": place,
        "source_width_mm": round(metrics["source_width_mm"], 2),
        "source_height_mm": round(metrics["source_height_mm"], 2),
        "content_width_ratio": round(metrics["content_width_ratio"], 3),
    }
    if scale is None:
        item.update({"verdict": "NOT_AUDITABLE", "reason": reason})
        return item
    sizes = metrics["text_sizes_pt"]
    if not sizes:
        item.update(
            {
                "target_width_mm": round(width_mm, 2),
                "scale": round(scale, 4),
                "verdict": "NOT_AUDITABLE",
                "reason": "no selectable PDF text; final-size visual inspection required",
            }
        )
        return item
    effective = [size * scale for size in sizes]
    failures = []
    warnings = []
    below_hard = sum(size + 1e-6 < args.hard_min_pt for size in effective)
    median = statistics.median(effective)
    if below_hard:
        failures.append(
            f"{below_hard}/{len(effective)} text spans below {args.hard_min_pt:g} pt"
        )
    if median + 1e-6 < args.recommended_min_pt:
        warnings.append(
            f"median effective text {median:.2f} pt below recommended {args.recommended_min_pt:g} pt"
        )
    if scale < args.min_scale:
        warnings.append(f"large downscale ({scale:.3f}); regenerate near final width")
    if metrics["content_width_ratio"] < args.min_content_ratio:
        warnings.append(
            f"content uses only {metrics['content_width_ratio']:.0%} of source canvas width"
        )
    verdict = "FAIL" if failures or (args.strict and warnings) else ("REVIEW" if warnings else "PASS")
    item.update(
        {
            "target_width_mm": round(width_mm, 2),
            "scale": round(scale, 4),
            "source_text_min_pt": round(min(sizes), 2),
            "source_text_median_pt": round(statistics.median(sizes), 2),
            "effective_text_min_pt": round(min(effective), 2),
            "effective_text_median_pt": round(median, 2),
            "text_span_count": len(effective),
            "failures": failures,
            "warnings": warnings,
            "verdict": verdict,
        }
    )
    return item


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit PDF text after final LaTeX scaling")
    parser.add_argument("pdfs", nargs="+", type=Path)
    parser.add_argument("--tex-root", type=Path)
    parser.add_argument("--profile", choices=["auto", "modeling", "research"], default="auto")
    parser.add_argument("--target-width-mm", type=float)
    parser.add_argument("--textwidth-mm", type=float)
    parser.add_argument("--columnwidth-mm", type=float)
    parser.add_argument("--linewidth-mm", type=float)
    parser.add_argument("--textheight-mm", type=float)
    parser.add_argument("--hard-min-pt", type=float)
    parser.add_argument("--recommended-min-pt", type=float)
    parser.add_argument("--min-scale", type=float, default=0.85)
    parser.add_argument("--min-content-ratio", type=float, default=0.62)
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--json", dest="json_path", type=Path)
    args = parser.parse_args()

    profile = detect_profile(Path(__file__)) if args.profile == "auto" else args.profile
    hard, recommended = profile_defaults(profile)
    args.hard_min_pt = hard if args.hard_min_pt is None else args.hard_min_pt
    args.recommended_min_pt = recommended if args.recommended_min_pt is None else args.recommended_min_pt
    by_name = placements(args.tex_root)
    results = []
    for pdf in args.pdfs:
        if not pdf.is_file():
            results.append({"figure": str(pdf), "verdict": "NOT_AUDITABLE", "reason": "file not found"})
            continue
        matches = by_name.get(pdf.name.lower(), [None])
        for place in matches:
            try:
                results.append(audit(pdf, place, args))
            except Exception as exc:
                results.append({"figure": str(pdf), "verdict": "NOT_AUDITABLE", "reason": str(exc)})

    print(f"=== final-size figure audit ({profile}) ===")
    print(f"hard minimum={args.hard_min_pt:g} pt; recommended median={args.recommended_min_pt:g} pt" if args.hard_min_pt > 0 else f"no hard font minimum; recommended median={args.recommended_min_pt:g} pt (review only)")
    for item in results:
        print(f"[{item['verdict']}] {item['figure']}")
        if "scale" in item and "effective_text_min_pt" in item:
            print(
                f"  target={item['target_width_mm']} mm, scale={item['scale']}; "
                f"effective text min/median={item['effective_text_min_pt']}/"
                f"{item['effective_text_median_pt']} pt"
            )
        for message in item.get("failures", []):
            print(f"  FAIL: {message}")
        for message in item.get("warnings", []):
            print(f"  REVIEW: {message}")
        if item.get("reason"):
            print(f"  {item['reason']}")
    if args.json_path:
        args.json_path.parent.mkdir(parents=True, exist_ok=True)
        args.json_path.write_text(
            json.dumps({"profile": profile, "results": results}, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    if any(item["verdict"] == "FAIL" for item in results):
        return 1
    if any(item["verdict"] == "NOT_AUDITABLE" for item in results):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
