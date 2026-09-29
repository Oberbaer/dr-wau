'use strict';

const HOUR = 3600000;
const PROFILES = ['auto', 'contact', 'button', 'sensor', 'vacuum', 'generic', 'unmonitorable'];
const PROFILE_LABELS = { contact: 'Kontakt / Ereignissensor', button: 'Taster / Fernbedienung', sensor: 'Messwertsensor', vacuum: 'Staubsauger', generic: 'Allgemeines Gerät', unmonitorable: 'Nicht per Timestamp überwachbar' };

function timestamp(value, now = Date.now()) {
  let parsed;
  if (typeof value === 'number' && Number.isFinite(value)) parsed = value < 1e11 ? value * 1000 : value;
  else if (typeof value === 'string' && /^\d{10}(?:\d{3})?$/.test(value)) return timestamp(Number(value), now);
  else if (typeof value === 'string') {
    const parts = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/);
    if (!parts) return null;
    const [, year, month, day, hour, minute, second] = parts.map(Number);
    if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59 || second > 59) return null;
    parsed = Date.parse(value);
  }
  else return null;
  return Number.isFinite(parsed) && parsed >= Date.UTC(2000, 0, 1) && parsed <= now ? parsed : null;
}

function profileForDevice(device, override = {}) {
  let kind = override.profile;
  const capabilities = device.capabilities || Object.keys(device.capabilitiesObj || {});
  if (!PROFILES.includes(kind) || kind === 'auto') {
    if (/homey:manager:vdevice|com\.swttt\.devicegroups/.test(device.driverUri || device.driverId || '')) kind = 'unmonitorable';
    else if (device.class === 'vacuumcleaner') kind = 'vacuum';
    else if (['remote', 'button'].includes(device.class)) kind = 'button';
    else if (capabilities.includes('alarm_contact')) kind = 'contact';
    else if (capabilities.some(id => /^measure_(temperature|humidity|pressure|luminance|co2|pm25|power|voltage)(\.|$)/.test(id))) kind = 'sensor';
    else if (capabilities.some(id => ['alarm_motion', 'alarm_water', 'alarm_smoke'].includes(id))) kind = 'contact';
    else kind = 'generic';
  }
  return { kind, label: PROFILE_LABELS[kind], eventDriven: ['contact', 'button'].includes(kind), staleHours: override.staleHours || null };
}

function relevantCapability(id, capability, profile) {
  if (!capability || capability.getable === false || capability.value === null || capability.value === undefined) return false;
  if (typeof capability.value === 'number' && !Number.isFinite(capability.value)) return false;
  if (!['boolean', 'number', 'string'].includes(typeof capability.value) || capability.value === '') return false;
  // Commands, configuration and cached desired states are not sensor reports.
  if (/^(button\.|target_|setpoint_|dim$|onoff$)/.test(id)) return false;
  if (/^(measure_battery|alarm_battery)(\.|$)/.test(id)) return true;
  if (profile.kind === 'unmonitorable') return false;
  if (profile.kind === 'contact') return /^alarm_(contact|motion|water|smoke)(\.|$)/.test(id);
  if (profile.kind === 'button') return false;
  if (profile.kind === 'vacuum') return ['is_cleaning', 'battery_charging_state', 'clean_time', 'clean_area', 'dock'].includes(id);
  return capability.setable !== true && /^(measure_|meter_|alarm_|status$|state$|battery_charging_state$)/.test(id);
}

function capabilityEvidence(device, profile, now) {
  return Object.entries(device.capabilitiesObj || {}).filter(([id, cap]) => relevantCapability(id, cap, profile))
    .map(([id, cap]) => ({ source: `capability:${id}`, label: `${id}.lastUpdated`, timestamp: timestamp(cap.lastUpdated, now), kind: 'capability', confidence: 'indirect' }))
    .filter(item => item.timestamp !== null);
}

