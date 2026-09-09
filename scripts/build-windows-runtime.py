#!/usr/bin/env python3
"""Build a Windows runtime from a REVIEWED sources.lock.json, not from the developer PATH.

Runs only on a Windows x64 build machine, in a new ASCII output directory.
First --resolve-wheels freezes the transitive wheel set; review that lock. Then
--build installs from those wheel hashes with NO package network access.
TeX installs solely from the captured, checksummed local repository.
"""
from __future__ import annotations
import argparse
import email.parser
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tomllib
import zipfile

def hash_file(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda: f.read(1024*1024), b''): h.update(b)
    return h.hexdigest()


def path_ok(value):
    p = PurePosixPath(value)
    if '\\' in value or ':' in value or p.is_absolute() or any(x in ('', '.', '..') for x in value.split('/')): raise ValueError(f'Unsafe archive path: {value}')
    return p


def unpack(source, destination, kind):
    destination.mkdir(parents=True, exist_ok=False)
    seen = set()
    if kind == 'tar':
        with tarfile.open(source) as archive:
            for member in archive:
                name = member.name.rstrip('/'); path_ok(name)
                if member.isdir(): (destination / name).mkdir(parents=True, exist_ok=True); continue
                if not member.isfile(): raise ValueError('Links/devices in upstream archive are not accepted')
                if name.lower() in seen: raise ValueError('Case-colliding upstream archive')
                seen.add(name.lower()); target = destination / name; target.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as src, target.open('xb') as dst: shutil.copyfileobj(src, dst)
    else:
        with zipfile.ZipFile(source) as archive:
            for member in archive.infolist():
                name = member.filename.rstrip('/'); path_ok(name)
                if member.is_dir(): (destination / name).mkdir(parents=True, exist_ok=True); continue
                mode = member.external_attr >> 16
                if stat.S_ISLNK(mode): raise ValueError('Upstream ZIP links are not accepted')
                if name.lower() in seen: raise ValueError('Case-colliding upstream ZIP')
                seen.add(name.lower()); target = destination / name; target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as src, target.open('xb') as dst: shutil.copyfileobj(src, dst)


def verify_capture(capture, lock):
    for name, entry in lock['assets'].items():
        path = capture / 'assets' / name
        if path.stat().st_size != entry['size'] or hash_file(path) != entry['sha256']: raise ValueError(f'Captured source changed: {name}')
    base = capture / 'tex-repository'
    expected = set()
    for entry in lock['tex']['files']:
        path_ok(entry['path']); expected.add(entry['path']); path = base / entry['path']
        if path.is_symlink() or path.stat().st_size != entry['size'] or hash_file(path) != entry['sha256']: raise ValueError(f'TeX snapshot changed: {entry["path"]}')
    if expected != {p.relative_to(base).as_posix() for p in base.rglob('*') if p.is_file()}: raise ValueError('TeX snapshot coverage mismatch')


def run(args, env, cwd, log):
    with log.open('ab') as out:
        result = subprocess.run(args if isinstance(args, str) else [str(a) for a in args], cwd=cwd, env=env, stdout=out, stderr=subprocess.STDOUT, timeout=7200, check=False)
    if result.returncode: raise RuntimeError(f'Build step failed ({result.returncode}); inspect {log}')


