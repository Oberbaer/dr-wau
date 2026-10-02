'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { learnDevice, profileDecision, updateLearningState, learningModelForDevice } = require('../lib/device-learning');
const { vacationDecision } = require('../lib/vacation');
const { evaluateBatteryDevices } = require('../lib/battery-watchdog');
const HOUR = 3600000, DAY = 24 * HOUR;
const START = Date.parse('2026-09-01T00:00:00Z');
const device = { id: 'synthetic-contact', class: 'sensor', capabilities: ['alarm_contact', 'measure_battery'],
  capabilitiesObj: { alarm_contact: { value: false, getable: true }, measure_battery: { value: 80, getable: true } } };
const pattern = (days = 14, hours = [8, 8 + 2 / 60, 16.5, 16.5 + 5 / 60]) =>
  Array.from({ length: days }, (_, day) => hours.map(hour => ({ at: START + day * DAY + hour * HOUR, source: 'interaction' }))).flat();
const now = START + 13 * DAY + 20 * HOUR;
const learn = (events = pattern(), at = now) => learnDevice({}, events, at, false, 'activity');
const profile = (learning, config = {}, at = now) => profileDecision(device, { staleHours: 24, ...config }, learning, at);

test('open/close bursts form two fixed 30-minute activity blocks per day', () => {
  const learning = learn();
  assert.equal(learning.rawEventCount, 56);
  assert.equal(learning.activity.rawEventCount, 56);
  assert.equal(learning.activity.blockCount, 28);
  assert.equal(learning.activity.pauseCount, 27);
  assert.ok(Math.abs(learning.activity.p95PauseHours - (15.5 - 5 / 60)) < 1e-6);
});
test('daily contact activity learns a 36-hour upper-pause recommendation', () => {
  const learning = learn(pattern(14, [8, 8 + 2 / 60]));
  assert.equal(learning.activity.blockCount, 14);
  assert.equal(profile(learning).warningAfterHours, 36);
  assert.match(profile(learning).activityDescription, /fast täglich/);
});
test('multiple activities daily learn 30 hours rather than median times a factor', () => {
  const decision = profile(learn());
  assert.equal(decision.warningAfterHours, 30);
  assert.match(decision.activityDescription, /mehrmals täglich/);
  assert.equal(decision.expectedReportHours, null);
});
test('rare contact activity has no automatic silence obligation', () => {
  const learning = learn(pattern().filter(event => [0, 6, 13].includes(Math.floor((event.at - START) / DAY))));
  assert.equal(learning.confidence, 'insufficient');
  assert.equal(learning.confidenceReason, 'activity_sparse_days');
  assert.equal(profile(learning).mode, 'event_only');
  assert.equal(profile(learning).warningAfterHours, null);
});
test('many events on one day cannot establish high activity confidence', () => {
  const events = Array.from({ length: 60 }, (_, i) => ({ at: START + i * HOUR / 3, source: 'interaction' }));
  const learning = learn(events, START + 23 * HOUR);
  assert.equal(learning.activity.observedDays, 1);
  assert.equal(learning.confidence, 'insufficient');
});
test('14 days of stable activity have high confidence; seven days have medium', () => {
  const learning = learn();
  assert.equal(learning.learningModel, 'activity');
  assert.equal(learning.activity.observedDays, 14);
  assert.equal(learning.activity.activeDays, 14);
  assert.equal(learning.activity.activeDayPercent, 100);
  assert.equal(learning.confidence, 'high');
  assert.equal(profile(learning).mode, 'learned');
  const at = START + 6 * DAY + 20 * HOUR;
  const medium = learn(pattern(7), at);
  assert.equal(medium.confidence, 'medium');
  assert.equal(profile(medium, {}, at).mode, 'learned');
});
test('vacation pauses activity by default and honors normal/extend overrides', () => {
  const decision = profile(learn());
  const vacation = { enabled: true };
  assert.equal(vacationDecision(device, decision, { vacation }, now).rule, 'pause');
  for (const [rule, hours] of [['normal', 30], ['extend', 60], ['pause', null]]) {
    assert.equal(vacationDecision(device, decision, { vacation, deviceProfiles: { [device.id]: { vacationMode: rule } } }, now).warningAfterHours, hours);
  }
  const original = learn();
  const onVacation = learnDevice(original, [{ at: now + DAY, source: 'interaction' }], now + DAY, true, 'activity');
  assert.deepEqual(onVacation.activity, original.activity);
});
test('confirmed manual 24 hours wins while automatic recommendation stays separate', () => {
  const decision = profile(learn(), { deviceProfiles: { [device.id]: { mode: 'manual', confirmation: 'confirmed', warningAfterHours: 24 } } });
  assert.equal(decision.mode, 'manual');
  assert.equal(decision.confirmation, 'confirmed');
  assert.equal(decision.warningAfterHours, 24);
  assert.equal(decision.automaticWarningAfterHours, 30);
  const config = { deviceProfiles: { [device.id]: { mode: 'manual', confirmation: 'confirmed', warningAfterHours: 24 } } };
  const state = updateLearningState({ schema: 1, devices: { [device.id]: learn() } }, [device], config,
    { [device.id]: [{ timestamp: now + DAY, capability: 'alarm_contact', verifiedRawEvent: true }] }, now + DAY);
  assert.equal(state.devices[device.id].activity.blockCount, 29);
  assert.equal(profileDecision(device, config, state.devices[device.id], now + DAY).warningAfterHours, 24);
});
test('frequently used buttons remain event_only even with high periodic history', () => {
  const button = { ...device, class: 'remote' };
  const periodic = learnDevice({}, Array.from({ length: 50 }, (_, i) => ({ at: now - (49 - i) * 8 * HOUR, source: 'insights' })), now);
  assert.equal(periodic.confidence, 'high');
  assert.equal(learningModelForDevice(button), 'event_only');
  assert.equal(profileDecision(button, {}, periodic, now).mode, 'event_only');
  assert.equal(profileDecision(button, {}, periodic, now).automaticWarningAfterHours, null);
});
test('periodic sensor pipeline and vacation default remain unchanged', () => {
  const sensor = { ...device, capabilities: ['measure_humidity'], capabilitiesObj: { measure_humidity: { value: 50, getable: true } } };
  const events = Array.from({ length: 50 }, (_, i) => ({ at: now - (49 - i) * 8 * HOUR, source: 'insights' }));
  const learning = learnDevice({}, events, now);
  const decision = profileDecision(sensor, {}, learning, now);
  assert.equal(decision.learningModel, 'periodic');
  assert.equal(decision.learning.confidence, 'high');
  assert.equal(decision.learning.medianIntervalHours, 8);
  assert.equal(decision.warningAfterHours, 16);
  assert.equal(vacationDecision(sensor, decision, { vacation: { enabled: true } }, now).rule, 'normal');
});
test('raw P90/P10 above 12 cannot make a stable daily contact insufficient', () => {
  const learning = learn();
  assert.ok(learning.regularityRatio > 12);
  assert.equal(learning.confidence, 'high');
  assert.equal(learning.confidenceReason, 'activity_high');
});
test('native and battery reports cannot create contact activity; old state migrates without reset', () => {
  const events = pattern();
  const legacy = learnDevice({}, events, now);
  delete legacy.learningModel;
  const migrated = profile(legacy).learning;
  assert.deepEqual(migrated.rawEvents, legacy.rawEvents);
  assert.equal(migrated.confidence, 'high');
  const technical = learnDevice({}, events.map(e => ({ ...e, source: 'native' })), now, false, 'activity');
  assert.equal(technical.activity.blockCount, 0);
  assert.equal(technical.confidence, 'insufficient');
  const state = updateLearningState({}, [device], {}, { [device.id]: events.map(e => ({ timestamp: e.at, capability: 'alarm_contact', verifiedRawEvent: true })) }, now);
  assert.equal(state.devices[device.id].learningModel, 'activity');
  assert.equal(state.devices[device.id].activity.blockCount, 28);
});
test('safety capabilities keep periodic rules even on a mixed contact device', () => {
  const safety = { ...device, capabilities: [...device.capabilities, 'alarm_smoke'] };
  const decision = profileDecision(safety, {}, learn(), now);
  assert.equal(decision.learningModel, 'periodic');
  assert.equal(vacationDecision(safety, decision, { vacation: { enabled: true }, deviceProfiles: { [device.id]: { vacationMode: 'pause' } } }, now).rule, 'normal');
});
test('long missing stretches stay in day coverage despite pause outlier exclusion', () => {
  const events = [...pattern(), ...pattern(2).map(e => ({ ...e, at: e.at + 46 * DAY }))];
  const learning = learn(events, START + 47 * DAY + 20 * HOUR);
  assert.equal(learning.activity.observedDays, 48);
  assert.equal(learning.activity.activeDays, 16);
  assert.ok(learning.activity.excludedPauseCount > 0);
  assert.equal(learning.confidenceReason, 'activity_sparse_days');
});
test('activity silence wording avoids a periodic claim and keeps current native heartbeat priority', () => {
  const contact = { ...device, name: 'Synthetic Contact', lastSeenAt: now - 31 * HOUR };
  const result = evaluateBatteryDevices([contact], {}, {}, now, {}, {}, { schema: 1, devices: { [device.id]: learn() } }).assessments[0];
  assert.equal(result.heartbeat.category, 'UNGEWOEHNLICH_STILL');
  assert.match(result.heartbeat.reason, /mehrmals täglich Aktivität/);
  assert.doesNotMatch(result.heartbeat.reason, /etwa alle/);
  const fresh = evaluateBatteryDevices([{ ...contact, lastSeenAt: now }], {}, {}, now, {}, {}, { schema: 1, devices: { [device.id]: learn() } }).assessments[0];
  assert.equal(fresh.heartbeat.problem, null);
});
test('fixed block boundaries, input order and repeated replay stay deterministic', () => {
  const events = [0, 20, 40].map(minutes => ({ at: now - HOUR + minutes * 60000, source: 'interaction' }));
  const first = learn(events);
  assert.equal(first.activity.blockCount, 2);
  assert.deepEqual(learn([...events].reverse()), first);
  assert.deepEqual(learnDevice(first, events, now), first);
});
