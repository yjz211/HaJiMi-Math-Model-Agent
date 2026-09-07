from __future__ import annotations

import argparse
import json
from pathlib import Path

from .inputs import inspect_input
from .provenance import validate_provenance
from .validation import validate_delivery


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="hajimi-toolkit")
    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect_parser = subparsers.add_parser("inspect-input", help="Inspect CSV, XLSX, PDF, DOCX, JSON, or text input")
    inspect_parser.add_argument("path", type=Path)

    validate_parser = subparsers.add_parser("validate-delivery", help="Validate a HaJiMi task workspace")
    validate_parser.add_argument("workspace", type=Path)
    validate_parser.add_argument("--no-strict", action="store_true")
    provenance_parser = subparsers.add_parser("validate-provenance", help="Validate workflow Experiment-Evidence-Claim provenance")
    provenance_parser.add_argument("workspace", type=Path)
    provenance_parser.add_argument("--no-strict", action="store_true")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == "inspect-input":
        print(json.dumps(inspect_input(args.path), ensure_ascii=False, indent=2))
        return 0
    if args.command == "validate-delivery":
        report = validate_delivery(args.workspace, strict=not args.no_strict)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["passed"] else 2
    if args.command == "validate-provenance":
        report = validate_provenance(args.workspace, strict=not args.no_strict)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["passed"] else 2
    raise AssertionError(f"Unhandled command: {args.command}")


if __name__ == "__main__":
    raise SystemExit(main())
