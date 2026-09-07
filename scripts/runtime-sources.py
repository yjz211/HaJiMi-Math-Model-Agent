#!/usr/bin/env python3
"""Capture explicit upstream URLs and a CLOSED TeX Live package repository.

Capture is a discovery step, NOT an authorization to publish. Review the resulting
lock (and upstream signatures when supplied) before build-windows-runtime.py.
Only build-time code accesses CTAN/GitHub/PyPI; installed HaJiMi uses its signed archive.
"""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import lzma
from pathlib import Path
import re
import urllib.parse
import urllib.request


def digest(path: Path, algorithm='sha256') -> str:
    h = hashlib.new(algorithm)
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()


def valid_url(value: str, origins: list[str]) -> str:
    u = urllib.parse.urlsplit(value)
    if u.scheme != 'https' or u.username or u.password or u.fragment or f'{u.scheme}://{u.netloc}' not in origins:
        raise ValueError(f'Unapproved source origin: {value}')
    return value


class Redirects(urllib.request.HTTPRedirectHandler):
    def __init__(self, origins): self.origins = origins
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        valid_url(newurl, self.origins)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url: str, target: Path, origins: list[str], sha256=None, sha512=None, size=None):
    valid_url(url, origins)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if target.is_symlink() or not target.is_file(): raise ValueError(f'Existing capture target is not a regular file: {target}')
        if size is not None and target.stat().st_size != size: raise ValueError(f'Existing capture size mismatch: {target}')
        if sha256 and digest(target) != sha256: raise ValueError(f'Existing capture SHA256 mismatch: {target}')
        if sha512 and digest(target, 'sha512') != sha512: raise ValueError(f'Existing TeX checksum mismatch: {target}')
        return {'url': url, 'size': target.stat().st_size, 'sha256': digest(target)}
    part = target.with_name(target.name + '.part')
    opener = urllib.request.build_opener(Redirects(origins))
    try:
        with opener.open(urllib.request.Request(url, headers={'User-Agent': 'HaJiMi-runtime-builder/1', 'Accept-Encoding': 'identity'}), timeout=120) as src, part.open('wb') as dst:
            total = 0
            while chunk := src.read(1024 * 1024):
                total += len(chunk)
                if total > (size if size is not None else 8 * 1024**3): raise ValueError('Source size limit')
                dst.write(chunk)
        if size is not None and part.stat().st_size != size: raise ValueError('Source size mismatch')
        if sha256 and digest(part) != sha256: raise ValueError(f'SHA256 mismatch: {url}')
        if sha512 and digest(part, 'sha512') != sha512: raise ValueError(f'TeX container checksum mismatch: {url}')
        part.replace(target)
        return {'url': url, 'size': target.stat().st_size, 'sha256': digest(target)}
    finally:
        part.unlink(missing_ok=True)


def tex_records(text):
    records = {}
    for block in re.split(r'\n\s*\n', text):
        record = {}; depends = []
        for line in block.splitlines():
            if not line or line[0].isspace(): continue
            key, _, value = line.partition(' ')
            if key == 'depend': depends.append(value)
            else: record[key] = value
        if 'name' in record:
            record['depends'] = depends; records[record['name']] = record
    return records


