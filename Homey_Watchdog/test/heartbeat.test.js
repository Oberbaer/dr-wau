'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { timestamp, evaluateHeartbeat, evaluateBattery, profileForDevice } = require('../lib/heartbeat');
const { evaluateBatteryDevices } = require('../lib/battery-watchdog');
const NOW = Date.parse('2026-09-29T15:00:00Z');
const HOUR = 3600000;
const at = hours => NOW - hours * HOUR;
const cap = (value, hours, extras = {}) => ({ value, lastUpdated: hours === null ? null : at(hours), getable: true, setable: false, ...extras });
const sensor = (id, extras = {}) => ({ id, name: `Synthetic ${id}`, class: 'sensor', available: true, capabilities: ['measure_battery', 'measure_humidity'],
  capabilitiesObj: { measure_battery: cap(80, 300), measure_humidity: cap(50, 1) }, ...extras });

test('parses ISO, epoch milliseconds and epoch seconds but rejects null, future and invalid values', () => {
  for (const input of [at(1), at(1) / 1000, String(at(1)), new Date(at(1)).toISOString()]) assert.equal(timestamp(input, NOW), at(1));
  for (const input of [null, undefined, false, true, '', '123', 'not-a-date', '2026-02-30T12:00:00Z', '2026-09-29T12:00:00', 0, 1, -1, NaN, Infinity, NOW + 1]) assert.equal(timestamp(input, NOW), null);
});

test('prefers native heartbeat and falls back to a real capability update', () => {
  assert.equal(evaluateHeartbeat(sensor('a', { lastSeenAt: at(2) }), {}, NOW).source, 'native:lastSeenAt');
  const fallback = evaluateHeartbeat(sensor('a'), {}, NOW);
  assert.equal(fallback.category, 'KEIN_TIMESTAMP_ABER_AKTIV');
  assert.equal(fallback.source, 'capability:measure_humidity');
  assert.equal(fallback.ageHours, 1);
  assert.equal(fallback.problem, null);
});

test('fresh report defeats obsolete native timestamp instead of falsely declaring silence', () => {
  const result = evaluateHeartbeat(sensor('a', { lastSeenAt: at(200) }), {}, NOW);
  assert.equal(result.status, 'active');
  assert.equal(result.source, 'capability:measure_humidity');
});

test('cached values and availability do not invent a heartbeat', () => {
  const result = evaluateHeartbeat(sensor('a', { capabilitiesObj: { measure_humidity: cap(50, null) } }), {}, NOW);
  assert.equal(result.timestamp, null);
  assert.equal(result.category, 'APP_ODER_TREIBER_OHNE_TIMESTAMP');
  assert.equal(result.problem, null);
});

test('contacts and buttons do not mistake unchanged states or lack of usage for silence', () => {
  const contact = sensor('c', { capabilities: ['measure_battery', 'alarm_contact'], capabilitiesObj: { alarm_contact: cap(false, 1000) } });
  const button = sensor('b', { class: 'remote', capabilitiesObj: { measure_battery: cap(80, 2000) } });
  assert.equal(evaluateHeartbeat(contact, {}, NOW).category, 'SELTEN_MELDEND');
  assert.equal(evaluateHeartbeat(contact, {}, NOW).problem, null);
  assert.equal(evaluateHeartbeat(button, {}, NOW).problem, null);
});

test('old sensor values produce a data-quality warning, not an offline claim', () => {
  const result = evaluateHeartbeat(sensor('a', { capabilitiesObj: { measure_humidity: cap(50, 1000) } }), {}, NOW);
  assert.equal(result.status, 'data_stale');
  assert.equal(result.category, 'NICHT_SICHER_BEWERTBAR');
  assert.match(result.problem.message, /Kommunikation nicht sicher beurteilbar/);
});

