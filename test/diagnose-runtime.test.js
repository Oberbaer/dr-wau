'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDiagnosticCode, deviceNameFromEnvironment } = require('../diagnose-runtime');

test('diagnostic requires an explicit device name', () => {
  assert.throws(() => deviceNameFromEnvironment({}), /WATCHDOG_DEVICE_NAME/);
  assert.equal(deviceNameFromEnvironment({ WATCHDOG_DEVICE_NAME: 'Example device' }), 'Example device');
});

test('diagnostic matches an explicitly configured name exactly', () => {
  const code = buildDiagnosticCode('Example device');
  assert.match(code, /device\.name === targetName/);
  assert.doesNotMatch(code, /private-device-name/);
});
