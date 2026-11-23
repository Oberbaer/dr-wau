'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { learnDevice, profileDecision, relevantEvents, percentile } = require('../lib/device-learning');
const { evaluateHeartbeat } = require('../lib/heartbeat');
const { rawInsightEvidence } = require('../lib/heartbeat-insights');
const { normalizeConfig } = require('../lib/battery-watchdog');
const HOUR = 3600000, NOW = Date.parse('2026-10-01T12:00:00Z');
const device = { id: 'synthetic-contact', name: 'Synthetic Reference Contact', class: 'sensor', lastSeenAt: NOW,
  driverUri: 'homey:app:synthetic', capabilities: ['alarm_contact', 'measure_battery'],
  capabilitiesObj: { alarm_contact: { value: false, getable: true }, measure_battery: { value: 80, getable: true } } };
function eventsFromIntervals(intervals, lastAt = NOW) {
  const events = [{ at: lastAt - intervals.reduce((sum, h) => sum + h, 0) * HOUR, source: 'insights' }];
  for (const h of intervals) events.push({ at: events.at(-1).at + h * HOUR, source: 'insights' });
  return events;
}
const referenceIntervals = Array.from({ length: 49 }, (_, i) => i === 12 ? 120 : i === 36 ? 168 : [4, 6, 6.4, 8, 24][i % 5]);
const referenceEvents = eventsFromIntervals(referenceIntervals);

test('fresh native heartbeat cannot discard verified older learning history', () => {
  const first = learnDevice({}, relevantEvents(device, {}, [], NOW), NOW);
  assert.equal(first.reportCount, 1);
  const evidence = referenceEvents.map(e => ({ timestamp: e.at, capability: 'alarm_contact', verifiedRawEvent: true }));
  const learned = learnDevice(first, relevantEvents(device, {}, evidence, NOW), NOW);
  assert.equal(learned.rawEventCount, 50);
  assert.equal(learned.uniqueEventCount, 50);
  assert.equal(learned.lastObservedAt, new Date(NOW).toISOString());
  assert.equal(learned.firstObservedAt, new Date(referenceEvents[0].at).toISOString());
  assert.equal(evaluateHeartbeat(device, {}, NOW, evidence).source, 'native:lastSeenAt');
  assert.equal(evaluateHeartbeat(device, {}, NOW, evidence).status, 'active');
});

test('replayed and reversed history never double-counts timestamps or intervals', () => {
  const first = learnDevice({}, referenceEvents, NOW);
  const repeated = learnDevice(first, [...referenceEvents, ...referenceEvents].reverse(), NOW);
  assert.deepEqual(repeated, first);
  const simultaneous = learnDevice({}, [{ at: NOW - HOUR, source: 'native' }, { at: NOW - HOUR + 30, source: 'capability' }, { at: NOW, source: 'native' }], NOW);
  assert.equal(simultaneous.rawEventCount, 3);
  assert.equal(simultaneous.uniqueEventCount, 2);
  assert.deepEqual(learnDevice(simultaneous, simultaneous.rawEvents, NOW), simultaneous);
});

test('median and percentiles come from exactly the same final interval population', () => {
  const learned = learnDevice({}, referenceEvents, NOW);
  const population = referenceIntervals.filter(h => h <= learned.outlierUpperHours).sort((a, b) => a - b);
  assert.equal(learned.intervalCount, 49);
  assert.equal(learned.usedIntervalCount, 47);
  assert.equal(learned.excludedIntervalCount, 2);
  assert.ok(Math.abs(learned.medianIntervalHours - percentile(population, 0.5)) < 1e-8);
  assert.ok(Math.abs(learned.p90IntervalHours - percentile(population, 0.9)) < 1e-8);
  assert.ok(Math.abs(learned.p95IntervalHours - percentile(population, 0.95)) < 1e-8);
  assert.ok(learned.medianIntervalHours <= learned.p90IntervalHours && learned.p90IntervalHours <= learned.p95IntervalHours);
  assert.equal(learned.sampleCount + learned.excludedIntervalCount, learned.intervalCount);
});

