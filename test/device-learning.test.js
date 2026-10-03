'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { learnDevice, warningHours, profileDecision, relevantEvents, updateLearningState } = require('../lib/device-learning');
const { evaluateBatteryDevices, markDelivered, normalizeConfig } = require('../lib/battery-watchdog');
const { vacationDecision, isVacationActive } = require('../lib/vacation');
const HOUR = 3600000;
const NOW = Date.parse('2026-10-01T12:00:00Z');
const cap = (value, at) => ({ value, lastUpdated: at, getable: true, setable: false });
const contact = (age = 25) => ({ id: 'contact-1', name: 'Synthetic Kitchen Contact', class: 'sensor', available: true,
  capabilities: ['alarm_contact', 'measure_battery'], capabilitiesObj: { alarm_contact: cap(false, NOW - age * HOUR), measure_battery: cap(77, NOW - age * HOUR) } });
const reports = (count, intervalHours, lastAge = 25) => Array.from({ length: count }, (_, i) => ({ at: NOW - (lastAge + (count - i - 1) * intervalHours) * HOUR, source: 'insights' }));
const learned = learnDevice({}, reports(85, 4).map(item => ({ ...item, source: 'interaction' })), NOW, false, 'activity');
const learnedState = { schema: 1, devices: { 'contact-1': learned } };

test('frequent contact learns 24-hour warning without claiming offline and recovers once', () => {
  assert.equal(learned.confidence, 'high');
  assert.equal(learned.sampleCount, 84);
  assert.equal(warningHours(learned, 'contact'), 24);
  const config = { timeline: true, repeatHours: 24 };
  assert.equal(evaluateBatteryDevices([contact(23)], {}, config, NOW, {}, {}, learnedState).pending.length, 0);
  const late = evaluateBatteryDevices([contact(25)], {}, config, NOW, {}, {}, learnedState);
  assert.equal(late.assessments[0].heartbeat.category, 'UNGEWOEHNLICH_STILL');
  assert.match(late.pending[0].message, /keine bestätigte Meldung/);
  assert.doesNotMatch(late.pending[0].message, /offline/i);
  markDelivered(late.state, late.pending.map(item => item.key), NOW, ['timeline']);
  assert.equal(evaluateBatteryDevices([contact(26)], late.state, config, NOW + HOUR, {}, {}, learnedState).pending.length, 0);
  const recovered = evaluateBatteryDevices([contact(1)], late.state, config, NOW + HOUR, {}, {}, learnedState);
  assert.equal(recovered.pending.filter(item => item.kind === 'recovery').length, 1);
  markDelivered(recovered.state, recovered.pending.map(item => item.key), NOW + HOUR, ['timeline']);
  assert.equal(evaluateBatteryDevices([contact(1)], recovered.state, config, NOW + 2 * HOUR, {}, {}, learnedState).pending.length, 0);
});

test('outage interval is not learned as normal and duplicate observations do not grow history', () => {
  const outage = learnDevice(learned, [{ at: NOW, source: 'native' }], NOW);
  assert.equal(warningHours(outage, 'contact'), 24);
  assert.equal(learnDevice(outage, [{ at: NOW, source: 'native' }], NOW).reportCount, outage.reportCount);
  const snapshot = updateLearningState({ schema: 1, devices: {} }, [contact(2)], {}, {}, NOW);
  assert.equal(updateLearningState(snapshot, [contact(2)], {}, {}, NOW).devices['contact-1'].reportCount, 1);
});

test('contradictory intervals stay unconfirmed', () => {
  const mixed = [{ at: NOW - 30 * 24 * HOUR, source: 'native' }];
  for (let i = 0; i < 25; i++) mixed.push({ at: mixed.at(-1).at + (i % 2 ? 0.2 : 24) * HOUR, source: 'native' });
  const result = learnDevice({}, mixed, NOW);
  assert.equal(result.confidence, 'insufficient');
  assert.equal(warningHours(result, 'sensor'), null);
});

test('sparse contact, button and virtual device do not gain a learned silence alarm', () => {
  const sparse = learnDevice({}, reports(3, 72), NOW);
  assert.equal(sparse.confidence, 'insufficient');
  assert.equal(profileDecision(contact(), {}, sparse).mode, 'event_only');
  const button = { ...contact(200), id: 'button-1', class: 'remote', capabilities: ['measure_battery'], capabilitiesObj: { measure_battery: cap(55, NOW - 200 * HOUR) } };
  assert.equal(profileDecision(button, {}, null).mode, 'event_only');
  assert.equal(evaluateBatteryDevices([button], {}, {}, NOW).assessments[0].heartbeat.problem, null);
  const virtual = { ...contact(), id: 'virtual-1', driverUri: 'homey:manager:vdevice' };
  assert.equal(relevantEvents(virtual, {}, [], NOW).length, 0);
  const motion = { ...contact(), id: 'motion-1', capabilities: ['alarm_motion', 'measure_battery'], capabilitiesObj: { alarm_motion: cap(false, NOW - HOUR) } };
  const safety = { ...contact(), id: 'smoke-1', capabilities: ['alarm_smoke', 'measure_battery'], capabilitiesObj: { alarm_smoke: cap(false, NOW - HOUR) } };
  assert.equal(profileDecision(motion, {}, null).deviceClass, 'motion');
  assert.equal(profileDecision(safety, {}, null).deviceClass, 'safety');
});

