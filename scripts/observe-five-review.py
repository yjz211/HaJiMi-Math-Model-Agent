import json
from pathlib import Path
r=Path('artifacts/five-review-20260909'); events=[json.loads(l) for l in (r/'events.jsonl').read_text(encoding='utf-8').splitlines()]
starts={e['id']:e for e in events if e['type']=='tool_execution_start'}
for e in events:
 if e['type']=='tool_execution_end' and (e.get('isError') or any(x['type']=='image' for x in e.get('result',[]))):
  print(e['time'], 'ERROR' if e.get('isError') else 'IMAGE',starts.get(e['id'],{}).get('args'),str(e.get('result'))[:350] if e.get('isError') else '')
for e in events[-6:]:
 if e['type']=='tool_execution_start':print('LATEST',e['time'],e['tool'],str(e['args'])[:400])
 if e['type']=='message_end' and e.get('text'):print('MODEL',e['text'][:900])
print('turns',sum(e['type']=='message_end' for e in events))
