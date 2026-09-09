import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, open } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createGunzip } from 'node:zlib';

export const LIMITS = Object.freeze({ files: 250000, expanded: 32 * 1024 ** 3, archive: 8 * 1024 ** 3, manifest: 48 * 1024 ** 2 });
const DEVICES = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i;
/** Deliberately narrower than tar/Windows: the publisher emits regular USTAR files only. */
export function safeArchivePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 230 || /[\\:\x00-\x1f\x7f]/.test(value)) throw new Error('Unsafe archive path');
  const parts = value.split('/');
  if (parts.some(p => !p || p === '.' || p === '..' || /[. ]$/.test(p) || DEVICES.test(p) || /[<>"|?*]/.test(p))) throw new Error(`Unsafe archive path: ${value}`);
  return value;
}
export function validateFiles(files) {
  if (!Array.isArray(files) || !files.length || files.length > LIMITS.files) throw new Error('Invalid file inventory');
  const map = new Map(); let size = 0;
  for (const f of files) {
    safeArchivePath(f.path);
    if (!Number.isSafeInteger(f.size) || f.size < 0 || !/^[a-f0-9]{64}$/.test(f.sha256)) throw new Error(`Invalid file record: ${f.path}`);
    const key = f.path.toLowerCase();
    if (map.has(key)) throw new Error(`Case-colliding or duplicate file: ${f.path}`);
    map.set(key, f); size += f.size;
    if (size > LIMITS.expanded) throw new Error('Expanded runtime exceeds limit');
  }
  for (const key of map.keys()) {
    const parts = key.split('/'); parts.pop();
    while (parts.length) {
      if (map.has(parts.join('/'))) throw new Error('File/directory collision');
      parts.pop();
    }
  }
  return map;
}
function field(b, start, length) { return b.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, ''); }
function octal(b, start, length) {
  const s = field(b, start, length).trim();
  if (!/^[0-7]+$/.test(s)) throw new Error('Unsupported tar numeric field');
  const n = parseInt(s, 8); if (!Number.isSafeInteger(n)) throw new Error('Tar integer overflow'); return n;
}
class Reader {
  constructor(stream) { this.iterator = stream[Symbol.asyncIterator](); this.buffer = Buffer.alloc(0); }
  async read(n) {
    const parts = []; let length = 0;
    while (length < n) {
      if (!this.buffer.length) {
        const item = await this.iterator.next(); if (item.done) throw new Error('Truncated archive');
        this.buffer = item.value;
      }
      const take = Math.min(n - length, this.buffer.length);
      parts.push(this.buffer.subarray(0, take)); this.buffer = this.buffer.subarray(take); length += take;
    }
    return parts.length === 1 ? parts[0] : Buffer.concat(parts, n);
  }
  async end() {
    if (this.buffer.some(x => x)) throw new Error('Trailing archive content');
    let padding = this.buffer.length;
    for (;;) { const item = await this.iterator.next(); if (item.done) return; padding += item.value.length; if (padding > 10240 || item.value.some(x => x)) throw new Error('Excess archive padding'); }
  }
}
/** root must be a NEW, exclusively owned staging directory, never an existing install. */
export async function extractRuntimeArchive(archive, root, files, signal) {
  const expected = validateFiles(files); const seen = new Set();
  const source = createReadStream(archive); const unzip = createGunzip();
  const abort = () => { source.destroy(new Error('Installation aborted')); unzip.destroy(new Error('Installation aborted')); };
  signal?.throwIfAborted(); signal?.addEventListener('abort', abort, { once: true });
  source.on('error', e => unzip.destroy(e)); source.pipe(unzip);
  const reader = new Reader(unzip);
  try {
    for (;;) {
      signal?.throwIfAborted();
      const header = await reader.read(512);
      if (header.every(x => x === 0)) {
        if (!(await reader.read(512)).every(x => x === 0)) throw new Error('Invalid tar terminator');
        await reader.end(); break;
      }
      let checksum = 0; for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
      if (checksum !== octal(header, 148, 8)) throw new Error('Tar checksum mismatch');
      if (field(header, 257, 6) !== 'ustar' || ![0, 48].includes(header[156])) throw new Error('Only regular USTAR files are supported (no links, PAX, devices or directories)');
      const prefix = field(header, 345, 155); const name = safeArchivePath((prefix ? prefix + '/' : '') + field(header, 0, 100));
      const size = octal(header, 124, 12); const key = name.toLowerCase(); const record = expected.get(key);
      if (!record || name !== record.path || record.size !== size || seen.has(key)) throw new Error(`Unexpected archive entry: ${name}`);
      const target = join(root, ...name.split('/')); await mkdir(dirname(target), { recursive: true });
      const handle = await open(target, 'wx'); const hash = createHash('sha256');
      try {
        for (let remaining = size; remaining > 0;) {
          signal?.throwIfAborted(); const data = await reader.read(Math.min(1024 * 1024, remaining)); hash.update(data);
          let offset = 0; while (offset < data.length) { const { bytesWritten } = await handle.write(data, offset, data.length - offset); if (!bytesWritten) throw new Error('Short archive write'); offset += bytesWritten; }
          remaining -= data.length;
        }
        await handle.sync();
      } finally { await handle.close(); }
      if (hash.digest('hex') !== record.sha256) throw new Error(`File hash mismatch: ${name}`);
      const padding = (512 - size % 512) % 512;
      if (padding && (await reader.read(padding)).some(x => x)) throw new Error('Invalid tar padding');
      seen.add(key);
    }
    if (seen.size !== expected.size) throw new Error('Missing archive files');
  } finally { signal?.removeEventListener('abort', abort); source.destroy(); unzip.destroy(); }
}
