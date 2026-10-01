'use strict';

const { timestamp, profileForDevice, capabilityEvidence, relevantCapability } = require('./heartbeat');

const HOUR = 3600000;
const DAY = 24 * HOUR;
const MAX_EVENTS = 96;
const MAX_RAW_EVENTS = 4 * MAX_EVENTS;
const MAX_DEVICES = 2000;
const ACTIVITY_BLOCK_MS = HOUR / 2;

function learningModelForDevice(device, config = {}) {
  const caps = [...(device.capabilities || []), ...Object.keys(device.capabilitiesObj || {})];
  if (caps.some(id => /^(alarm_smoke|alarm_water|alarm_co)(\.|$)/.test(id))) return 'periodic';
  const kind = profileForDevice(device, config.deviceProfiles?.[device.id]).kind;
  if (['remote', 'button'].includes(device.class) || kind === 'button') return 'event_only';
  return kind === 'contact' ? 'activity' : 'periodic';
}

function percentile(sorted, portion) {
  if (!sorted.length) return null;
  const at = (sorted.length - 1) * portion;
  const low = Math.floor(at);
  return sorted[low] + (sorted[Math.ceil(at)] - sorted[low]) * (at - low);
}

function relevantEvents(device, config, insights = [], now = Date.now()) {
  const profile = profileForDevice(device, config.deviceProfiles?.[device.id]);
  if (profile.kind === 'unmonitorable') return [];
  const native = timestamp(device.lastSeenAt, now);
  const reports = [
    ...(native === null ? [] : [{ at: native, source: 'native' }]),
    ...capabilityEvidence(device, profile, now).map(item => ({ at: item.timestamp,
      source: ['contact', 'motion', 'button'].includes(profile.kind) && /^(alarm_contact|alarm_motion)/.test(item.source.slice('capability:'.length)) ? 'interaction' : 'capability' })),
    ...insights.filter(item => item.verifiedRawEvent === true && timestamp(item.timestamp, now) !== null
      && relevantCapability(item.capability, device.capabilitiesObj?.[item.capability], profile))
      .map(item => ({ at: timestamp(item.timestamp, now), source: ['contact', 'motion', 'button'].includes(profile.kind) && /^(alarm_contact|alarm_motion)/.test(item.capability) ? 'interaction' : 'insights' })),
  ].filter(item => item.at <= now);
  // Learning merges these timestamps with its own history. The current heartbeat
  // chooses its freshest evidence independently in evaluateHeartbeat().
  return reports.sort((a, b) => a.at - b.at);
}

function activityStatistics(rawEvents, now) {
  // Only confirmed interaction timestamps describe usage; native/battery
  // communication must never manufacture contact activity.
  const events = rawEvents.filter(item => item.source === 'interaction');
  const blocks = [];
  for (const event of events) {
    const block = blocks.at(-1);
    if (!block || event.at - block.startAt > ACTIVITY_BLOCK_MS) blocks.push({ startAt: event.at, endAt: event.at });
    else block.endAt = event.at;
  }
  const pauses = blocks.slice(1).map((block, i) => (block.startAt - blocks[i].endAt) / HOUR);
  const sorted = [...pauses].sort((a, b) => a - b);
  const q1 = percentile(sorted, 0.25), q3 = percentile(sorted, 0.75);
  const upper = sorted.length >= 8 ? Math.max(24, 8 * percentile(sorted, 0.5), q3 + 3 * (q3 - q1)) : null;
  const normal = upper === null ? sorted : sorted.filter(value => value <= upper);
  // Calendar coverage includes silent days and the current day. Removing a
  // statistical pause outlier does not remove those days from confidence.
  const observedDays = events.length ? Math.floor(now / DAY) - Math.floor(events[0].at / DAY) + 1 : 0;
  const elapsedDays = events.length ? (now - events[0].at) / DAY : 0;
  const activeDays = new Set(events.map(event => Math.floor(event.at / DAY))).size;
  const activeDayFraction = observedDays ? activeDays / observedDays : 0;
  const p90 = percentile(normal, 0.9), p95 = percentile(normal, 0.95);
  const max = normal.at(-1) ?? null;
  const stable = p90 > 0 && p95 / p90 <= 1.75 && max / p95 <= 2;
  const confidence = blocks.length < 4 || observedDays < 3 || activeDayFraction < 0.5 || !stable ? 'insufficient'
    : observedDays >= 14 && elapsedDays >= 13 && blocks.length >= 14 && activeDayFraction >= 0.8 ? 'high'
      : observedDays >= 7 && elapsedDays >= 6 && blocks.length >= 7 && activeDayFraction >= 0.6 ? 'medium' : 'low';
  const confidenceReason = blocks.length < 4 ? 'activity_too_few_blocks' : observedDays < 3 ? 'activity_too_few_days'
    : activeDayFraction < 0.5 ? 'activity_sparse_days' : !stable ? 'activity_unstable_pauses'
      : `activity_${confidence}`;
  return { rawEventCount: events.length, blockCount: blocks.length, blockMinutes: 30, observedDays, elapsedDays,
    activeDays, activeDayPercent: 100 * activeDayFraction, blocksPerActiveDay: activeDays ? blocks.length / activeDays : 0,
    pausesHours: pauses, pauseCount: pauses.length, usedPauseCount: normal.length, excludedPauseCount: pauses.length - normal.length,
    outlierUpperHours: upper, medianPauseHours: percentile(normal, 0.5), p90PauseHours: p90, p95PauseHours: p95,
    maxNormalPauseHours: max, upperPausesStable: stable, confidence, confidenceReason,
    observedUntil: new Date(now).toISOString() };
}

