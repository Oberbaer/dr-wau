'use strict';

const DEFAULT_CONFIG = Object.freeze({
  enabled: false, checkHours: 6, staleHours: 24, repeatHours: 6,
  timeline: true, pushAll: true, ignoredDeviceIds: [],
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
    pushAll: input.pushAll !== false,
    ignoredDeviceIds: [...new Set(Array.isArray(input.ignoredDeviceIds) ? input.ignoredDeviceIds.map(String).filter(Boolean) : [])],
  };
}

const values = input => Array.isArray(input) ? input : Object.values(input || {});
function isBatteryDevice(device) {
  const capabilities = Array.isArray(device?.capabilities) ? device.capabilities : Object.keys(device?.capabilitiesObj || {});
  return capabilities.some(id => id === 'measure_battery' || id === 'alarm_battery');
}

function evaluateBatteryDevices(devicesRaw, stateRaw, configRaw, now = Date.now()) {
  const config = normalizeConfig(configRaw);
  const previous = stateRaw?.schema === 1 && stateRaw.devices && typeof stateRaw.devices === 'object' ? stateRaw.devices : {};
  const ignored = new Set(config.ignoredDeviceIds);
  const devices = values(devicesRaw).filter(device => isBatteryDevice(device) && !ignored.has(device.id));
  const pending = [];
  const state = { schema: 1, lastCheckedAt: now, checkedDevices: devices.length, devices: {} };
  for (const device of devices) {
    const timestamp = typeof device.lastSeenAt === 'number' ? device.lastSeenAt : Date.parse(device.lastSeenAt);
    const known = Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now;
    if (known && now - timestamp < config.staleHours * 3600000) continue;
    const fingerprint = known ? new Date(timestamp).toISOString() : 'unknown';
    const old = previous[device.id];
    const notifiedAt = old?.fingerprint === fingerprint ? Number(old.notifiedAt || 0) : 0;
    state.devices[device.id] = { fingerprint, notifiedAt };
    if (notifiedAt && now - notifiedAt < config.repeatHours * 3600000) continue;
    const value = device.capabilitiesObj?.measure_battery?.value;
    const battery = typeof value === 'number' && Number.isFinite(value) ? `${value}%` : 'unbekannt';
    const age = known ? `${Math.floor((now - timestamp) / 3600000)} h ohne Lebenszeichen` : 'Überwachung unklar: kein gültiger Lebenszeichen-Zeitstempel';
    const name = String(device.name || device.id).slice(0, 120);
    pending.push({ id: device.id, name, message: `${name}: ${age}, letzter Batteriewert ${battery}` });
  }
  return { config, checkedDevices: devices.length, pending, state };
}

function markDelivered(state, deviceIds, deliveredAt) {
  for (const id of deviceIds) if (state.devices[id]) state.devices[id].notifiedAt = deliveredAt;
  return state;
}

module.exports = { DEFAULT_CONFIG, evaluateBatteryDevices, isBatteryDevice, markDelivered, normalizeConfig };
