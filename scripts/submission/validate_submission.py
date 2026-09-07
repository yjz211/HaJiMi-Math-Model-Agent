"""Validate an actual stage-9 ZIP against accepted inputs and generation receipts."""
import argparse
import csv
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import sys
import tempfile
import zipfile

import pymupdf as fitz

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_code_appendix import verify_body
from render_ai_usage_report import validate as validate_ai


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def validate(config_path):
    base = config_path.resolve().parent
    request = load(config_path)
    workspace = (base / request["workspace_root"]).resolve()

    def source(parent, raw):
        path = (parent / raw).resolve()
        if workspace not in path.parents or not path.is_file():
            raise ValueError("Submission validation input must be a current workspace file")
        return path

    archive_path = source(base, request["package_path"])
    package_base = archive_path.parent
    package_config = load(package_base / "generation-config.json")
    body = source(base, request["accepted_body_path"])
    if sha(body.read_bytes()) != request["accepted_body_sha256"]:
        raise ValueError("Accepted paper body changed")
    with_code = source(package_base, package_config["papers"]["with_code"])
    ai_pdf = source(package_base, package_config["ai_report_pdf"])
    appendix_receipt = load(with_code.parent / "appendix-receipt.json")
    ai_receipt = load(ai_pdf.parent / "ai-report-receipt.json")
    ai_config = load(ai_pdf.parent / "generation-config.json")
    final, errors = validate_ai(ai_config)
    if not final or errors:
        raise ValueError("AI usage facts are incomplete: " + "; ".join(errors))
    docx = ai_pdf.parent / "AI工具使用详情.docx"
    if sha(docx.read_bytes()) != ai_receipt["docx_sha256"] or sha(ai_pdf.read_bytes()) != ai_receipt["pdf_sha256"]:
        raise ValueError("AI report differs from its DOCX/PDF generation receipt")
    if appendix_receipt["body_sha256"] != request["accepted_body_sha256"] or appendix_receipt["with_code_sha256"] != sha(with_code.read_bytes()):
        raise ValueError("Appendix does not derive from the accepted body")
    required = {"00_论文_含完整代码附录.pdf": with_code, "01_论文_正文版_不含代码附录.pdf": body,
                "AI工具使用详情.pdf": ai_pdf}
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or archive.testzip():
            raise ValueError("ZIP is corrupt or has duplicate entries")
        for name in names:
            path = PurePosixPath(name)
            if path.is_absolute() or ".." in path.parts or "\\" in name or name.endswith("/"):
                raise ValueError("ZIP contains unsafe paths or empty directory records")
            if any(part.lower() in {".git", ".hajimi", "__pycache__", ".env"} for part in path.parts):
                raise ValueError("ZIP contains internal or secret files")
        manifest_name = "04_文件校验清单.csv"
        rows = list(csv.DictReader(io.StringIO(archive.read(manifest_name).decode("utf-8-sig"))))
        listed = [row["相对路径"] for row in rows]
        if len(listed) != len(set(listed)) or set(listed) != set(names) - {manifest_name}:
            raise ValueError("Checksum manifest does not cover the ZIP exactly")
        for row in rows:
            data = archive.read(row["相对路径"])
            if len(data) != int(row["字节数"]) or sha(data).upper() != row["SHA256"].upper():
                raise ValueError("ZIP checksum mismatch: " + row["相对路径"])
        for name, current in required.items():
            if archive.read(name) != current.read_bytes():
                raise ValueError("ZIP contains an outdated or missing PDF: " + name)
        for name in ["README_请先阅读.md", "02_附录目录与代码对应表.md", "03_代码文件说明.md", "05_原文件名与提交文件名对照.csv", "代码/README_代码复现说明.md"]:
            if not archive.read(name).strip():
                raise ValueError("Missing submission explanation: " + name)
        codes = package_config.get("code_files", [])
        if not codes:
            raise ValueError("No reproducible code is included")
        appendix_sources = {(item["path"], item["sha256"], item["appendix"]) for item in appendix_receipt["sources"]}
        packaged_sources = set()
        for code in codes:
            original = source(package_base, code["source"])
            content = original.read_bytes()
            if content != archive.read(code["target"].replace("\\", "/")):
                raise ValueError("Packaged code differs from its source")
            packaged_sources.add((original.relative_to(workspace).as_posix(), sha(content), code["appendix"]))
        if packaged_sources != appendix_sources:
            raise ValueError("Code appendix and packaged code mappings disagree")
        # Validate what the recipient receives, not only external source copies.
        with tempfile.TemporaryDirectory(prefix="zip-pdf-check-", dir=base) as raw:
            check_root = Path(raw)
            for name in required:
                (check_root / name).write_bytes(archive.read(name))
            verify_body(check_root / "01_论文_正文版_不含代码附录.pdf", check_root / "00_论文_含完整代码附录.pdf")
            previews = []
            for pdf_index, name in enumerate(required, 1):
                with fitz.open(check_root / name) as pdf:
                    for index, page in enumerate(pdf):
                        filename = f"review-{pdf_index}-page-{index + 1}.png"
                        page.get_pixmap(matrix=fitz.Matrix(1.5, 1.5), alpha=False).save(base / filename)
                        previews.append({"pdf": name, "page": index + 1, "path": filename,
                                         "sha256": sha((base / filename).read_bytes())})
    governed = [archive_path, body, with_code, ai_pdf, docx, package_base / "generation-config.json",
                with_code.parent / "appendix-receipt.json", ai_pdf.parent / "ai-report-receipt.json",
                ai_pdf.parent / "generation-config.json"]
    governed += [source(package_base, code["source"]) for code in codes]
    report = {"status": "technical_pass_visual_review_required", "zip_sha256": sha(archive_path.read_bytes()),
              "accepted_body_sha256": request["accepted_body_sha256"], "files": len(names), "previews": previews,
              "inputs": [{"path": path.relative_to(workspace).as_posix(), "sha256": sha(path.read_bytes())} for path in governed]}
    (base / "submission-validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("config", type=Path)
    print(json.dumps(validate(parser.parse_args().config), ensure_ascii=False))
