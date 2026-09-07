from __future__ import annotations

import hashlib
import json
from pathlib import Path

from hajimi_toolkit.inputs import inspect_input
from hajimi_toolkit.cli import main
from hajimi_toolkit.validation import validate_delivery
from hajimi_toolkit.provenance import validate_provenance
from hajimi_toolkit.stage8_validation import stage8_checks


def _artifact(tmp_path: Path, relative_path: str, content: str) -> dict[str, object]:
    path = tmp_path / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    frozen = tmp_path / ".hajimi" / "cas" / "sha256" / digest[:2] / digest
    frozen.parent.mkdir(parents=True, exist_ok=True)
    frozen.write_bytes(path.read_bytes())
    return {
        "id": f"sha256:{digest}",
        "path": relative_path,
        "frozenPath": f".hajimi/cas/sha256/{digest[:2]}/{digest}",
        "sha256": digest,
        "sizeBytes": path.stat().st_size,
        "mediaType": "application/json",
    }


def test_inspect_csv(tmp_path: Path) -> None:
    path = tmp_path / "data.csv"
    path.write_text("x,y\n1,2\n3,4\n", encoding="utf-8")
    result = inspect_input(path)
    assert result["row_count"] == 2
    assert result["columns"] == ["x", "y"]


def test_validation_detects_a_complete_minimal_delivery(tmp_path: Path) -> None:
    for directory in ("input", "src", "data/derived", "figures", "paper", "output", ".hajimi"):
        (tmp_path / directory).mkdir(parents=True, exist_ok=True)
    input_path = tmp_path / "input" / "problem.txt"
    input_path.write_text("problem", encoding="utf-8")
    input_hash = hashlib.sha256(input_path.read_bytes()).hexdigest()
    (tmp_path / ".hajimi" / "input-manifest.json").write_text(
        json.dumps({"files": [{"path": "input/problem.txt", "sha256": input_hash}]}), encoding="utf-8"
    )
    (tmp_path / "src" / "solve.py").write_text("print(1)\n", encoding="utf-8")
    result_path = tmp_path / "output" / "result.json"
    result_path.write_text('{"answer": 1}\n', encoding="utf-8")
    result_hash = hashlib.sha256(result_path.read_bytes()).hexdigest()
    (tmp_path / ".hajimi" / "artifacts.jsonl").write_text(
        json.dumps({"path": "output/result.json", "sha256": result_hash}) + "\n", encoding="utf-8"
    )

    report = validate_delivery(tmp_path, strict=False)

    assert report["passed"] is True
    assert (tmp_path / ".hajimi" / "validation.json").is_file()


def test_registered_artifact_history_uses_immutable_version(tmp_path: Path) -> None:
    for directory in ("input", "src", "data/derived", "figures", "paper", "output", ".hajimi"):
        (tmp_path / directory).mkdir(parents=True, exist_ok=True)
    input_path = tmp_path / "input/problem.txt"
    input_path.write_text("problem", encoding="utf-8")
    input_hash = hashlib.sha256(input_path.read_bytes()).hexdigest()
    (tmp_path / ".hajimi/input-manifest.json").write_text(
        json.dumps({"files": [{"path": "input/problem.txt", "sha256": input_hash}]}), encoding="utf-8"
    )
    (tmp_path / "src/solve.py").write_text("print(1)\n", encoding="utf-8")
    old_artifact = _artifact(tmp_path, "output/result.json", '{"answer": 1}\n')
    artifact = _artifact(tmp_path, "output/result.json", '{"answer": 2}\n')
    (tmp_path / str(old_artifact["frozenPath"])).unlink()
    (tmp_path / ".hajimi/artifacts.jsonl").write_text(
        json.dumps(old_artifact) + "\n" + json.dumps(artifact) + "\n", encoding="utf-8"
    )

    assert validate_delivery(tmp_path, strict=False)["passed"] is True

    (tmp_path / str(artifact["frozenPath"])).write_text("corrupt", encoding="utf-8")
    report = validate_delivery(tmp_path, strict=False)
    assert report["passed"] is False
    assert any("Artifact version hash changed" in item["detail"] for item in report["checks"])


