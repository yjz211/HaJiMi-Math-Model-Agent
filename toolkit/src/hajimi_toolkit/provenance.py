from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


def validate_provenance(workspace: Path, *, strict: bool = True) -> dict[str, Any]:
    workspace = workspace.resolve()
    checks = provenance_checks(workspace, strict=strict)
    failures = [check for check in checks if not check["passed"] and check["severity"] == "error"]
    return {
        "schema_version": "hajimi.provenance-validation.v1",
        "passed": not failures,
        "checks": checks,
        "summary": {
            "passed": sum(bool(check["passed"]) for check in checks),
            "failed": sum(not bool(check["passed"]) for check in checks),
        },
    }


def provenance_checks(workspace: Path, *, strict: bool) -> list[dict[str, Any]]:
    state_path = workspace / ".hajimi" / "state.json"
    if not state_path.is_file():
        return [_check("workflow_state_v2", False, "Missing .hajimi/state.json", "error" if strict else "warning")]
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        return [_check("workflow_state_v2", False, f"Unreadable workflow state: {error}")]
    if state.get("schemaVersion") != "hajimi.workflow-state.v2":
        return [_check("workflow_state_v2", False, "Workflow state is not hajimi.workflow-state.v2")]

    checks = [_check("workflow_state_v2", True, f"revision {state.get('revision', '?')}")]
    provenance = state.get("provenance")
    if not isinstance(provenance, dict):
        return checks + [_check("provenance_graph", False, "Missing provenance object")]

    experiments = _unique_index(provenance.get("experiments"), "experimentId", checks, "experiment")
    evidence = _unique_index(provenance.get("evidence"), "evidenceId", checks, "evidence")
    claims = _unique_index(provenance.get("claims"), "claimId", checks, "claim")
    freezes = _unique_index(provenance.get("freezes"), "freezeId", checks, "freeze")
    bindings = _unique_index(provenance.get("bindings"), "bindingId", checks, "binding")

    artifact_ids: set[str] = set()
    for experiment_id, experiment in experiments.items():
        if not isinstance(experiment, dict):
            continue
        selection = experiment.get("selection")
        if selection not in {"candidate", "selected", "superseded", "invalidated"}:
            checks.append(_check(f"experiment_{experiment_id}_selection", False, f"Invalid experiment selection: {selection}"))
        refs = []
        for field in ("codeRefs", "inputRefs", "parameterRefs", "outputRefs"):
            value = experiment.get(field, [])
            if not isinstance(value, list):
                checks.append(_check(f"experiment_{experiment_id}", False, f"{field} is not a list"))
                continue
            refs.extend(value)
        inactive = (experiment.get("status") in {"stale", "superseded", "invalidated"}
                    or selection in {"superseded", "invalidated"})
        for ref in refs:
            if isinstance(ref, dict) and isinstance(ref.get("id"), str):
                artifact_ids.add(ref["id"])
            if inactive:
                continue
            detail = _verify_artifact_ref(workspace, ref)
            checks.append(_check(f"artifact_{experiment_id}_{len(checks)}", detail is None, detail or str(ref.get("path", "artifact"))))
        if not inactive and experiment.get("status") == "succeeded" and not experiment.get("outputRefs"):
            checks.append(_check(f"experiment_{experiment_id}_outputs", False, "Succeeded experiment has no output"))
        if not inactive and experiment.get("trust") == "legacy_unverified":
            checks.append(_check(f"experiment_{experiment_id}_trust", False, "Legacy-unverified experiment cannot support formal evidence"))

    for evidence_id, item in evidence.items():
        if not isinstance(item, dict):
            continue
        experiment_refs = item.get("experimentRefs", [])
        formal = item.get("status") not in {"stale", "superseded", "invalidated"}
        referenced_experiments: list[dict[str, Any]] = []
        for ref in experiment_refs:
            experiment = experiments.get(ref)
            if not isinstance(experiment, dict):
                checks.append(_check(f"evidence_{evidence_id}_experiment", False, f"Unknown experiment {ref}"))
                continue
            referenced_experiments.append(experiment)
            if formal and (experiment.get("status") != "succeeded"
                           or experiment.get("trust") == "legacy_unverified"
                           or experiment.get("selection") in {"superseded", "invalidated"}):
                checks.append(_check(f"evidence_{evidence_id}_experiment", False, f"Ineligible formal experiment {ref}"))
        for ref in item.get("artifactRefs", []):
            if ref not in artifact_ids:
                checks.append(_check(f"evidence_{evidence_id}_artifact", False, f"Unknown artifact {ref}"))
        if item.get("status") == "frozen" and item.get("domainValidationStatus") != "accepted":
            checks.append(_check(f"evidence_{evidence_id}_domain", False, "Frozen evidence is not domain-accepted"))
        if item.get("status") == "cross_validated":
            if len(referenced_experiments) < 2 or len(set(experiment_refs)) < 2:
                checks.append(_check(f"evidence_{evidence_id}_cross_validation", False, "Cross-validation requires two managed experiments"))
            elif len({_execution_signature(experiment) for experiment in referenced_experiments}) < 2:
                checks.append(_check(f"evidence_{evidence_id}_cross_validation", False, "Cross-validation experiments are not independent"))
            output_signatures = [_substantive_output_signature(experiment) for experiment in referenced_experiments]
            if not output_signatures or any(not signature for signature in output_signatures) or len(set(output_signatures)) != 1:
                checks.append(_check(f"evidence_{evidence_id}_cross_outputs", False, "Cross-validation substantive output hashes differ"))

    for claim_id, claim in claims.items():
        if not isinstance(claim, dict):
            continue
        refs = claim.get("evidenceRefs", [])
        if claim.get("kind") != "estimate" and not refs:
            checks.append(_check(f"claim_{claim_id}_evidence", False, "Formal claim has no evidence"))
        for ref in refs:
            if ref not in evidence:
                checks.append(_check(f"claim_{claim_id}_evidence", False, f"Unknown evidence {ref}"))

    active_freeze_claims: set[str] = set()
    for freeze_id, freeze in freezes.items():
        if not isinstance(freeze, dict) or freeze.get("status") != "active":
            continue
        evidence_refs = freeze.get("evidenceRefs", [])
        claim_refs = freeze.get("claimRefs", [])
        for ref in evidence_refs:
            item = evidence.get(ref)
            if not isinstance(item, dict) or item.get("status") != "frozen" or item.get("domainValidationStatus") != "accepted":
                checks.append(_check(f"freeze_{freeze_id}_evidence", False, f"Ineligible frozen evidence {ref}"))
        for ref in claim_refs:
            claim = claims.get(ref)
            if not isinstance(claim, dict) or claim.get("status") not in {"supported", "published"}:
                checks.append(_check(f"freeze_{freeze_id}_claim", False, f"Ineligible frozen claim {ref}"))
            elif any(evidence_ref not in evidence_refs for evidence_ref in claim.get("evidenceRefs", [])):
                checks.append(_check(f"freeze_{freeze_id}_coverage", False, f"Claim {ref} is not fully covered"))
            else:
                active_freeze_claims.add(ref)

    for binding_id, binding in bindings.items():
        if not isinstance(binding, dict) or binding.get("status") in {"stale", "superseded", "invalidated"}:
            continue
        claim_refs = binding.get("claimRefs", [])
        if not claim_refs:
            checks.append(_check(f"binding_{binding_id}_claims", False, "Publication binding has no claims"))
        for ref in claim_refs:
            if ref not in active_freeze_claims:
                checks.append(_check(f"binding_{binding_id}_freeze", False, f"Claim {ref} is outside active evidence freezes"))
        for field in ("artifactRef", "claimMarkerRef"):
            artifact_ref = binding.get(field)
            if artifact_ref is not None:
                detail = _verify_artifact_ref(workspace, artifact_ref)
                checks.append(_check(f"binding_{binding_id}_{field}", detail is None, detail or str(artifact_ref.get("path", field))))
        numeric_claims = [claims.get(ref) for ref in claim_refs if isinstance(claims.get(ref), dict) and claims[ref].get("kind") == "numeric"]
        if binding.get("kind") == "paper" and numeric_claims:
            marker = binding.get("claimMarkerRef")
            if not isinstance(marker, dict):
                checks.append(_check(f"binding_{binding_id}_claim_markers", False, "Numeric paper claims require a claim-binding sidecar"))
            else:
                detail = _verify_claim_markers(workspace, marker, numeric_claims)
                checks.append(_check(f"binding_{binding_id}_claim_markers", detail is None, detail or "Numeric paper claim markers match"))

    if not any(not check["passed"] for check in checks):
        checks.append(_check("provenance_graph", True, f"{len(experiments)} experiment(s), {len(evidence)} evidence item(s), {len(claims)} claim(s), {len(bindings)} binding(s)"))
    return checks


