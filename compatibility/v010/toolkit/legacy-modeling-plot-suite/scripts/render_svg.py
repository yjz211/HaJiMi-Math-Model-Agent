#!/usr/bin/env python
"""Render SVG to PNG with CairoSVG, with Chrome as a fallback."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from resolve_runtime import resolve


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--output", required=True)
    parser.add_argument("--scale", type=float, default=2.0)
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=900)
    args = parser.parse_args()

    source = Path(args.input).resolve()
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        import cairosvg
        cairosvg.svg2png(url=str(source), write_to=str(output), scale=args.scale)
    except Exception:
        chrome = resolve().get("chrome")
        if not chrome:
            raise SystemExit("Neither CairoSVG nor Chrome is available")
        command = [
            chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            f"--window-size={args.width},{args.height}", f"--screenshot={output}", source.as_uri(),
        ]
        proc = subprocess.run(command, capture_output=True, text=True, timeout=60)
        if proc.returncode != 0 and not output.exists():
            raise SystemExit(proc.stderr or proc.stdout)
    if not output.is_file() or output.stat().st_size < 256:
        raise SystemExit(f"Invalid PNG output: {output}")
    print(f"{output}\t{output.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

