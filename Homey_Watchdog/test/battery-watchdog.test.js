'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateBatteryDevices, markDelivered, normalizeConfig, notificationRoutes } = require('../lib/battery-watchdog');
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
test('legacy push option migrates to a Flow trigger without selecting direct recipients', () => {
  assert.equal(normalizeConfig({ pushAll: true }).flowTrigger, true);
  assert.equal(normalizeConfig({ pushAll: false }).flowTrigger, false);
  assert.equal(normalizeConfig({}).flowTrigger, false);
  const config = normalizeConfig({ pushAll: true, flowTrigger: false, pushUserIds: ['user-a', 'user-a', 'user-b'] });
  assert.deepEqual(config.pushUserIds, ['user-a', 'user-b']);
  assert.deepEqual(notificationRoutes(config), ['timeline', 'push:user-a', 'push:user-b']);
});
test('only failed recipients remain pending after partial delivery', () => {
  const config = { timeline: true, pushUserIds: ['user-a', 'user-b'] };
  const first = evaluateBatteryDevices([device('stale', 48)], {}, config, NOW);
  markDelivered(first.state, ['stale'], NOW, ['timeline', 'push:user-a']);
  const retry = evaluateBatteryDevices([device('stale', 48)], first.state, config, NOW + 3600000);
  assert.deepEqual(retry.pending[0].routes, ['push:user-b']);
  markDelivered(retry.state, ['stale'], NOW + 3600000, ['push:user-b']);
  assert.equal(evaluateBatteryDevices([device('stale', 48)], retry.state, config, NOW + 2 * 3600000).pending.length, 0);
});
test('old delivery suppression does not pretend a new direct recipient was notified', () => {
  const old = { schema: 1, devices: { stale: { fingerprint: new Date(NOW - 48 * 3600000).toISOString(), notifiedAt: NOW } } };
  const next = evaluateBatteryDevices([device('stale', 48)], old, { timeline: true, pushUserIds: ['user-a'] }, NOW + 3600000);
  assert.deepEqual(next.pending[0].routes, ['push:user-a']);
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