function evaluateHeartbeat(device, config, now = Date.now(), insights = []) {
  const profile = profileForDevice(device, config.deviceProfiles?.[device.id]);
  const staleHours = profile.staleHours || config.staleHours || 24;
  const nativeAt = timestamp(device.lastSeenAt, now);
  const native = nativeAt === null ? [] : [{ source: 'native:lastSeenAt', label: 'lastSeenAt', timestamp: nativeAt, kind: 'native', confidence: 'reported' }];
  const capabilities = capabilityEvidence(device, profile, now);
  const secondary = insights.filter(item => item?.verifiedRawEvent === true && timestamp(item.timestamp, now) !== null
    && relevantCapability(item.capability, device.capabilitiesObj?.[item.capability], profile))
    .map(item => ({ source: `insights:${item.capability}`, label: `Insights: ${item.capability} (Rohereignis)`, timestamp: timestamp(item.timestamp, now), kind: 'insights', confidence: 'indirect' }));
  const candidates = [...native, ...capabilities, ...secondary].sort((a, b) => b.timestamp - a.timestamp);
  // A recent native heartbeat wins; a newer real report can rescue an obsolete native field.
  const chosen = nativeAt !== null && now - nativeAt < staleHours * HOUR ? native[0] : candidates[0] || null;
  const ageHours = chosen ? (now - chosen.timestamp) / HOUR : null;
  const fresh = chosen !== null && ageHours < staleHours;
  const base = { profile, staleHours, source: chosen?.source || null, sourceLabel: chosen?.label || 'Keine bestätigte Quelle',
    timestamp: chosen ? new Date(chosen.timestamp).toISOString() : null, ageHours,
    confidence: chosen?.confidence || 'unknown', nativeTimestampAvailable: nativeAt !== null,
    available: typeof device.available === 'boolean' ? device.available : null, timestampMonitorable: nativeAt !== null,
    category: 'NICHT_SICHER_BEWERTBAR', status: 'unknown', problem: null };
  if (device.available === false) return { ...base,
    category: nativeAt !== null && now - nativeAt >= staleHours * HOUR ? 'ECHT_OFFLINE' : 'NICHT_SICHER_BEWERTBAR', status: 'unavailable',
    reason: 'Homey meldet das Gerät als nicht verfügbar. Das belegt keine bestimmte Hardware- oder Funkursache.',
    problem: { type: 'availability', fingerprint: 'unavailable', message: 'Homey meldet nicht verfügbar; Verbindung und Geräte-App prüfen' } };
  if (profile.kind === 'unmonitorable') return { ...base, status: 'unsupported', category: 'APP_ODER_TREIBER_OHNE_TIMESTAMP', timestampMonitorable: false,
    reason: 'Für dieses Profil ist keine echte Gerätekommunikation per Timestamp überwachbar; Batterie und Homey-Verfügbarkeit werden getrennt geprüft.' };
  if (fresh) return { ...base, category: chosen.kind === 'native' ? 'LEBENSZEICHEN_OK' : 'KEIN_TIMESTAMP_ABER_AKTIV', status: 'active',
    reason: chosen.kind === 'native' ? 'Aktuelles natives Lebenszeichen vorhanden.' : `Aktuelle Zustands-/Messwertmeldung über ${chosen.label}; kein Ping- oder Funknachweis.`,
    timestampMonitorable: nativeAt !== null };
  if (nativeAt !== null) return { ...base, status: 'stale',
    reason: 'Seit der Grenze kein bestätigtes Lebenszeichen; die Ursache und ein tatsächlicher Offline-Zustand sind nicht belegt.',
    problem: { type: 'communication', fingerprint: 'heartbeat_stale', message: `seit ${Math.floor(ageHours)} h kein bestätigtes Lebenszeichen (${chosen.label})` } };
  if (profile.eventDriven) return { ...base, category: !chosen ? 'NICHT_SICHER_BEWERTBAR' : profile.kind === 'contact' ? 'SELTEN_MELDEND' : 'APP_ODER_TREIBER_OHNE_TIMESTAMP', status: 'events_only',
    reason: 'Ein unveränderter Kontakt oder nicht benutzter Taster ist kein Offline-Beweis. Ohne Kommunikations-Timestamp nur Ereignisse, Batterie und Verfügbarkeit prüfbar.' };
  if (chosen && ['sensor', 'vacuum'].includes(profile.kind)) return { ...base, status: 'data_stale',
    reason: 'Die Zustands-/Messwertdaten sind alt. Ein Änderungszeitpunkt ist kein Kommunikations-Timestamp und beweist keinen Offline-Zustand.',
    problem: { type: 'communication', fingerprint: 'measurement_stale', message: `seit ${Math.floor(ageHours)} h keine aktuelle Zustands-/Messwertänderung (${chosen.label}); Kommunikation nicht sicher beurteilbar` } };
  const hasValues = Object.values(device.capabilitiesObj || {}).some(cap => cap?.value !== null && cap?.value !== undefined);
  return { ...base, category: hasValues && !chosen ? 'APP_ODER_TREIBER_OHNE_TIMESTAMP' : 'NICHT_SICHER_BEWERTBAR',
    reason: 'Kein belastbarer Lebenszeichen-Zeitpunkt. Gespeicherte Werte und „verfügbar“ allein bestätigen keine aktuelle Kommunikation; keine automatische Fehlerwarnung.' };
}

function evaluateBattery(device, config, now = Date.now()) {
  const entries = Object.entries(device.capabilitiesObj || {}).filter(([id, cap]) => /^measure_battery(\.|$)/.test(id)
    && typeof cap?.value === 'number' && Number.isFinite(cap.value) && cap.value >= 0 && cap.value <= 100);
  const lowest = entries.sort((a, b) => a[1].value - b[1].value)[0];
  const level = lowest ? lowest[1].value : null;
  const updatedAt = lowest ? timestamp(lowest[1].lastUpdated, now) : null;
  const alarms = Object.entries(device.capabilitiesObj || {}).filter(([id]) => /^alarm_battery(\.|$)/.test(id));
  const alarm = alarms.some(([, cap]) => cap?.value === true) ? true : alarms.some(([, cap]) => cap?.value === false) ? false : null;
  const stale = updatedAt !== null && now - updatedAt >= 90 * 24 * HOUR;
  const critical = alarm === true || (level !== null && level <= (config.batteryCriticalPercent ?? 5));
  const low = level !== null && level <= (config.batteryLowPercent ?? 20);
  const status = critical ? 'critical' : low ? 'low' : level !== null || alarm === false ? 'ok' : 'unknown';
  const text = level !== null ? `Batterie zuletzt ${level} %${stale ? ' (Wert älter als 90 Tage; bestätigen)' : updatedAt === null ? ' (Messzeitpunkt unbekannt)' : ''}` : 'Batteriewert unbekannt';
  return { level, alarm, status, timestamp: updatedAt ? new Date(updatedAt).toISOString() : null, stale,
    problem: ['critical', 'low'].includes(status) ? { type: 'battery', fingerprint: status, message: `${text}${alarm === true ? ' · Batteriealarm aktiv' : ''}` } : null };
}

module.exports = { HOUR, PROFILES, PROFILE_LABELS, timestamp, profileForDevice, relevantCapability, capabilityEvidence, evaluateHeartbeat, evaluateBattery };
