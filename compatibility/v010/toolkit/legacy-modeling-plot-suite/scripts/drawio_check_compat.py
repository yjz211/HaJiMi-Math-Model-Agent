#!/usr/bin/env python
"""General/architecture Draw.io checks without competition-template false positives."""

from __future__ import annotations

import argparse
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input")
    parser.add_argument("--mode", choices=["general", "architecture"], default="general")
    args = parser.parse_args()
    path = Path(args.input)
    try:
        root = ET.parse(path).getroot()
    except Exception as exc:
        print(f"CRITICAL: invalid Draw.io XML: {exc}")
        return 2

    cells = root.findall(".//mxCell")
    vertices = [c for c in cells if c.get("vertex") == "1"]
    edges = [c for c in cells if c.get("edge") == "1"]
    ids = {c.get("id") for c in cells}
    issues = []
    if len(vertices) < 2:
        issues.append("fewer than two visual nodes")
    if not edges:
        issues.append("no connector edges")
    unlabeled = [c.get("id") for c in vertices if not (c.get("value") or "").strip()]
    if unlabeled:
        issues.append("unlabeled nodes: " + ", ".join(filter(None, unlabeled)))
    broken = [
        c.get("id") for c in edges
        if c.get("source") not in ids or c.get("target") not in ids
    ]
    if broken:
        issues.append("edges with missing endpoints: " + ", ".join(filter(None, broken)))
    bad_geometry = []
    for cell in vertices:
        geom = cell.find("mxGeometry")
        if geom is None:
            bad_geometry.append(cell.get("id"))
            continue
        try:
            width = float(geom.get("width", "0"))
            height = float(geom.get("height", "0"))
            if width <= 0 or height <= 0:
                bad_geometry.append(cell.get("id"))
        except ValueError:
            bad_geometry.append(cell.get("id"))
    if bad_geometry:
        issues.append("invalid node geometry: " + ", ".join(filter(None, bad_geometry)))
    if issues:
        for issue in issues:
            print("CRITICAL: " + issue)
        return 1
    print(f"PASS: mode={args.mode}, nodes={len(vertices)}, edges={len(edges)}")
    print("INFO: visual overlap and arrow review still required")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

