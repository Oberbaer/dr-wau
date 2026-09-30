'use strict';

const { timestamp, profileForDevice, capabilityEvidence, relevantCapability } = require('./heartbeat');

const HOUR = 3600000;
const DAY = 24 * HOUR;
const MAX_EVENTS = 96;
const MAX_DEVICES = 2000;

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
  reports.sort((a, b) => a.at - b.at);
  // Multiple capabilities can change in one device report. A one-minute cluster is one observation.
  const distinct = [];
  for (const report of reports) {
    if (!distinct.length || report.at - distinct[distinct.length - 1].at > 60000) distinct.push(report);
    else if (report.source === 'native' && distinct[distinct.length - 1].source !== 'interaction') distinct[distinct.length - 1] = report;
  }
  return distinct;
}

function learnDevice(previous = {}, reports = [], now = Date.now(), vacation = false) {
  if (!previous || typeof previous !== 'object') previous = {};
  const oldEvents = Array.isArray(previous.events) ? previous.events.filter(item => timestamp(item.at, now) !== null && item.at >= now - 90 * DAY) : [];
  const events = [...oldEvents];
  let added = 0;
  const seen = new Set(events.map(item => item.at));
  for (const item of reports) {
    if (!Number.isFinite(item.at) || item.at > now || item.at < now - 90 * DAY || seen.has(item.at) || events.some(event => Math.abs(event.at - item.at) <= 60000)) continue;
    // A report that ends an anomalous silence must not turn the outage into normal behavior.
    const last = events.at(-1);
    if (last && item.at < last.at) continue;
    if (vacation && item.source === 'interaction') continue;
    events.push({ at: item.at, source: item.source });
    added++;
    seen.add(item.at);
  }
  events.sort((a, b) => a.at - b.at);
  const bounded = events.slice(-MAX_EVENTS);
  const intervals = [];
  for (let i = 1; i < bounded.length; i++) {
    const interval = (bounded[i].at - bounded[i - 1].at) / HOUR;
    if (interval > 1 / 60) intervals.push(interval);
  }
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = percentile(sorted, 0.5);
  const typical = sorted.filter(value => value <= Math.max(24, (median || 0) * 8));
  const p90 = percentile(typical, 0.9);
  const p95 = percentile(typical, 0.95);
  const p10 = percentile(typical, 0.1);
  const spanDays = bounded.length > 1 ? (bounded.at(-1).at - bounded[0].at) / DAY : 0;
  const days = typical.reduce((sum, value) => sum + value, 0) / 24;
  const irregular = p10 !== null && p10 > 0 && p90 / p10 > 12;
  const confidence = irregular ? 'insufficient' : typical.length >= 20 && days >= 7 ? 'high' : typical.length >= 10 && days >= 3 ? 'medium'
    : typical.length >= 4 && days >= 1 ? 'low' : 'insufficient';
  const sources = [...new Set(bounded.map(item => item.source))].sort();
  return { events: bounded, reportCount: bounded.length, sampleCount: typical.length, observationDays: days, observationSpanDays: spanDays,
    medianIntervalHours: median, p90IntervalHours: p90, p95IntervalHours: p95, maxNormalIntervalHours: typical.at(-1) ?? null,
    confidence, source: sources.join('+') || 'none', firstObservedAt: bounded.length ? new Date(bounded[0].at).toISOString() : null,
    lastObservedAt: bounded.length ? new Date(bounded.at(-1).at).toISOString() : null,
    lastLearnedAt: added ? new Date(now).toISOString() : previous.lastLearnedAt || null };
}

function warningHours(learning, deviceClass) {
  if (!['high', 'medium'].includes(learning?.confidence) || !Number.isFinite(learning.p95IntervalHours)) return null;
  const minimum = deviceClass === 'sensor' ? 4 : deviceClass === 'vacuum' ? 12 : 24;
  const raw = Math.max(minimum, learning.p95IntervalHours * 2);
  const rounded = raw <= 24 ? Math.ceil(raw / 2) * 2 : raw <= 72 ? Math.ceil(raw / 6) * 6 : Math.ceil(raw / 24) * 24;
  return Math.min(720, rounded);
}

function profileDecision(device, config, learning) {
  const override = config.deviceProfiles?.[device.id] || {};
  const deviceClass = profileForDevice(device, override).kind;
  const manual = override.mode === 'manual' || (override.mode === undefined && (override.profile && override.profile !== 'auto' || override.staleHours));
  const confirmed = override.confirmation === 'confirmed' || manual;
  const learnedHours = warningHours(learning, deviceClass);
  const mode = override.mode || (manual ? 'manual' : learnedHours !== null ? 'learned' : deviceClass === 'button' ? 'event_only' : 'assumed');
  const threshold = mode === 'manual' ? override.warningAfterHours || override.staleHours || config.staleHours
    : mode === 'learned' ? learnedHours : mode === 'event_only' || mode === 'disabled' ? null : config.staleHours;
  return { deviceClass, mode, confirmation: confirmed ? 'confirmed' : 'unconfirmed', expectedReportHours: learning?.medianIntervalHours ?? null,
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
    next.devices[device.id] = learnDevice(next.devices[device.id], reports, now, vacationActive);
  }
  next.devices = Object.fromEntries(Object.entries(next.devices).filter(([, value]) => value && typeof value === 'object')
    .sort((a, b) => Date.parse(b[1].lastLearnedAt || '') - Date.parse(a[1].lastLearnedAt || '') || 0).slice(0, MAX_DEVICES));
  return next;
}

module.exports = { percentile, relevantEvents, learnDevice, warningHours, profileDecision, updateLearningState };
