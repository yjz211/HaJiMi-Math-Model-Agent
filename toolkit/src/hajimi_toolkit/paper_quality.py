"""Product completion checks shared by lean and strict, without provenance gates."""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from .stage8_validation import _run, _workspace_path, _equation_checks


def check_paper(workspace: Path) -> dict:
    workspace = workspace.resolve()
    checks, pages = [], 0
    try:
        try:
            config = json.loads((workspace / "paper/hajimi-paper-config.json").read_text(encoding="utf-8"))
        except FileNotFoundError:
            config = {}
            checks.append({"name": "paper_config", "passed": False, "detail": "Missing paper/hajimi-paper-config.json"})
        state = json.loads((workspace / ".hajimi/state.json").read_text(encoding="utf-8"))
        scripts = Path(os.environ["HAJIMI_CAPABILITIES_ROOT"]) / "modeling-paper-standard/1.0.0/resources/scripts"
        source = _workspace_path(workspace, config.get("mainTex", "paper/main.tex"))
        pdf = _workspace_path(workspace, config.get("finalPdf", "paper/main.pdf"))
        # Expand includes using the same implementation as the structure checker.
        import importlib.util
        spec = importlib.util.spec_from_file_location("paper_layout", scripts / "check_latex_layout_risks.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        text = re.sub(r"(?<!\\)%.*", "", module.expand_inputs(source))
        try:
            plan = json.loads((workspace / "FIGURE_PLAN.json").read_text(encoding="utf-8"))
        except FileNotFoundError:
            plan = {"figures": []}
        if not plan.get("figures"):
            checks.append({"name": "figures", "passed": False, "detail": "Missing full figure plan and figures"})
        import pymupdf as fitz
        with fitz.open(pdf) as document:
            pages = len(document)
            if not pages or any(not p.get_text().strip() and not p.get_images() and not p.get_drawings() for p in document):
                raise ValueError("PDF contains empty pages or has no readable content")
        included = re.findall(r"\\includegraphics\*?(?:\[[^\]]*\])?\{([^}]+)\}", text)
        graphics_roots = [workspace, source.parent]
        for declaration in re.findall(r"\\graphicspath\{((?:\{[^}]*\})+)\}", text):
            for folder in re.findall(r"\{([^}]*)\}", declaration):
                graphics_roots.extend([(workspace / folder).resolve(), (source.parent / folder).resolve()])
        for figure in plan["figures"]:
            # Match the actual planned asset, not just a basename or a figure count.
            candidates = []
            for value in included:
                for base in graphics_roots:
                    candidate = (base / value).resolve()
                    if candidate.is_relative_to(workspace):
                        candidates.append(candidate)
            output = _workspace_path(workspace, f"figures/{figure['id']}.pdf")
            if not any(output == p or (not p.suffix and output == p.with_suffix(".pdf")) for p in candidates):
                raise ValueError(f"Planned figure is absent from the paper: {figure['id']}")
            with fitz.open(output) as image:
                if not len(image) or not any(p.get_images() or p.get_drawings() for p in image):
                    raise ValueError(f"Figure has no rendered image/vector content: {figure['id']}")
        # A stable technical source is enough; lean does not need a freeze chain.
        baseline = config.get("equationBaselinePath")
        if baseline:
            baseline_path = _workspace_path(workspace, baseline)
            if baseline_path == source:
                raise ValueError("Equation baseline must be the earlier technical source, not the paper itself")
            checks.append(_run("equations", [sys.executable, str(scripts / "check_latex_equation_drift.py"), str(baseline_path), str(source), "--require-all", "--exact-labels"], workspace))
        else:
            checks.extend(_equation_checks(workspace, state, config, source, scripts))
        questions = state.get("questions", [])
        if not questions:
            raise ValueError("Paper must cover the questions defined at stage 1")
        structure = [sys.executable, str(scripts / "check_latex_structure.py"), str(source), "--questions", str(len(questions)), "--paper-type", config.get("paperType", "standard")]
        for item in config.get("optimizationQuestions", []):
            structure += ["--optimization-question", str(item["question"]), "--optimization-constraint-min", f"{item['question']}:{item['constraintMin']}"]
        checks.append(_run("structure", structure, workspace))
        for name, args in [
            ("check_section_balance.py", ["--main", str(source)]),
            ("check_latex_language.py", [str(source)]),
            ("check_latex_layout_risks.py", [str(source)]),
            ("check_pdf_typography.py", [str(pdf)]),
            ("check_pdf_page_gate.py", [str(pdf)]),
            ("check_pdf_page_flow.py", [str(pdf)]),
        ]:
            checks.append(_run(name, [sys.executable, str(scripts / name), *args], workspace))
    except (OSError, ValueError, KeyError, TypeError, ImportError) as error:
        checks.append({"name": "paper_outputs", "passed": False, "detail": str(error)})
    issues = [c for c in checks if not c["passed"]]
    return {"passed": not issues, "pages": pages, "issues": issues}
