#!/usr/bin/env python3
"""Build and verify a mathematical-modeling submission package from JSON config."""

from __future__ import annotations

import argparse
import csv
import fnmatch
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import sys
import zipfile


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def resolve(base: Path, value: str) -> Path:
    path = Path(value)
    return (path if path.is_absolute() else base / path).resolve()


def safe_target(stage: Path, relative: str) -> Path:
    rel = PurePosixPath(relative.replace("\\", "/"))
    if rel.is_absolute() or ".." in rel.parts:
        raise ValueError(f"非法提交路径：{relative}")
    target = (stage / Path(*rel.parts)).resolve()
    if target == stage or stage not in target.parents:
        raise ValueError(f"目标越出暂存目录：{relative}")
    return target


def matches_exclusion(relative: str, patterns: list[str]) -> str | None:
    posix = relative.replace("\\", "/")
    name = PurePosixPath(posix).name
    for pattern in patterns:
        normalized = pattern.replace("\\", "/")
        if fnmatch.fnmatch(posix, normalized) or fnmatch.fnmatch(name, normalized):
            return pattern
    return None


def copy_file(source: Path, target: Path) -> None:
    if not source.is_file():
        raise FileNotFoundError(f"文件不存在：{source}")
    if target.exists():
        raise FileExistsError(f"提交目标冲突：{target.name}")
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)
    if sha256(source) != sha256(target):
        raise RuntimeError(f"复制后哈希不一致：{source}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    parser.add_argument("--replace", action="store_true", help="替换已存在的暂存目录和 ZIP")
    args = parser.parse_args()

    config_path = args.config.resolve()
    config = json.loads(config_path.read_text(encoding="utf-8"))
    base = config_path.parent
    workspace_check = resolve(base, config.get("workspace_root", "."))
    sources = list(config.get("papers", {}).values()) + [config.get("ai_report_pdf")]
    sources += [item["source"] for key in ("code_files", "extra_files") for item in config.get(key, [])]
    for raw in filter(None, sources):
        source_check = resolve(base, raw)
        if workspace_check not in source_check.parents:
            raise ValueError("提交源文件必须位于本题工作区内")
    output_dir = resolve(base, config["output_dir"])
    workspace = resolve(base, config.get("workspace_root", "."))
    delivery_root = (workspace / "deliverables").resolve()
    if output_dir != delivery_root and delivery_root not in output_dir.parents:
        raise ValueError("输出必须位于本题 deliverables 下")
    output_dir.mkdir(parents=True, exist_ok=True)
    stage = (output_dir / config["staging_name"]).resolve()
    if output_dir not in stage.parents or stage == output_dir:
        raise ValueError("staging_name 必须是 output_dir 下的单独目录")
    zip_path = (output_dir / config["zip_name"]).resolve()
    if output_dir not in zip_path.parents:
        raise ValueError("zip_name 必须位于 output_dir 下")

    replace = args.replace or bool(config.get("replace", False))
    if replace:
        raise ValueError("HaJiMi 保留历史提交包；请使用新的版本目录，不允许 replace")
    if stage == zip_path or stage in zip_path.parents or zip_path in stage.parents:
        raise ValueError("ZIP 与暂存目录不能重叠")
    if stage.exists():
        if not replace:
            raise FileExistsError(f"暂存目录已存在；确认后使用 --replace：{stage}")
        if stage.is_symlink():
            raise RuntimeError("拒绝删除符号链接暂存目录")
        shutil.rmtree(stage)
    if zip_path.exists() and not replace:
        raise FileExistsError(f"ZIP 已存在；确认后使用 --replace：{zip_path}")
    stage.mkdir(parents=True)

    excluded = [".env", ".env.*", "*.pem", "*.key", "*.aux", "*.log", "*.out", "*.toc", "*.synctex.gz", "*.fls", "*.fdb_latexmk", "*.pyc", ".git/*", "*/.git/*", ".hajimi/*", "*/.hajimi/*", "*__pycache__*", "*.mat"] + list(config.get("excluded_patterns", []))
    copied: list[dict[str, object]] = []

    paper_targets = {
        "with_code": "00_论文_含完整代码附录.pdf",
        "without_code": "01_论文_正文版_不含代码附录.pdf",
    }
    for key, target_name in paper_targets.items():
        raw = config.get("papers", {}).get(key)
        if not raw:
            continue
        source = resolve(base, raw)
        target = stage / target_name
        copy_file(source, target)
        copied.append({"source": source, "target": target, "appendix": "", "purpose": "论文", "required": True})

    ai_raw = config.get("ai_report_pdf")
    if ai_raw:
        source = resolve(base, ai_raw)
        target = stage / "AI工具使用详情.pdf"
        copy_file(source, target)
        copied.append({"source": source, "target": target, "appendix": "", "purpose": "AI工具使用详情", "required": True})

    code_rows: list[dict[str, object]] = []
    for item in config.get("code_files", []):
        source = resolve(base, item["source"])
        relative = item["target"].replace("\\", "/")
        matched = matches_exclusion(relative, excluded)
        if matched:
            raise ValueError(f"必要代码命中禁入模式 {matched}: {relative}")
        required = bool(item.get("required", True))
        if not source.is_file():
            if required:
                raise FileNotFoundError(f"必要代码不存在：{source}")
            continue
        target = safe_target(stage, relative)
        copy_file(source, target)
        row = {"source": source, "target": target, "appendix": item.get("appendix", ""), "purpose": item.get("purpose", ""), "required": required}
        copied.append(row)
        code_rows.append(row)

    for item in config.get("extra_files", []):
        source = resolve(base, item["source"])
        relative = item["target"].replace("\\", "/")
        matched = matches_exclusion(relative, excluded)
        if matched:
            raise ValueError(f"附加文件命中禁入模式 {matched}: {relative}")
        target = safe_target(stage, relative)
        copy_file(source, target)
        copied.append({"source": source, "target": target, "appendix": "", "purpose": item.get("purpose", "附加文件"), "required": True})

    package_title = config.get("package_title", "数学建模提交包")
    papers = [p.name for p in stage.glob("*.pdf") if p.name.startswith(("00_", "01_"))]
    readme = [f"# {package_title}", "", "## 请先打开", ""]
    readme.extend(f"- `{name}`" for name in sorted(papers))
    if (stage / "AI工具使用详情.pdf").exists():
        readme += ["", "`AI工具使用详情.pdf` 记录 AI 工具、实际使用环节、关键交互摘要和人工处理。"]
    readme += ["", "## 代码与复现", "", "代码位于 `代码/`，并按论文附录编号排列。"]
    if config.get("data_instructions"):
        readme += ["", "## 数据放置", "", str(config["data_instructions"])]
    if config.get("run_steps"):
        readme += ["", "## 最短运行顺序", ""]
        readme.extend(f"{i}. {step}" for i, step in enumerate(config["run_steps"], 1))
    (stage / "README_请先阅读.md").write_text("\n".join(readme) + "\n", encoding="utf-8")

    mapping = ["# 附录目录与代码对应表", "", "| 附录 | 提交文件 | 用途 | 属性 |", "|---|---|---|---|"]
    descriptions = ["# 代码文件说明", ""]
    original_rows = []
    for row in code_rows:
        rel = row["target"].relative_to(stage).as_posix()
        kind = "必需" if row["required"] else "可选"
        mapping.append(f"| {row['appendix']} | `{rel}` | {row['purpose']} | {kind} |")
        descriptions += [f"## {row['appendix']} · `{rel}`", "", f"- 用途：{row['purpose']}", f"- 属性：{kind}", ""]
        original_rows.append([os.path.relpath(row["source"], workspace).replace("\\", "/"), rel, row["appendix"], row["purpose"], kind])
    (stage / "02_附录目录与代码对应表.md").write_text("\n".join(mapping) + "\n", encoding="utf-8")
    (stage / "03_代码文件说明.md").write_text("\n".join(descriptions), encoding="utf-8")
    if not (stage / "代码" / "README_代码复现说明.md").exists():
        code_readme = ["# 代码复现说明", "", config.get("data_instructions", "按题目要求准备输入数据。"), "", "## 运行顺序", ""]
        code_readme.extend(f"{i}. {step}" for i, step in enumerate(config.get("run_steps", []), 1))
        (stage / "代码").mkdir(exist_ok=True)
        (stage / "代码" / "README_代码复现说明.md").write_text("\n".join(code_readme) + "\n", encoding="utf-8")
    with (stage / "05_原文件名与提交文件名对照.csv").open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["原文件", "提交文件", "附录编号", "用途", "属性"])
        writer.writerows(original_rows)

    manifest_path = stage / "04_文件校验清单.csv"
    files_before_manifest = sorted(p for p in stage.rglob("*") if p.is_file() and p != manifest_path)
    with manifest_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["相对路径", "字节数", "SHA256"])
        for path in files_before_manifest:
            writer.writerow([path.relative_to(stage).as_posix(), path.stat().st_size, sha256(path)])

    all_files = sorted(p for p in stage.rglob("*") if p.is_file())
    violations = []
    for path in all_files:
        rel = path.relative_to(stage).as_posix()
        match = matches_exclusion(rel, excluded)
        if match:
            violations.append((rel, match))
    if violations:
        raise RuntimeError(f"发现禁入文件：{violations}")

    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in all_files:
            archive.write(path, path.relative_to(stage).as_posix())

    with zipfile.ZipFile(zip_path) as archive:
        bad = archive.testzip()
        if bad:
            raise RuntimeError(f"ZIP 损坏：{bad}")
        names = archive.namelist()
        expected = {p.relative_to(stage).as_posix(): p for p in all_files}
        if len(names) != len(set(names)) or set(names) != set(expected):
            raise RuntimeError("ZIP 文件清单不完整或重复")
        for name, path in expected.items():
            if hashlib.sha256(archive.read(name)).hexdigest().upper() != sha256(path):
                raise RuntimeError(f"ZIP 文件哈希不一致：{name}")
        for source_key, target_name in paper_targets.items():
            raw = config.get("papers", {}).get(source_key)
            if raw and target_name in names:
                source_hash = sha256(resolve(base, raw))
                zip_hash = hashlib.sha256(archive.read(target_name)).hexdigest().upper()
                if source_hash != zip_hash:
                    raise RuntimeError(f"ZIP 内论文不是最新版：{target_name}")

    summary = {
        "staging_dir": str(stage),
        "zip_path": str(zip_path),
        "file_count": len(all_files),
        "zip_sha256": sha256(zip_path),
        "root_pdfs": sorted(p.name for p in stage.glob("*.pdf")),
        "excluded_violations": [],
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)

