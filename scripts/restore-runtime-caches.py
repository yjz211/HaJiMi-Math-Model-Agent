import base64,json,tarfile,hashlib,os
from pathlib import Path
v=Path(r'C:\ProgramData\HaJiMi\runtime-users\3e70f53f034e1321d40b\versions\d19bd3b9-4bcd-4f73-a515-31c7f9c4c2b5'); root=v/'payload'
m=json.loads(base64.b64decode(json.loads((v/'receipt.json').read_text())['payload']))
expected={f['path']:f for f in m['files']}; bad=set()
for rel,f in expected.items():
 if True:
  p=root/rel
  if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest()!=f['sha256']:bad.add(rel)
print('Runtime files to restore',len(bad),flush=True)
archive=next(Path(r'C:\Users\hhhh\Desktop\HaJiMi-native-test-20260907\runtime\windows\payloads').glob('*.tar.gz'))
with tarfile.open(archive,'r|gz') as tar:
 for member in tar:
  rel=member.name.removeprefix('./')
  if rel not in bad:continue
  data=tar.extractfile(member).read();assert hashlib.sha256(data).hexdigest()==expected[rel]['sha256']
  p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);bad.remove(rel)
  if not bad:break
assert not bad,bad
print('RESTORED signed runtime',flush=True)

