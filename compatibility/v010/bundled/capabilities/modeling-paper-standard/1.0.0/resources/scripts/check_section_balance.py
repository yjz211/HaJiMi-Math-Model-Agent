"""Check the existing 30% narrative limit from a whole or split manuscript."""
import argparse
import re
from pathlib import Path
from check_latex_layout_risks import expand_inputs, strip_comments


def visible_cjk_units(path):
    return len(re.findall(r'[\u3400-\u4dbf\u4e00-\u9fff]', strip_comments(path.read_text(encoding='utf-8'))))


def whole_paper_units(path):
    source = strip_comments(expand_inputs(path))
    headings = list(re.finditer(r'\\section\*?\{([^{}]+)\}', source))
    counts = {}
    positions = []
    for title in ['模型建立与求解', '模型检验', '模型优缺点评价', '参考文献']:
        matches = [(i, h) for i, h in enumerate(headings) if re.sub(r'^[一二三四五六七八九十]+、', '', h[1]).strip() == title]
        if len(matches) != 1:
            raise ValueError(f'Expected exactly one major section: {title}')
        i, heading = matches[0]
        positions.append(heading.start())
        body = source[heading.end():headings[i + 1].start() if i + 1 < len(headings) else len(source)]
        counts[title] = len(re.findall(r'[\u3400-\u4dbf\u4e00-\u9fff]', body))
    if positions != sorted(positions):
        raise ValueError('Model, validation, evaluation and references are out of order')
    return [counts[title] for title in ['模型建立与求解', '模型检验', '模型优缺点评价']]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model', type=Path, nargs='?')
    parser.add_argument('validation', type=Path, nargs='?')
    parser.add_argument('evaluation', type=Path, nargs='?')
    parser.add_argument('--main', type=Path, help='Full manuscript entrypoint, expanding local input/include files')
    parser.add_argument('--max-ratio', type=float, default=0.30)
    args = parser.parse_args()
    if args.main and any([args.model, args.validation, args.evaluation]):
        parser.error('Use --main or three section files, not both')
    if not args.main and not all([args.model, args.validation, args.evaluation]):
        parser.error('Supply --main or model, validation and evaluation files')
    try:
        model, validation, evaluation = whole_paper_units(args.main) if args.main else [visible_cjk_units(p) for p in [args.model, args.validation, args.evaluation]]
        if not model:
            raise ValueError('Model section has no visible Chinese text')
    except (OSError, ValueError) as error:
        print(f'SECTION_BALANCE: FAIL; {error}')
        return 1
    ratio = (validation + evaluation) / model
    passed = ratio <= args.max_ratio + 1e-12
    print(f'SECTION_BALANCE: {"PASS" if passed else "FAIL"}; model={model}, validation={validation}, evaluation={evaluation}, combined_ratio={ratio:.4f}, limit={args.max_ratio:.4f}')
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
