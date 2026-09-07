from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

from .provenance import _verify_artifact_ref


EXPECTED_CAPABILITIES = {
    "modeling-paper-standard": "1.0.0",
    "modeling-plot-suite": "1.0.0",
}


def stage8_checks(workspace: Path, *, strict: bool) -> list[dict[str, Any]]:
    severity = "error" if strict else "warning"
    checks: list[dict[str, Any]] = []
    capability_root_value = os.environ.get("HAJIMI_CAPABILITIES_ROOT", "").strip()
    if not capability_root_value:
        return [_check("bundled_capabilities", False, "HAJIMI_CAPABILITIES_ROOT is unavailable", severity)]
    capability_root = Path(capability_root_value).resolve()
    manifests: dict[str, tuple[Path, dict[str, Any], str]] = {}
    for capability_id, version in EXPECTED_CAPABILITIES.items():
        root = capability_root / capability_id / version
        manifest_path = root / "manifest.json"
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if (manifest.get("schemaVersion") != "hajimi.capability-manifest.v1"
                    or manifest.get("id") != capability_id or manifest.get("version") != version):
                raise ValueError("identity mismatch")
            allowed_stages = manifest.get("allowedStages")
            if (not isinstance(allowed_stages, list) or not allowed_stages
                    or any(not isinstance(stage, int) or isinstance(stage, bool) or stage < 0 or stage > 9 for stage in allowed_stages)
                    or len(set(allowed_stages)) != len(allowed_stages)):
                raise ValueError("invalid allowedStages")
            activation = manifest.get("activation")
            if (not isinstance(activation, dict) or activation.get("stages") != allowed_stages
                    or activation.get("requiresActiveEvidenceFreeze") is not True
                    or activation.get("persistRoute") is not True):
                raise ValueError("invalid activation contract")
            for field in ("requiredInputs", "toolScopes"):
                values = manifest.get(field)
                if not isinstance(values, list) or not values or any(not isinstance(value, str) or not value.strip() for value in values):
                    raise ValueError(f"invalid {field}")
            files = manifest.get("files")
            if not isinstance(files, list) or not files:
                raise ValueError("empty file manifest")
            listed_paths: set[str] = set()
            for entry in files:
                if (not isinstance(entry, dict) or not isinstance(entry.get("path"), str)
                        or not isinstance(entry.get("sizeBytes"), int)
                        or not isinstance(entry.get("sha256"), str) or len(entry["sha256"]) != 64
                        or entry["path"] in listed_paths):
                    raise ValueError("invalid file record")
                path = (root / str(entry["path"])).resolve()
                path.relative_to(root)
                if not path.is_file() or path.is_symlink() or path.stat().st_size != entry["sizeBytes"] or _sha256(path) != entry["sha256"]:
                    raise ValueError(f"file drift: {entry.get('path')}")
                listed_paths.add(entry["path"])
            actual_paths = {
                path.relative_to(root).as_posix()
                for path in root.rglob("*")
                if path.is_file() and path.name not in {"manifest.json", "manifest.json.tmp"}
            }
            if actual_paths != listed_paths:
                raise ValueError("file manifest coverage mismatch")
            fragments = manifest.get("contextFragments")
            if not isinstance(fragments, list) or not fragments or fragments != manifest.get("fragments"):
                raise ValueError("invalid context fragment contract")
            fragment_ids: set[str] = set()
            for fragment in fragments:
                if (not isinstance(fragment, dict) or not isinstance(fragment.get("id"), str)
                        or fragment["id"] in fragment_ids or fragment.get("path") not in listed_paths
                        or not isinstance(fragment.get("priority"), (int, float))
                        or not isinstance(fragment.get("stages"), list)
                        or any(stage not in allowed_stages for stage in fragment["stages"])):
                    raise ValueError("invalid context fragment")
                fragment_ids.add(fragment["id"])
            manifest_hash = hashlib.sha256(json.dumps(manifest, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
            manifests[capability_id] = (root, manifest, manifest_hash)
            checks.append(_check(f"capability_{capability_id}", True, f"{len(manifest.get('files', []))} files verified"))
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
            checks.append(_check(f"capability_{capability_id}", False, str(error), severity))

    state_path = workspace / ".hajimi" / "state.json"
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        checks.append(_check("stage8_state", False, f"Cannot inspect stage 8: {error}", severity))
        return checks
    routes = state.get("capabilityRoutes", [])
    missing_routes: list[str] = []
    for key, version in EXPECTED_CAPABILITIES.items():
        if key not in manifests:
            missing_routes.append(f"{key}@{version}")
            continue
        manifest = manifests[key][1]
        manifest_hash = manifests[key][2]
        available_fragment_ids = {fragment["id"] for fragment in manifest["contextFragments"] if 8 in fragment["stages"]}
        route = next((item for item in routes if isinstance(item, dict)
                      and item.get("stage") == 8 and item.get("capabilityId") == key
                      and item.get("capabilityVersion") == version and item.get("sourceHash") == manifest_hash), None)
        fragment_ids = route.get("fragmentIds") if isinstance(route, dict) else None
        if (not isinstance(route, dict) or route.get("availability") != "ready"
                or route.get("persisted") is not True or not isinstance(fragment_ids, list) or not fragment_ids
                or any(fragment not in available_fragment_ids for fragment in fragment_ids)):
            missing_routes.append(f"{key}@{version}")
    checks.append(_check("stage8_joint_route", not missing_routes, "Both capabilities routed" if not missing_routes else f"Missing routes: {', '.join(missing_routes)}", severity))
    active_freezes = [item for item in state.get("provenance", {}).get("freezes", []) if item.get("status") == "active"]
    checks.append(_check("stage8_evidence_freeze", bool(active_freezes), f"{len(active_freezes)} active freeze(s); created automatically when binding publications", "warning"))

    config_path = workspace / "paper" / "hajimi-paper-config.json"
    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
        checks.append(_check("stage8_paper_config", True, "paper/hajimi-paper-config.json"))
    except (OSError, json.JSONDecodeError) as error:
        checks.append(_check("stage8_paper_config", False, f"Missing or invalid paper config: {error}", severity))
        config = {}
    try:
        main_tex = _workspace_path(workspace, config.get("mainTex", "paper/main.tex"))
        final_pdf = _workspace_path(workspace, config.get("finalPdf", "paper/main.pdf"))
        figure_manifest = _workspace_path(workspace, config.get("figureManifest", "paper/FIGURE_MANIFEST.md"))
    except ValueError as error:
        checks.append(_check("stage8_paper_config_paths", False, f"Configured path escapes workspace: {error}", severity))
        return checks
    questions = int(config.get("questions", len(state.get("questions", [])) or 0))
    paper_type = str(config.get("paperType", "data-analysis" if "data" in state.get("problemTags", []) else "standard"))
    topic_terms = [str(term) for term in config.get("topicTerms", [])]
    optimization = config.get("optimizationQuestions", [])

    if "modeling-plot-suite" in manifests and figure_manifest.is_file():
        plot_root = manifests["modeling-plot-suite"][0]
        checks.append(_run(
            "stage8_figure_manifest",
            [sys.executable, str(plot_root / "resources" / "scripts" / "validate_figure_manifest.py"), "--manifest", str(figure_manifest), "--profile", "modeling", "--full-paper"],
            workspace,
        ))
    else:
        checks.append(_check("stage8_figure_manifest", False, f"Figure manifest not found: {figure_manifest}", severity))

    if "modeling-paper-standard" in manifests and main_tex.is_file():
        paper_root = manifests["modeling-paper-standard"][0]
        scripts = paper_root / "resources" / "scripts"
        checks.extend(_equation_checks(workspace, state, config, main_tex, scripts))
        structure = [sys.executable, str(scripts / "check_latex_structure.py"), str(main_tex), "--paper-type", paper_type]
        if questions:
            structure.extend(["--questions", str(questions)])
        for item in optimization if isinstance(optimization, list) else []:
            question = int(item["question"])
            constraint_min = int(item["constraintMin"])
            structure.extend(["--optimization-question", str(question), "--optimization-constraint-min", f"{question}:{constraint_min}"])
        checks.append(_run("stage8_paper_structure", structure, workspace))
        checks.append(_run("stage8_section_balance", [sys.executable, str(scripts / "check_section_balance.py"), "--main", str(main_tex)], workspace))
        language = [sys.executable, str(scripts / "check_latex_language.py"), str(main_tex)]
        for term in topic_terms:
            language.extend(["--topic-term", term])
        checks.append(_run("stage8_paper_language", language, workspace))
        checks.append(_run("stage8_latex_layout", [sys.executable, str(scripts / "check_latex_layout_risks.py"), str(main_tex)], workspace))
        if final_pdf.is_file():
            checks.append(_run("stage8_pdf_typography", [sys.executable, str(scripts / "check_pdf_typography.py"), str(final_pdf)], workspace))
            checks.append(_run("stage8_pdf_page_gate", [sys.executable, str(scripts / "check_pdf_page_gate.py"), str(final_pdf)], workspace))
            checks.append(_run("stage8_pdf_large_float", [sys.executable, str(scripts / "check_pdf_large_float.py"), str(final_pdf)], workspace))
            checks.append(_run("stage8_pdf_page_flow", [sys.executable, str(scripts / "check_pdf_page_flow.py"), str(final_pdf)], workspace))
        else:
            checks.append(_check("stage8_pdf_checks", False, f"Final PDF not found: {final_pdf}", severity))
    else:
        checks.append(_check("stage8_paper_checks", False, f"Main LaTeX file not found: {main_tex}", severity))
    return apply_light_review(checks)


def apply_light_review(checks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    advisory = {"stage8_section_balance", "stage8_paper_language", "stage8_latex_layout", "stage8_pdf_typography", "stage8_pdf_page_gate", "stage8_pdf_large_float", "stage8_pdf_page_flow"}
    return [{**item, "severity": "warning"} if item["name"] in advisory else item for item in checks]


def _equation_checks(workspace: Path, state: dict[str, Any], config: dict[str, Any], main_tex: Path, scripts: Path) -> list[dict[str, Any]]:
    identifiers = config.get("equationBaselineArtifactIds")
    if (not isinstance(identifiers, list) or not identifiers
            or any(not isinstance(item, str) or not item for item in identifiers)
            or len(set(identifiers)) != len(identifiers)):
        return [_check("stage8_equation_baseline", False, "Set equationBaselineArtifactIds to registered technical equation artifact(s), not the rewritten paper")]
    registry_path = workspace / ".hajimi" / "artifacts.jsonl"
    try:
        records = [json.loads(line) for line in registry_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        eligible = {ref["id"]: ref for ref in records if isinstance(ref, dict) and "id" in ref}
    except (OSError, ValueError, TypeError):
        eligible = {}
    # Legacy records may live only in experiment outputs.
    for experiment in state.get("provenance", {}).get("experiments", []):
        for ref in experiment.get("outputRefs", []):
            if isinstance(ref, dict) and "id" in ref:
                eligible.setdefault(ref["id"], ref)
    checks = []
    for index, identifier in enumerate(identifiers):
        name = f"stage8_equation_baseline_{index + 1}"
        try:
            ref = eligible.get(identifier)
            if ref is None:
                raise ValueError(f"{identifier}: not a registered technical artifact")
            error = _verify_artifact_ref(workspace, ref)
            if error:
                raise ValueError(error)
            baseline = _workspace_path(workspace, ref["path"])
            if baseline == main_tex:
                raise ValueError("Technical baseline cannot be the current paper")
            # Freeze a self-contained technical excerpt so untracked includes
            # cannot change the mathematical baseline behind its recorded hash.
            source = re.sub(r"(?<!\\)%.*", "", baseline.read_text(encoding="utf-8"))
            if re.search(r"\\(?:input|include)\b", source):
                raise ValueError("Freeze a self-contained equation baseline with inputs expanded")
            if not re.search(r"\\label\{[^}]+\}", source):
                raise ValueError("Technical equation baseline has no stable labels")
            checks.append(_check(name, True, f"{identifier}: {ref['sha256']}"))
            checks.append(_run(f"stage8_equation_drift_{index + 1}", [sys.executable, "-B", "-X", "utf8", str(scripts / "check_latex_equation_drift.py"), str(baseline), str(main_tex), "--require-all", "--exact-labels"], workspace))
        except (OSError, KeyError, TypeError, ValueError) as error:
            checks.append(_check(name, False, str(error)))
    return checks


def _workspace_path(workspace: Path, value: Any) -> Path:
    path = (workspace / str(value)).resolve()
    path.relative_to(workspace)
    return path


def _run(name: str, command: list[str], cwd: Path) -> dict[str, Any]:
    try:
        if command[0] == sys.executable:
            command = [command[0], "-X", "utf8", *command[1:]]
        result = subprocess.run(command, cwd=cwd, env={**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "PYTHONUTF8": "1"}, text=True, encoding="utf-8", errors="replace", capture_output=True, timeout=120, check=False)
        detail = (result.stdout + "\n" + result.stderr).strip()[-2000:] or f"exit {result.returncode}"
        return _check(name, result.returncode == 0, detail)
    except (OSError, subprocess.TimeoutExpired) as error:
        return _check(name, False, str(error))


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _check(name: str, passed: bool, detail: str, severity: str = "error") -> dict[str, Any]:
    return {"name": name, "passed": passed, "detail": detail, "severity": severity}