def _unique_index(value: Any, key: str, checks: list[dict[str, Any]], label: str) -> dict[str, Any]:
    if not isinstance(value, list):
        checks.append(_check(f"{label}_records", False, f"{label} records are not a list"))
        return {}
    output: dict[str, Any] = {}
    for item in value:
        identifier = item.get(key) if isinstance(item, dict) else None
        if not isinstance(identifier, str) or not identifier:
            checks.append(_check(f"{label}_identity", False, f"Missing {key}"))
        elif identifier in output:
            checks.append(_check(f"{label}_identity", False, f"Duplicate {key}: {identifier}"))
        else:
            output[identifier] = item
    return output


def _verify_artifact_ref(workspace: Path, ref: Any) -> str | None:
    if not isinstance(ref, dict):
        return "Artifact reference is not an object"
    try:
        expected = str(ref["sha256"])
        expected_size = int(ref["sizeBytes"])
        path = (workspace / str(ref["path"])).resolve()
        frozen = (workspace / str(ref["frozenPath"])).resolve()
    except KeyError as error:
        return f"Artifact reference lacks {error}"
    for candidate, role in ((path, "workspace"), (frozen, "CAS")):
        try:
            candidate.relative_to(workspace)
        except ValueError:
            return f"Artifact {role} path escapes workspace"
        if not candidate.is_file() or candidate.is_symlink():
            return f"Artifact {role} file is missing or unsafe: {candidate}"
        if candidate.stat().st_size != expected_size:
            return f"Artifact {role} size mismatch: {candidate}"
        if _sha256(candidate) != expected:
            return f"Artifact {role} hash mismatch: {candidate}"
    return None


