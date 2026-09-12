'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CHECK_INTERVAL_HOURS, FLOW_NAME, REPEAT_AFTER_HOURS, STALE_AFTER_HOURS, buildFlow, buildWatchdogScript, validateFlow } = require('../flow-template');

test('creates a neutral disabled and connected flow proposal', () => {
  const flow = buildFlow({ stateVariableId: 'test-state-variable' });
  assert.equal(flow.enabled, false);
  assert.equal(flow.name, FLOW_NAME);
  assert.doesNotMatch(flow.name, /codex/i);
  assert.equal(Object.keys(flow.cards).length, 3);
  assert.equal(validateFlow(flow), true);
});

test('embedded watchdog uses the agreed thresholds and V2 explanation', () => {
  const script = buildWatchdogScript({ stateVariableId: 'test-state-variable' });
  const flow = buildFlow({ stateVariableId: 'test-state-variable' });
  assert.match(script, /"staleHours":24/);
  assert.match(script, /"repeatHours":6/);
  assert.match(script, /notifications:create_notification/);
  assert.match(script, /lastSeenAt/);
  assert.equal(CHECK_INTERVAL_HOURS, 6);
  assert.equal(STALE_AFTER_HOURS, 24);
  assert.equal(REPEAT_AFTER_HOURS, 6);
  assert.match(Object.values(flow.cards).find(card => card.type === 'note').value, /V2/);
});
