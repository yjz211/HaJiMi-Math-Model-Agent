"""Compact read-only view of backend events; never changes its workspace."""
import json
from pathlib import Path
from collections import Counter

root=Path(__file__).resolve().parents[1]
trace=root/'artifacts/seven-synthetic-20260909'
path=trace/'events.jsonl'
rows=[json.loads(line) for line in path.read_text(encoding='utf-8').splitlines() if line.strip()]
starts=[r for r in rows if r['type']=='tool_execution_start']
messages=[r for r in rows if r['type']=='message_end']
errors=[r for r in rows if r.get('isError')]
print(json.dumps({'events':len(rows),'assistantTurns':len(messages),'tools':dict(Counter(r['tool'] for r in starts)),
 'errors':len(errors),'latestEvent':rows[-1]['time'],'outputs':len(list((root/'projects/seven-synthetic-20260909/figures').glob('*.pdf')))},ensure_ascii=False))
for row in rows[-8:]:
    if row['type']=='tool_execution_end':
        texts='\n'.join(x.get('text','') for x in row.get('result') or [])
        print(row['time'],row.get('tool'), 'ERROR' if row.get('isError') else 'OK',texts[:250])
    else:
        print(row['time'],row['type'],row.get('tool',''),str(row.get('args',row.get('text','')))[:850])
