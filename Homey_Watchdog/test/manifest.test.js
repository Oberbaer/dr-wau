'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('compose manifest identifies Dr. Wau and exposes private owner APIs', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.homeycompose', 'app.json'), 'utf8'));
  assert.equal(manifest.id, 'com.oberbaer.homeywatchdog');
  assert.equal(manifest.version, '0.7.1');
  assert.equal(manifest.name.en, 'Dr. Wau 🐶🔧⚙️👀');
  const trigger = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.homeycompose', 'flow', 'triggers', 'battery_watchdog_warning.json'), 'utf8'));
  assert.equal(trigger.tokens[0].name, 'text');
  for (const id of ['getWatchdog', 'updateWatchdog', 'runWatchdog', 'previewWatchdog', 'setVacation', 'updateDeviceProfile', 'testWatchdogNotification', 'importAutomationHealth', 'exportBackup', 'restorePlan', 'restoreRun']) {
    assert.equal(manifest.api[id].public, false);
    assert.equal(manifest.api[id].role, 'owner');
  }
  assert.equal(manifest.api.previewWatchdog.method, 'GET');
});
