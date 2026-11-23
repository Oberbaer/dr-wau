'use strict';
const http = require('node:http');
const https = require('node:https');
const {TextDecoder} = require('node:util');
const {EXPORT_BYTES, TOO_LARGE} = require('./bounded-json');

const READ_FAILED = 'Flow data could not be read completely. No backup was created.';
const TIMED_OUT = 'Backup creation timed out safely. Try again later.';
const invalid = () => new Error(READ_FAILED);

// Homey's GET collection is one JSON object, not paginated. Retain only the
// current entry's JSON text, then hand its parsed, owned object to the exporter.
// JSON.parse validates every complete entry; this scanner only finds boundaries.
class FlowEntries {
  constructor(onEntry, maxBytes = EXPORT_BYTES, check = () => {}) {
    this.onEntry = onEntry; this.maxBytes = maxBytes; this.check = check;
    this.decoder = new TextDecoder('utf-8', {fatal:true});
    this.bytes = 0; this.state = 'root'; this.seen = new Set();
    this.parts = []; this.bufferedChars = 0; this.maxBufferedChars = 0;
    this.keyText = ''; this.escaped = false; this.inString = false; this.depth = 0;
  }
  async write(chunk) {
    this.check(); this.bytes += chunk.length;
    if (this.bytes > this.maxBytes) throw Error(TOO_LARGE);
    let text;
    try { text = this.decoder.decode(chunk, {stream:true}); } catch (_) { throw invalid(); }
    await this.scan(text);
  }
  async scan(text) {
    let start = this.state === 'value' ? 0 : -1;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (this.state === 'key') {
        this.keyText += c;
        if (this.keyText.length > 1024) throw invalid();
        if (this.escaped) this.escaped = false;
        else if (c === '\\') this.escaped = true;
        else if (c === '"') {
          try { this.key = JSON.parse(this.keyText); } catch (_) { throw invalid(); }
          if (this.seen.has(this.key)) throw invalid();
          this.seen.add(this.key); this.keyText = ''; this.state = 'colon';
        }
        continue;
      }
      if (this.state === 'value') {
        if (this.inString) {
          if (this.escaped) this.escaped = false;
          else if (c === '\\') this.escaped = true;
          else if (c === '"') this.inString = false;
        } else if (c === '"') this.inString = true;
        else if (c === '{' || c === '[') { if (++this.depth > 64) throw invalid(); }
        else if (c === '}' || c === ']') {
          if (--this.depth === 0) {
            this.add(text.slice(start, i + 1)); start = -1;
            let entry;
            try { entry = JSON.parse(this.parts.join('')); } catch (_) { throw invalid(); }
            this.parts = []; this.bufferedChars = 0; this.state = 'separator';
            this.check(); await this.onEntry(this.key, entry); this.check();
          }
        }
        continue;
      }
      if (/^[\x20\t\r\n]$/.test(c)) continue;
      switch (this.state) {
        case 'root': if (c !== '{') throw invalid(); this.state = 'first-key'; break;
        case 'first-key':
        case 'next-key':
          if (c === '}' && this.state === 'first-key') { this.state = 'done'; break; }
          if (c !== '"') throw invalid();
          this.keyText = '"'; this.state = 'key'; this.escaped = false; break;
        case 'colon': if (c !== ':') throw invalid(); this.state = 'start-value'; break;
        case 'start-value':
          if (c !== '{') throw invalid();
          this.state = 'value'; this.depth = 1; this.inString = false; this.escaped = false; start = i; break;
        case 'separator':
          if (c === ',') this.state = 'next-key';
          else if (c === '}') this.state = 'done';
          else throw invalid();
          break;
        default: throw invalid();
      }
    }
    if (start >= 0) this.add(text.slice(start));
  }
  add(text) {
    this.parts.push(text); this.bufferedChars += text.length;
    this.maxBufferedChars = Math.max(this.maxBufferedChars, this.bufferedChars);
    if (this.bufferedChars > this.maxBytes) throw Error(TOO_LARGE);
  }
  async finish() {
    let tail;
    try { tail = this.decoder.decode(); } catch (_) { throw invalid(); }
    await this.scan(tail);
    if (this.state !== 'done') throw invalid();
  }
}

async function readCollection({baseUrl, token, homeyId, type, onEntry, maxBytes, check, timeoutMs = 8000}) {
  const endpoint = {standard:'flow', advanced:'advancedflow'}[type];
  if (!endpoint) throw invalid();
  const url = new URL('/api/manager/flow/' + endpoint, baseUrl);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw invalid();
  const parser = new FlowEntries(onEntry, maxBytes, check);
  await new Promise((resolve, reject) => {
    let settled = false, response;
    const finish = error => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) { response?.destroy(); req.destroy(); reject(error); }
      else resolve();
    };
    // Same owner session and local URL as HomeyAPI.createAppAPI. No redirect,
    // remote destination, cookie, SDK Item wrapper or full response.text().
    const req = (url.protocol === 'https:' ? https : http).request(url, {
      method:'GET', headers:{Authorization:'Bearer ' + token, Accept:'application/json', 'Accept-Encoding':'identity', ...(homeyId ? {'X-Homey-ID':homeyId} : {})},
    }, res => {
      response = res;
      void (async () => {
        try {
          if (res.statusCode !== 200 || !/^application\/json(?:;|$)/i.test(res.headers['content-type'] || '')
            || !['identity', undefined].includes(res.headers['content-encoding'])) throw invalid();
          if (Number(res.headers['content-length']) > parser.maxBytes) throw Error(TOO_LARGE);
          for await (const chunk of res) await parser.write(chunk);
          await parser.finish(); finish();
        } catch (e) { finish(e); }
      })();
    });
    const timer = setTimeout(() => finish(Error(TIMED_OUT)), timeoutMs); timer.unref();
    req.once('error', () => finish(invalid())); req.end();
  });
}

async function createReader(api, homeyId, platformVersion = 2) {
  const baseUrl = await api.getLocalUrl(), token = await api.getOwnerApiToken();
  // Keep the pinned SDK's legacy card-ID normalization without constructing
  // hundreds of SDK Item/socket objects for this read-only export.
  const legacy = platformVersion === 1 ? {
    standard:require('homey-api/lib/HomeyAPI/HomeyAPIV2/ManagerFlow/Flow'),
    advanced:require('homey-api/lib/HomeyAPI/HomeyAPIV2/ManagerFlow/AdvancedFlow'),
  } : null;
  return (type, onEntry, maxBytes, check) => readCollection({baseUrl, token, homeyId, type,
    onEntry:(id,record)=>{
      record = legacy ? legacy[type].transformGet(record) : record;
      // SDK Item supplies this enumerable metadata even when absent on the wire.
      record.uri ??= 'homey:' + (type === 'standard' ? 'flow' : 'advancedflow') + ':' + (record.id || id);
      return onEntry(id,record);
    }, maxBytes, check});
}
module.exports = {createReader, readCollection, FlowEntries, READ_FAILED};
