'use strict';

const DEFAULTS = Object.freeze({retentionEnabled:false, retentionDays:60, minimumBackupsToKeep:3});
const DAY = 24 * 60 * 60 * 1000;
const BACKUP_NAME = /^Backup_Center_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}))?\.json$/;

function settings(input = {}) {
 const retentionEnabled = input.retentionEnabled === undefined ? false : input.retentionEnabled;
 const retentionDays = input.retentionDays === undefined ? 60 : Number(input.retentionDays);
 const minimumBackupsToKeep = input.minimumBackupsToKeep === undefined ? 3 : Number(input.minimumBackupsToKeep);
 if(typeof retentionEnabled !== 'boolean') throw Error('Retention enabled must be a boolean.');
 if(!Number.isInteger(retentionDays) || retentionDays < 1 || !Number.isSafeInteger(retentionDays)) throw Error('Retention days must be an integer of at least 1.');
 if(!Number.isInteger(minimumBackupsToKeep) || minimumBackupsToKeep < 1 || !Number.isSafeInteger(minimumBackupsToKeep)) throw Error('Minimum backups to keep must be an integer of at least 1.');
 return {retentionEnabled,retentionDays,minimumBackupsToKeep};
}

function timestamp(name, allowLegacy = false) {
 if(typeof name !== 'string') return null;
 const match = BACKUP_NAME.exec(name);
 if(!match || (!allowLegacy && !match[2])) return null;
 const iso = match[1].replace(/-(\d{2})-(\d{2})-(\d{3})Z$/, ':$1:$2.$3Z');
 const date = Date.parse(iso);
 return Number.isFinite(date) && new Date(date).toISOString() === iso ? date : null;
}

async function cleanup({target,currentFilename,list,remove,now = Date.now,log = () => {},allowLegacy = false}) {
 const policy = settings(target);
 const report = {enabled:policy.retentionEnabled,destination:target.name,inspected:0,valid:0,cutoff:null,minimum:policy.minimumBackupsToKeep,selected:[],deleted:[],protected:[],errors:[]};
 if(!policy.retentionEnabled) { log('Retention disabled', report); return report; }
 const currentTime = timestamp(currentFilename,allowLegacy);
 if(currentTime === null) throw Error('The completed backup filename is not recognized; cleanup skipped.');
 const entries = await list();
 if(!Array.isArray(entries)) throw Error('Retention listing is invalid; cleanup skipped.');
 report.inspected = entries.length;
 const seen = new Set();
 const valid = [];
 for(const entry of entries) {
  if(!entry || typeof entry.name !== 'string') continue;
  const date = timestamp(entry.name,allowLegacy);
  if(date === null) continue;
  if(seen.has(entry.name)) throw Error('Duplicate backup filename in listing; cleanup skipped.');
  seen.add(entry.name);
  if(entry.type !== 'file' || !Number.isSafeInteger(entry.size) || entry.size <= 0) continue;
  valid.push({...entry,date});
 }
 report.valid = valid.length;
 if(!valid.some(entry => entry.name === currentFilename)) throw Error('Completed backup absent from listing; cleanup skipped.');
 const cutoff = now() - policy.retentionDays * DAY;
 if(!Number.isFinite(cutoff) || !Number.isFinite(new Date(cutoff).valueOf())) throw Error('Retention cutoff is invalid; cleanup skipped.');
 report.cutoff = new Date(cutoff).toISOString();
 valid.sort((a,b) => b.date - a.date || a.name.localeCompare(b.name));
 let remaining = valid.length;
 for(const entry of valid.slice().reverse()) {
  if(entry.name === currentFilename || entry.date >= cutoff) continue;
  if(remaining <= policy.minimumBackupsToKeep) { report.protected.push(entry.name); continue; }
  report.selected.push(entry.name);
  try { await remove(entry); report.deleted.push(entry.name); remaining--; }
  catch(e) { report.errors.push({filename:entry.name,message:e?.code ? 'Deletion failed ('+e.code+').' : 'Deletion failed.'}); }
 }
 log('Retention cleanup', report);
 return report;
}

module.exports = {DEFAULTS,settings,timestamp,cleanup};