def test_registered_legacy_artifact_checks_working_path(tmp_path: Path) -> None:
    for directory in ("input", "src", "data/derived", "figures", "paper", "output", ".hajimi"):
        (tmp_path / directory).mkdir(parents=True, exist_ok=True)
    input_path = tmp_path / "input/problem.txt"
    input_path.write_text("problem", encoding="utf-8")
    input_hash = hashlib.sha256(input_path.read_bytes()).hexdigest()
    (tmp_path / ".hajimi/input-manifest.json").write_text(
        json.dumps({"files": [{"path": "input/problem.txt", "sha256": input_hash}]}), encoding="utf-8"
    )
    (tmp_path / "src/solve.py").write_text("print(1)\n", encoding="utf-8")
    path = tmp_path / "output/result.json"
    path.write_text('{"answer": 1}\n', encoding="utf-8")
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    (tmp_path / ".hajimi/artifacts.jsonl").write_text(
        json.dumps({"path": "output/result.json", "sha256": digest}) + "\n", encoding="utf-8"
    )

    path.write_text('{"answer": 2}\n', encoding="utf-8")
    report = validate_delivery(tmp_path, strict=False)
    assert report["passed"] is False
    assert any("Artifact version hash changed" in item["detail"] for item in report["checks"])


def test_module_cli_entrypoint_reports_validation_result(tmp_path: Path, capsys) -> None:
    exit_code = main(["validate-delivery", str(tmp_path), "--no-strict"])
    assert exit_code == 2
    assert '"schema_version": "hajimi.validation.v1"' in capsys.readouterr().out


def test_provenance_validation_enforces_active_freeze_for_publication(tmp_path: Path) -> None:
    for directory in ("output", ".hajimi/cas/sha256"):
        (tmp_path / directory).mkdir(parents=True, exist_ok=True)
    output = tmp_path / "output" / "result.json"
    output.write_text('{"answer": 42}\n', encoding="utf-8")
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    frozen = tmp_path / ".hajimi" / "cas" / "sha256" / digest[:2] / digest
    frozen.parent.mkdir(parents=True, exist_ok=True)
    frozen.write_bytes(output.read_bytes())
    artifact = {
        "id": f"sha256:{digest}",
        "path": "output/result.json",
        "frozenPath": f".hajimi/cas/sha256/{digest[:2]}/{digest}",
        "sha256": digest,
        "sizeBytes": output.stat().st_size,
        "mediaType": "application/json",
    }
    state = {
        "schemaVersion": "hajimi.workflow-state.v2",
        "revision": 4,
        "provenance": {
            "experiments": [{
                "experimentId": "exp-1", "status": "succeeded", "trust": "verified",
                "selection": "selected", "command": "python solve.py", "environment": {},
                "codeRefs": [], "inputRefs": [], "parameterRefs": [], "outputRefs": [artifact],
            }],
            "evidence": [{
                "evidenceId": "ev-1", "experimentRefs": ["exp-1"], "artifactRefs": [artifact["id"]],
                "status": "frozen", "domainValidationStatus": "accepted",
            }],
            "claims": [{
                "claimId": "claim-1", "kind": "numeric", "status": "supported", "evidenceRefs": ["ev-1"],
            }],
            "freezes": [{
                "freezeId": "freeze-1", "status": "active", "evidenceRefs": ["ev-1"], "claimRefs": ["claim-1"],
            }],
            "bindings": [{
                "bindingId": "binding-1", "status": "candidate", "claimRefs": ["claim-1"],
            }],
        },
    }
    state_path = tmp_path / ".hajimi" / "state.json"
    state_path.write_text(json.dumps(state), encoding="utf-8")
    assert validate_provenance(tmp_path)["passed"] is True

    state["provenance"]["freezes"] = []
    state_path.write_text(json.dumps(state), encoding="utf-8")
    report = validate_provenance(tmp_path)
    assert report["passed"] is False
    assert any(check["name"] == "binding_binding-1_freeze" for check in report["checks"])


def test_provenance_validation_checks_cross_validation_and_experiment_selection(tmp_path: Path) -> None:
    result = _artifact(tmp_path, "output/result.json", '{"answer": 42}\n')
    state = {
        "schemaVersion": "hajimi.workflow-state.v2",
        "revision": 1,
        "provenance": {
            "experiments": [
                {
                    "experimentId": "exp-a", "status": "succeeded", "trust": "verified", "selection": "selected",
                    "command": "python solver_a.py", "environment": {}, "seed": 1,
                    "codeRefs": [], "inputRefs": [], "parameterRefs": [], "outputRefs": [result],
                },
                {
                    "experimentId": "exp-b", "status": "succeeded", "trust": "verified", "selection": "candidate",
                    "command": "python solver_b.py", "environment": {}, "seed": 2,
                    "codeRefs": [], "inputRefs": [], "parameterRefs": [], "outputRefs": [result],
                },
            ],
            "evidence": [{
                "evidenceId": "ev-cross", "experimentRefs": ["exp-a", "exp-b"],
                "artifactRefs": [result["id"]], "status": "cross_validated", "domainValidationStatus": "accepted",
            }],
            "claims": [], "freezes": [], "bindings": [],
        },
    }
    state_path = tmp_path / ".hajimi" / "state.json"
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(json.dumps(state), encoding="utf-8")
    assert validate_provenance(tmp_path)["passed"] is True

    state["provenance"]["experiments"][1]["command"] = "python solver_a.py"
    state["provenance"]["experiments"][1]["seed"] = 1
    state_path.write_text(json.dumps(state), encoding="utf-8")
    report = validate_provenance(tmp_path)
    assert report["passed"] is False
    assert any(check["name"] == "evidence_ev-cross_cross_validation" for check in report["checks"])

    state["provenance"]["experiments"][1]["command"] = "python solver_b.py"
    state["provenance"]["experiments"][1]["seed"] = 2
    state["provenance"]["experiments"][1]["selection"] = "invalidated"
    state_path.write_text(json.dumps(state), encoding="utf-8")
    report = validate_provenance(tmp_path)
    assert report["passed"] is False
    assert any("Ineligible formal experiment exp-b" in check["detail"] for check in report["checks"])


