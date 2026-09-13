'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateBatteryDevices, markDelivered, normalizeConfig } = require('../lib/battery-watchdog');
const NOW = Date.parse('2026-09-12T20:00:00.000Z');
const device = (id, hours, battery = 80) => ({ id, name: `Sensor ${id}`, capabilities: ['measure_battery'], lastSeenAt: hours === null ? null : new Date(NOW - hours * 3600000).toISOString(), capabilitiesObj: { measure_battery: { value: battery } } });
test('detects 24-hour silence and ignores fresh devices', () => {
  const result = evaluateBatteryDevices([device('fresh', 23), device('stale', 24)], {}, {}, NOW);
  assert.deepEqual(result.pending.map(item => item.id), ['stale']);
  assert.match(result.pending[0].message, /24 h ohne Lebenszeichen/);
});
test('repeats after six hours and clears recovered devices', () => {
  const first = evaluateBatteryDevices([device('stale', 48)], {}, {}, NOW); markDelivered(first.state, ['stale'], NOW);
  assert.equal(evaluateBatteryDevices([device('stale', 48)], first.state, {}, NOW + 5 * 3600000).pending.length, 0);
  assert.equal(evaluateBatteryDevices([device('stale', 48)], first.state, {}, NOW + 6 * 3600000).pending.length, 1);
  assert.deepEqual(evaluateBatteryDevices([], first.state, {}, NOW).state.devices, {});
});
test('reports unknown timestamps without fabricating a battery value', () => {
  const result = evaluateBatteryDevices([device('unknown', null, null)], {}, {}, NOW);
  assert.match(result.pending[0].message, /Überwachung unklar/); assert.match(result.pending[0].message, /Batteriewert unbekannt/);
});
test('supports exclusions and clamps configuration', () => {
  const config = normalizeConfig({ staleHours: 0, repeatHours: 999, ignoredDeviceIds: ['skip', 'skip'] });
  assert.equal(config.staleHours, 1); assert.equal(config.repeatHours, 168); assert.deepEqual(config.ignoredDeviceIds, ['skip']);
  assert.equal(evaluateBatteryDevices([device('skip', 100)], {}, config, NOW).pending.length, 0);
});
test('starts disabled until explicitly enabled', () => {
  assert.equal(normalizeConfig({}).enabled, false);
  assert.equal(normalizeConfig({ enabled: true }).enabled, true);
});
