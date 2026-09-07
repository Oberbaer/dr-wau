'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CHECK_INTERVAL_HOURS,
  STALE_AFTER_HOURS,
  buildFlow,
  buildWatchdogScript,
  validateFlow,
} = require('../flow-template');

test('creates a disabled, connected flow proposal', () => {
  const flow = buildFlow({ stateVariableId: 'test-state-variable' });
  assert.equal(flow.enabled, false);
  assert.equal(Object.keys(flow.cards).length, 3);
  assert.equal(validateFlow(flow), true);
});

test('embedded watchdog uses the agreed thresholds and notification deduplication', () => {
  const script = buildWatchdogScript({ stateVariableId: 'test-state-variable' });
  assert.match(script, /"staleHours":24/);
  assert.match(script, /notifications:create_notification/);
  assert.match(script, /"repeatHours":6/);
  assert.match(script, /lastSeenAt/);
  assert.equal(CHECK_INTERVAL_HOURS, 6);
});
