'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const appPath = path.join(__dirname, '..', 'app.js');
const moduleStub = { exports: {} };
vm.runInNewContext(fs.readFileSync(appPath, 'utf8'), {
  module: moduleStub,
  exports: moduleStub.exports,
  require(id) {
    if (id === 'homey') return { App: class {} };
    if (id === 'homey-api') return { HomeyAPI: {} };
    if (id === './backup/app') return class {};
    return require(path.join(__dirname, '..', id));
  },
}, { filename: appPath });

const App = moduleStub.exports;

test('watchdog sends only through explicitly enabled channels', async () => {
  const app = Object.create(App.prototype);
  const sent = [];
  app.homey = { notifications: { createNotification: async () => { sent.push('timeline'); } } };
  app.watchdogWarningTrigger = { trigger: async () => { sent.push('flow'); } };

  app.watchdogConfig = { timeline: false, flowTrigger: false, pushUserIds: [] };
  assert.equal(await app.deliverWatchdogMessage('test'), false);
  assert.deepEqual(sent, []);
  await assert.rejects(app.sendWatchdogTestNotification(), /Kein Benachrichtigungskanal/);

  app.watchdogConfig = { timeline: true, flowTrigger: false, pushUserIds: [] };
  assert.equal(await app.deliverWatchdogMessage('test'), true);
  assert.deepEqual(sent, ['timeline']);

  app.watchdogConfig = { timeline: false, flowTrigger: true, pushUserIds: [] };
  assert.equal(await app.deliverWatchdogMessage('test'), true);
  assert.deepEqual(sent, ['timeline', 'flow']);
});

test('direct push addresses only selected users using the shared write client', async () => {
  const app = Object.create(App.prototype);
  const calls = [];
  app.watchdogConfig = { timeline: false, flowTrigger: false, pushUserIds: ['selected-user'] };
  app.notificationUsers = async () => [{ id: 'selected-user', name: 'Selected' }, { id: 'other-user', name: 'Other' }];
  app.getWriteClient = () => ({ flow: {
    getFlowCardAction: async ({ id }) => { assert.equal(id, 'homey:manager:mobile:push_text'); },
    runFlowCardAction: async args => { calls.push(args); },
  } });
  assert.equal(await app.deliverWatchdogMessage('test'), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].args.user.id, 'selected-user');
  assert.equal(calls[0].args.text, 'test');
});

test('recipient selection requires an authenticated key and a real Homey user', async () => {
  const app = Object.create(App.prototype);
  app.watchdogConfig = { timeline: true };
  await assert.rejects(app.updateWatchdogConfig({ pushUserIds: ['selected-user'] }), /Homey API Key/);
  assert.deepEqual(app.watchdogConfig, { timeline: true });
  app.writeClient = {};
  app.notificationUsers = async () => [{ id: 'selected-user', name: 'Selected' }];
  await assert.rejects(app.updateWatchdogConfig({ pushUserIds: ['missing-user'] }), /nicht verfügbar/);
});

test('failed pushes are retried without repeating successful channels', async () => {
  const app = Object.create(App.prototype);
  const settings = new Map();
  const calls = { timeline: 0, first: 0, second: 0 };
  app.homey = {
    settings: { get: key => settings.get(key), set: async (key, value) => { settings.set(key, JSON.parse(JSON.stringify(value))); } },
    notifications: { createNotification: async () => { calls.timeline += 1; } },
  };
  app.watchdogConfig = { timeline: true, flowTrigger: false, pushUserIds: ['first-user', 'second-user'] };
  app.notificationUsers = async () => [{ id: 'first-user', name: 'First' }, { id: 'second-user', name: 'Second' }];
  app.getWriteClient = () => ({ flow: {
    getFlowCardAction: async () => ({}),
    runFlowCardAction: async ({ args }) => {
      if (args.user.id === 'first-user') calls.first += 1;
      else { calls.second += 1; throw new Error('synthetic delivery failure'); }
    },
  } });
  app.ensureApi = async () => ({
    call: async () => ({ sensor: { id: 'sensor', name: 'Synthetic sensor', capabilities: ['measure_battery'], lastSeenAt: new Date(Date.now() - 48 * 3600000).toISOString() } }),
    zones: { getZones: async () => ({}) },
  });
  // A fixed fingerprint represents the same outstanding warning on both checks.
  const api = await app.ensureApi();
  const devices = await api.call();
  api.call = async () => devices;
  app.ensureApi = async () => api;
  assert.equal((await app.performBatteryWatchdog('test')).ok, false);
  assert.deepEqual(calls, { timeline: 1, first: 1, second: 1 });
  assert.equal((await app.performBatteryWatchdog('test')).ok, false);
  assert.deepEqual(calls, { timeline: 1, first: 1, second: 2 });
});