def capture_tex(repository, packages, directory, origins, resume=False, workers=6):
    if directory.exists() and not resume: raise ValueError('TeX snapshot directory must be new')
    directory.mkdir(parents=True, exist_ok=True)
    xz = directory / 'tlpkg' / 'texlive.tlpdb.xz'
    meta = fetch(repository.rstrip('/') + '/tlpkg/texlive.tlpdb.xz', xz, origins)
    text = lzma.decompress(xz.read_bytes()).decode('utf-8')
    (xz.parent / 'texlive.tlpdb').write_text(text, encoding='utf-8', newline='\n')
    # tlmgr requires the uncompressed database checksum even for a local,
    # independently locked snapshot. This is a computed checksum, not a GPG signature.
    database = xz.parent / 'texlive.tlpdb'
    (xz.parent / 'texlive.tlpdb.sha512').write_text(digest(database, 'sha512') + '  texlive.tlpdb\n', encoding='ascii')
    # install-tl adds these Windows bootstrap packages outside ordinary depends.
    records = tex_records(text); selected = set(); queue = ['scheme-small', 'texlive.infra', 'texlive.infra.windows', 'tlperl.windows', 'tlgs.windows', *packages]
    while queue:
        name = queue.pop().replace('.ARCH', '.windows')
        if name in selected or name.startswith(('setting_', 'opt_')): continue
        # Some cross-platform TLCore records use .ARCH but intentionally omit a
        # Windows implementation (notably xdvi); there is no archive to capture.
        if name not in records and name == 'xdvi.windows': continue
        if name not in records: raise ValueError(f'Unknown TeX dependency: {name}')
        selected.add(name); queue.extend(records[name]['depends'])
    revisions = {}
    jobs = []
    for name in sorted(selected):
        if not re.fullmatch(r'[A-Za-z0-9_.+-]+', name): raise ValueError('Unsafe TeX package name')
        r = records[name]; revisions[name] = r.get('revision')
        for suffix, prefix in [('', ''), ('.doc', 'doc'), ('.source', 'src')]:
            checksum = r.get(prefix + 'containerchecksum')
            if not checksum: continue  # Pure collection records may have no container.
            if not re.fullmatch(r'[0-9a-f]{128}', checksum): raise ValueError('Unsupported TeX checksum format')
            filename = name + suffix + '.tar.xz'
            jobs.append((repository.rstrip('/') + '/archive/' + filename, directory / 'archive' / filename, checksum, int(r[prefix + 'containersize'])))
    with ThreadPoolExecutor(max_workers=max(1, min(workers, 16))) as pool:
        futures = [pool.submit(fetch, url, target, origins, None, checksum, size) for url, target, checksum, size in jobs]
        for future in futures: future.result()
    inventory = [{'path': p.relative_to(directory).as_posix(), 'size': p.stat().st_size, 'sha256': digest(p)} for p in sorted(directory.rglob('*')) if p.is_file()]
    return {'upstream': repository, 'metadata': meta, 'packages': packages, 'revisions': revisions, 'files': inventory}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--spec', type=Path, required=True)
    p.add_argument('--out', type=Path, required=True, help='NEW build-cache directory')
    p.add_argument('--resume', action='store_true', help='Resume an incomplete capture after validating existing files')
    p.add_argument('--workers', type=int, default=6, help='Concurrent TeX container downloads (default: 6)')
    args = p.parse_args()
    if args.out.exists() and not args.resume: raise SystemExit('--out must not exist; capture cannot overwrite an earlier lock')
    if args.resume and (args.out / 'sources.lock.json').exists(): raise SystemExit('Refusing to resume a completed source lock')
    spec = json.loads(args.spec.read_text(encoding='utf-8'))
    origins = spec['allowedOrigins']
    for name in ['python', 'portableGit', 'texInstaller', 'notoFont', 'notoLicense']:
        if not spec['assets'].get(name, {}).get('url'): raise ValueError(f'Provide an explicit, versioned upstream URL for {name}')
    args.out.mkdir(parents=True, exist_ok=True)
    lock = {'format': 'hajimi.sources.v1', 'runtimeVersion': spec['runtimeVersion'], 'pythonVersion': spec['pythonVersion'], 'pymupdfRequirement': spec['pymupdfRequirement'], 'extraRequirements': spec.get('extraRequirements', []), 'assets': {}, 'allowedOrigins': origins}
    for name, record in spec['assets'].items():
        if not re.fullmatch(r'[a-zA-Z0-9_-]+', name): raise ValueError('Unsafe source name')
        lock['assets'][name] = fetch(record['url'], args.out / 'assets' / name, origins, record.get('sha256'), record.get('sha512'), record.get('size'))
    lock['tex'] = capture_tex(spec['texRepository'], spec['texPackages'], args.out / 'tex-repository', origins, resume=args.resume, workers=args.workers)
    (args.out / 'sources.lock.json').write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Captured sources.lock.json. Review source identity, checksums, provenance and redistribution rights before building.')

if __name__ == '__main__': main()
