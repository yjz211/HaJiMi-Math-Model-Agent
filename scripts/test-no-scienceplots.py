import importlib.util,subprocess,tempfile,os
from pathlib import Path
root=Path(r'C:\Users\hhhh\Desktop\HaJiMi-v0.1.2')
for prefix in ['', 'compatibility/v010/']:
 p=root/prefix/'bundled/capabilities/modeling-plot-suite/1.0.0/resources/assets/shared-scripts/plot_utils.py'
 assert 'scienceplots' not in p.read_text(encoding='utf-8').lower()
 spec=importlib.util.spec_from_file_location('pu',p); pu=importlib.util.module_from_spec(spec);spec.loader.exec_module(pu)
 original=subprocess.check_call
 def guard(args,*a,**kw):
  assert not any('scienceplots' in str(x).lower() for x in args),args
  return original(args,*a,**kw)
 subprocess.check_call=guard
 with tempfile.TemporaryDirectory() as d:
  old=os.getcwd();os.chdir(d)
  try:
   for palette in ['auto','coral']:
    pu.setup_style(palette)
    import matplotlib.pyplot as plt
    f,a=plt.subplots();a.plot([0,1],[0,1]);f.savefig(Path(d)/(palette+'.png'));plt.close(f)
   assert list(pu.PALETTE)==pu.PALETTES['coral']
  finally:os.chdir(old)
 subprocess.check_call=original
 print(prefix or 'main','auto and explicit palette PASSED')
