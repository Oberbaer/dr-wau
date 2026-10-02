'use strict';

const crypto = require('node:crypto');
const { normalizeConfig } = require('./battery-watchdog');
const { PROFILES } = require('./heartbeat');
const LEGACY_APP_ID = 'com.oberbaer.homeywatchdog';
const APP_ID = 'com.oberbaer.drwau';
const CONFIG = 'battery_watchdog_config_v1';
const SOURCE_SETTING = 'dr_wau_migration_source_v1';
const KEYS = [CONFIG, 'device_learning_state_v1', 'finding_annotations_v1',
  'battery_watchdog_state_v2', 'webdavTargets', 'networkTargets', 'schedule', 'language'];
const forbidden = /password|passwd|secret|token|api.?key|restorePat|credential|authorization|cookie|private.?key/i;
const fail = () => { throw Error('Invalid Dr. Wau migration file. No settings were changed.'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]));

// Only these settings are read. Reports, credentials and diagnostic dumps are excluded.
function readSettings(settings) {
  return Object.fromEntries(KEYS.map(key => [key, settings.get(key)]).filter(([, value]) => value != null));
}

function clean(value, importing = false, depth = 0) {
  if (depth > 20) fail();
  if (typeof value === 'string') {
    if (value.length > 20000) fail();
    if (/^https?:\/\//i.test(value)) {
      let url;
      try { url = new URL(value); } catch (_) { fail(); }
      const unsafe = Boolean(url.username || url.password || url.search || url.hash);
      if (importing && unsafe) fail();
      if (unsafe) { url.username = ''; url.password = ''; url.search = ''; url.hash = ''; return url.href; }
    }
    return value;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 10000) fail();
    return value.map(item => clean(item, importing, depth + 1));
  }
  if (!object(value) || Object.keys(value).length > 10000) fail();
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) fail();
    if (forbidden.test(key)) { if (importing) fail(); else continue; }
    result[key] = clean(item, importing, depth + 1);
  }
  return result;
}

function destinations(input, network) {
  if (!Array.isArray(input)) fail();
  return input.map(target => {
    if (!object(target)) fail();
    // Usernames and domains are credentials too. Known-safe destination metadata only.
    return pick(target, ['id', 'name', ...(network ? ['type', 'host', 'port', 'directory', 'share', 'fingerprint', 'timeoutMs'] : ['url']),
      'retentionEnabled', 'retentionDays', 'minimumBackupsToKeep']);
  });
}

function createExport(settings, { sourceAppId = LEGACY_APP_ID, sourceVersion = '0.7.1', now = Date.now() } = {}) {
  const selected = pick(settings, KEYS);
  selected[CONFIG] = normalizeConfig(selected[CONFIG] || { timeline: false });
  if (selected.webdavTargets) selected.webdavTargets = destinations(selected.webdavTargets, false);
  if (selected.networkTargets) selected.networkTargets = destinations(selected.networkTargets, true);
  if (selected.schedule) selected.schedule = pick(selected.schedule, ['enabled', 'time', 'weekdays', 'targetId', 'notifyUserId']);
  const document = { format: 'dr-wau-migration', schema: 1, sourceAppId, sourceVersion,
    exportedAt: new Date(now).toISOString(), settings: clean(selected) };
  validate(document);
  return document;
}

