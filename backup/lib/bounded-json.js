'use strict';
// Export JSON has a smaller budget than the compatibility limit for uploaded backups.
const EXPORT_BYTES = 16 * 1024 * 1024;
const TOO_LARGE = 'This backup exceeds the safe runtime size limit. It was aborted safely.';
const INVALID = 'Backup data could not be serialized safely.';

// Two bounded passes, one exact Buffer allocation. No complete JSON string or
// complete Base64 copy is retained. String escaping uses at most 4096 code units.
function* tokens(value) {
  const ancestors = new Set(); let nodes = 0;
  function* string(text) {
    if (text.length > EXPORT_BYTES) throw Error(TOO_LARGE);
    yield '"';
    for (let start = 0; start < text.length;) {
      let end = Math.min(text.length, start + 4096);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      yield JSON.stringify(text.slice(start, end)).slice(1, -1); start = end;
    }
    yield '"';
  }
  function normalize(v,key){return v && typeof v.toJSON==='function'?v.toJSON(key):v;}
  function* visit(v, depth, key = '', array = false, normalized = false) {
    if (++nodes > 500000 || depth > 64) throw Error(INVALID);
    if(!normalized)v=normalize(v,key);
    if (v === null) { yield 'null'; return; }
    if (typeof v === 'string') { yield* string(v); return; }
    if (typeof v === 'number') { yield Number.isFinite(v) ? String(v) : 'null'; return; }
    if (typeof v === 'boolean') { yield String(v); return; }
    if (typeof v === 'bigint') throw Error(INVALID);
    if (typeof v !== 'object') { if (array) yield 'null'; return; }
    if (ancestors.has(v)) throw Error(INVALID);
    ancestors.add(v);
    try {
      const isArray = Array.isArray(v); yield isArray ? '[' : '{'; let first = true;
      const keys = isArray ? null : Object.keys(v);
      if ((isArray ? v.length : keys.length) > 500000) throw Error(INVALID);
      for (let i = 0; i < (isArray ? v.length : keys.length); i++) {
        const k = isArray ? String(i) : keys[i], child = normalize(v[k],k);
        if (!isArray && ['undefined','function','symbol'].includes(typeof child)) continue;
        if (!first) yield ','; first = false;
        if (!isArray) { yield* string(k); yield ':'; }
        yield* visit(child, depth + 1, k, isArray,true);
      }
      yield isArray ? ']' : '}';
    } finally { ancestors.delete(v); }
  }
  yield* visit(value, 0);
}
function measure(value, limit = EXPORT_BYTES) {
  let bytes = 0;
  for (const token of tokens(value)) {
    bytes += Buffer.byteLength(token);
    if (bytes > limit) throw Error(TOO_LARGE);
  }
  if (!bytes) throw Error(INVALID);
  return bytes;
}
function encode(value, limit = EXPORT_BYTES, reserve = () => {}) {
  const bytes = measure(value, limit); reserve(bytes);
  const buffer = Buffer.allocUnsafe(bytes); let offset = 0;
  for (const token of tokens(value)) {
    const length = Buffer.byteLength(token);
    if (offset + length > bytes) throw Error(INVALID);
    offset += buffer.write(token, offset, length, 'utf8');
  }
  if (offset !== bytes) throw Error(INVALID);
  return buffer;
}
module.exports = { EXPORT_BYTES, TOO_LARGE, INVALID, measure, encode };