test('read-only live preview never saves state, notifies or triggers Flow cards', async () => {
  const app = Object.create(App.prototype);
  const legacy = { schema: 1, devices: { sensor: { fingerprint: 'unknown', notifiedAt: 1 } } };
  app.homey = { app: { manifest: { version: '0.6.0' } }, settings: {
    get: key => key === 'battery_watchdog_state_v1' ? legacy : undefined,
    set: () => { throw Error('Preview must not write settings'); },
  }, notifications: { createNotification: () => { throw Error('Preview must not notify'); } } };
  app.watchdogWarningTrigger = { trigger: () => { throw Error('Preview must not run Flow'); } };
  app.watchdogConfig = { timeline: true, flowTrigger: true, pushUserIds: ['u'] };
  app.ensureApi = async () => ({ call: async () => ({ sensor: { id: 'sensor', class: 'remote', capabilities: ['measure_battery'], capabilitiesObj: { measure_battery: { value: 1 } } } }), zones: { getZones: async () => ({}) } });
  const result = await app.previewBatteryWatchdog();
  assert.equal(result.notificationMode, 'disabled');
  assert.equal(result.assessments[0].category, 'BATTERIE_KRITISCH');
  assert.equal(legacy.devices.sensor.fingerprint, 'unknown');
});

test('new runtime keeps legacy suppression state untouched for rollback', async () => {
  const app = Object.create(App.prototype);
  const legacy = { schema: 1, devices: { sensor: { fingerprint: 'unknown', notifiedAt: 1 } } };
  const settings = new Map([['battery_watchdog_state_v1', legacy]]);
  app.homey = { settings: { get: key => settings.get(key), set: (key, value) => { settings.set(key, value); } } };
  app.watchdogConfig = { timeline: false };
  app.ensureApi = async () => ({ call: async () => ({ sensor: { id: 'sensor', capabilities: ['measure_battery'], capabilitiesObj: { measure_battery: { value: 80 } } } }), zones: { getZones: async () => ({}) } });
  await app.performBatteryWatchdog('test');
  assert.strictEqual(settings.get('battery_watchdog_state_v1'), legacy);
  assert.equal(settings.get('battery_watchdog_state_v2').schema, 2);
});

test('disabling a route during a running watchdog stops later batches without marking them delivered', async () => {
  const app = Object.create(App.prototype), settings = new Map(), sent = [];
  app.watchdogConfig = { timeline: true, flowTrigger: true, pushUserIds: [] };
  app.homey = { settings: { get: key => settings.get(key), set: (key, value) => settings.set(key, structuredClone(value)) },
    notifications: { createNotification: async () => {
      sent.push('timeline'); app.watchdogConfig = { timeline: false, flowTrigger: false, pushUserIds: [] };
    } } };
  app.watchdogWarningTrigger = { trigger: async () => { sent.push('flow'); } };
  const devices = Object.fromEntries(['one','two','three'].map(id => [id, { id, name: 'Synthetic ' + id,
    capabilities: ['measure_battery'], capabilitiesObj: { measure_battery: { value: 1 } } }]));
  app.ensureApi = async () => ({ call: async () => devices, zones: { getZones: async () => ({}) } });
  await app.performBatteryWatchdog('synthetic');
  assert.deepEqual(sent, ['timeline']);
  const state = settings.get('battery_watchdog_state_v2');
  assert.ok(state.devices.one.problems.battery.deliveryTimes.timeline > 0);
  assert.deepEqual(state.devices.three.problems.battery.deliveryTimes, {});
  assert.equal(state.devices.one.problems.battery.deliveryTimes.flow, undefined);
});

test('removing a push recipient during preparation prevents the outgoing action', async () => {
  const app = Object.create(App.prototype), calls = [];
  app.watchdogConfig = { timeline: false, flowTrigger: false, pushUserIds: ['synthetic-recipient'] };
  app.prepareWatchdogPush = async () => {
    app.watchdogConfig.pushUserIds = [];
    return { client: { flow: { runFlowCardAction: async () => calls.push('push') } },
      users: new Map([['synthetic-recipient', {id:'synthetic-recipient'}]]), cardId: 'synthetic' };
  };
  assert.equal(await app.deliverWatchdogRoute('push:synthetic-recipient', 'synthetic'), false);
  assert.deepEqual(calls, []);
});
