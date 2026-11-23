'use strict';
const { timestamp, profileForDevice, relevantCapability, evaluateHeartbeat } = require('./heartbeat');
const { isZoneExcluded, zoneMap } = require('./zone-exclusions');

function rawInsightEvidence(response, log, device, profile, now) {
  // Numeric Insights are resampled into regular buckets, including unchanged old values.
  // Neither bucket t nor lastValue.t proves that a device sent a new report.
  if (!response || response.step !== undefined || response.start !== undefined || response.end !== undefined) return [];
  const capability = log.ownerId || String(log.id).slice(`homey:device:${device.id}:`.length);
  if (!relevantCapability(capability, device.capabilitiesObj?.[capability], profile)) return [];
  const owner = device.driverUri || String(device.driverId || '').split(':').slice(0, 3).join(':');
  const entries = Array.isArray(response.values) ? response.values : [];
  return entries.filter(entry => timestamp(entry.t, now) !== null && entry.v !== null && entry.v !== undefined
    && entry.originUri === owner && !entry.originUserId && !entry.originClientId)
    .map(entry => ({ capability, timestamp: timestamp(entry.t, now), verifiedRawEvent: true }));
}

async function collectHeartbeatInsights(api, devices, config, now, zonesRaw = {}, maxRequests = 24, learningState = null) {
  const evidence = {};
  const summary = { requests: 0, errors: 0, skipped: 0, aggregatedIgnored: 0 };
  if (!api.insights?.getLogs || !api.insights?.getLogEntries) return { evidence, summary: { ...summary, unavailable: true } };
  const zones = zoneMap(zonesRaw);
  const candidates = Object.values(devices || {}).filter(device => (device.capabilities || Object.keys(device.capabilitiesObj || {})).some(id => /^(measure_battery|alarm_battery)(\.|$)/.test(id))
    && !(config.ignoredDeviceIds || []).includes(device.id)
    && !isZoneExcluded(device.zone, zones, config.ignoredZoneIds)
    && (learningState !== null || evaluateHeartbeat(device, config, now).status !== 'active'));
  if (!candidates.length) return { evidence, summary };
  let logs;
  try { logs = await api.insights.getLogs({ $cache: false }); }
  catch (_) { return { evidence, summary: { ...summary, errors: 1, unavailable: true } }; }
  const queries = [];
  for (const device of candidates) {
    const profile = profileForDevice(device, config.deviceProfiles?.[device.id]);
    if (profile.kind === 'unmonitorable') continue;
    for (const log of Object.values(logs || {})) {
      if (log.ownerUri !== `homey:device:${device.id}` || log.type !== 'boolean') continue;
      const cap = log.ownerId || String(log.id).slice(`homey:device:${device.id}:`.length);
      if (relevantCapability(cap, device.capabilitiesObj?.[cap], profile)) queries.push({ log, device, profile });
    }
  }
  if (learningState !== null && queries.length > maxRequests) {
    const offset = Math.floor(now / Math.max(1, (config.checkHours || 6) * 3600000)) * maxRequests % queries.length;
    queries.push(...queries.splice(0, offset));
  }
  summary.skipped = Math.max(0, queries.length - maxRequests);
  let cursor = 0;
  async function worker() {
    while (cursor < Math.min(queries.length, maxRequests)) {
      const { log, device, profile } = queries[cursor++];
      summary.requests++;
      try {
        const response = await api.insights.getLogEntries({ id: log.id, resolution: 'last24Hours', $timeout: 8000 });
        if (response?.step !== undefined) summary.aggregatedIgnored++;
        evidence[device.id] = [...(evidence[device.id] || []), ...rawInsightEvidence(response, log, device, profile, now)];
      } catch (_) { summary.errors++; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, queries.length) }, worker));
  return { evidence, summary };
}

module.exports = { rawInsightEvidence, collectHeartbeatInsights };
