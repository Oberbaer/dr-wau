'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { analyzeSnapshot, graphAudit, applyFindingAnnotations } = require('../lib/analyzer');

function snapshot(overrides = {}) {
  return {
    normalFlows: {}, advancedFlows: {}, flowFolders: {}, devices: {}, variables: {}, apps: {}, zones: {}, coverage: {},
    generatedAt: '2026-08-12T12:00:00.000Z', ...overrides,
  };
}

test('healthy empty snapshot keeps scores at 100', () => {
  const report = analyzeSnapshot(snapshot());
  assert.equal(report.score.overall, 100);
  assert.deepEqual(report.summary, { critical: 0, high: 0, medium: 0, low: 0, info: 0 });
  assert.equal(report.mode, 'read-only');
  assert.equal(report.privacy.externalTransfer, false);
});

test('active broken flow receives a critical finding and reduces flow score', () => {
  const report = analyzeSnapshot(snapshot({
    normalFlows: { f1: { id: 'f1', name: 'Broken', enabled: true, broken: true, trigger: { id: 'trigger' }, actions: [{ id: 'action' }] } },
  }));
  assert.ok(report.findings.some((finding) => finding.code === 'flow_broken' && finding.severity === 'critical'));
  assert.ok(report.score.categories.flows < 100);
});

test('advanced graph identifies dangling and unreachable cards', () => {
  const result = graphAudit({ cards: {
    trigger: { type: 'trigger', id: 't', outputSuccess: ['action', 'missing'] },
    action: { type: 'action', id: 'a' },
    orphan: { type: 'action', id: 'b' },
  } });
  assert.equal(result.dangling.length, 1);
  assert.deepEqual(result.unreachable, ['orphan']);
});

test('unavailable referenced device is more severe and Zigbee is counted', () => {
  const deviceId = '11111111-1111-4111-8111-111111111111';
  const report = analyzeSnapshot(snapshot({
    normalFlows: { f1: { id: 'f1', name: 'Uses sensor', enabled: true, trigger: { id: `homey:device:${deviceId}:trigger` }, actions: [{ id: 'action' }] } },
    devices: { [deviceId]: { id: deviceId, name: 'Sensor', available: false, flags: ['zigbee'], settings: { zb_device_type: 'enddevice' }, capabilitiesObj: {} } },
  }));
  assert.equal(report.inventory.zigbee.detectedDevices, 1);
  assert.ok(report.findings.some((finding) => finding.code === 'device_unavailable' && finding.severity === 'high'));
  assert.ok(report.findings.some((finding) => finding.code === 'flow_uses_unavailable_device'));
});

test('coverage failure is explicit instead of silently presenting a complete report', () => {
  const report = analyzeSnapshot(snapshot({ coverage: { apps: { ok: false, error: 'forbidden' } } }));
  assert.ok(report.findings.some((finding) => finding.code === 'scan_coverage_incomplete'));
});

test('stale Zigbee timestamps are findings but do not claim a mesh defect', () => {
  const generatedAt = new Date(Date.now() - 8 * 86400000).toISOString();
  const report = analyzeSnapshot(snapshot({
    devices: { z1: { id: 'z1', name: 'Sleepy sensor', available: true, lastSeenAt: generatedAt, flags: ['zigbee'], settings: { zb_device_type: 'enddevice' }, capabilitiesObj: {} } },
  }));
  const finding = report.findings.find((item) => item.code === 'zigbee_device_stale');
  assert.equal(finding.severity, 'high');
  assert.match(finding.recommendation.en, /does not prove/);
});

test('null battery values are unknown and never converted to zero', () => {
  const report = analyzeSnapshot(snapshot({
    devices: {
      d1: {
        id: 'd1', name: 'Remote', available: true, capabilitiesObj: {
          measure_battery: { value: null, lastUpdated: '2024-01-01T00:00:00.000Z' },
        },
      },
    },
  }));
  assert.equal(report.findings.some((finding) => finding.code === 'battery_critical'), false);
  assert.equal(report.findings.some((finding) => finding.code === 'battery_reading_stale'), false);
});

