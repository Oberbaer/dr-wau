'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { normalizeConfig } = require('../lib/battery-watchdog');
const { isVacationActive } = require('../lib/vacation');
const HOUR = 3600000, DAY = 24 * HOUR, NOW = Date.parse('2026-10-01T12:00:00Z');
const CONFIG = 'battery_watchdog_config_v1';
const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function runtime(settings = new Map(), initialNow = NOW, failBackup = false) {
  if (!settings.has(CONFIG)) settings.set(CONFIG, normalizeConfig({ timeline: false, flowTrigger: false, pushUserIds: [] }));
  let now = initialNow, nextId = 0;
  const timers = new Map(), delays = [], errors = [];
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const module = { exports: {} };
  const api = { call: async () => ({}), zones: { getZones: async () => ({}) } };
  vm.runInNewContext(source, { module, exports: module.exports, Date: ClockDate, require(id) {
    if (id === 'homey') return { App: class {} };
    if (id === 'homey-api') return { HomeyAPI: { createAppAPI: async () => api } };
    if (id === './backup/app') return class { async onInit() { if (failBackup) throw Error('Synthetic startup failure'); } onUninit() {} };
    return require(path.join(__dirname, '..', id));
  } });
  const App = module.exports;
  const app = new App();
  const card = { registerRunListener() {}, trigger: async () => {} };
  app.homey = { settings: { get: key => settings.get(key), set: (key, value) => settings.set(key, structuredClone(value)) },
    flow: { getActionCard: () => card, getConditionCard: () => card, getTriggerCard: () => card },
    setTimeout(callback, delay) { delays.push(delay); const id = ++nextId; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout: id => timers.delete(id),
    setInterval() { throw Error('Automatic watchdog must remain disabled in test'); }, clearInterval() {},
  };
  app.log = () => {};
  app.error = (...args) => errors.push(args);
  return { app, settings, timers, delays, errors, get now() { return now; },
    async advanceTo(target) {
      for (;;) {
        const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
        if (!next || next[1].at > target) break;
        timers.delete(next[0]); now = next[1].at; await next[1].callback();
      }
      now = target;
    },
    jumpTo(target) { now = target; },
  };
}

for (const [label, duration] of [['1 hour', HOUR], ['3 days', 3 * DAY], ['30 days', 30 * DAY], ['90 days', 90 * DAY]]) {
  test(`vacation lasts ${label} and uses only safe short timers`, async () => {
    const r = runtime(); await r.app.onInit();
    const until = new Date(NOW + duration).toISOString();
    await r.app.setVacation(true, until);
    assert.equal(r.settings.get(CONFIG).vacation.until, until);
    await r.advanceTo(NOW + Math.min(duration - 1, 2147483647));
    assert.equal(r.app.watchdogConfig.vacation.enabled, true);
    assert.equal(isVacationActive(r.settings.get(CONFIG).vacation, r.now), true);
    await r.advanceTo(NOW + duration);
    assert.equal(r.settings.get(CONFIG).vacation.enabled, false);
    assert.equal(r.settings.get(CONFIG).vacation.until, null);
    assert.ok(r.delays.every(delay => delay > 0 && delay <= HOUR));
    assert.equal(r.timers.size, 0);
    assert.deepEqual(r.errors, []);
  });
}

test('persisted long vacation survives app/runtime restart and expires at the original absolute deadline', async () => {
  const first = runtime(); await first.app.onInit();
  const until = new Date(NOW + 90 * DAY).toISOString();
  await first.app.setVacation(true, until);
  first.app.onUninit(); assert.equal(first.timers.size, 0);
  const restarted = runtime(first.settings, NOW + 10 * DAY); await restarted.app.onInit();
  assert.equal(restarted.app.watchdogConfig.vacation.until, until);
  await restarted.advanceTo(NOW + 30 * DAY);
  assert.equal(restarted.app.watchdogConfig.vacation.enabled, true);
  await restarted.advanceTo(NOW + 90 * DAY);
  assert.equal(restarted.settings.get(CONFIG).vacation.enabled, false);
});

test('expired persisted vacation is cleared and saved during app initialization', async () => {
  const config = normalizeConfig({ vacation: { enabled: true, until: new Date(NOW - HOUR).toISOString() },
    ignoredZoneIds: ['synthetic-zone'], batteryLowPercent: 17 });
  const r = runtime(new Map([[CONFIG, config]])); await r.app.onInit();
  assert.deepEqual(r.settings.get(CONFIG).vacation, { enabled: false, until: null });
  assert.deepEqual(r.settings.get(CONFIG).ignoredZoneIds, ['synthetic-zone']);
  assert.equal(r.settings.get(CONFIG).batteryLowPercent, 17);
  assert.equal(r.timers.size, 0);
});

test('manual vacation off cancels expiry without changing other stored configuration', async () => {
  const config = normalizeConfig({ vacation: { enabled: false }, ignoredDeviceIds: ['synthetic-exclusion'],
    timeline: false, flowTrigger: false, pushUserIds: [] });
  const r = runtime(new Map([[CONFIG, config]])); await r.app.onInit();
  await r.app.setVacation(true, new Date(NOW + 30 * DAY).toISOString());
  await r.app.setVacation(false);
  assert.equal(r.timers.size, 0);
  await r.advanceTo(NOW + 90 * DAY);
  assert.deepEqual(r.settings.get(CONFIG), config);
});

test('watchdog run checks an overdue vacation even when timer delivery was delayed', async () => {
  const r = runtime(); await r.app.onInit();
  await r.app.setVacation(true, new Date(NOW + 30 * DAY).toISOString());
  r.jumpTo(NOW + 31 * DAY);
  const result = await r.app.performBatteryWatchdog('synthetic-test');
  assert.equal(result.ok, true);
  assert.equal(result.pendingNotifications, 0);
  assert.equal(r.settings.get(CONFIG).vacation.enabled, false);
  assert.equal(r.timers.size, 0);
});

test('an already queued obsolete timer cannot interfere with a newly extended vacation', async () => {
  const r = runtime(); await r.app.onInit();
  await r.app.setVacation(true, new Date(NOW + HOUR).toISOString());
  const oldCallback = [...r.timers.values()][0].callback;
  await r.app.setVacation(false);
  const until = new Date(NOW + 90 * DAY).toISOString();
  await r.app.setVacation(true, until);
  const currentTimer = r.app.vacationTimer;
  await oldCallback();
  assert.equal(r.app.vacationTimer, currentTimer);
  assert.equal(r.timers.size, 1);
  assert.equal(r.settings.get(CONFIG).vacation.until, until);
});

test('queued timer callbacks cannot rearm expiry after app uninitialization', async () => {
  const r = runtime(); await r.app.onInit();
  await r.app.setVacation(true, new Date(NOW + 90 * DAY).toISOString());
  const callback = [...r.timers.values()][0].callback;
  r.app.onUninit(); await callback();
  assert.equal(r.timers.size, 0);
  assert.equal(r.settings.get(CONFIG).vacation.enabled, true);
});
test('failed backup initialization cancels already scheduled vacation resources', async () => {
  const config = normalizeConfig({ timeline: false, vacation: { enabled: true, until: new Date(NOW + 30 * DAY).toISOString() } });
  const r = runtime(new Map([[CONFIG, config]]), NOW, true);
  await assert.rejects(r.app.onInit(), /Synthetic startup failure/);
  assert.equal(r.timers.size, 0);
  assert.equal(r.app.vacationExpiryStopped, true);
  assert.equal(r.settings.get(CONFIG).vacation.enabled, true);
});
