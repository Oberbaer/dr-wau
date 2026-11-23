'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

test('watchdog device and zone exclusions use independent checkboxes', async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'index.html'), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(script);
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://my.homey.app/' });
  const { window } = dom;
  const overview = {
    config: {
      enabled: true, timeline: true, flowTrigger: false, pushUserIds: ['user-1'],
      checkHours: 6, staleHours: 24, repeatHours: 6,
      ignoredDeviceIds: ['device-1'], ignoredZoneIds: ['zone-1'],
    },
    batteryDevices: [{ id: 'device-1', name: 'First device' }, { id: 'device-2', name: 'Second device' }],
    zones: [{ id: 'zone-1', name: 'First zone' }, { id: 'zone-2', name: 'Second zone' }],
    users: [{ id: 'user-1', name: 'First user' }, { id: 'user-2', name: 'Second user' }],
    pushAuthReady: true,
    status: null,
  };
  let saved;
  window.eval(script);
  window.onHomeyReady({
    ready() {},
    api(method, route, body, callback) {
      if (method === 'GET' && route === '/report') callback(null, { report: null });
      else if (method === 'GET' && route === '/watchdog') callback(null, overview);
      else if (method === 'POST' && route === '/watchdog') {
        saved = body;
        callback(null, { ...overview, config: body });
      } else callback(new Error(`Unexpected API call ${method} ${route}`));
    },
  });
  await new Promise(resolve => setImmediate(resolve));

  const deviceRows = [...window.document.querySelectorAll('#watchdog-ignore input[type="checkbox"]')];
  const zoneRows = [...window.document.querySelectorAll('#watchdog-ignore-zones input[type="checkbox"]')];
  const userRows = [...window.document.querySelectorAll('#watchdog-users input[type="checkbox"]')];
  assert.ok(window.document.querySelector('#panel-watchdog #watchdog-monitoring'));
  assert.equal(window.document.querySelectorAll('#watchdog-monitoring-rows select').length, 2);
  window.document.querySelector('[data-profile="device-2"]').value = 'sensor';
  window.document.querySelector('[data-limit="device-2"]').value = '48';
  assert.equal(deviceRows.length, 2);
  assert.equal(zoneRows.length, 2);
  assert.equal(deviceRows[0].checked, true);
  assert.equal(zoneRows[0].checked, true);
  assert.equal(userRows[0].checked, true);

  deviceRows[0].checked = false;
  deviceRows[1].checked = true;
  zoneRows[0].checked = false;
  zoneRows[1].checked = true;
  userRows[0].checked = false;
  userRows[1].checked = true;
  window.document.getElementById('watchdog-save').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(saved.ignoredDeviceIds), ['device-2']);
  assert.deepEqual(Array.from(saved.ignoredZoneIds), ['zone-2']);
  assert.deepEqual(Array.from(saved.pushUserIds), ['user-2']);
  assert.equal(saved.deviceProfiles['device-2'].profile, 'sensor');
  assert.equal(saved.deviceProfiles['device-2'].staleHours, 48);
  assert.equal(saved.batteryLowPercent, 20);
  assert.equal(saved.batteryCriticalPercent, 5);
  assert.equal(window.document.querySelector('#watchdog-ignore-zones input[value="zone-2"]').checked, true);
  saved = undefined;
  window.document.getElementById('watchdog-preview').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved, undefined);
  for (const id of ['watchdog-ignore', 'watchdog-ignore-zones', 'watchdog-users']) {
    for (const checkbox of window.document.querySelectorAll(`#${id} input[type="checkbox"]`)) checkbox.checked = false;
  }
  window.document.getElementById('watchdog-save').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Array.from(saved.ignoredDeviceIds), []);
  assert.deepEqual(Array.from(saved.ignoredZoneIds), []);
  assert.deepEqual(Array.from(saved.pushUserIds), []);
  dom.window.close();
});