def batch(path, args, env, cwd, log):
    # Build inputs are reviewed and paths cannot contain cmd expansion metacharacters.
    values = [str(path), *map(str, args)]
    if any(re.search(r'["%!&|<>^\r\n]', value) for value in values): raise ValueError('Unsafe batch argument')
    # TL's wrapper compares raw %0; quoting flags prevents -no-gui recognition.
    command = '"' + values[0] + '" ' + subprocess.list2cmdline(values[1:])
    # cmd.exe does not use CRT backslash-escaped quotes. Supply its command line
    # directly so subprocess.list2cmdline cannot turn the outer quotes into \".
    cmd = Path(env['SystemRoot'])/'System32/cmd.exe'
    run(f'"{cmd}" /d /s /c "{command}"', env, cwd, log)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', type=Path, required=True)
    parser.add_argument('--project', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--wheels', type=Path, required=True)
    parser.add_argument('--resolve-wheels', action='store_true')
    parser.add_argument('--build', action='store_true')
    parser.add_argument('--license-review', type=Path)
    parser.add_argument('--local-test', action='store_true', help='Build an explicitly non-redistributable local test artifact')
    args = parser.parse_args()
    if sys.platform != 'win32' or os.environ.get('PROCESSOR_ARCHITECTURE', '').upper() not in ('AMD64', 'X86_64'): raise SystemExit('Use a native Windows x64 build worker')
    if args.resolve_wheels == args.build: raise SystemExit('Select exactly one of --resolve-wheels or --build')
    args.out = args.out.resolve(); args.project = args.project.resolve(); args.capture = args.capture.resolve(); args.wheels = args.wheels.resolve()
    for build_path in (args.out, args.capture, args.wheels):
        if any(ord(c) > 127 or c in '%!&|<>^' for c in str(build_path)): raise SystemExit('Build/cache/wheel paths need ASCII, cmd-safe local paths')
    if args.out.exists(): raise SystemExit('--out must be a new directory; no overwrite or clean of existing builds')
    lock = json.loads((args.capture/'sources.lock.json').read_text(encoding='utf-8'))
    if lock['format'] != 'hajimi.sources.v1' or not re.fullmatch(r'3\.13\.\d+', lock['pythonVersion']): raise ValueError('This runtime flavor requires an exact CPython 3.13 GIL release')
    if 'freethreaded' in lock['assets']['python']['url'] or 'x86_64-pc-windows-msvc' not in lock['assets']['python']['url']: raise ValueError('Wrong Python archive target/threading flavor')
    if not re.fullmatch(r'pymupdf==\d+\.\d+\.\d+', lock['pymupdfRequirement'], re.I): raise ValueError('Pin an actually reviewed PyMuPDF version')
    verify_capture(args.capture, lock); args.out.mkdir(parents=True)
    payload = args.out/'payload'
    unpack(args.capture/'assets/python', payload, 'tar')
    python = payload/'python/python.exe'
    if not python.is_file(): raise ValueError('Expected python-build-standalone install_only layout')
    system_root = os.environ['SystemRoot']
    env = {'SystemRoot': system_root, 'WINDIR': system_root, 'COMSPEC': str(Path(system_root)/'System32/cmd.exe'), 'PATH': str(Path(system_root)/'System32'), 'TEMP': str(args.out), 'TMP': str(args.out), 'PYTHONUTF8': '1', 'PYTHONNOUSERSITE': '1', 'PYTHONDONTWRITEBYTECODE': '1', 'PIP_CONFIG_FILE': os.devnull, 'PIP_DISABLE_PIP_VERSION_CHECK': '1'}
    log = args.out/'build.log'
    env['PATH'] += os.pathsep + str(Path(system_root)/'System32/WindowsPowerShell/v1.0')
    env.update({'HOME': str(args.out), 'USERPROFILE': str(args.out), 'APPDATA': str(args.out), 'LOCALAPPDATA': str(args.out), 'PROCESSOR_ARCHITECTURE': 'AMD64'})
    probe = subprocess.run([str(python), '-I', '-c', 'import sys; print(".".join(map(str,sys.version_info[:3])))'], env=env, capture_output=True, text=True, check=True)
    if probe.stdout.strip() != lock['pythonVersion']: raise ValueError('Python archive version mismatch')
    project = tomllib.loads((args.project/'toolkit/pyproject.toml').read_text(encoding='utf-8'))
    requirements = [*project['project']['dependencies'], lock['pymupdfRequirement'], *lock.get('extraRequirements', []), 'adjustText==1.4.0']
    if any(not re.fullmatch(r'[A-Za-z0-9_.-]+==[A-Za-z0-9_.+-]+', r) for r in requirements): raise ValueError('Build flavor requires exact package pins, no URLs/ranges/editables')
    if args.resolve_wheels:
        if args.wheels.exists(): raise ValueError('Wheel capture directory must be new')
        args.wheels.mkdir(parents=True)
        run([python, '-m', 'ensurepip'], env, args.out, log)
        run([python, '-m', 'pip', 'download', '--only-binary=:all:', '--index-url', 'https://pypi.org/simple', '--dest', args.wheels, *requirements], env, args.out, log)
        entries = []
        for wheel in sorted(args.wheels.glob('*.whl')):
            with zipfile.ZipFile(wheel) as z:
                names = [n for n in z.namelist() if n.endswith('.dist-info/METADATA')]
                if len(names) != 1: raise ValueError('Ambiguous wheel metadata')
                meta = email.parser.BytesParser().parsebytes(z.read(names[0]))
            entries.append({'file': wheel.name, 'name': meta['Name'], 'version': meta['Version'], 'size': wheel.stat().st_size, 'sha256': hash_file(wheel)})
        (args.wheels/'wheels.lock.json').write_text(json.dumps({'pythonVersion': lock['pythonVersion'], 'requirements': requirements, 'files': entries}, indent=2)+'\n', encoding='utf-8')
        print('Resolved wheel closure. Review wheels.lock.json, licenses and availability; then use --build with a NEW --out.')
        return
    wheels = json.loads((args.wheels/'wheels.lock.json').read_text(encoding='utf-8'))
    if wheels['pythonVersion'] != lock['pythonVersion'] or wheels['requirements'] != requirements: raise ValueError('Wheel lock does not match requested runtime dependencies')
    lines = []
    for entry in wheels['files']:
        path_ok(entry['file']); wheel = args.wheels/entry['file']
        if wheel.stat().st_size != entry['size'] or hash_file(wheel) != entry['sha256']: raise ValueError('Wheel hash mismatch')
        lines.append(f"{entry['name']}=={entry['version']} --hash=sha256:{entry['sha256']}")
    requirements_file = args.out/'requirements-win-cp313.lock'; requirements_file.write_text('\n'.join(lines)+'\n', encoding='utf-8')
    env['PIP_NO_INDEX'] = '1'
    run([python, '-m', 'ensurepip'], env, args.out, log)
    run([python, '-m', 'pip', 'install', '--no-index', '--find-links', args.wheels, '--require-hashes', '--no-compile', '-r', requirements_file], env, args.out, log)
    # Self-extractor is a reviewed upstream executable, invoked ONLY on the build worker.
    portable = args.out/'PortableGit.7z.exe'; shutil.copyfile(args.capture/'assets/portableGit', portable)
    # This official SFX extracts beside itself into PortableGit; it ignores
    # generic 7-Zip -o / -InstallPath switches. Keep its post-install behavior,
    # then relocate the completed portable tree inside this fresh build only.
    run([portable, '-y', '-gm2'], env, args.out, log)
    extracted_git = args.out/'PortableGit'
    if not (extracted_git/'usr/bin/bash.exe').is_file(): raise ValueError('Unexpected PortableGit SFX output layout')
    extracted_git.rename(payload/'shell')
    if not (payload/'shell/usr/bin/bash.exe').is_file(): raise ValueError('PortableGit extraction failed, or the source was MinGit')
    installer = args.out/'tex-installer'; unpack(args.capture/'assets/texInstaller', installer, 'zip')
    candidates = list(installer.rglob('install-tl-windows.bat'))
    if len(candidates) != 1: raise ValueError('Unexpected TeX installer layout')
    tex = payload/'texlive'
    profile = args.out/'texlive.profile'
    options = ['selected_scheme scheme-small', f'TEXDIR {tex.as_posix()}', 'instopt_portable 1', 'instopt_adjustpath 0', 'instopt_adjustrepo 0', 'tlpdbopt_install_docfiles 1', 'tlpdbopt_install_srcfiles 1']
    options += [f'{name} {(tex/directory).as_posix()}' for name, directory in [
        ('TEXMFLOCAL', 'texmf-local'), ('TEXMFSYSVAR', 'texmf-var'), ('TEXMFSYSCONFIG', 'texmf-config'),
        ('TEXMFHOME', 'texmf-local'), ('TEXMFVAR', 'texmf-var'), ('TEXMFCONFIG', 'texmf-config')]]
    options += [f'{p} 1' for p in lock['tex']['packages'] if p.startswith('collection-')]
    profile.write_text('\n'.join(options)+'\n', encoding='utf-8')
    batch(candidates[0], ['-no-gui', '-strict', '-profile', profile, '-repository', (args.capture/'tex-repository').as_posix()], env, args.out, log)
    tex_env = {**env, 'PERL5LIB': str(tex/'tlpkg/tlperl/lib'), 'PATH': str(tex/'bin/windows') + os.pathsep + env['PATH']}
    extra = [p for p in lock['tex']['packages'] if not p.startswith(('collection-', 'scheme-'))]
    # Direct bundled Perl preserves tlmgr's exit code. This local snapshot is
    # already byte-verified by verify_capture; it has no upstream GPG signature.
    if extra: run([tex/'tlpkg/tlperl/bin/perl.exe', tex/'texmf-dist/scripts/texlive/tlmgr.pl', '--verify-repo', 'none', '--repository', (args.capture/'tex-repository').as_posix(), 'install', *extra], tex_env, args.out, log)
    config = tex/'texmf.cnf'
    config.write_text(config.read_text(encoding='utf-8').replace(tex.as_posix(), '$SELFAUTOPARENT'), encoding='utf-8', newline='\n')
    for name in ['xelatex.exe', 'kpsewhich.exe']:
        if not (tex/'bin/windows'/name).is_file(): raise ValueError(f'Missing TeX tool: {name}')
    shutil.copytree(args.project/'runtime/windows/support', payload/'support')
    (payload/'fonts').mkdir()
    run([python, args.project/'scripts/build-runtime-font.py', args.capture/'assets/notoFont', payload/'fonts/NotoSansCJKsc-Regular.ttf'], env, args.out, log)
    (payload/'licenses').mkdir(); shutil.copyfile(args.capture/'assets/notoLicense', payload/'licenses/Noto-CJK-OFL.txt')
    for name in ['tex-config', 'tex-home', 'bin']: (payload/name).mkdir(exist_ok=True)
    for name in ['python', 'python3']:
        (payload/'bin'/name).write_text('#!/usr/bin/bash\nexec "$HAJIMI_PYTHON" "$@"\n', encoding='utf-8', newline='\n')
    shutil.copyfile(requirements_file, payload/'requirements-win-cp313.lock')
    shutil.copyfile(args.capture/'sources.lock.json', payload/'sources.lock.json')
    if args.license_review:
        review = json.loads(args.license_review.read_text(encoding='utf-8'))
    elif args.local_test:
        review = {}
    else:
        raise ValueError('--license-review is required before producing a distributable runtime (or pass --local-test for an explicitly non-redistributable build)')
    if args.local_test:
        # Local testing may exercise the real payload without implying redistribution rights.
        review = {
            'redistributionApproved': False,
            'reviewer': review.get('reviewer') or 'LOCAL-TEST ONLY',
            'reviewedAt': review.get('reviewedAt') or 'not approved',
            'components': review.get('components') or [{'name': e['name'], 'version': e['version'], 'licenseReview': 'NOT APPROVED FOR REDISTRIBUTION'} for e in wheels['files']],
            'note': 'Local test artifact only. Redistribution is not approved; complete the distributor license review before release.'
        }
    elif review.get('redistributionApproved') is not True or not review.get('reviewer') or not review.get('components'):
        raise ValueError('Redistribution review is incomplete; an automated boolean is not legal clearance')
    (payload/'THIRD_PARTY_NOTICES.json').write_text(json.dumps(review, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    files = []; names = set()
    for path in sorted(payload.rglob('*')):
        if path.is_symlink() or path.is_junction(): raise ValueError(f'Reparse point in runtime: {path}')
        if not path.is_file(): continue
        if path.stat().st_nlink > 1:
            # PortableGit/TeX may deduplicate regular files. Materialize only
            # inside this new generated payload; never alter the linked peer.
            temporary = path.with_name(path.name + '.hajimi-materialize')
            with path.open('rb') as src, temporary.open('xb') as dst: shutil.copyfileobj(src, dst)
            temporary.replace(path)
        name = path.relative_to(payload).as_posix(); path_ok(name)
        if len(name) > 230 or name.lower() in names: raise ValueError('Runtime path limit/case collision')
        names.add(name.lower()); files.append({'path': name, 'size': path.stat().st_size, 'sha256': hash_file(path)})
    version = lock['runtimeVersion']
    if not re.fullmatch(r'\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?', version): raise ValueError('Invalid runtime version')
    filename = f'hajimi-runtime-{version}-win32-x64.tar.gz'; archive = args.out/filename
    with archive.open('wb') as raw, gzip.GzipFile(filename='', mode='wb', fileobj=raw, mtime=0) as gz, tarfile.open(fileobj=gz, mode='w', format=tarfile.USTAR_FORMAT, encoding='utf-8') as tar:
        for item in files:
            info = tarfile.TarInfo(item['path']); info.size = item['size']; info.mode = 0o644; info.mtime = 0; info.uid = info.gid = 0
            with (payload/item['path']).open('rb') as data: tar.addfile(info, data)
    manifest = {'format': 'hajimi.runtime.v1', 'abi': 1, 'version': version, 'platform': 'win32', 'arch': 'x64', 'pythonVersion': lock['pythonVersion'], 'tools': {'python': 'python/python.exe', 'bash': 'shell/usr/bin/bash.exe', 'git': 'shell/cmd/git.exe', 'xelatex': 'texlive/bin/windows/xelatex.exe'}, 'capabilities': {'baseline': True, 'pdfLayout': True, 'pdfPreview': True, 'svgExport': True, 'svgInputRender': False, 'html': False, 'mermaid': False, 'drawio': 'standard-shapes-only'}, 'archive': {'file': filename, 'size': archive.stat().st_size, 'sha256': hash_file(archive)}, 'files': files}
    (args.out/'manifest.unsigned.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    (args.out/'size-report.json').write_text(json.dumps({'archiveBytes': archive.stat().st_size, 'installedFileBytes': sum(f['size'] for f in files), 'files': len(files), 'notIncluded': 'NTFS metadata, install staging, caches and project outputs'}, indent=2)+'\n', encoding='utf-8')
    print('Built unsigned runtime and measured size-report.json. Relocation/clean-VM smoke and release signing are still required.')

if __name__ == '__main__': main()
