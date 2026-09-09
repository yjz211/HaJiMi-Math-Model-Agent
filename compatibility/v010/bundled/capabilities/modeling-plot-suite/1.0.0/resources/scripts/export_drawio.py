#!/usr/bin/env python
"""Export Draw.io files reliably on Windows and wait for detached output."""

from __future__ import annotations

import argparse
import os
import subprocess
import time
from pathlib import Path

from resolve_runtime import resolve


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--output")
    parser.add_argument("--format", choices=["pdf", "png", "svg"], default="pdf")
    parser.add_argument("--scale", type=float, default=2.0)
    parser.add_argument("--timeout", type=int, default=90)
    args = parser.parse_args()

    source = Path(args.input).resolve()
    if not source.is_file():
        raise SystemExit(f"Draw.io source not found: {source}")
    executable = resolve().get("drawio")
    if not executable:
        raise SystemExit("Draw.io executable not found")
    output = Path(args.output).resolve() if args.output else source.with_suffix("." + args.format)
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        output.unlink()

    profile = Path(os.environ.get("APPDATA", str(output.parent))) / "hajimi-drawio"
    profile.mkdir(parents=True, exist_ok=True)
    command = [executable, "--export", "--format", args.format, "--crop", "--output", str(output)]
    if args.format == "png":
        command += ["--scale", str(args.scale)]
    command.append(str(source))
    command.append("--user-data-dir=" + str(profile))
    proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    deadline = time.time() + args.timeout
    stable_size = -1
    stable_ticks = 0
    while time.time() < deadline:
        if output.is_file() and output.stat().st_size > 512:
            size = output.stat().st_size
            stable_ticks = stable_ticks + 1 if size == stable_size else 0
            stable_size = size
            if stable_ticks >= 2:
                print(f"{output}\t{size}")
                return 0
        if proc.poll() is not None and not output.exists():
            stdout, stderr = proc.communicate()
            raise SystemExit(f"Draw.io export failed ({proc.returncode}): {stderr or stdout}")
        time.sleep(0.5)
    proc.kill()
    raise SystemExit(f"Timed out waiting for Draw.io export: {output}")


if __name__ == "__main__":
    raise SystemExit(main())

