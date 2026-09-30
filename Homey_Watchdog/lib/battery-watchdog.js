'use strict';
const { isZoneExcluded, zoneMap } = require('./zone-exclusions');
const { PROFILES, evaluateHeartbeat, evaluateBattery } = require('./heartbeat');
const { profileDecision } = require('./device-learning');
const { normalizeVacation, vacationDecision } = require('./vacation');

const DEFAULT_CONFIG = Object.freeze({
  enabled: false, checkHours: 6, staleHours: 24, repeatHours: 24,
  timeline: true, flowTrigger: false, pushUserIds: [], ignoredDeviceIds: [], ignoredZoneIds: [],
  batteryLowPercent: 20, batteryCriticalPercent: 5, deviceProfiles: {}, vacation: { enabled: false, until: null },
});

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeConfig(input = {}) {
  const low = clampNumber(input.batteryLowPercent, DEFAULT_CONFIG.batteryLowPercent, 1, 100);
  const profiles = input.deviceProfiles && typeof input.deviceProfiles === 'object' && !Array.isArray(input.deviceProfiles) ? input.deviceProfiles : {};
  return {
    enabled: input.enabled === true,
    checkHours: clampNumber(input.checkHours, DEFAULT_CONFIG.checkHours, 1, 168),
    staleHours: clampNumber(input.staleHours, DEFAULT_CONFIG.staleHours, 1, 720),
    repeatHours: clampNumber(input.repeatHours, DEFAULT_CONFIG.repeatHours, 1, 168),
    timeline: input.timeline !== false,
    flowTrigger: typeof input.flowTrigger === 'boolean' ? input.flowTrigger : input.pushAll === true,
    pushUserIds: [...new Set(Array.isArray(input.pushUserIds) ? input.pushUserIds.map(String).filter(Boolean) : [])],
    ignoredDeviceIds: [...new Set(Array.isArray(input.ignoredDeviceIds) ? input.ignoredDeviceIds.map(String).filter(Boolean) : [])],
    ignoredZoneIds: [...new Set(Array.isArray(input.ignoredZoneIds) ? input.ignoredZoneIds.map(String).filter(Boolean) : [])],
    batteryLowPercent: low,
    batteryCriticalPercent: clampNumber(input.batteryCriticalPercent, DEFAULT_CONFIG.batteryCriticalPercent, 0, low),
    vacation: normalizeVacation(input.vacation),
    deviceProfiles: Object.fromEntries(Object.entries(profiles).slice(0, 2000).filter(([id, value]) => !['__proto__', 'constructor', 'prototype'].includes(id) && value && typeof value === 'object')
      .map(([id, value]) => [id, { profile: PROFILES.includes(value.profile) ? value.profile : 'auto',
        ...(value.staleHours !== undefined && value.staleHours !== null && value.staleHours !== '' ? { staleHours: clampNumber(value.staleHours, DEFAULT_CONFIG.staleHours, 1, 720) } : {}),
        ...(value.warningAfterHours !== undefined && value.warningAfterHours !== null && value.warningAfterHours !== '' ? { warningAfterHours: clampNumber(value.warningAfterHours, DEFAULT_CONFIG.staleHours, 1, 720) } : {}),
        ...(['manual', 'event_only', 'disabled'].includes(value.mode) ? { mode: value.mode } : !value.mode && (value.profile && value.profile !== 'auto' || value.staleHours) ? { mode: 'manual' } : {}),
        confirmation: value.confirmation === 'confirmed' || (!value.mode && (value.profile && value.profile !== 'auto' || value.staleHours)) ? 'confirmed' : 'unconfirmed',
        vacationMode: ['auto', 'normal', 'extend', 'pause'].includes(value.vacationMode) ? value.vacationMode : 'auto',
        vacationFactor: clampNumber(value.vacationFactor, 2, 1, 8) }])),
  };
}

const values = input => Array.isArray(input) ? input : Object.values(input || {});
function notificationRoutes(config) {
  return [
    ...(config.timeline ? ['timeline'] : []),
    ...(config.flowTrigger ? ['flow'] : []),
    ...(config.pushUserIds || []).map(id => `push:${id}`),
  ];
}
function isBatteryDevice(device) {
  const capabilities = Array.isArray(device?.capabilities) ? device.capabilities : Object.keys(device?.capabilitiesObj || {});
  return capabilities.some(id => /^(measure_battery|alarm_battery)(\.|$)/.test(id));
}

