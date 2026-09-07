from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .provenance import provenance_checks
from .stage8_validation import stage8_checks


@dataclass(frozen=True)
class Check:
    name: str
    passed: bool
    detail: str
    severity: str = "error"


def validate_delivery(workspace: Path, *, strict: bool = True) -> dict[str, Any]:
    workspace = workspace.resolve()
    metadata = workspace / ".hajimi"
    checks: list[Check] = []

    checks.append(_check_input_manifest(workspace, metadata))
    checks.extend(_check_registered_artifacts(workspace, metadata))
    checks.extend(_check_figures(workspace / "figures", strict=strict))
    checks.extend(_check_paper(workspace / "paper", strict=strict))
    checks.extend(Check(**item) for item in provenance_checks(workspace, strict=strict))
    checks.extend(Check(**item) for item in stage8_checks(workspace, strict=strict))

    source_files = _regular_files(workspace / "src")
    result_files = [
        path
        for root in (workspace / "data" / "derived", workspace / "output")
        for path in _regular_files(root)
        if path.suffix.lower() in {".csv", ".json", ".jsonl", ".parquet", ".xlsx", ".txt"}
    ]
    checks.append(Check("reproducible_source", bool(source_files), f"{len(source_files)} source file(s) found"))
    checks.append(Check("machine_readable_results", bool(result_files), f"{len(result_files)} result file(s) found"))

    errors = [check for check in checks if not check.passed and check.severity == "error"]
    report = {
        "schema_version": "hajimi.validation.v1",
        "validated_at": datetime.now(UTC).isoformat(),
        "strict": strict,
        "passed": not errors,
        "checks": [asdict(check) for check in checks],
        "summary": {"passed": sum(check.passed for check in checks), "failed": len(checks) - sum(check.passed for check in checks)},
    }
    metadata.mkdir(parents=True, exist_ok=True)
    _write_json_atomic(metadata / "validation.json", report)
    return report


def _check_input_manifest(workspace: Path, metadata: Path) -> Check:
    manifest_path = metadata / "input-manifest.json"
    if not manifest_path.is_file():
        return Check("frozen_inputs", False, "Missing .hajimi/input-manifest.json")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        files = manifest.get("files", [])
        for ref in files:
            path = workspace / str(ref["path"])
            if not path.is_file():
                return Check("frozen_inputs", False, f"Frozen input is missing: {ref['path']}")
            actual = _sha256(path)
            if actual != ref["sha256"]:
                return Check("frozen_inputs", False, f"Frozen input changed: {ref['path']}")
        return Check("frozen_inputs", bool(files), f"Verified {len(files)} frozen input file(s)")
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        return Check("frozen_inputs", False, f"Invalid input manifest: {error}")


def _check_registered_artifacts(workspace: Path, metadata: Path) -> list[Check]:
    registry = metadata / "artifacts.jsonl"
    if not registry.is_file():
        return [Check("registered_artifacts", False, "No registered artifacts")]
    checks: list[Check] = []
    records = 0
    latest_by_path: dict[str, tuple[int, dict[str, Any]]] = {}
    for line_number, line in enumerate(registry.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        records += 1
        try:
            record = json.loads(line)
            artifact_path = str(record["path"])
            record["sha256"]
            latest_by_path[artifact_path] = (line_number, record)
        except (KeyError, TypeError, json.JSONDecodeError) as error:
            checks.append(Check(f"artifact_{line_number}", False, f"Invalid artifact record: {error}"))

    # The registry is append-only. Only the latest version at each logical
    # path is part of the current delivery; older versions may be absent from
    # a resumed checkpoint. Active frozen evidence is checked separately.
    for line_number, record in latest_by_path.values():
        recorded_path = str(record.get("frozenPath") or record["path"])
        path = workspace / recorded_path
        if not path.is_file():
            checks.append(Check(f"artifact_{line_number}", False, f"Missing artifact version: {recorded_path}"))
        elif _sha256(path) != record["sha256"]:
            checks.append(Check(f"artifact_{line_number}", False, f"Artifact version hash changed: {recorded_path}"))
    checks.insert(0, Check(
        "registered_artifacts", records > 0,
        f"Checked {records} registered artifact record(s), {len(latest_by_path)} current path(s)",
    ))
    return checks


def _check_figures(figures: Path, *, strict: bool) -> list[Check]:
    image_files = [path for path in _regular_files(figures) if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}]
    if not image_files:
        return [Check("figures", False, "No generated figure found", "error" if strict else "warning")]
    from PIL import Image

    checks: list[Check] = []
    for path in image_files:
        try:
            with Image.open(path) as image:
                image.verify()
            with Image.open(path) as image:
                width, height = image.size
            checks.append(Check(f"figure_{path.name}", width >= 640 and height >= 360, f"{width}x{height}", "warning"))
        except Exception as error:  # Pillow exposes several decoder-specific errors.
            checks.append(Check(f"figure_{path.name}", False, f"Unreadable figure: {error}"))
    return checks


def _check_paper(paper: Path, *, strict: bool) -> list[Check]:
    tex_files = [path for path in _regular_files(paper) if path.suffix.lower() == ".tex"]
    pdf_files = [path for path in _regular_files(paper) if path.suffix.lower() == ".pdf"]
    checks = [Check("latex_source", bool(tex_files), f"{len(tex_files)} LaTeX source file(s)", "error" if strict else "warning")]
    if not pdf_files:
        checks.append(Check("paper_pdf", False, "No compiled paper PDF", "error" if strict else "warning"))
        return checks
    from pypdf import PdfReader

    for path in pdf_files:
        try:
            reader = PdfReader(path)
            text = "".join(page.extract_text() or "" for page in reader.pages)
            checks.append(Check(f"pdf_{path.name}", bool(reader.pages) and bool(text.strip()), f"{len(reader.pages)} page(s), {len(text)} text characters"))
        except Exception as error:
            checks.append(Check(f"pdf_{path.name}", False, f"Unreadable PDF: {error}"))
    return checks


def _regular_files(root: Path) -> list[Path]:
    return sorted(path for path in root.rglob("*") if path.is_file() and not path.is_symlink()) if root.is_dir() else []


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json_atomic(path: Path, value: Any) -> None:
    temporary = path.with_name(f"{path.name}.tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)