test('stale low battery is a review hint instead of a critical claim', () => {
  const report = analyzeSnapshot(snapshot({
    devices: {
      d1: {
        id: 'd1', name: 'Stored device', available: true, capabilitiesObj: {
          measure_battery: { value: 0, lastUpdated: '2025-01-01T00:00:00.000Z' },
        },
      },
    },
  }));
  assert.ok(report.findings.some((finding) => finding.code === 'battery_reading_stale'));
  assert.equal(report.findings.some((finding) => finding.code === 'battery_critical'), false);
});

test('mixed severities are penalized independently', () => {
  const deviceId = '11111111-1111-4111-8111-111111111111';
  const report = analyzeSnapshot(snapshot({
    normalFlows: {
      active: { id: 'active', name: 'Active', enabled: true, trigger: { id: `homey:device:${deviceId}:trigger` }, actions: [{ id: 'action' }] },
      disabled: { id: 'disabled', name: 'Disabled', enabled: false, trigger: { id: `homey:device:${deviceId}:trigger` }, actions: [{ id: 'action' }] },
    },
    devices: { [deviceId]: { id: deviceId, name: 'Offline', available: false, capabilitiesObj: {} } },
  }));
  const affected = report.findings.filter((finding) => finding.code === 'flow_uses_unavailable_device');
  assert.deepEqual(affected.map((finding) => finding.severity).sort(), ['info', 'medium']);
  assert.ok(report.score.categories.flows > 90);
});

test('finding ids remain stable across scans', () => {
  const input = snapshot({
    normalFlows: { f1: { id: 'f1', name: 'Broken', enabled: true, broken: true, trigger: { id: 'trigger' }, actions: [{ id: 'action' }] } },
  });
  const first = analyzeSnapshot(input).findings.find((finding) => finding.code === 'flow_broken');
  const second = analyzeSnapshot({ ...input, generatedAt: '2026-08-13T12:00:00.000Z' }).findings.find((finding) => finding.code === 'flow_broken');
  assert.match(first.id, /^finding_[0-9a-f]{8}$/);
  assert.equal(first.id, second.id);
});

test('ignored findings stay retrievable but no longer affect the active score', () => {
  const raw = analyzeSnapshot(snapshot({
    normalFlows: { f1: { id: 'f1', name: 'Broken', enabled: true, broken: true, trigger: { id: 'trigger' }, actions: [{ id: 'action' }] } },
  }));
  const target = raw.findings.find((finding) => finding.code === 'flow_broken');
  const managed = applyFindingAnnotations(raw, {
    [target.id]: { priority: 'critical', status: 'expected', ignored: true, note: 'Temporary device', updatedAt: '2026-08-12T13:00:00.000Z' },
  });
  assert.equal(managed.findings.some((finding) => finding.id === target.id), false);
  assert.equal(managed.ignoredFindings.find((finding) => finding.id === target.id).annotation.status, 'expected');
  assert.equal(managed.score.overall, 100);
  assert.equal(managed.management.ignored, 1);
});

test('an unimportant priority keeps a finding visible without a score penalty', () => {
  const raw = analyzeSnapshot(snapshot({
    normalFlows: { f1: { id: 'f1', name: 'Broken', enabled: true, broken: true, trigger: { id: 'trigger' }, actions: [{ id: 'action' }] } },
  }));
  const target = raw.findings.find((finding) => finding.code === 'flow_broken');
  const managed = applyFindingAnnotations(raw, { [target.id]: { priority: 'unimportant' } });
  const visible = managed.findings.find((finding) => finding.id === target.id);
  assert.equal(visible.effectiveSeverity, 'info');
  assert.equal(managed.score.overall, 100);
});