test('vacuum profiles use status reports without applying button or contact assumptions', () => {
  const vacuum = sensor('v', { class: 'vacuumcleaner', capabilitiesObj: { is_cleaning: cap(false, 1) } });
  const result = evaluateHeartbeat(vacuum, {}, NOW);
  assert.equal(result.profile.kind, 'vacuum');
  assert.equal(result.status, 'active');
});

test('commands, null values and future capability updates are not evidence', () => {
  const result = evaluateHeartbeat(sensor('a', { capabilitiesObj: { measure_humidity: cap(null, 1), target_temperature: cap(20, 1), onoff: cap(true, 1), 'button.refresh': cap(true, 1), measure_pressure: cap(900, -1) } }), {}, NOW);
  assert.equal(result.timestamp, null);
  assert.equal(result.problem, null);
});

test('Homey unavailable is an explicit separate finding, never a made-up hardware cause', () => {
  const stale = evaluateHeartbeat(sensor('a', { available: false, lastSeenAt: at(48) }), {}, NOW);
  assert.equal(stale.category, 'ECHT_OFFLINE');
  assert.equal(stale.problem.type, 'availability');
  assert.equal(evaluateHeartbeat(sensor('a', { available: false }), {}, NOW).category, 'NICHT_SICHER_BEWERTBAR');
});

test('battery validation keeps null, strings, booleans and out-of-range values unknown', () => {
  for (const value of [null, '1', false, -1, 101, NaN]) assert.equal(evaluateBattery({ capabilitiesObj: { measure_battery: cap(value, 1) } }, {}, NOW).level, null);
  assert.equal(evaluateBattery({ capabilitiesObj: { alarm_battery: cap(true, 1000) } }, {}, NOW).status, 'critical');
  const stale = evaluateBattery({ capabilitiesObj: { measure_battery: cap(1, 10000) } }, {}, NOW);
  assert.equal(stale.status, 'critical');
  assert.match(stale.problem.message, /bestätigen/);
});

test('virtual devices are explicitly non-physical timestamp profiles', () => {
  assert.equal(profileForDevice(sensor('v', { driverUri: 'homey:manager:vdevice' })).kind, 'unmonitorable');
  assert.equal(evaluateHeartbeat(sensor('v', { driverUri: 'homey:manager:vdevice' }), {}, NOW).problem, null);
});

test('nine synthetic regression cases separate stale measurements, event-only devices, critical battery and live devices', () => {
  const devices = [
    sensor('contact-old', { capabilities: ['measure_battery', 'alarm_contact'], capabilitiesObj: { alarm_contact: cap(false, 31 * 24), measure_battery: cap(100, 1200 * 24) } }),
    sensor('humidity-old-a', { capabilitiesObj: { measure_humidity: cap(56, 52 * 24), measure_battery: cap(70, 52 * 24) } }),
    sensor('humidity-old-b', { capabilitiesObj: { measure_humidity: cap(66, 29 * 24), measure_battery: cap(37, 36 * 24) } }),
    sensor('remote-null', { class: 'remote', capabilitiesObj: { measure_battery: cap(null, 300) } }),
    ...['vacuum-a', 'vacuum-b', 'vacuum-c'].map(id => sensor(id, { class: 'vacuumcleaner', lastSeenAt: at(0.05) })),
    sensor('button-low', { class: 'remote', capabilitiesObj: { measure_battery: cap(1, 123 * 24), alarm_battery: cap(true, 123 * 24) } }),
    sensor('contact-live', { capabilities: ['measure_battery', 'alarm_contact'], lastSeenAt: at(1) }),
  ];
  const result = evaluateBatteryDevices(devices, {}, {}, NOW);
  assert.equal(result.checkedDevices, 9);
  assert.equal(result.activeProblems, 3);
  assert.equal(result.assessments.filter(item => item.category === 'LEBENSZEICHEN_OK').length, 4);
  assert.equal(result.assessments.find(item => item.id === 'button-low').category, 'BATTERIE_KRITISCH');
  assert.equal(result.pending.some(item => /Überwachung unklar/.test(item.message)), false);
});
