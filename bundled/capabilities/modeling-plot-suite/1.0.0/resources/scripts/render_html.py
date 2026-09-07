#!/usr/bin/env python
"""Render local HTML through Chrome with file-existence validation."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
import time
from pathlib import Path

from resolve_runtime import resolve


def valid(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 512


def run_checked(command, output: Path, timeout: int):
    if output.exists():
        output.unlink()
    proc = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    deadline = time.time() + 5
    while time.time() < deadline and not valid(output):
        time.sleep(0.2)
    if not valid(output):
        detail = (proc.stderr or proc.stdout or "").strip()
        raise RuntimeError(f"Renderer did not create a valid file: {output}\n{detail}")
    return proc.returncode


def run_capture(runtime, source: Path, output: Path, fmt: str, width: int, height: int,
              timeout: int, render_math: bool) -> bool:
    executable = runtime.get("capture_electron")
    if not executable:
        return False
    if output.exists():
        output.unlink()
    config = {
        "viewport": {"width": width, "height": height},
        "targets": [{
            "file": str(source),
            "out": str(output),
            "format": fmt,
            "waitMs": 800,
            "fullPage": fmt == "png",
            "renderMath": render_math,
        }],
    }
    with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as handle:
        json.dump(config, handle, ensure_ascii=False)
        config_path = Path(handle.name)
    try:
        try:
            subprocess.run(
                [executable, "--mh-capture", str(config_path)],
                capture_output=True, text=True, timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            pass
        deadline = time.time() + 5
        while time.time() < deadline and not valid(output):
            time.sleep(0.2)
        return valid(output)
    finally:
        config_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["pdf", "png", "both"], default="both")
    parser.add_argument("--width", type=int, default=1600)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument("--render-math", action="store_true")
    parser.add_argument("--timeout", type=int, default=60)
    args = parser.parse_args()

    source = Path(args.input).resolve()
    if not source.is_file():
        raise SystemExit(f"HTML not found: {source}")
    runtime = resolve()
    chrome = runtime.get("chrome")
    if not chrome:
        raise SystemExit("No working Chrome executable found")
    base = Path(args.output).resolve() if args.output else source.with_suffix("")
    url = source.as_uri()
    common = [chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"]

    outputs = []
    if args.format in ("pdf", "both"):
        pdf = base if base.suffix.lower() == ".pdf" else base.with_suffix(".pdf")
        if not run_capture(runtime, source, pdf, "pdf", args.width, args.height, args.timeout, args.render_math):
            run_checked(common + ["--no-pdf-header-footer", f"--print-to-pdf={pdf}", url], pdf, args.timeout)
        outputs.append(pdf)
    if args.format in ("png", "both"):
        png = base if base.suffix.lower() == ".png" else base.with_suffix(".png")
        if not run_capture(runtime, source, png, "png", args.width, args.height, args.timeout, args.render_math):
            run_checked(common + [f"--window-size={args.width},{args.height}", f"--screenshot={png}", url], png, args.timeout)
        outputs.append(png)
    for output in outputs:
        print(f"{output}\t{output.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
