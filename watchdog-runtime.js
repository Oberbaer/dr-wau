'use strict';

// Serialized into HomeyScript; keep this function self-contained.
async function watchdog(Homey, config) {
  const now = Date.now();
  const [devicesRaw, variablesRaw] = await Promise.all([
    Homey.call({ method: 'GET', path: '/api/manager/devices/device/' }),
    Homey.logic.getVariables(),
  ]);
  const variable = Object.values(variablesRaw || {}).find(v => v.id === config.stateVariableId);
  if (!variable || variable.type !== 'string') throw new Error('Watchdog state variable missing or not a string');
  const saved = JSON.parse(variable.value || '{}');
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) throw new Error('Invalid watchdog state');
  // V1 marked failures as delivered. Do not inherit its suppression state.
  const previous = saved.schema === 2 ? saved.devices || {} : {};
  const devices = Object.values(devicesRaw || {}).filter(d =>
    Array.isArray(d.capabilities) && d.capabilities.some(c => ['measure_battery', 'alarm_battery'].includes(c)));
  const pending = [];
  const next = { schema: 2, lastCheckedAt: now, checkedDevices: devices.length, devices: {} };
  for (const device of devices) {
    const timestamp = typeof device.lastSeenAt === 'number' ? device.lastSeenAt : Date.parse(device.lastSeenAt);
    const known = Number.isFinite(timestamp) && timestamp > 0 && timestamp <= now;
    if (known && now - timestamp < config.staleHours * 3600000) continue;
    const fingerprint = known ? new Date(timestamp).toISOString() : 'unknown';
    const old = previous[device.id];
    const entry = { fingerprint, notifiedAt: old?.fingerprint === fingerprint ? old.notifiedAt || 0 : 0 };
    next.devices[device.id] = entry;
    if (entry.notifiedAt && now - entry.notifiedAt < config.repeatHours * 3600000) continue;
    const value = device.capabilitiesObj?.measure_battery?.value;
    const battery = typeof value === 'number' && Number.isFinite(value) ? value + '%' : 'unbekannt';
    const age = known ? Math.floor((now - timestamp) / 3600000) + ' h ohne Lebenszeichen' : 'Überwachung unklar: kein gültiger Lebenszeichen-Zeitstempel';
    pending.push({ id: device.id, text: String(device.name || device.id).slice(0, 120) + ': ' + age + ', letzter Batteriewert ' + battery });
  }
  const persist = () => Homey.logic.updateVariable({ id: config.stateVariableId, variable: { value: JSON.stringify(next) } });
  // Short batches include every affected device, avoiding truncated summaries.
  for (let offset = 0; offset < pending.length; offset += 2) {
    const batch = pending.slice(offset, offset + 2);
    const result = await Homey.flow.runFlowCardAction({
      id: 'homey:manager:notifications:create_notification',
      args: { text: '⚠️ Batterie-Watchdog: ' + batch.map(d => d.text).join('; ') },
    });
    if (result?.error || result === false) throw new Error('Watchdog notification failed: ' + JSON.stringify(result));
    for (const user of config.pushRecipients || []) {
      const push = await Homey.flow.runFlowCardAction({
        id: 'homey:manager:mobile:push_text',
        args: { user, text: 'Batterie-Watchdog: ' + batch.map(d => d.text).join('; ') },
      });
      if (push?.error || push === false) throw new Error('Watchdog push failed: ' + JSON.stringify(push));
    }
    for (const device of batch) next.devices[device.id].notifiedAt = now;
    await persist();
  }
  await persist();
  return 'Batterie-Watchdog: ' + devices.length + ' Geräte geprüft, ' + pending.length + ' Warnungen an Homey übergeben.';
}

module.exports = watchdog;