test('periodic sensor and vacuum learn class-sensitive thresholds', () => {
  const sensorLearning = learnDevice({}, reports(30, 8, 1), NOW);
  assert.equal(warningHours(sensorLearning, 'sensor'), 16);
  assert.equal(warningHours(sensorLearning, 'vacuum'), 16);
  const sensor = { ...contact(20), id: 'sensor-1', capabilities: ['measure_humidity', 'measure_battery'], capabilitiesObj: { measure_humidity: cap(45, NOW - 20 * HOUR), measure_battery: cap(70, NOW - 100 * HOUR) } };
  const state = { schema: 1, devices: { 'sensor-1': sensorLearning } };
  assert.equal(evaluateBatteryDevices([sensor], {}, {}, NOW, {}, {}, state).assessments[0].heartbeat.category, 'UNGEWOEHNLICH_STILL');
});

test('manual migrated profile wins over learning and confirmation stays explicit', () => {
  const config = normalizeConfig({ enabled: true, staleHours: 30, repeatHours: 6, ignoredDeviceIds: ['skip'], ignoredZoneIds: ['zone'], pushUserIds: ['owner'], batteryLowPercent: 15,
    deviceProfiles: { 'contact-1': { profile: 'contact', staleHours: 48 } } });
  assert.equal(config.deviceProfiles['contact-1'].mode, 'manual');
  assert.equal(config.deviceProfiles['contact-1'].confirmation, 'confirmed');
  assert.equal(profileDecision(contact(), config, learned).warningAfterHours, 48);
  assert.deepEqual(config.ignoredDeviceIds, ['skip']);
  assert.deepEqual(config.ignoredZoneIds, ['zone']);
  assert.deepEqual(config.pushUserIds, ['owner']);
  assert.equal(config.repeatHours, 6);
  const confirmedAuto = normalizeConfig({ deviceProfiles: { 'contact-1': { confirmation: 'confirmed' } } });
  assert.equal(profileDecision(contact(), confirmedAuto, learned).profileStatus, 'learned_confirmed');
  assert.equal(profileDecision(contact(), normalizeConfig({}), learned).mode, 'learned');
  const custom = normalizeConfig({ deviceProfiles: { 'contact-1': { profile: 'contact', mode: 'manual', confirmation: 'confirmed', warningAfterHours: 48 } } });
  assert.equal(evaluateBatteryDevices([contact(47)], {}, custom, NOW).assessments[0].heartbeat.problem, null);
  assert.match(evaluateBatteryDevices([contact(49)], {}, custom, NOW).assessments[0].heartbeat.problem.message, /eigene Warnschwelle/);
});

test('vacation expires, pauses selected silence warnings and keeps battery/availability', () => {
  assert.equal(isVacationActive({ enabled: true, until: new Date(NOW - HOUR).toISOString() }, NOW), false);
  const vacation = { enabled: true, until: new Date(NOW + HOUR).toISOString() };
  const config = normalizeConfig({ vacation, deviceProfiles: { 'contact-1': { vacationMode: 'pause' } } });
  const result = evaluateBatteryDevices([contact(25)], {}, config, NOW, {}, {}, learnedState).assessments[0];
  assert.equal(result.heartbeat.problem, null);
  assert.equal(vacationDecision(contact(), result.profile, config, NOW).rule, 'pause');
  const low = contact(25); low.capabilitiesObj.measure_battery = cap(1, NOW - HOUR);
  assert.equal(evaluateBatteryDevices([low], {}, config, NOW, {}, {}, learnedState).assessments[0].battery.status, 'critical');
  assert.equal(evaluateBatteryDevices([{ ...contact(25), available: false }], {}, config, NOW, {}, {}, learnedState).assessments[0].heartbeat.problem.type, 'availability');
  const normal = normalizeConfig({ vacation, deviceProfiles: { 'contact-1': { vacationMode: 'normal' } } });
  assert.equal(evaluateBatteryDevices([contact(25)], {}, normal, NOW, {}, {}, learnedState).assessments[0].heartbeat.category, 'UNGEWOEHNLICH_STILL');
  const extended = normalizeConfig({ vacation, deviceProfiles: { 'contact-1': { vacationMode: 'extend', vacationFactor: 2 } } });
  assert.equal(evaluateBatteryDevices([contact(25)], {}, extended, NOW, {}, {}, learnedState).assessments[0].heartbeat.problem, null);
  assert.equal(evaluateBatteryDevices([contact(49)], {}, extended, NOW, {}, {}, learnedState).assessments[0].heartbeat.category, 'UNGEWOEHNLICH_STILL');
  const sensor = { ...contact(25), id: 'sensor-1', capabilities: ['measure_humidity', 'measure_battery'], capabilitiesObj: { measure_humidity: cap(55, NOW - 25 * HOUR) } };
  const sensorLearning = { schema: 1, devices: { 'sensor-1': learned } };
  assert.equal(evaluateBatteryDevices([sensor], {}, normalizeConfig({ vacation }), NOW, {}, {}, sensorLearning).assessments[0].vacation.rule, 'normal');
  const smoke = { ...contact(25), capabilities: ['alarm_smoke', 'measure_battery'] };
  assert.equal(vacationDecision(smoke, result.profile, config, NOW).rule, 'normal');
});

test('vacation ignores interaction samples but keeps technical reports', () => {
  const state = learnDevice({}, [{ at: NOW - 2 * HOUR, source: 'interaction' }, { at: NOW - HOUR, source: 'native' }], NOW, true);
  assert.equal(state.reportCount, 1);
  const evidence = relevantEvents(contact(1), {}, [{ capability: 'alarm_contact', timestamp: NOW - HOUR, verifiedRawEvent: true }], NOW);
  assert.ok(evidence.some(item => item.source === 'interaction'));
});
