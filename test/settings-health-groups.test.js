'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { analyzeSnapshot, applyFindingAnnotations } = require('../lib/analyzer');

const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/i)[1];
const absent = '11111111-1111-4111-8111-111111111111';
const unavailable = '22222222-2222-4222-8222-222222222222';
const sameName = '33333333-3333-4333-8333-333333333333';
const action = id => ({ id: `homey:device:${id}:action` });
const flow = (id, name, enabled, ...actions) => ({ id, name, enabled, trigger: { id: 'synthetic:when' }, actions });
const snapshot = (normalFlows, devices = {}) => ({ normalFlows, devices, generatedAt: '2026-11-22T12:00:00Z' });

async function render(t, report, annotations = []) {
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://my.homey.app/' });
  const { window } = dom;
  t.after(() => dom.window.close());
  Object.defineProperty(window.navigator, 'language', { value: 'de-DE' });
  const calls = [];
  window.eval(script);
  window.onHomeyReady({ ready() {}, api(method, route, _body, done) {
    calls.push({ method, route });
    assert.equal(method, 'GET');
    done(null, route === '/report' ? { report, annotations } : null);
  } });
  await new Promise(resolve => setImmediate(resolve));
  const open = details => { details.open = true; details.dispatchEvent(new window.Event('toggle')); };
  return { window, calls, open, list: window.document.getElementById('findings') };
}

test('health groups one device across flows by identity and keeps every expandable finding', async t => {
  const archive = flow('archive', 'ALT_Rollback', false, action(unavailable), action(absent));
  const critical = flow('critical', 'ALT_Aktiv', true, action(absent));
  const current = [
    critical,
    flow('first', 'Gleicher Flowname', true, ...Array.from({ length: 260 }, () => action(unavailable))),
    flow('second', 'Gleicher Flowname', false, action(unavailable)),
    flow('different-device', 'Anderer Flow', true, action(sameName)),
  ];
  const devices = {
    first: { id: unavailable, name: 'Gleicher Gerätename', available: false },
    second: { id: sameName, name: 'Gleicher Gerätename', available: false },
  };
  const report = applyFindingAnnotations(analyzeSnapshot(snapshot([...current, archive], devices)));
  const withoutArchive = applyFindingAnnotations(analyzeSnapshot(snapshot(current, devices)));
  assert.deepEqual(report.score, withoutArchive.score);
  assert.equal(report.findings.find(f => f.flow?.id === critical.id).effectiveSeverity, 'critical');
  assert(report.findings.filter(f => f.flow?.id === archive.id).every(f => f.effectiveSeverity === 'info'));

  const { list, calls, open } = await render(t, report);
  assert.equal(list.firstElementChild.classList.contains('critical'), true);
  const groups = [...list.querySelectorAll('.cause-group')];
  assert.equal(groups.filter(row => row.querySelector('h3').textContent === 'Gleicher Gerätename').length, 2);
  const grouped = groups.find(row => row.querySelector('.cause-flow-counts')?.textContent === '1 aktive Flows · 2 deaktivierte Flows');
  assert(grouped);
  assert.equal(grouped.querySelector('h3').textContent, 'Gleicher Gerätename');
  const details = grouped.querySelector('.cause-details');
  assert.equal(details.querySelectorAll('article').length, 0);
  open(details);
  assert.deepEqual([...details.querySelectorAll(':scope > details > summary')].map(s => s.textContent), [
    'Gleicher Flowname · Aktiv', 'ALT_Rollback · Deaktiviertes Archiv', 'Gleicher Flowname · Deaktiviert',
  ]);
  for (const group of groups) {
    const inner = group.querySelector('.cause-details');
    open(inner);
    for (const flowDetails of inner.querySelectorAll(':scope > details')) open(flowDetails);
  }
  assert.equal(list.querySelectorAll('article:not(.cause-group)').length, report.findings.length);
  assert(calls.every(call => call.method === 'GET'));
});

test('priority overrides, category filters and older reports keep their individual findings accessible', async t => {
  const device = { id: unavailable, name: 'Sensor', available: false };
  const base = analyzeSnapshot(snapshot([flow('one', 'Erster Flow', true, action(unavailable))], [device]));
  const warning = base.findings.find(f => f.code === 'flow_uses_unavailable_device');
  const annotation = { id: warning.id, priority: 'critical', status: 'expected', note: 'Geprüft' };
  const report = applyFindingAnnotations(base, { [annotation.id]: annotation });
  const older = { ...warning, id: 'legacy', title: 'Alter Einzelbefund', cause: undefined, flow: undefined };
  report.findings.push(older);
  const { list, window, calls, open } = await render(t, report, [annotation]);
  const category = window.document.getElementById('category-filter');
  category.value = 'flows';
  category.dispatchEvent(new window.Event('change'));
  assert.equal(list.querySelectorAll('.cause-group').length, 1);
  assert.match(list.textContent, /Alter Einzelbefund/);
  assert(list.firstElementChild.classList.contains('critical'));
  const groupDetails = list.querySelector('.cause-details');
  assert.match(groupDetails.textContent, /1 Befunde/);
  open(groupDetails);
  const flowDetails = groupDetails.querySelector(':scope > details');
  open(flowDetails);
  const editor = flowDetails.querySelector('article details');
  open(editor);
  assert.equal(editor.querySelector('select').value, 'critical');
  assert.equal(editor.querySelector('textarea').value, 'Geprüft');
  category.value = 'devices';
  category.dispatchEvent(new window.Event('change'));
  assert.doesNotMatch(list.textContent, /Alter Einzelbefund/);
  assert.equal(list.querySelector('.cause-flow-counts'), null);
  assert(calls.every(call => call.method === 'GET'));
});