function learnDevice(previous = {}, reports = [], now = Date.now(), vacation = false, learningModel = previous?.learningModel || 'periodic') {
  if (!previous || typeof previous !== 'object') previous = {};
  const valid = item => item && Number.isFinite(item.at) && timestamp(item.at, now) !== null && item.at >= now - 90 * DAY;
  const oldEvents = (Array.isArray(previous.rawEvents) ? previous.rawEvents : Array.isArray(previous.events) ? previous.events : []).filter(valid);
  const sources = ['interaction', 'native', 'insights', 'capability'];
  const incoming = reports.filter(item => valid(item) && (!vacation || item.source !== 'interaction'));
  // Exact repeats of the same timestamp never increase the retained raw count.
  // Keep source precedence deterministic even when history arrives out of order.
  const byTime = new Map();
  for (const item of [...oldEvents, ...incoming]) {
    const source = sources.includes(item.source) ? item.source : 'capability';
    const old = byTime.get(item.at);
    if (!old || sources.indexOf(source) < sources.indexOf(old.source)) byTime.set(item.at, { at: item.at, source });
  }
  const raw = [...byTime.values()].sort((a, b) => a.at - b.at).slice(-MAX_RAW_EVENTS);
  // A fixed one-minute window from the first timestamp prevents a chain of
  // adjacent events from merging an arbitrarily long period into one report.
  const clusters = [];
  for (const item of raw) {
    const cluster = clusters.at(-1);
    if (!cluster || item.at - cluster[0].at > 60000) clusters.push([item]);
    else cluster.push(item);
  }
  const retained = clusters.slice(-MAX_EVENTS);
  const rawEvents = retained.flat();
  const bounded = retained.map(cluster => cluster[0]);
  const oldTimes = new Set(oldEvents.map(item => item.at));
  const added = rawEvents.some(item => !oldTimes.has(item.at));
  const intervals = [];
  for (let i = 1; i < bounded.length; i++) {
    const interval = (bounded[i].at - bounded[i - 1].at) / HOUR;
    if (interval > 1 / 60) intervals.push(interval);
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  // Small samples cannot establish an outlier reliably. With >=8 intervals,
  // exclude only above ALL of: 24h, 8x the pilot median, and the upper outer
  // Tukey fence Q3 + 3*IQR. All published statistics use the resulting set.
  const pilotMedian = percentile(sorted, 0.5);
  const q1 = percentile(sorted, 0.25), q3 = percentile(sorted, 0.75);
  const outlierUpperHours = sorted.length >= 8 ? Math.max(24, pilotMedian * 8, q3 + 3 * (q3 - q1)) : null;
  const typical = outlierUpperHours === null ? sorted : sorted.filter(value => value <= outlierUpperHours);
  const median = percentile(typical, 0.5);
  const p90 = percentile(typical, 0.9);
  const p95 = percentile(typical, 0.95);
  const p10 = percentile(typical, 0.1);
  const spanDays = bounded.length > 1 ? (bounded.at(-1).at - bounded[0].at) / DAY : 0;
  const days = typical.reduce((sum, value) => sum + value, 0) / 24;
  const irregular = p10 !== null && p10 > 0 && p90 / p10 > 12;
  const confidence = irregular ? 'insufficient' : typical.length >= 20 && days >= 7 ? 'high' : typical.length >= 10 && days >= 3 ? 'medium'
    : typical.length >= 4 && days >= 1 ? 'low' : 'insufficient';
  const confidenceReason = irregular ? 'irregular_intervals' : confidence === 'high' ? 'sufficient_high'
    : confidence === 'medium' ? 'sufficient_medium' : confidence === 'low' ? 'limited_history'
      : typical.length < 4 ? 'too_few_intervals' : 'too_short_observation';
  const evidenceSources = [...new Set(rawEvents.map(item => item.source))].sort();
  const activity = learningModel === 'activity' ? activityStatistics(rawEvents,
    vacation && Number.isFinite(Date.parse(previous.activity?.observedUntil)) ? Date.parse(previous.activity.observedUntil) : now) : null;
  return { learningModel, ...(activity ? { activity } : {}), events: bounded, rawEvents, rawEventCount: rawEvents.length, uniqueEventCount: bounded.length,
    intervalCount: intervals.length, usedIntervalCount: typical.length, excludedIntervalCount: intervals.length - typical.length,
    outlierRule: 'conservative_upper_v1', outlierUpperHours,
    reportCount: bounded.length, sampleCount: typical.length, observationDays: days, observationSpanDays: spanDays,
    medianIntervalHours: median, p90IntervalHours: p90, p95IntervalHours: p95, maxNormalIntervalHours: typical.at(-1) ?? null,
    p10IntervalHours: p10, regularityRatio: p10 > 0 ? p90 / p10 : null,
    confidenceReason: activity?.confidenceReason || (learningModel === 'event_only' ? 'event_only' : confidenceReason),
    confidence: activity?.confidence || (learningModel === 'event_only' ? 'insufficient' : confidence), source: evidenceSources.join('+') || 'none', firstObservedAt: bounded.length ? new Date(bounded[0].at).toISOString() : null,
    lastObservedAt: bounded.length ? new Date(bounded.at(-1).at).toISOString() : null,
    lastLearnedAt: added ? new Date(now).toISOString() : previous.lastLearnedAt || null };
}

function warningHours(learning, deviceClass) {
  if (deviceClass === 'button' || learning?.learningModel === 'event_only') return null;
  if (learning?.learningModel === 'activity') {
    const activity = learning.activity;
    if (!['high', 'medium'].includes(learning.confidence) || !Number.isFinite(activity?.p95PauseHours)) return null;
    const raw = Math.max(24, activity.p95PauseHours + Math.max(12, activity.p95PauseHours * 0.25));
    return Math.min(720, Math.ceil(raw / 6) * 6);
  }
  if (!['high', 'medium'].includes(learning?.confidence) || !Number.isFinite(learning.p95IntervalHours)) return null;
  const minimum = deviceClass === 'sensor' ? 4 : deviceClass === 'vacuum' ? 12 : 24;
  const raw = Math.max(minimum, learning.p95IntervalHours * 2);
  const rounded = raw <= 24 ? Math.ceil(raw / 2) * 2 : raw <= 72 ? Math.ceil(raw / 6) * 6 : Math.ceil(raw / 24) * 24;
  return Math.min(720, rounded);
}

function profileDecision(device, config, learning, now = Date.now()) {
  const override = config.deviceProfiles?.[device.id] || {};
  const deviceClass = profileForDevice(device, override).kind;
  const learningModel = learningModelForDevice(device, config);
  if (learning && learning.learningModel !== learningModel) learning = learnDevice(learning, [], now, false, learningModel);
  const manual = override.mode === 'manual' || (override.mode === undefined && (override.profile && override.profile !== 'auto' || override.staleHours));
  const confirmed = override.confirmation === 'confirmed' || manual;
  const learnedHours = warningHours(learning, deviceClass);
  const mode = override.mode || (manual ? 'manual' : learnedHours !== null ? 'learned' : learningModel !== 'periodic' ? 'event_only' : 'assumed');
  const threshold = mode === 'manual' ? override.warningAfterHours || override.staleHours || config.staleHours
    : mode === 'learned' ? learnedHours : mode === 'event_only' || mode === 'disabled' ? null : config.staleHours;
  const activityDescription = learningModel === 'activity' && learnedHours !== null
    ? learning.activity.blocksPerActiveDay >= 1.5 ? 'Normalerweise mehrmals täglich Aktivität.' : 'Dieses Gerät ist normalerweise fast täglich aktiv.' : null;
  return { deviceClass, learningModel, mode, automaticWarningAfterHours: learnedHours, activityDescription,
    confirmation: confirmed ? 'confirmed' : 'unconfirmed', expectedReportHours: learningModel === 'periodic' ? learning?.medianIntervalHours ?? null : null,
    warningAfterHours: threshold, learning: learning || null,
    profileStatus: mode === 'disabled' ? 'disabled' : mode === 'event_only' ? 'event_only' : mode === 'learned' && confirmed ? 'learned_confirmed'
      : mode === 'learned' ? 'learned' : mode === 'manual' ? 'manual' : learning?.confidence === 'low' ? 'learning' : 'assumed' };
}

function updateLearningState(previous, devices, config, insights, now, vacationActive = false) {
  const existing = previous?.schema === 1 && previous.devices && typeof previous.devices === 'object' ? previous.devices : {};
  const next = { schema: 1, devices: { ...existing } };
  for (const device of Object.values(devices || {}).slice(0, MAX_DEVICES)) {
    const reports = relevantEvents(device, config, insights?.[device.id] || [], now);
    if (!reports.length) continue;
    next.devices[device.id] = learnDevice(next.devices[device.id], reports, now, vacationActive, learningModelForDevice(device, config));
  }
  next.devices = Object.fromEntries(Object.entries(next.devices).filter(([, value]) => value && typeof value === 'object')
    .sort((a, b) => Date.parse(b[1].lastLearnedAt || '') - Date.parse(a[1].lastLearnedAt || '') || 0).slice(0, MAX_DEVICES));
  return next;
}

module.exports = { percentile, relevantEvents, learnDevice, warningHours, profileDecision, updateLearningState, learningModelForDevice, activityStatistics };
