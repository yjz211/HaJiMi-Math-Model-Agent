#!/usr/bin/env python
"""Inject compatibility assets without changing any vendored skill prompt."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from resolve_runtime import resolve


MODELING_MARKERS = (
    "FIGURE_MANIFEST", "数学建模", "数模", "MCM", "ICM",
    "CUMCM", "APMCM", "PROBLEM_ANALYSIS",
)


def detect_profile(workspace: Path) -> str:
    candidates = [
        workspace / "PROBLEM_ANALYSIS.md",
        workspace / "PAPER_PLAN.md",
        workspace / "MODELING_REPORT.md",
        workspace / "CLAUDE.md",
        workspace / "CODEX.md",
    ]
    for path in candidates:
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8", errors="replace")[:500_000]
        if any(marker.lower() in text.lower() for marker in MODELING_MARKERS):
            return "modeling-competition"
    return "general-paper"


def copy_tree_files(source: Path, destination: Path, force: bool = False):
    copied = 0
    skipped = 0
    destination.mkdir(parents=True, exist_ok=True)
    for src in source.rglob("*"):
        if not src.is_file():
            continue
        rel = src.relative_to(source)
        dst = destination / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists() and not force:
            skipped += 1
            continue
        shutil.copy2(src, dst)
        copied += 1
    return copied, skipped


def sha256(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", required=True)
    parser.add_argument("--profile", choices=["auto", "general-paper", "modeling-competition"], default="auto")
    parser.add_argument("--capability", default="all")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    workspace = Path(args.workspace).resolve()
    if not workspace.is_dir():
        raise SystemExit(f"Workspace does not exist: {workspace}")
    root = Path(__file__).resolve().parent.parent
    assets = root / "assets"
    # HaJiMi: refresh only the identified pristine helper, preserving custom files.
    for relative in ("_utils/plot_utils.py", "skills/shared-scripts/plot_utils.py"):
        existing = workspace / relative
        if existing.is_file() and sha256(existing) == "8399c469450a2b8c33c9ce70b19c04db93bf5c3b3c94f00f83423670e3d713d1":
            shutil.copy2(assets / "shared-scripts/plot_utils.py", existing)
    profile = detect_profile(workspace) if args.profile == "auto" else args.profile

    shared_project = workspace / "skills/shared-scripts"
    utils = workspace / "_utils"
    templates = workspace / "_templates"
    tools = workspace / "tools"

    copied_shared, skipped_shared = copy_tree_files(
        assets / "shared-scripts", shared_project, args.force
    )
    copied_utils, skipped_utils = copy_tree_files(
        assets / "shared-scripts", utils, args.force
    )
    copied_templates, skipped_templates = copy_tree_files(
        assets / "html-templates", templates, args.force
    )
    copied_tools, skipped_tools = copy_tree_files(
        assets / "tools", tools, args.force
    )
    copy_tree_files(assets / "tools", utils, args.force)

    runtime = resolve()
    metadata = {
        "schema": 1,
        "profile": profile,
        "capability": args.capability,
        "workspace": str(workspace),
        "runtime_skill": str(root),
        "paths": {
            **runtime,
            "shared_scripts": str(shared_project),
            "utils": str(utils),
            "templates": str(templates),
            "tools": str(tools),
        },
        "injection": {
            "shared": {"copied": copied_shared, "preserved": skipped_shared},
            "utils": {"copied": copied_utils, "preserved": skipped_utils},
            "templates": {"copied": copied_templates, "preserved": skipped_templates},
            "tools": {"copied": copied_tools, "preserved": skipped_tools},
        },
        "prompt_policy": "vendored drawing prompts are immutable",
    }
    meta_path = workspace / ".codex-plot-runtime.json"
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

