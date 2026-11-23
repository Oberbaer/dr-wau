'use strict';

const values = input => Array.isArray(input) ? input : Object.values(input || {});

function zoneMap(zones) {
  return Object.fromEntries(values(zones).filter(zone => zone?.id).map(zone => [String(zone.id), zone]));
}

function isZoneExcluded(zoneId, zones, ignoredZoneIds) {
  const ignored = ignoredZoneIds instanceof Set ? ignoredZoneIds : new Set(ignoredZoneIds || []);
  const seen = new Set();
  let current = typeof zoneId === 'object' ? zoneId?.id : zoneId;
  while (current && !seen.has(String(current))) {
    current = String(current);
    if (ignored.has(current)) return true;
    seen.add(current);
    const zone = zones[current];
    current = zone?.parent?.id || zone?.parent || null;
  }
  return false;
}

module.exports = { isZoneExcluded, zoneMap };
