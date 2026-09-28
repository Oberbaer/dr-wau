'use strict';
const { isZoneExcluded, zoneMap } = require('./zone-exclusions');

const DEFAULT_CONFIG = Object.freeze({
  enabled: false, checkHours: 6, staleHours: 24, repeatHours: 6,
  timeline: true, flowTrigger: false, pushUserIds: [], ignoredDeviceIds: [], ignoredZoneIds: [],
});

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function normalizeConfig(input = {}) {
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
  return capabilities.some(id => id === 'measure_battery' || id === 'alarm_battery');
}

function evaluateBatteryDevices(devicesRaw, stateRaw, configRaw, now = Date.now(), zonesRaw = {}) {
  const config = normalizeConfig(configRaw);
  const previous = stateRaw?.schema === 1 && stateRaw.devices && typeof stateRaw.devices === 'object' ? stateRaw.devices : {};
  const ignored = new Set(config.ignoredDeviceIds);
  const ignoredZones = new Set(config.ignoredZoneIds);
  const zones = zoneMap(zonesRaw);
  const routes = notificationRoutes(config);
  const devices = values(devicesRaw).filter(device => isBatteryDevice(device)
    && !ignored.has(device.id) && !isZoneExcluded(device.zone, zones, ignoredZones));
  const pending = [];
  const state = { schema: 1, lastCheckedAt: now, checkedDevices: devices.length, devices: {} };
  for (const device of devices) {
    const timestamp = typeof device.lastSeenAt === 'number' ? device.lastSeenAt : Date.parse(device.lastSeenAt);
    const known = Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now;
    if (known && now - timestamp < config.staleHours * 3600000) continue;
    const fingerprint = known ? new Date(timestamp).toISOString() : 'unknown';
    const old = previous[device.id];
    const sameWarning = old?.fingerprint === fingerprint;
    const notifiedAt = sameWarning ? Number(old.notifiedAt || 0) : 0;
    const previousTimes = sameWarning && old.deliveryTimes && typeof old.deliveryTimes === 'object' ? old.deliveryTimes : null;
    const deliveryTimes = Object.fromEntries(routes.map(route => [route,
      previousTimes ? Number(previousTimes[route] || 0) : route.startsWith('push:') ? 0 : notifiedAt]));
    const pendingRoutes = routes.filter(route => !deliveryTimes[route] || now - deliveryTimes[route] >= config.repeatHours * 3600000);
    state.devices[device.id] = { fingerprint, notifiedAt, deliveryTimes };
    if (routes.length && !pendingRoutes.length) continue;
    const value = device.capabilitiesObj?.measure_battery?.value;
    const battery = typeof value === 'number' && Number.isFinite(value) ? `${value}%` : 'unbekannt';
    const age = known ? `${Math.floor((now - timestamp) / 3600000)} h ohne Lebenszeichen` : 'Überwachung unklar: kein gültiger Lebenszeichen-Zeitstempel';
    const name = String(device.name || device.id).slice(0, 120);
    pending.push({ id: device.id, name, message: `${name}: ${age}, letzter Batteriewert ${battery}`, routes: pendingRoutes });
  }
  return { config, checkedDevices: devices.length, pending, state };
}

function markDelivered(state, deviceIds, deliveredAt, routes) {
  for (const id of deviceIds) if (state.devices[id]) {
    const device = state.devices[id];
    device.notifiedAt = deliveredAt;
    device.deliveryTimes ||= {};
    for (const route of routes || Object.keys(device.deliveryTimes)) device.deliveryTimes[route] = deliveredAt;
  }
  return state;
}

module.exports = { DEFAULT_CONFIG, evaluateBatteryDevices, isBatteryDevice, markDelivered, normalizeConfig, notificationRoutes };
