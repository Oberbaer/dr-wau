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
test('excludes a whole zone including subzones while keeping other devices', () => {
  const zones = {
    off: { id: 'off', name: 'Außer Betrieb' },
    child: { id: 'child', name: 'Regal', parent: 'off' },
    active: { id: 'active', name: 'Wohnzimmer' },
  };
  const devices = [
    { ...device('direct', 48), zone: 'off' },
    { ...device('nested', 48), zone: 'child' },
    { ...device('live', 48), zone: 'active' },
  ];
  const config = normalizeConfig({ ignoredZoneIds: ['off', 'off'] });
  assert.deepEqual(config.ignoredZoneIds, ['off']);
  const result = evaluateBatteryDevices(devices, {}, config, NOW, zones);
  assert.equal(result.checkedDevices, 1);
  assert.deepEqual(result.pending.map(item => item.id), ['live']);
  assert.deepEqual(Object.keys(result.state.devices), ['live']);
});
