"""Append readable source listings to an accepted PDF without rebuilding its body."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil

import pymupdf as fitz


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def confined(base: Path, root: Path, raw: str) -> Path:
    path = (base / raw).resolve()
    if root not in path.parents or not path.is_file():
        raise ValueError("Appendix input must be an existing file inside the task workspace")
    return path


def verify_body(body: Path, combined: Path) -> int:
    with fitz.open(body) as original, fitz.open(combined) as appended:
        if len(appended) <= len(original):
            raise ValueError("Code appendix has no added pages")
        for index in range(len(original)):
            left, right = original[index], appended[index]
            if left.rect != right.rect or left.get_text() != right.get_text():
                raise ValueError(f"Accepted body changed on page {index + 1}")
            a = left.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            b = right.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
            if a.samples != b.samples:
                raise ValueError(f"Accepted body rendering changed on page {index + 1}")
        return len(original)


def build(config_path: Path) -> dict:
    base = config_path.resolve().parent
    config = json.loads(config_path.read_text(encoding="utf-8"))
    workspace = (base / config["workspace_root"]).resolve()
    if (workspace / "deliverables").resolve() not in base.parents:
        raise ValueError("Appendix output must be a new directory under deliverables")
    body = confined(base, workspace, config["papers"]["without_code"])
    rows = config.get("code_files", [])
    if not rows:
        raise ValueError("At least one actual source file is required for a code appendix")
    inputs = []
    for row in rows:
        path = confined(base, workspace, row["source"])
        if path.suffix.lower() not in {".py", ".r", ".m", ".jl", ".c", ".cpp", ".h", ".hpp", ".java", ".js", ".ts", ".sql", ".sh"}:
            raise ValueError("Appendix requires plain-text executable source, not data or binary files")
        if not str(row.get("appendix", "")).strip() or not str(row.get("purpose", "")).strip():
            raise ValueError("Each source requires an appendix id and Chinese purpose")
        inputs.append((row, path, path.read_text(encoding="utf-8-sig"), digest(path)))
    without = base / "01_论文_正文版_不含代码附录.pdf"
    combined = base / "00_论文_含完整代码附录.pdf"
    if without.exists() or combined.exists():
        raise FileExistsError("Refusing to overwrite an existing submission version")
    body_hash = digest(body)
    font = fitz.Font("cjk")
    appendix = fitz.open()
    page = None
    cursor = 0

    def draw(text, x, y, size=10, color=(0, 0, 0)):
        writer = fitz.TextWriter(page.rect)
        writer.append((x, y), text, font=font, fontsize=size)
        writer.write_text(page, color=color)

    def new_page(title):
        nonlocal page, cursor
        page = appendix.new_page(width=595.276, height=841.89)
        draw(title, 45, 42, 11)
        draw(f"代码附录 · {len(appendix)}", 255, 810, 9)
        cursor = 70

    def wrapped(text, width, size):
        line = ""
        for char in text:
            if line and font.text_length(line + char, fontsize=size) > width:
                yield line
                line = ""
            line += char
        yield line

    new_page("附录 代码目录")
    for row, path, _, _ in inputs:
        for line in wrapped(f"{row['appendix']}  {row['purpose']}  {path.name}", 505, 11):
            if cursor > 765:
                new_page("附录 代码目录（续）")
            draw(line, 45, cursor, 11)
            cursor += 18
        cursor += 8
    for source_index, (row, path, source, _) in enumerate(inputs):
        title = f"{row['appendix']}  {path.name}"
        if source_index == 0 and cursor < 650:
            cursor += 12
            draw(title, 45, cursor, 11)
            cursor += 26
        else:
            new_page(title)
        for line in wrapped(str(row["purpose"]), 505, 11):
            if cursor > 765:
                new_page(title + "（续）")
            draw(line, 45, cursor, 11)
            cursor += 18
        cursor += 10
        for number, raw in enumerate(source.splitlines(), 1):
            for part, line in enumerate(wrapped(raw.expandtabs(4), 463, 9.5)):
                if cursor > 770:
                    new_page(title + "（续）")
                draw(str(number) if part == 0 else "↳", 45, cursor, 8, (0.4, 0.4, 0.4))
                draw(line, 85, cursor, 9.5)
                cursor += 14
    with fitz.open(body) as document:
        if not document.is_pdf or document.needs_pass or len(document) == 0:
            raise ValueError("Accepted body must be an unlocked, nonempty PDF")
        body_pages = len(document)
        document.insert_pdf(appendix)
        document.set_metadata({})
        document.save(combined, garbage=4, deflate=True)
    appendix.close()
    shutil.copy2(body, without)
    verify_body(without, combined)
    if digest(body) != body_hash or digest(without) != body_hash:
        raise ValueError("Accepted body changed during generation")
    for _, path, _, sha in inputs:
        if digest(path) != sha:
            raise ValueError("Source changed during appendix generation")
    receipt = {"body_pages": body_pages, "without_code": without.name, "with_code": combined.name,
               "body_sha256": body_hash, "with_code_sha256": digest(combined),
               "sources": [{"appendix": row["appendix"], "path": path.relative_to(workspace).as_posix(), "sha256": sha}
                           for row, path, _, sha in inputs], "visual_review": "pending"}
    (base / "appendix-receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2), encoding="utf-8")
    return receipt


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    print(json.dumps(build(parser.parse_args().config), ensure_ascii=False))
