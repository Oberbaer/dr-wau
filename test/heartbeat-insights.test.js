'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rawInsightEvidence, collectHeartbeatInsights } = require('../lib/heartbeat-insights');
const { evaluateHeartbeat } = require('../lib/heartbeat');
const NOW = Date.parse('2026-09-29T15:00:00Z');
const device = { id: 'contact', class: 'sensor', capabilities: ['alarm_contact', 'measure_battery'], driverUri: 'homey:app:example', capabilitiesObj: { alarm_contact: { value: false, getable: true } } };
const log = { id: 'homey:device:contact:alarm_contact', ownerId: 'alarm_contact', ownerUri: 'homey:device:contact', type: 'boolean' };
const entry = { t: new Date(NOW - 3600000).toISOString(), v: false, originUri: 'homey:app:example', originUserId: null, originClientId: null };

test('only real driver-origin Insights events can provide secondary heartbeat evidence', () => {
  const evidence = rawInsightEvidence({ values: [entry] }, log, device, { kind: 'contact' }, NOW);
  assert.equal(evidence.length, 1);
  const result = evaluateHeartbeat(device, {}, NOW, evidence);
  assert.equal(result.status, 'active');
  assert.equal(result.source, 'insights:alarm_contact');
});

test('resampled numeric buckets and lastValue never fabricate a fresh report', () => {
  for (const response of [{ step: 300000, values: [entry] }, { start: entry.t, values: [entry] }, { lastValue: entry }]) {
    assert.deepEqual(rawInsightEvidence(response, log, device, { kind: 'contact' }, NOW), []);
  }
});

test('manual, foreign, future and null events are rejected', () => {
  for (const changed of [{ originUserId: 'user' }, { originClientId: 'client' }, { originUri: 'homey:manager:flow' }, { originUri: undefined }, { t: new Date(NOW + 1).toISOString() }, { v: null }]) {
    assert.deepEqual(rawInsightEvidence({ values: [{ ...entry, ...changed }] }, log, device, { kind: 'contact' }, NOW), []);
  }
});

test('collector is read-only, bounded and respects device and zone exclusions', async () => {
  let calls = 0;
  const logs = Object.fromEntries(['a', 'b', 'c'].map(id => [id, { ...log, id: `homey:device:${id}:alarm_contact`, ownerUri: `homey:device:${id}` }]));
  const devices = Object.fromEntries(['a', 'b', 'c'].map(id => [id, { ...device, id, zone: id === 'c' ? 'off' : 'on' }]));
  const api = { insights: { getLogs: async () => logs, getLogEntries: async () => { calls++; return { values: [entry] }; } } };
  const result = await collectHeartbeatInsights(api, devices, { ignoredDeviceIds: ['b'], ignoredZoneIds: ['off'] }, NOW, { off: { id: 'off' } }, 1);
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(result.evidence), ['a']);
});

test('Insights failure is a data limitation rather than an offline assertion', async () => {
  const result = await collectHeartbeatInsights({ insights: { getLogs: async () => { throw Error('synthetic'); }, getLogEntries: async () => {} } }, { contact: device }, {}, NOW);
  assert.equal(result.summary.unavailable, true);
  assert.deepEqual(result.evidence, {});
});
