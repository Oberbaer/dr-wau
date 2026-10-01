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
    learning: kind === 'learned' ? { confidence: 'high', confidenceReason: 'sufficient_high', rawEventCount: 26, uniqueEventCount: 24,
      intervalCount: 23, usedIntervalCount: 21, excludedIntervalCount: 2, reportCount: 24, sampleCount: 21,
      observationSpanDays: 10, observationDays: 8, medianIntervalHours: 4, p90IntervalHours: 7, p95IntervalHours: 10, source: 'insights', lastLearnedAt: '2026-09-30T10:00:00Z' } : null },
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
  window.document.querySelector('#device-list button').click();
  const expert = window.document.getElementById('detail-expert').textContent;
  assert.match(expert, /Rohereignisse.*26/);
  assert.match(expert, /Eindeutige Meldungen: 24/);
  assert.match(expert, /Gebildete Intervalle: 23/);
  assert.match(expert, /Für Statistik verwendet: 21/);
  assert.match(expert, /Ausreißer ausgeschlossen: 2/);
  assert.match(expert, /Begründung: Mindestens 20 Intervalle/);
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

test('activity details show calculated usage and keep recommendation separate from manual 24h', async () => {
  const { learnDevice, profileDecision } = require('../lib/device-learning');
  const start = Date.parse('2026-09-01T00:00:00Z'), at = start + (13 * 24 + 20) * 3600000;
  const events = Array.from({ length: 14 }, (_, day) => [8, 8 + 2 / 60, 16.5, 16.5 + 5 / 60]
    .map(hour => ({ at: start + (day * 24 + hour) * 3600000, source: 'interaction' }))).flat();
  const device = { id: 'synthetic-contact', name: 'Synthetic Contact', capabilities: ['alarm_contact'], capabilitiesObj: { alarm_contact: { getable: true } } };
  const config = { enabled: false, deviceProfiles: { [device.id]: { mode: 'manual', warningAfterHours: 24, confirmation: 'confirmed' } } };
  const learning = learnDevice({}, events, at, false, 'activity');
  const detail = assessment('learned');
  detail.profile = profileDecision(device, config, learning, at);
  const overview = { config, batteryDevices: [{ ...device, assessment: detail }], zones: [], users: [] };
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://my.homey.app/' });
  dom.window.eval(script);
  dom.window.onHomeyReady({ ready() {}, api(method, route, body, done) { done(null, route === '/report' ? { report: null } : overview); } });
  await new Promise(resolve => setImmediate(resolve));
  dom.window.document.querySelector('#device-list button').click();
  const simple = dom.window.document.getElementById('detail-simple').textContent;
  assert.match(simple, /mehrmals täglich Aktivität/);
  assert.match(simple, /Dr.-Wau-Empfehlung: 30 h/);
  assert.match(simple, /Deine Einstellung: 24 h/);
  assert.doesNotMatch(simple, /alle .*Stunden/);
  const expert = dom.window.document.getElementById('detail-expert').textContent;
  for (const expected of ['Lernmodell: Aktivitätsbasiert', 'Kontakt-Rohereignisse: 56', 'Aktivitätsblöcke (30 Minuten): 28',
    'Beobachtungstage (UTC, einschließlich stiller Tage): 14', 'Tage mit Aktivität: 14', 'Aktive Tage: 100.0 %',
    'Median Ruhephase:', 'Automatische Empfehlung: 30 h', 'Deine Einstellung: 24 h']) assert.ok(expert.includes(expected), expected);
  dom.window.close();
});
