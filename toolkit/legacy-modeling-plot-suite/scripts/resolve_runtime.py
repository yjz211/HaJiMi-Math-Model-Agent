#!/usr/bin/env python
"""Resolve local executables for the frozen plotting prompts."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path


def first_existing(candidates):
    for value in candidates:
        if not value:
            continue
        expanded = Path(os.path.expandvars(os.path.expanduser(str(value))))
        if expanded.is_file():
            return str(expanded.resolve())
        found = shutil.which(str(value))
        if found:
            return str(Path(found).resolve())
    return None


def resolve():
    local = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
    program_files = Path(os.environ.get("PROGRAMFILES", "C:/Program Files"))
    program_files_x86 = Path(os.environ.get("PROGRAMFILES(X86)", "C:/Program Files (x86)"))
    chrome = first_existing([
        os.environ.get("PUPPETEER_EXECUTABLE_PATH"),
        os.environ.get("CHROME_PATH"),
        program_files / "Google/Chrome/Application/chrome.exe",
        program_files_x86 / "Google/Chrome/Application/chrome.exe",
        local / "Google/Chrome/Application/chrome.exe",
        "chrome", "google-chrome", "chromium", "chromium-browser",
    ])
    drawio = first_existing([
        os.environ.get("DRAWIO_PATH"),
        local / "Programs/draw.io/draw.io.exe",
        program_files / "draw.io/draw.io.exe",
        "draw.io.exe", "drawio", "draw.io",
    ])
    managed_python = first_existing([
        os.environ.get("MH_PYTHON"),
    ])
    capture_js = first_existing([
        os.environ.get("HAJIMI_CAPTURE_JS"),
    ])
    capture_electron = first_existing([
        os.environ.get("HAJIMI_CAPTURE_ELECTRON"),
    ])
    return {
        "python": str(Path(sys.executable).resolve()),
        "managed_python": managed_python,
        "chrome": chrome,
        "drawio": drawio,
        "mmdc": first_existing(["mmdc.cmd", "mmdc"]),
        "node": first_existing(["node.exe", "node"]),
        "xelatex": first_existing(["xelatex.exe", "xelatex"]),
        "bash": first_existing(["bash.exe", "bash"]),
        "capture_electron": capture_electron,
        "capture_js": capture_js,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--require", action="append", default=[])
    parser.add_argument("--output")
    args = parser.parse_args()
    result = resolve()
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        Path(args.output).write_text(payload + "\n", encoding="utf-8")
    print(payload)
    missing = [name for name in args.require if not result.get(name)]
    if missing:
        print("Missing required runtime: " + ", ".join(missing), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

