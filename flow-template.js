'use strict';

const crypto = require('crypto');

const FLOW_NAME = 'Codex – Zentraler Batterie-Watchdog (Freigabe ausstehend)';
const STATE_VARIABLE_NAME = 'CODEX_BATTERY_WATCHDOG_ALERT_STATE';
const CHECK_INTERVAL_HOURS = 6;
const STALE_AFTER_HOURS = 48;
const REPEAT_AFTER_HOURS = 24;

function cardId() {
  return crypto.randomUUID();
}

function buildWatchdogScript({ stateVariableId }) {
  if (!stateVariableId) throw new Error('stateVariableId is required');

  return `// CODEX_BATTERY_WATCHDOG_V1
const STATE_ID = ${JSON.stringify(stateVariableId)};
const STALE_AFTER_MS = ${STALE_AFTER_HOURS} * 60 * 60 * 1000;
const REPEAT_AFTER_MS = ${REPEAT_AFTER_HOURS} * 60 * 60 * 1000;
const now = Date.now();
const [devicesRaw, variablesRaw] = await Promise.all([
  Homey.devices.getDevices(),
  Homey.logic.getVariables(),
]);
const devices = Object.values(devicesRaw || {});
const variables = Object.values(variablesRaw || {});
const stateVariable = variables.find(variable => variable.id === STATE_ID);
if (!stateVariable) throw new Error('Watchdog state variable is missing');

let state = {};
try { state = JSON.parse(String(stateVariable.value || '{}')); } catch (_) { state = {}; }

const batteryDevices = devices.filter(device =>
  Array.isArray(device.capabilities)
  && (device.capabilities.includes('measure_battery') || device.capabilities.includes('alarm_battery')));

const stale = batteryDevices.map(device => {
  const lastSeen = device.lastSeenAt ? Date.parse(device.lastSeenAt) : NaN;
  const ageMs = Number.isFinite(lastSeen) ? now - lastSeen : Infinity;
  const battery = device.capabilitiesObj?.measure_battery;
  return {
    id: device.id,
    name: device.name || device.id,
    battery: Number.isFinite(Number(battery?.value)) ? Number(battery.value) : null,
    lastSeenAt: device.lastSeenAt || null,
    ageMs,
  };
}).filter(device => device.ageMs >= STALE_AFTER_MS);

const alerts = stale.filter(device => {
  const fingerprint = String(device.lastSeenAt || 'never');
  const previous = state[device.id];
  return !previous || previous.fingerprint !== fingerprint || now - Number(previous.notifiedAt || 0) >= REPEAT_AFTER_MS;
});

const nextState = {};
for (const device of stale) {
  const previous = state[device.id];
  const alert = alerts.find(item => item.id === device.id);
  nextState[device.id] = {
    fingerprint: String(device.lastSeenAt || 'never'),
    notifiedAt: alert ? now : Number(previous?.notifiedAt || now),
  };
}
await Homey.logic.updateVariable({ id: STATE_ID, variable: { value: JSON.stringify(nextState) } });

if (!alerts.length) return 'Batterie-Watchdog: ' + batteryDevices.length + ' Geräte geprüft, keine neue Warnung.';

const summary = alerts.slice(0, 8).map(device => {
  const hours = Number.isFinite(device.ageMs) ? Math.floor(device.ageMs / 3600000) : '?';
  const battery = device.battery === null ? 'unbekannt' : device.battery + '%';
  return device.name + ' (' + hours + ' h, Batterie ' + battery + ')';
}).join('; ');
const suffix = alerts.length > 8 ? ' +' + (alerts.length - 8) + ' weitere' : '';
await Homey.notifications.createNotification({
  excerpt: '⚠️ Batterie-Watchdog: kein Lebenszeichen seit mindestens ${STALE_AFTER_HOURS} h: ' + summary + suffix,
});
return 'Batterie-Watchdog: ' + alerts.length + ' neue Warnung(en): ' + summary + suffix;`;
}

function buildFlow({ stateVariableId, folderId = null }) {
  const cron = cardId();
  const script = cardId();
  const note = cardId();
  return {
    name: FLOW_NAME,
    folder: folderId || undefined,
    enabled: false,
    cards: {
      [cron]: {
        type: 'trigger',
        id: 'homey:manager:cron:every_nth',
        ownerUri: 'homey:manager:cron',
        args: { n: CHECK_INTERVAL_HOURS, type: 'hour' },
        x: 40, y: 220,
        outputSuccess: [script],
      },
      [script]: {
        type: 'action',
        id: 'homey:app:com.athom.homeyscript:runCodeReturnsString_v2',
        ownerUri: 'homey:app:com.athom.homeyscript',
        args: { code: buildWatchdogScript({ stateVariableId }) },
        x: 480, y: 220,
      },
      [note]: {
        type: 'note',
        id: 'undefined:undefined',
        color: 'yellow',
        x: 40, y: -100, width: 1350, height: 180,
        value: `BATTERIE-WATCHDOG V1\nPrüft alle ${CHECK_INTERVAL_HOURS} Stunden batterie-fähige Geräte. Meldung ab ${STALE_AFTER_HOURS} Stunden ohne Lebenszeichen; Wiederholung frühestens nach ${REPEAT_AFTER_HOURS} Stunden. Der Flow liest nur vorhandene Homey-Daten und fragt keine Geräte aktiv ab.`,
      },
    },
  };
}

function validateFlow(flow) {
  const cards = flow.cards || {};
  if (flow.enabled !== false) throw new Error('Proposal must be disabled');
  for (const card of Object.values(cards)) {
    for (const output of ['outputSuccess', 'outputTrue', 'outputFalse', 'outputError']) {
      for (const target of card[output] || []) {
        if (!cards[target]) throw new Error(`Missing card target: ${target}`);
      }
    }
  }
  return true;
}

module.exports = {
  CHECK_INTERVAL_HOURS,
  FLOW_NAME,
  REPEAT_AFTER_HOURS,
  STALE_AFTER_HOURS,
  STATE_VARIABLE_NAME,
  buildFlow,
  buildWatchdogScript,
  validateFlow,
};
