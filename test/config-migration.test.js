'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const m = require('../lib/config-migration');
const { normalizeConfig, notificationRoutes } = require('../lib/battery-watchdog');

function legacy() {
  return { [m.CONFIG]: { enabled: true, timeline: true, flowTrigger: true, pushUserIds: ['synthetic-recipient'],
    checkHours: 8, repeatHours: 48, batteryLowPercent: 19, batteryCriticalPercent: 4,
    deviceProfiles: { 'synthetic-contact': { profile: 'contact', mode: 'manual', warningAfterHours: 72, confirmation: 'confirmed', vacationMode: 'extend', vacationFactor: 3 } },
    ignoredDeviceIds: ['synthetic-ignore'], ignoredZoneIds: ['synthetic-zone'], vacation: { enabled: true, until: '2027-01-01T00:00:00Z' } },
  device_learning_state_v1: { schema: 1, devices: { 'synthetic-contact': { learningModel: 'activity', events: [{ at: 123, source: 'interaction' }], rawEvents: [{ at: 123, source: 'interaction' }], confidence: 'low', activity: { blockCount: 1 } } } },
  finding_annotations_v1: { 'synthetic-finding': { note: 'Expected synthetic downtime', status: 'expected' } },
  battery_watchdog_state_v2: { schema: 2, devices: {} },
  restorePat: 'synthetic-private-value',
  webdavTargets: [{ id: 'synthetic-webdav', name: 'Example', url: 'https://example.invalid/backups', username: 'synthetic-user', password: 'synthetic-password' }],
  networkTargets: [{ id: 'synthetic-network', name: 'Example', type: 'sftp', host: 'example.invalid', username: 'synthetic-user', password: 'synthetic-password', directory: '/backups', domain: 'synthetic-domain' }],
  schedule: { enabled: true, time: '03:00', weekdays: ['1', '3'], targetId: 'synthetic-webdav', notifyUserId: 'synthetic-recipient', lastError: 'private diagnostic' }, language: 'de' };
}
const exported = () => m.createExport(legacy());

test('1.0.0 identity and version carriers agree at the repository root', () => {
  for (const file of ['.homeycompose/app.json', 'app.json', 'package.json', 'package-lock.json']) {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', file)));
    assert.equal(data.version, '1.0.0'); assert.equal(data.id || data.name, m.APP_ID);
    if (data.packages) assert.equal(data.packages[''].version, '1.0.0');
  }
  assert.equal(fs.existsSync(path.join(__dirname, '..', 'Homey_Watchdog')), false);
});
test('valid 0.7.1 export validates and does not mutate its source', () => {
  const source = legacy(), before = structuredClone(source); const file = m.createExport(source);
  assert.equal(m.validate(file), file); assert.deepEqual(source, before);
});
for (const [label, mutate] of [
  ['wrong schema', d => d.schema = 2], ['missing config', d => delete d.settings[m.CONFIG]],
  ['missing metadata', d => delete d.sourceVersion], ['wrong source', d => d.sourceAppId = 'com.example.untrusted'],
  ['wrong legacy version', d => d.sourceVersion = '0.7.0'], ['arbitrary settings', d => d.settings.arbitrary = {}],
  ['wrong config type', d => d.settings[m.CONFIG].pushUserIds = {}],
  ['malformed learning', d => d.settings.device_learning_state_v1.devices['synthetic-contact'].events = [{ at: 'invalid' }]],
  ['secret fields', d => d.settings.networkTargets[0].password = 'synthetic-password'],
  ['URL secrets', d => d.settings.webdavTargets[0].url = 'https://user:pass@example.invalid/?token=synthetic'],
  ['prototype pollution', d => d.settings = JSON.parse('{"__proto__":{},"battery_watchdog_config_v1":{}}')],
]) test(`migration rejects ${label}`, () => { const d = exported(); mutate(d); assert.throws(() => m.planMigration(d), /Invalid Dr. Wau/); });
test('export strips credentials, URL authentication, queries and scheduler diagnostics', () => {
  const source = legacy(); source.webdavTargets[0].url = 'https://synthetic-user:synthetic-password@example.invalid/backups?token=synthetic-query#synthetic-fragment';
  source.device_learning_state_v1.token = 'synthetic-private-value';
  const json = JSON.stringify(m.createExport(source));
  for (const secret of ['synthetic-private-value', 'synthetic-password', 'synthetic-user', 'synthetic-domain', 'synthetic-query', 'synthetic-fragment', 'private diagnostic']) assert.equal(json.includes(secret), false);
});
test('profiles, manual overrides, battery limits and ignored devices/zones survive', () => {
  const plan = m.planMigration(exported()), config = plan.settings[m.CONFIG];
  assert.deepEqual(config.deviceProfiles, normalizeConfig(legacy()[m.CONFIG]).deviceProfiles);
  assert.deepEqual(config.ignoredZoneIds, ['synthetic-zone']); assert.deepEqual(config.ignoredDeviceIds, ['synthetic-ignore']);
  assert.equal(config.checkHours, 8); assert.equal(config.repeatHours, 48); assert.equal(config.batteryLowPercent, 19);
  assert.equal(plan.summary.manualOverrides, 1);
});
test('learning history, findings and suppression state survive byte for byte', () => {
  const source = legacy(), result = m.planMigration(m.createExport(source)).settings;
  for (const key of ['device_learning_state_v1', 'finding_annotations_v1', 'battery_watchdog_state_v2']) assert.deepEqual(result[key], source[key]);
});
test('vacation, recipients and schedule choices are archived while every live channel stays off', () => {
  const plan = m.planMigration(exported()); const c = plan.settings[m.CONFIG], saved = plan.settings[m.SOURCE_SETTING];
  assert.equal(c.enabled, false); assert.deepEqual(notificationRoutes(c), []); assert.equal(c.vacation.enabled, false);
  assert.deepEqual(saved.watchdogConfig.pushUserIds, ['synthetic-recipient']); assert.equal(saved.watchdogConfig.vacation.enabled, true);
  assert.equal(saved.schedule.enabled, true); assert.equal(plan.settings.schedule.enabled, false);
  assert.equal(plan.settings.restorePat, ''); assert.equal(plan.settings.networkTargets[0].password, '');
});
test('failed settings write restores earlier settings, including absent keys', async () => {
  const original = new Map([[m.CONFIG, { enabled: false }]]), settings = new Map(original); let failed = false;
  const adapter = { get: key => settings.get(key), unset: key => settings.delete(key), set(key, value) {
    if (key === 'finding_annotations_v1' && !failed) { failed = true; throw Error('synthetic failure'); } settings.set(key, value);
  } };
  await assert.rejects(m.applyMigration(adapter, m.planMigration(exported())), /previous settings restored/);
  assert.deepEqual(settings, original);
});