def _execution_signature(experiment: dict[str, Any]) -> str:
    signature = {
        "command": experiment.get("command"),
        "environment": experiment.get("environment", {}),
        "seed": experiment.get("seed"),
        "code": sorted(str(ref.get("sha256", "")) for ref in experiment.get("codeRefs", []) if isinstance(ref, dict)),
        "parameters": sorted(str(ref.get("sha256", "")) for ref in experiment.get("parameterRefs", []) if isinstance(ref, dict)),
    }
    return json.dumps(signature, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _substantive_output_signature(experiment: dict[str, Any]) -> str:
    hashes = sorted(
        str(ref.get("sha256", ""))
        for ref in experiment.get("outputRefs", [])
        if isinstance(ref, dict) and not str(ref.get("path", "")).lower().endswith((".stdout.log", ".stderr.log"))
    )
    return ":".join(hashes)


def _verify_claim_markers(workspace: Path, marker: dict[str, Any], claims: list[dict[str, Any]]) -> str | None:
    try:
        marker_path = (workspace / str(marker["path"])).resolve()
        marker_path.relative_to(workspace)
        sidecar = json.loads(marker_path.read_text(encoding="utf-8"))
    except (KeyError, OSError, ValueError, json.JSONDecodeError) as error:
        return f"Unreadable numeric claim-binding sidecar: {error}"
    if sidecar.get("schemaVersion") != "hajimi.claim-bindings.v1" or not isinstance(sidecar.get("claims"), list):
        return "Invalid numeric claim-binding sidecar schema"
    markers = sidecar["claims"]
    for claim in claims:
        match = next((item for item in markers if isinstance(item, dict) and item.get("claimId") == claim.get("claimId")), None)
        if not isinstance(match, dict):
            return f"Missing numeric claim marker {claim.get('claimId')}"
        expected_value = json.dumps(claim.get("value"), ensure_ascii=False, separators=(",", ":"))
        actual_value = json.dumps(match.get("value"), ensure_ascii=False, separators=(",", ":"))
        if actual_value != expected_value or str(match.get("unit", "")) != str(claim.get("unit", "")):
            return f"Numeric claim marker drift: {claim.get('claimId')}"
    return None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _check(name: str, passed: bool, detail: str, severity: str = "error") -> dict[str, Any]:
    return {"name": name, "passed": passed, "detail": detail, "severity": severity}
