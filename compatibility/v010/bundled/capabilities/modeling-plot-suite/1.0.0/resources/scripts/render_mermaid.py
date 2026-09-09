#!/usr/bin/env python
"""Render Mermaid with a discovered system Chrome."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
from pathlib import Path

from resolve_runtime import resolve


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["svg", "png", "pdf"], default="svg")
    parser.add_argument("--background", default="white")
    parser.add_argument("--scale", type=float, default=2.0)
    parser.add_argument("--width", type=int)
    parser.add_argument("--height", type=int)
    parser.add_argument("--timeout", type=int, default=90)
    args = parser.parse_args()

    source = Path(args.input).resolve()
    if not source.is_file():
        raise SystemExit(f"Mermaid source not found: {source}")
    runtime = resolve()
    if not runtime.get("mmdc"):
        raise SystemExit("mmdc not found; install @mermaid-js/mermaid-cli")
    if not runtime.get("chrome"):
        raise SystemExit("Chrome not found")

    output = Path(args.output).resolve() if args.output else source.with_suffix("." + args.format)
    output.parent.mkdir(parents=True, exist_ok=True)
    config = {"executablePath": runtime["chrome"], "args": ["--no-sandbox", "--disable-gpu"]}
    with tempfile.NamedTemporaryFile("w", suffix=".json", encoding="utf-8", delete=False) as handle:
        json.dump(config, handle)
        config_path = handle.name
    command = [
        runtime["mmdc"], "-p", config_path, "-i", str(source), "-o", str(output),
        "-b", args.background, "-s", str(args.scale),
    ]
    if args.width:
        command += ["-w", str(args.width)]
    if args.height:
        command += ["-H", str(args.height)]
    env = os.environ.copy()
    env["PUPPETEER_EXECUTABLE_PATH"] = runtime["chrome"]
    try:
        proc = subprocess.run(command, capture_output=True, text=True, timeout=args.timeout, env=env)
    finally:
        Path(config_path).unlink(missing_ok=True)
    if proc.returncode != 0 or not output.is_file() or output.stat().st_size < 256:
        raise SystemExit(f"Mermaid render failed: {proc.stderr or proc.stdout}")
    print(f"{output}\t{output.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

