import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Report observed usage, not an estimated tokenizer count or an efficiency claim.
for (const root of process.argv.slice(2).filter(arg => arg !== '--first-stop')) {
  let events = (await readFile(join(root, 'probe-events.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  if (process.argv.includes('--first-stop')) {
    const stop = events.findIndex(e => e.type === 'message_end' && e.stopReason === 'stop');
    if (stop >= 0) events = events.slice(0, stop + 1);
  }
  const messages = events.filter(e => e.type === 'message_end');
  const reads = events.filter(e => e.type === 'tool_execution_start' && e.tool === 'read');
  const totals = Object.fromEntries(['input', 'output', 'cacheRead', 'reasoning'].map(key => [key, messages.reduce((n, e) => n + (e.usage?.[key] ?? 0), 0)]));
  console.log(JSON.stringify({ root, responses: messages.length, usage: totals,
    maxRequestInput: Math.max(...messages.map(e => (e.usage?.input ?? 0) + (e.usage?.cacheRead ?? 0))),
    eventSpanSeconds: (Date.parse(events.at(-1).time) - Date.parse(events[0].time)) / 1000,
    toolCalls: events.filter(e => e.type === 'tool_execution_start').length,
    explicitReferenceReads: reads.filter(e => /modeling-paper-standard.*references/.test(e.args.path)).map(e => e.args.path.split(/[\\/]/).at(-1)),
    toolErrors: events.filter(e => e.type === 'tool_execution_end' && e.isError).length,
    lastStopReason: messages.at(-1)?.stopReason,
  }, null, 2));
}