def test_provenance_validation_checks_numeric_paper_claim_markers(tmp_path: Path) -> None:
    result = _artifact(tmp_path, "output/result.json", '{"answer": 42}\n')
    marker = _artifact(
        tmp_path,
        "paper/claim-bindings.json",
        json.dumps({"schemaVersion": "hajimi.claim-bindings.v1", "claims": [{"claimId": "claim-1", "value": 42, "unit": "kg"}]}),
    )
    state = {
        "schemaVersion": "hajimi.workflow-state.v2",
        "revision": 1,
        "provenance": {
            "experiments": [{
                "experimentId": "exp-1", "status": "succeeded", "trust": "verified", "selection": "selected",
                "command": "python solve.py", "environment": {}, "codeRefs": [], "inputRefs": [],
                "parameterRefs": [], "outputRefs": [result],
            }],
            "evidence": [{
                "evidenceId": "ev-1", "experimentRefs": ["exp-1"], "artifactRefs": [result["id"]],
                "status": "frozen", "domainValidationStatus": "accepted",
            }],
            "claims": [{
                "claimId": "claim-1", "kind": "numeric", "value": 42, "unit": "kg",
                "status": "supported", "evidenceRefs": ["ev-1"],
            }],
            "freezes": [{
                "freezeId": "freeze-1", "status": "active", "evidenceRefs": ["ev-1"], "claimRefs": ["claim-1"],
            }],
            "bindings": [{
                "bindingId": "paper-1", "kind": "paper", "status": "candidate",
                "claimRefs": ["claim-1"], "claimMarkerRef": marker,
            }],
        },
    }
    state_path = tmp_path / ".hajimi" / "state.json"
    state_path.write_text(json.dumps(state), encoding="utf-8")
    assert validate_provenance(tmp_path)["passed"] is True

    wrong_marker = _artifact(
        tmp_path,
        "paper/claim-bindings-wrong.json",
        json.dumps({"schemaVersion": "hajimi.claim-bindings.v1", "claims": [{"claimId": "claim-1", "value": 41, "unit": "kg"}]}),
    )
    state["provenance"]["bindings"][0]["claimMarkerRef"] = wrong_marker
    state_path.write_text(json.dumps(state), encoding="utf-8")
    report = validate_provenance(tmp_path)
    assert report["passed"] is False
    assert any(check["name"] == "binding_paper-1_claim_markers" and not check["passed"] for check in report["checks"])


def test_stage8_validator_verifies_the_bundled_capability_snapshot(tmp_path: Path, monkeypatch) -> None:
    capability_root = Path(__file__).resolve().parents[2] / "bundled" / "capabilities"
    monkeypatch.setenv("HAJIMI_CAPABILITIES_ROOT", str(capability_root))
    checks = stage8_checks(tmp_path, strict=False)
    capability_checks = [check for check in checks if check["name"].startswith("capability_")]
    assert len(capability_checks) == 2
    assert all(check["passed"] for check in capability_checks)


def test_light_review_preserves_serious_errors():
    from hajimi_toolkit.stage8_validation import apply_light_review
    names = ['stage8_pdf_typography', 'stage8_paper_language', 'stage8_equation_drift_1', 'stage8_structure', 'stage8_evidence']
    original = [dict(name=name, passed=False, detail='visible finding', severity='error') for name in names]
    result = apply_light_review(original)
    assert [item['severity'] for item in result] == ['warning', 'warning', 'error', 'error', 'error']
    assert all(not item['passed'] and item['detail'] == 'visible finding' for item in result)
    assert all(item['severity'] == 'error' for item in original)