test('conservative outlier rule removes isolated extreme gaps reproducibly and retains regular long gaps', () => {
  const learned = learnDevice({}, referenceEvents, NOW);
  assert.equal(learned.outlierRule, 'conservative_upper_v1');
  assert.deepEqual(learnDevice({}, [...referenceEvents].reverse(), NOW), learned);
  const regular = learnDevice({}, eventsFromIntervals(Array.from({ length: 25 }, (_, i) => i % 3 ? 8 : 32)), NOW);
  assert.equal(regular.excludedIntervalCount, 0);
  assert.equal(regular.usedIntervalCount, 25);
});

test('small samples retain uncertain long gaps and cannot yield an automatic threshold', () => {
  const sparse = learnDevice({}, eventsFromIntervals([1, 171]), NOW);
  assert.equal(sparse.outlierUpperHours, null);
  assert.equal(sparse.excludedIntervalCount, 0);
  assert.equal(sparse.confidence, 'insufficient');
  assert.equal(sparse.confidenceReason, 'too_few_intervals');
  assert.equal(profileDecision(device, {}, sparse).mode, 'event_only');
});

test('50-report periodic reference retains its recommendation and respects manual 24h', () => {
  const sensor = { ...device, capabilities: ['measure_humidity'], capabilitiesObj: { measure_humidity: { value: 50, getable: true } } };
  const learned = learnDevice({}, referenceEvents, NOW);
  assert.equal(learned.reportCount, 50);
  assert.equal(learned.confidence, 'high');
  assert.equal(learned.confidenceReason, 'sufficient_high');
  const automatic = profileDecision(sensor, normalizeConfig({}), learned, NOW);
  assert.equal(automatic.mode, 'learned');
  assert.equal(automatic.warningAfterHours, 48);
  const manual = profileDecision(sensor, normalizeConfig({ deviceProfiles: {
    [device.id]: { profile: 'sensor', mode: 'manual', confirmation: 'confirmed', warningAfterHours: 24 },
  } }), learned, NOW);
  assert.equal(manual.mode, 'manual');
  assert.equal(manual.warningAfterHours, 24);
  assert.equal(manual.confirmation, 'confirmed');
});

test('irregular history has an explicit numeric reason instead of unexplained insufficient', () => {
  const learned = learnDevice({}, eventsFromIntervals(Array.from({ length: 30 }, (_, i) => i % 2 ? 0.2 : 24)), NOW);
  assert.equal(learned.confidence, 'insufficient');
  assert.equal(learned.confidenceReason, 'irregular_intervals');
  assert.ok(learned.regularityRatio > 12);
  assert.equal(learned.excludedIntervalCount, 0);
});

test('cached values, numeric buckets and unverified timestamps cannot enter learning', () => {
  const log = { id: 'homey:device:synthetic-contact:alarm_contact', ownerId: 'alarm_contact' };
  const entry = { t: new Date(NOW - HOUR).toISOString(), v: false, originUri: device.driverUri };
  for (const response of [{ step: 300000, values: [entry] }, { lastValue: entry }]) {
    const evidence = rawInsightEvidence(response, log, device, { kind: 'contact' }, NOW);
    const learned = learnDevice({}, relevantEvents(device, {}, evidence, NOW), NOW);
    assert.equal(learned.reportCount, 1); // Only the actual native timestamp.
  }
  const learned = learnDevice({}, relevantEvents(device, {}, [{ timestamp: NOW - HOUR, capability: 'alarm_contact' }], NOW), NOW);
  assert.equal(learned.reportCount, 1);
});

test('retained raw history and canonical reports stay bounded and use only actual timestamps', () => {
  const events = eventsFromIntervals(Array(500).fill(2));
  const learned = learnDevice({}, events, NOW);
  assert.equal(learned.reportCount, 96);
  assert.equal(learned.rawEventCount, 96);
  assert.ok(learned.rawEvents.length <= 384);
  const realTimes = new Set(events.map(e => e.at));
  assert.ok(learned.events.every(e => realTimes.has(e.at)));
  assert.deepEqual(learnDevice(learned, events, NOW), learned);
});