function runtime() {
  const module = { exports: {} }, settings = new Map();
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), { module, exports: module.exports, require(id) {
    if (id === 'homey') return { App: class {} };
    if (id === 'homey-api') return {};
    if (id === './backup/app') return class {};
    return require(path.join(__dirname, '..', id));
  } });
  const app = new module.exports();
  app.homey = { settings: { get: key => settings.get(key), set: (key, value) => settings.set(key, value), unset: key => settings.delete(key) }, clearInterval() {}, clearTimeout() {} };
  app.watchdogConfig = normalizeConfig({ timeline: false });
  return { app, settings };
}
test('preview is read-only; explicit matching confirmation is required and stale previews reject', async () => {
  const { app, settings } = runtime(), document = exported();
  const preview = app.previewMigration(document); assert.equal(settings.size, 0);
  await assert.rejects(app.importMigration({ document, previewToken: preview.previewToken }), /explicitly confirm/);
  const edited = structuredClone(document); edited.settings[m.CONFIG].checkHours = 12;
  await assert.rejects(app.importMigration({ document: edited, confirmed: true, previewToken: preview.previewToken }), /explicitly confirm/);
  const result = await app.importMigration({ document, confirmed: true, previewToken: preview.previewToken });
  assert.equal(result.imported, true); assert.deepEqual(notificationRoutes(app.watchdogConfig), []);
  await assert.rejects(app.importMigration({ document, confirmed: true, previewToken: preview.previewToken }), /explicitly confirm/);
});
test('active notification routes block import before any settings write', async () => {
  const { app, settings } = runtime(), document = exported(), preview = app.previewMigration(document);
  app.watchdogConfig.timeline = true;
  await assert.rejects(app.importMigration({ document, confirmed: true, previewToken: preview.previewToken }), /Stop automatic/);
  assert.equal(settings.size, 0);
});
test('new migration endpoints are owner-only', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.homeycompose/app.json')));
  for (const key of ['exportMigration', 'previewMigration', 'importMigration']) { assert.equal(manifest.api[key].public, false); assert.equal(manifest.api[key].role, 'owner'); }
});
test('legacy identity is restricted to migration code, tests and historical documentation', () => {
  const files = ['app.js', 'api.js', '.homeycompose/app.json', 'app.json', 'package.json', 'package-lock.json', 'settings/index.html'];
  for (const file of files) assert.equal(fs.readFileSync(path.join(__dirname, '..', file), 'utf8').includes(m.LEGACY_APP_ID), false, file);
});
