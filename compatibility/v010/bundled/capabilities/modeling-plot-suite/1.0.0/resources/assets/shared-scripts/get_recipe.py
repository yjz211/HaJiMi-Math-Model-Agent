#!/usr/bin/env python3
"""Return an unchanged recipe by stable ID, legacy number, or plan references.

Examples:
  python _utils/get_recipe.py --id academic.tsne_umap
  python _utils/get_recipe.py academic 3
  python _utils/get_recipe.py --plan FIGURE_PLAN.json PAPER_PLAN.md --output _utils/RECIPES_FOR_THIS_PAPER.md
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import tempfile

HEADER = re.compile(r'^## (\d+)\.\s+([^\n]+)$', re.MULTILINE)
ID_REF = re.compile(r'\brecipe:([a-z][a-z0-9_]*\.[a-z][a-z0-9_]*)\b')
LEGACY_REF = re.compile(r'\b(basic|advanced|empirical|competition|academic|comp)\s*#\s*(\d+)((?:\s*[,/+]\s*#\s*\d+)*)')


def sections(text):
    headers = list(HEADER.finditer(text))
    return [(match.group(1), match.group(2), text[match.start():headers[i + 1].start() if i + 1 < len(headers) else len(text)].strip())
            for i, match in enumerate(headers)]


def content_hash(section):
    # Chapter numbers are presentation only. The title and entire body are locked.
    normalized = re.sub(r'^## \d+\.\s+', '', section, count=1)
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


class Recipes:
    def __init__(self, root=None):
        # Never search the current directory: registry and recipes form one bundle.
        self.root = Path(root) if root is not None else Path(__file__).resolve().parent
        self.registry = json.loads((self.root / 'recipe_registry.json').read_text(encoding='utf-8'))
        if self.registry.get('schemaVersion') != 1:
            raise ValueError('Unsupported recipe registry version')
        self.entries = {}
        self.legacy = {}
        for entry in self.registry['recipes']:
            key = entry['id']
            if key in self.entries or entry['legacy'] in self.legacy:
                raise ValueError('Duplicate recipe identity: ' + key)
            if Path(entry['file']).name != entry['file'] or '/' in entry['file'] or '\\' in entry['file']:
                raise ValueError('Recipe file must be inside the registry directory')
            self.entries[key] = entry
            self.legacy[entry['legacy']] = key

    def legacy_id(self, category, number):
        category = 'competition' if category.lower() == 'comp' else category.lower()
        key = f'{category} #{int(number)}'
        if key not in self.legacy:
            raise ValueError('Unknown legacy recipe: ' + key)
        return self.legacy[key]

    def extract(self, key):
        key = key.removeprefix('recipe:')
        if key not in self.entries:
            raise ValueError('Unknown recipe ID: ' + key)
        entry = self.entries[key]
        text = (self.root / entry['file']).read_text(encoding='utf-8')
        matches = [body for _, title, body in sections(text) if title == entry['title']]
        if len(matches) != 1:
            raise ValueError(f'{key}: expected one matching title, found {len(matches)}')
        if content_hash(matches[0]) != entry['contentSha256']:
            raise ValueError(f'{key}: recipe content differs from this registry; use a matching bundle')
        return matches[0]

    def references(self, text):
        found = [(m.start(), m.group(1)) for m in ID_REF.finditer(text)]
        for m in LEGACY_REF.finditer(text):
            for number in [m.group(2), *re.findall(r'#\s*(\d+)', m.group(3))]:
                found.append((m.start(), self.legacy_id(m.group(1), number)))
        return list(dict.fromkeys(key for _, key in sorted(found, key=lambda item: item[0])))


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('category', nargs='?')
    parser.add_argument('number', nargs='?', type=int)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--id')
    mode.add_argument('--plan', nargs='+', type=Path)
    mode.add_argument('--list', action='store_true')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args(argv)
    if (args.id or args.plan or args.list) and (args.category or args.number is not None):
        parser.error('Choose stable ID, plan, list, or legacy category/number')
    recipes = Recipes()
    if args.list:
        result = '\n'.join(f"recipe:{key}\t{entry['title']}" for key, entry in recipes.entries.items())
    elif args.plan:
        keys = []
        for path in args.plan:
            keys.extend(recipes.references(path.read_text(encoding='utf-8')))
        keys = list(dict.fromkeys(keys))
        if not keys:
            raise ValueError('No recipe references found in the supplied plans')
        # Resolve every entry before replacing an existing prefetched file.
        result = '\n\n'.join(f'########## recipe:{key} ##########\n{recipes.extract(key)}' for key in keys)
    else:
        key = args.id
        if key is None and args.category and args.number is not None:
            key = recipes.legacy_id(args.category, args.number)
        if key is None:
            parser.error('Supply --id, --plan, --list, or category and number')
        result = recipes.extract(key)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        name = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n', dir=args.output.parent, delete=False) as stream:
                name = stream.name
                stream.write(result + '\n')
            os.replace(name, args.output)
        finally:
            if name and os.path.exists(name):
                os.unlink(name)
    else:
        print(result)
    return 0


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    try:
        raise SystemExit(main())
    except (ValueError, KeyError, OSError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        raise SystemExit(1)
