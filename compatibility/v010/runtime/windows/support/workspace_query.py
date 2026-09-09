"""Bounded workspace search. Runs inside the managed process job, never the server thread."""
import fnmatch
import json
import os
from pathlib import Path
import re
import sys

kind, root_value, raw = sys.argv[1:]
root = Path(root_value).resolve()
cfg = json.loads(raw)
limit = cfg.get('limit', 100)
result = []

def safe(path):
    return not path.is_symlink() and not path.is_junction() and (not path.is_file() or path.stat().st_nlink == 1)

def paths():
    if root.is_file():
        if safe(root): yield root
        return
    for current, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if d.lower() not in {'.git', '.hajimi', 'node_modules'} and safe(Path(current) / d))
        for name in sorted(dirs + files):
            path = Path(current) / name
            if safe(path): yield path

pattern = cfg['pattern']
regex = re.compile(re.escape(pattern) if cfg.get('literal') else pattern, re.I if cfg.get('ignoreCase') else 0) if kind == 'grep' else None
for path in paths():
    rel = path.name if root.is_file() else path.relative_to(root).as_posix()
    if kind == 'find':
        if fnmatch.fnmatchcase(rel, pattern) or fnmatch.fnmatchcase(path.name, pattern): result.append(rel + ('/' if path.is_dir() else ''))
    elif path.is_file() and path.stat().st_size <= 16 * 1024 * 1024:
        glob = cfg.get('glob') or '*'
        if not (fnmatch.fnmatchcase(rel, glob) or fnmatch.fnmatchcase(path.name, glob)): continue
        try: lines = path.read_text(encoding='utf-8').splitlines()
        except (UnicodeError, OSError): continue
        context = cfg.get('context', 0)
        for i, line in enumerate(lines):
            if regex.search(line):
                for j in range(max(0, i-context), min(len(lines), i+context+1)): result.append(f'{rel}:{j+1}: {lines[j][:500]}')
            if len(result) >= limit: break
    if len(result) >= limit: break
print(json.dumps(result[:limit], ensure_ascii=False) if kind == 'find' else '\n'.join(result[:limit]))
