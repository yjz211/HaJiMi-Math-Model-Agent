import base64,json,tarfile,hashlib,io
from pathlib import Path
product=Path(r'C:\Users\hhhh\Desktop\HaJiMi-v0.1.2'); build=Path(r'C:\Users\hhhh\hajimi-runtime-build-012-adjusttext');build.mkdir(exist_ok=False)
v=Path(r'C:\ProgramData\HaJiMi\runtime-users\3e70f53f034e1321d40b\versions\d19bd3b9-4bcd-4f73-a515-31c7f9c4c2b5')
m=json.loads(base64.b64decode(json.loads((v/'receipt.json').read_text())['payload']))
add={}
for folder in ['adjustText','adjusttext-1.4.0.dist-info']:
 for p in (v/'payload/python/Lib/site-packages'/folder).rglob('*'):
  if p.is_file() and '__pycache__' not in p.parts: add[p.relative_to(v/'payload').as_posix()]=p.read_bytes()
archive=next(Path(r'C:\Users\hhhh\Desktop\HaJiMi-native-test-20260907\runtime\windows\payloads').glob('*.tar.gz'))
name='hajimi-runtime-1.0.0-local-test.20260909-adjusttext-win32-x64.tar.gz';dest=build/name
with tarfile.open(archive,'r|gz') as src,tarfile.open(dest,'w:gz',format=tarfile.USTAR_FORMAT,compresslevel=3) as out:
 for member in src:
  if member.isfile():out.addfile(member,src.extractfile(member))
 for rel,data in add.items():
  info=tarfile.TarInfo(rel);info.size=len(data);info.mode=0o644;out.addfile(info,io.BytesIO(data))
  m['files'].append({'path':rel,'size':len(data),'sha256':hashlib.sha256(data).hexdigest()})
h=hashlib.sha256()
with dest.open('rb') as f:
 for b in iter(lambda:f.read(1048576),b''):h.update(b)
m['version']='1.0.0-local-test.20260909-adjusttext';m['archive']={'file':name,'size':dest.stat().st_size,'sha256':h.hexdigest()}
(build/'manifest.unsigned.json').write_text(json.dumps(m),encoding='utf-8')
print('Built signed-input archive; added files:',len(add),flush=True)