function validate(document) {
  if (!object(document) || JSON.stringify(document).length > 5000000) fail();
  if (Object.keys(document).some(key => !['format', 'schema', 'sourceAppId', 'sourceVersion', 'exportedAt', 'settings'].includes(key))) fail();
  if (document.format !== 'dr-wau-migration' || document.schema !== 1
    || !(document.sourceAppId === LEGACY_APP_ID && document.sourceVersion === '0.7.1'
      || document.sourceAppId === APP_ID && document.sourceVersion === '1.0.0')
    || typeof document.exportedAt !== 'string' || !Number.isFinite(Date.parse(document.exportedAt))) fail();
  const s = document.settings;
  if (!object(s) || !object(s[CONFIG]) || Object.keys(s).some(key => !KEYS.includes(key))) fail();
  clean(s, true);
  const c = s[CONFIG];
  for (const key of ['enabled', 'timeline', 'flowTrigger']) if (c[key] !== undefined && typeof c[key] !== 'boolean') fail();
  for (const key of ['checkHours', 'staleHours', 'repeatHours', 'batteryLowPercent', 'batteryCriticalPercent'])
    if (c[key] !== undefined && (typeof c[key] !== 'number' || !Number.isFinite(c[key]))) fail();
  for (const key of ['pushUserIds', 'ignoredDeviceIds', 'ignoredZoneIds'])
    if (c[key] !== undefined && (!Array.isArray(c[key]) || c[key].some(id => typeof id !== 'string'))) fail();
  if (c.deviceProfiles !== undefined && (!object(c.deviceProfiles) || Object.keys(c.deviceProfiles).length > 2000
    || Object.values(c.deviceProfiles).some(profile => !object(profile)
      || profile.profile !== undefined && !PROFILES.includes(profile.profile)
      || profile.mode !== undefined && !['manual', 'event_only', 'disabled'].includes(profile.mode)
      || ['staleHours', 'warningAfterHours', 'vacationFactor'].some(key => profile[key] != null && typeof profile[key] !== 'number')))) fail();
  if (c.vacation !== undefined && (!object(c.vacation) || typeof c.vacation.enabled !== 'boolean'
    || c.vacation.until != null && !Number.isFinite(Date.parse(c.vacation.until)))) fail();
  if (s.device_learning_state_v1 !== undefined && (!object(s.device_learning_state_v1) || s.device_learning_state_v1.schema !== 1
    || !object(s.device_learning_state_v1.devices) || Object.values(s.device_learning_state_v1.devices).some(row => !object(row)
      || row.activity !== undefined && !object(row.activity)
      || ['events', 'rawEvents'].some(key => row[key] !== undefined && (!Array.isArray(row[key]) || row[key].length > 384
        || row[key].some(e => !object(e) || !Number.isFinite(e.at) || !['interaction', 'native', 'capability', 'insights'].includes(e.source))))))) fail();
  if (s.finding_annotations_v1 !== undefined && (!object(s.finding_annotations_v1) || Object.values(s.finding_annotations_v1).some(row => !object(row)))) fail();
  if (s.battery_watchdog_state_v2 !== undefined && (!object(s.battery_watchdog_state_v2) || s.battery_watchdog_state_v2.schema !== 2 || !object(s.battery_watchdog_state_v2.devices))) fail();
  for (const key of ['webdavTargets', 'networkTargets']) if (s[key] !== undefined) {
    const network = key === 'networkTargets';
    const allowed = destinations(s[key], network);
    if (s[key].some((t, i) => Object.keys(t).some(key => !Object.hasOwn(allowed[i], key))) || allowed.length > 8
      || allowed.some(t => typeof t.id !== 'string' || typeof t.name !== 'string'
        || (network ? !['smb', 'ftp', 'sftp'].includes(t.type) || typeof t.host !== 'string' || /[@\/\s]/.test(t.host)
          : typeof t.url !== 'string' || !/^https?:\/\//.test(t.url)))) fail();
  }
  if (s.schedule !== undefined && (!object(s.schedule) || typeof s.schedule.enabled !== 'boolean'
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.schedule.time)
    || !Array.isArray(s.schedule.weekdays) || s.schedule.weekdays.some(day => !/^[0-6]$/.test(String(day)))
    || typeof s.schedule.targetId !== 'string' || typeof s.schedule.notifyUserId !== 'string'
    || Object.keys(s.schedule).some(key => !['enabled', 'time', 'weekdays', 'targetId', 'notifyUserId'].includes(key)))) fail();
  if (s.language !== undefined && !['en', 'de', 'nl'].includes(s.language)) fail();
  return document;
}

function planMigration(document) {
  validate(document);
  const source = structuredClone(document.settings);
  const config = normalizeConfig(source[CONFIG]);
  const settings = { ...source, restorePat: '', [CONFIG]: normalizeConfig({ ...config, enabled: false, timeline: false,
    flowTrigger: false, pushUserIds: [], vacation: { enabled: false, until: null } }),
    [SOURCE_SETTING]: { schema: 1, sourceAppId: document.sourceAppId, sourceVersion: document.sourceVersion,
      importedAt: new Date().toISOString(), watchdogConfig: config, schedule: source.schedule || null } };
  if (settings.schedule) settings.schedule = { ...settings.schedule, schemaVersion: 2, enabled: false };
  // Empty credentials are explicit; an import can never retain a previous target password.
  for (const key of ['webdavTargets', 'networkTargets']) if (settings[key])
    settings[key] = settings[key].map(t => ({ ...t, username: '', password: '', ...(key === 'networkTargets' ? { domain: '' } : {}) }));
  const profiles = Object.values(config.deviceProfiles);
  const summary = { profiles: profiles.length, manualOverrides: profiles.filter(p => p.mode === 'manual').length,
    ignoredDevices: config.ignoredDeviceIds.length, ignoredZones: config.ignoredZoneIds.length,
    learningDevices: Object.keys(source.device_learning_state_v1?.devices || {}).length,
    annotations: Object.keys(source.finding_annotations_v1 || {}).length, pushRecipientsPreserved: config.pushUserIds.length,
    webdavTargets: source.webdavTargets?.length || 0, networkTargets: source.networkTargets?.length || 0,
    schedulePreserved: Boolean(source.schedule), vacationPreserved: config.vacation.enabled,
    warningsEnabled: false, vacationEnabled: false, backupScheduleEnabled: false,
    credentialsExcluded: ['Homey API key', 'WebDAV credentials', 'SMB/FTP/SFTP credentials', 'URL authentication and query parameters'],
    activationChoicesPreserved: true };
  const previewToken = crypto.createHash('sha256').update(JSON.stringify(document)).digest('hex');
  return { settings, summary, previewToken };
}

async function applyMigration(adapter, plan) {
  const before = Object.fromEntries(Object.keys(plan.settings).map(key => [key, adapter.get(key)]));
  try { for (const [key, value] of Object.entries(plan.settings)) await adapter.set(key, value); }
  catch (_) {
    let restored = true;
    for (const [key, value] of Object.entries(before)) {
      try { if (value === undefined || value === null) await adapter.unset(key); else await adapter.set(key, value); }
      catch (_) { restored = false; }
    }
    throw Error(restored ? 'Migration failed; previous settings restored.' : 'Migration failed; settings rollback incomplete. Keep all schedules disabled and inspect settings.');
  }
  return plan.summary;
}

module.exports = { APP_ID, LEGACY_APP_ID, CONFIG, SOURCE_SETTING, KEYS, readSettings, createExport, validate, planMigration, applyMigration };