function evaluateBatteryDevices(devicesRaw, stateRaw, configRaw, now = Date.now(), zonesRaw = {}, insightsRaw = {}, learningRaw = {}) {
  const config = normalizeConfig(configRaw);
  const previous = [1, 2].includes(stateRaw?.schema) && stateRaw.devices && typeof stateRaw.devices === 'object' ? stateRaw.devices : {};
  const ignored = new Set(config.ignoredDeviceIds);
  const ignoredZones = new Set(config.ignoredZoneIds);
  const zones = zoneMap(zonesRaw);
  const routes = notificationRoutes(config);
  const devices = values(devicesRaw).filter(device => isBatteryDevice(device)
    && !ignored.has(device.id) && !isZoneExcluded(device.zone, zones, ignoredZones));
  const pending = [];
  const assessments = [];
  const state = { schema: 2, lastCheckedAt: now, checkedDevices: devices.length, devices: {} };
  for (const device of devices) {
    const decision = profileDecision(device, config, learningRaw?.devices?.[device.id]);
    const vacation = vacationDecision(device, decision, config, now);
    const heartbeat = evaluateHeartbeat(device, config, now, insightsRaw[device.id] || [], { decision, vacation });
    const battery = evaluateBattery(device, config, now);
    const problems = [heartbeat.problem, battery.problem].filter(Boolean);
    const old = previous[device.id] || {};
    const entry = { problems: {}, unresolved: { ...(old.unresolved || {}) }, recoveries: { ...(old.recoveries || {}) } };
    const name = String(device.name || device.id).slice(0, 120);
    assessments.push({ id: device.id, name, heartbeat, battery, profile: decision, vacation,
      category: battery.status === 'critical' ? 'BATTERIE_KRITISCH' : heartbeat.category });
    for (const problem of problems) {
      delete entry.recoveries[problem.type];
      let prior = old.problems?.[problem.type] || old.unresolved?.[problem.type];
      delete entry.unresolved[problem.type];
      // Migrate only genuine stale-heartbeat warnings. Missing-data alerts are not outages.
      if (!prior && stateRaw?.schema === 1 && problem.type === 'communication' && old.fingerprint && old.fingerprint !== 'unknown') {
        prior = { fingerprint: problem.fingerprint, notifiedAt: old.notifiedAt, deliveryTimes: old.deliveryTimes || Object.fromEntries(routes.filter(route => !route.startsWith('push:')).map(route => [route, old.notifiedAt || 0])) };
      }
      const same = prior?.fingerprint === problem.fingerprint;
      const deliveryTimes = same ? { ...(prior.deliveryTimes || {}) } : {};
      entry.problems[problem.type] = { fingerprint: problem.fingerprint, notifiedAt: same ? prior.notifiedAt || 0 : 0, deliveryTimes,
        ...(problem.type === 'battery' ? { alarmActive: battery.alarm === true, numericLow: battery.level !== null && battery.level <= config.batteryLowPercent } : {}) };
      const pendingRoutes = routes.filter(route => !deliveryTimes[route] || now - deliveryTimes[route] >= config.repeatHours * 3600000);
      if (pendingRoutes.length) pending.push({ id: device.id, name, type: problem.type, kind: 'problem',
        severity: problem.type === 'availability' || problem.type === 'battery' && battery.status === 'critical' ? 'critical' : 'warning',
        key: `${device.id}|${problem.type}|problem`, message: `${name}: ${problem.message}${problem.type !== 'battery' && battery.level !== null ? ` · Batterie zuletzt ${battery.level} %` : ''}`, routes: pendingRoutes });
    }
    for (const [type, prior] of Object.entries({ ...(old.unresolved || {}), ...(old.problems || {}) })) {
      if (entry.problems[type]) continue;
      const recovered = type === 'communication' ? heartbeat.status === 'active'
        : type === 'availability' ? device.available === true
          : type === 'battery' && battery.status === 'ok' && (!prior.alarmActive || battery.alarm === false) && (!prior.numericLow || battery.level !== null);
      if (!recovered) { entry.unresolved[type] = prior; continue; }
      delete entry.unresolved[type];
      const recipients = routes.filter(route => prior.deliveryTimes?.[route] > 0);
      if (recipients.length) entry.recoveries[type] = { routes: recipients, deliveryTimes: {}, message: type === 'availability'
        ? 'Homey meldet wieder verfügbar' : type === 'battery' ? `Batterieproblem behoben · letzter Wert ${battery.level === null ? 'unbekannt' : `${battery.level} %`}` : `wieder aktuelles Lebenszeichen über ${heartbeat.sourceLabel}` };
    }
    for (const [type, recovery] of Object.entries(entry.recoveries)) {
      const pendingRoutes = (recovery.routes || []).filter(route => routes.includes(route) && !recovery.deliveryTimes?.[route]);
      if (pendingRoutes.length) pending.push({ id: device.id, name, type, kind: 'recovery', key: `${device.id}|${type}|recovery`, message: `${name}: ${recovery.message}`, routes: pendingRoutes });
    }
    if (Object.keys(entry.problems).length || Object.keys(entry.recoveries).length || Object.keys(entry.unresolved).length) state.devices[device.id] = entry;
  }
  return { config, checkedDevices: devices.length, pending, state, assessments,
    activeProblems: assessments.filter(item => item.heartbeat.problem || item.battery.problem).length };
}

function markDelivered(state, keys, deliveredAt, routes) {
  for (const key of keys) {
    const [id, type, kind] = key.split('|');
    const device = state.devices[id];
    if (!device) continue;
    const entries = type ? [kind === 'recovery' ? device.recoveries?.[type] : device.problems?.[type]] : Object.values(device.problems || {});
    for (const entry of entries.filter(Boolean)) {
      entry.notifiedAt = deliveredAt;
      entry.deliveryTimes ||= {};
      for (const route of routes || ['timeline']) entry.deliveryTimes[route] = deliveredAt;
    }
  }
  return state;
}

module.exports = { DEFAULT_CONFIG, evaluateBatteryDevices, isBatteryDevice, markDelivered, normalizeConfig, notificationRoutes };
