'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/i)[1];
const assessment = (kind, problem = null) => ({ category: problem ? 'UNGEWOEHNLICH_STILL' : 'LEBENSZEICHEN_OK',
  heartbeat: { profile: { kind: 'contact', label: 'Kontakt' }, sourceLabel: 'lastSeenAt', ageHours: 2, reason: 'Synthetic', nativeTimestampAvailable: true, problem },
  battery: { level: 80, stale: false, problem: null }, profile: { deviceClass: 'contact', mode: kind === 'learned' ? 'learned' : 'assumed', profileStatus: kind, confirmation: 'unconfirmed', warningAfterHours: 24,
    learning: kind === 'learned' ? { confidence: 'high', reportCount: 24, sampleCount: 23, observationDays: 8, medianIntervalHours: 4, p90IntervalHours: 7, p95IntervalHours: 10, source: 'insights', lastLearnedAt: '2026-09-30T10:00:00Z' } : null },
  vacation: { warningAfterHours: 24 } });

test('device watch reveals filters, details, manual override and vacation without cluttering the start page', async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://my.homey.app/' });
  const { window } = dom;
  let overview = { config: { enabled: true, timeline: true, flowTrigger: false, pushUserIds: [], checkHours: 6, staleHours: 24, repeatHours: 24,
    ignoredDeviceIds: [], ignoredZoneIds: [], deviceProfiles: {}, vacation: { enabled: false, until: null } },
  batteryDevices: [{ id: 'one', name: 'Synthetic Contact', zone: 'kitchen', assessment: assessment('learned', { message: 'Ungewöhnlich still' }) },
    { id: 'two', name: 'Synthetic Remote', zone: 'hall', assessment: assessment('assumed') }],
  zones: [{ id: 'kitchen', name: 'Kitchen' }, { id: 'hall', name: 'Hallway' }], users: [], status: null };
  const writes = [];
  window.eval(script);
  window.onHomeyReady({ ready() {}, api(method, route, body, done) {
    if (method === 'GET') return done(null, route === '/report' ? { report: null } : overview);
    writes.push({ route, body });
    if (route === '/watchdog/profile') {
      overview = { ...overview, config: { ...overview.config, deviceProfiles: { ...overview.config.deviceProfiles, [body.id]: body.changes } } };
      return done(null, overview);
    }
    if (route === '/watchdog/vacation') { overview.config.vacation = body; return done(null, { vacation: body }); }
    done(new Error(route));
  } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(window.document.querySelectorAll('#overview-important').length, 1);
  assert.equal(window.document.querySelectorAll('#device-list button').length, 2);
  assert.equal(window.document.querySelector('#watchdog-advanced').open, false);
  window.document.getElementById('device-profile-filter').value = 'unconfirmed';
  window.document.getElementById('device-profile-filter').dispatchEvent(new window.Event('change'));
  assert.equal(window.document.querySelectorAll('#device-list button').length, 2);
  window.document.getElementById('device-search').value = 'remote';
  window.document.getElementById('device-search').dispatchEvent(new window.Event('input'));
  assert.equal(window.document.querySelectorAll('#device-list button').length, 1);
  window.document.querySelector('#device-list button').click();
  assert.equal(window.document.getElementById('device-detail').hidden, false);
  assert.match(window.document.getElementById('detail-expert').textContent, /Konfidenz/);
  window.document.getElementById('detail-confirm').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.at(-1).body.changes.confirmation, 'confirmed');
  window.document.getElementById('detail-threshold').value = '48';
  window.document.getElementById('detail-save').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.at(-1).route, '/watchdog/profile');
  assert.equal(writes.at(-1).body.changes.warningAfterHours, 48);
  assert.equal(writes.at(-1).body.changes.mode, 'manual');
  window.document.getElementById('detail-auto').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.at(-1).body.changes.reset, true);
  window.document.getElementById('vacation-enabled').checked = true;
  window.document.getElementById('vacation-save').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.at(-1).route, '/watchdog/vacation');
  assert.equal(writes.at(-1).body.enabled, true);
  dom.window.close();
});
