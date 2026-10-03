'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { JSDOM } = require('jsdom');
const { createExport, planMigration } = require('../lib/config-migration');
const tick = () => new Promise(resolve => setImmediate(resolve));

test('migration UI binds preview to the selected file and requires explicit replacement confirmation', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../settings/index.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.invalid/' });
  const { window } = dom, byId = id => window.document.getElementById(id), calls = [];
  const document = createExport({ battery_watchdog_config_v1: { timeline: false } });
  const plan = planMigration(document);
  const overview = { config: plan.settings.battery_watchdog_config_v1, batteryDevices: [], zones: [], users: [], status: null };
  window.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
  window.onHomeyReady({ ready() {}, api(method, route, body, done) {
    calls.push({method,route,body});
    if (route === '/report') return done(null, {report:null,annotations:[]});
    if (route === '/watchdog') return done(null, overview);
    if (route === '/migration/preview') return done(null,{summary:plan.summary,previewToken:plan.previewToken});
    if (route === '/migration/import') return done(null,{imported:true,summary:plan.summary});
    done(Error('Unexpected synthetic route'));
  } });
  await tick();
  assert.equal(byId('migration-import').disabled,true);
  assert.equal(calls.some(c=>c.route.startsWith('/migration')),false);
  Object.defineProperty(byId('migration-file'),'files',{configurable:true,value:[{size:100,text:async()=>JSON.stringify(document)}]});
  byId('migration-file').dispatchEvent(new window.Event('change')); await tick();
  byId('migration-preview').click(); await tick();
  assert.match(byId('migration-summary').textContent,/AUS \/ OFF/);
  assert.equal(byId('migration-import').disabled,true);
  byId('migration-confirm').checked=true; byId('migration-confirm').dispatchEvent(new window.Event('change'));
  assert.equal(byId('migration-import').disabled,false);
  // Selecting a file invalidates the old confirmation even if its contents match.
  byId('migration-file').dispatchEvent(new window.Event('change')); await tick();
  assert.equal(byId('migration-import').disabled,true); assert.equal(byId('migration-confirm').checked,false);
  byId('migration-preview').click(); await tick();
  byId('migration-confirm').checked=true; byId('migration-confirm').dispatchEvent(new window.Event('change'));
  byId('migration-import').click(); await tick();
  const writes = calls.filter(c=>c.route==='/migration/import'); assert.equal(writes.length,1);
  assert.equal(writes[0].body.confirmed,true); assert.equal(writes[0].body.previewToken,plan.previewToken);
  assert.match(byId('migration-summary').textContent,/Import abgeschlossen/);
  assert.equal(byId('migration-import').disabled,true);
  dom.window.close();
});
