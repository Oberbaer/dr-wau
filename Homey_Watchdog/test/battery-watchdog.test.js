'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateBatteryDevices, markDelivered, normalizeConfig, notificationRoutes } = require('../lib/battery-watchdog');
const NOW = Date.parse('2026-09-12T20:00:00.000Z');
const device = (id, hours, battery = 80) => ({ id, name: `Sensor ${id}`, capabilities: ['measure_battery'], lastSeenAt: hours === null ? null : new Date(NOW - hours * 3600000).toISOString(), capabilitiesObj: { measure_battery: { value: battery } } });
test('detects 24-hour silence and ignores fresh devices', () => {
  const result = evaluateBatteryDevices([device('fresh', 23), device('stale', 24)], {}, {}, NOW);
  assert.deepEqual(result.pending.map(item => item.id), ['stale']);
  assert.match(result.pending[0].message, /seit 24 h kein bestätigtes Lebenszeichen/);
});
test('repeats after six hours and clears recovered devices', () => {
  const config = { repeatHours: 6 };
  const first = evaluateBatteryDevices([device('stale', 48)], {}, config, NOW); markDelivered(first.state, ['stale'], NOW);
  assert.equal(evaluateBatteryDevices([device('stale', 48)], first.state, config, NOW + 5 * 3600000).pending.length, 0);
  assert.equal(evaluateBatteryDevices([device('stale', 48)], first.state, config, NOW + 6 * 3600000).pending.length, 1);
  assert.deepEqual(evaluateBatteryDevices([], first.state, {}, NOW).state.devices, {});
});
test('missing timestamps are diagnostics, not repeated warnings or fabricated battery values', () => {
  const result = evaluateBatteryDevices([device('unknown', null, null)], {}, {}, NOW);
  assert.equal(result.pending.length, 0);
  assert.equal(result.assessments[0].heartbeat.status, 'unknown');
  assert.equal(result.assessments[0].battery.level, null);
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

test('stable semantic warnings do not reset suppression when old timestamp or battery value changes', () => {
  const config = { repeatHours: 24 };
  const first = evaluateBatteryDevices([device('stale', 48, 4)], {}, config, NOW);
  markDelivered(first.state, first.pending.map(item => item.key), NOW, ['timeline']);
  const next = evaluateBatteryDevices([device('stale', 47, 3)], first.state, config, NOW + 3600000);
  assert.equal(next.pending.length, 0);
  assert.equal(next.activeProblems, 1);
  assert.equal(next.state.devices.stale.problems.battery.fingerprint, 'critical');
});

test('battery and communication problems have independent delivery and recovery', () => {
  const first = evaluateBatteryDevices([device('sensor', 48, 1)], {}, { pushUserIds: ['u'] }, NOW);
  assert.deepEqual(first.pending.map(item => item.type).sort(), ['battery', 'communication']);
  markDelivered(first.state, ['sensor|communication|problem'], NOW, ['timeline']);
  const next = evaluateBatteryDevices([device('sensor', 0, 1)], first.state, { pushUserIds: ['u'] }, NOW + 1000);
  assert.equal(next.pending.filter(item => item.kind === 'problem')[0].type, 'battery');
  const recovery = next.pending.find(item => item.kind === 'recovery');
  assert.deepEqual(recovery.routes, ['timeline']);
  markDelivered(next.state, [recovery.key], NOW + 1000, ['timeline']);
  const repeated = evaluateBatteryDevices([device('sensor', 0, 1)], next.state, { pushUserIds: ['u'] }, NOW + 2000);
  assert.equal(repeated.pending.filter(item => item.kind === 'recovery').length, 0);
});

test('unknown readings or profile changes do not invent recovery', () => {
  const first = evaluateBatteryDevices([device('sensor', 48, 1)], {}, {}, NOW);
  markDelivered(first.state, first.pending.map(item => item.key), NOW, ['timeline']);
  const next = evaluateBatteryDevices([device('sensor', null, null)], first.state, { deviceProfiles: { sensor: { profile: 'unmonitorable' } } }, NOW + 1000);
  assert.equal(next.pending.length, 0);
  const restored = evaluateBatteryDevices([device('sensor', 0, 80)], next.state, {}, NOW + 2000);
  assert.equal(restored.pending.filter(item => item.kind === 'recovery').length, 2);
});

test('a false battery alarm without a numeric reading cannot clear a numeric low-battery problem', () => {
  const first = evaluateBatteryDevices([device('sensor', 0, 1)], {}, {}, NOW);
  markDelivered(first.state, first.pending.map(item => item.key), NOW, ['timeline']);
  const next = evaluateBatteryDevices([{ ...device('sensor', 0, null), capabilitiesObj: { measure_battery: { value: null }, alarm_battery: { value: false } } }], first.state, {}, NOW + 1000);
  assert.equal(next.pending.filter(item => item.kind === 'recovery').length, 0);
  assert.ok(next.state.devices.sensor.unresolved.battery);
});

test('failed recovery channel is retried without repeating a successful recovery channel', () => {
  const config = { pushUserIds: ['u'] };
  const first = evaluateBatteryDevices([device('sensor', 48)], {}, config, NOW);
  markDelivered(first.state, first.pending.map(item => item.key), NOW, ['timeline', 'push:u']);
  const recovered = evaluateBatteryDevices([device('sensor', 0)], first.state, config, NOW + 1000);
  markDelivered(recovered.state, recovered.pending.map(item => item.key), NOW + 1000, ['timeline']);
  const retry = evaluateBatteryDevices([device('sensor', 0)], recovered.state, config, NOW + 2000);
  assert.deepEqual(retry.pending[0].routes, ['push:u']);
});

test('legacy missing-data alerts do not generate an all-clear or hide battery problems', () => {
  const previous = { schema: 1, devices: { button: { fingerprint: 'unknown', notifiedAt: NOW } } };
  const next = evaluateBatteryDevices([{ ...device('button', null, 1), class: 'remote' }], previous, {}, NOW + 1000);
  assert.equal(next.state.schema, 2);
  assert.deepEqual(next.pending.map(item => [item.type, item.kind]), [['battery', 'problem']]);
});

test('device-specific profiles and time limits survive normalization and do not create usage alarms', () => {
  const config = normalizeConfig({ deviceProfiles: { a: { profile: 'contact', staleHours: 48 }, b: { profile: 'sensor', staleHours: 12 } } });
  const first = evaluateBatteryDevices([device('a', 25), device('b', 13)], {}, config, NOW);
  assert.deepEqual(first.pending.map(item => item.id), ['b']);
  assert.equal(normalizeConfig({}).repeatHours, 24);
  assert.equal(normalizeConfig({ repeatHours: 6 }).repeatHours, 6);
});

test('no selected routes means no notifications but still exposes actionable problems', () => {
  const result = evaluateBatteryDevices([device('critical', null, 1)], {}, { timeline: false }, NOW);
  assert.equal(result.pending.length, 0);
  assert.equal(result.activeProblems, 1);
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
