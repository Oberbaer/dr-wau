'use strict';

const crypto = require('crypto');

const FLOW_NAME = 'Zentraler Batterie-Watchdog (vor Aktivierung prüfen)';
const STATE_VARIABLE_NAME = 'CODEX_BATTERY_WATCHDOG_ALERT_STATE';
const CHECK_INTERVAL_HOURS = 6;
const STALE_AFTER_HOURS = 24;
const REPEAT_AFTER_HOURS = 6;

function cardId() {
  return crypto.randomUUID();
}

function buildWatchdogScript({ stateVariableId, pushRecipients = [] }) {
  if (!stateVariableId) throw new Error('stateVariableId is required');
  const runtime = require('./watchdog-runtime');
  return '// CODEX_BATTERY_WATCHDOG_V2\nreturn (' + runtime.toString() + ')(Homey, ' + JSON.stringify({ stateVariableId, staleHours: STALE_AFTER_HOURS, repeatHours: REPEAT_AFTER_HOURS, pushRecipients }) + ');';
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
        value: `BATTERIE-WATCHDOG V2\nPrüft alle ${CHECK_INTERVAL_HOURS} Stunden batteriefähige Geräte. Meldung ab ${STALE_AFTER_HOURS} Stunden ohne Lebenszeichen; Wiederholung frühestens nach ${REPEAT_AFTER_HOURS} Stunden. Der Flow liest nur vorhandene Homey-Daten und fragt keine Geräte aktiv ab.`,
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
