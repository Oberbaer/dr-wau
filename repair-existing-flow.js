'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { loadAthomApi } = require('./homey-api');
const { buildWatchdogScript } = require('./flow-template');

(async () => {
  const id = process.env.WATCHDOG_FLOW_ID;
  if (!id) throw new Error('Set WATCHDOG_FLOW_ID to the reviewed existing Flow ID');
  const AthomApi = loadAthomApi();
  const h = await new AthomApi().getActiveHomey();
  const original = JSON.parse(JSON.stringify(await h.flow.getAdvancedFlow({ id })));
  const entries = Object.entries(original.cards);
  const match = entries.filter(([, c]) => c.type === 'action' && c.args?.code?.includes('CODEX_BATTERY_WATCHDOG_'));
  if (match.length !== 1) throw new Error('Expected one watchdog script');
  const [cardId, card] = match[0];
  const state = Object.values(await h.logic.getVariables()).find(v => v.name === 'CODEX_BATTERY_WATCHDOG_ALERT_STATE');
  if (!state) throw new Error('State variable missing');
  let pushRecipients = [];
  if (process.env.WATCHDOG_PUSH_USER_IDS) {
    const ids = process.env.WATCHDOG_PUSH_USER_IDS.split(',');
    const users = Object.values(await h.users.getUsers());
    pushRecipients = ids.map(id => {
      const user = users.find(u => u.id === id);
      if (!user) throw new Error('Requested push recipient no longer exists');
      return { id: user.id, name: user.name };
    });
  } else {
    // Preserve the explicit recipient configuration during future repairs.
    const matchConfig = card.args.code.match(/\)\(Homey, (.*)\);$/s);
    if (matchConfig) pushRecipients = JSON.parse(matchConfig[1]).pushRecipients || [];
  }
  const code = buildWatchdogScript({ stateVariableId: state.id, pushRecipients });
  const prefix = `const messages = []; let saved;
const preview = {call: options => Homey.call(options),logic:{getVariables:()=>Homey.logic.getVariables(),updateVariable:async options=>{saved=JSON.parse(options.variable.value);}},flow:{runFlowCardAction:async options=>{messages.push(options.args.text);return {};}}};
`;
  const previewCode = prefix + code.replace('return (', 'const summary = await (').replace(')(Homey,', ')(preview,') + '\nreturn JSON.stringify({summary,messages,state:saved});';
  const result = await h.flow.runFlowCardAction({ id: card.id, args: { code: previewCode } });
  if (result.error) throw new Error(JSON.stringify(result.error));
  const preview = JSON.parse(result.returnTokens.string);
  console.log(JSON.stringify({ name: original.name, enabled: original.enabled, preview }, null, 2));
  if (!process.argv.includes('--apply') || !process.argv.includes('--approve')) return;
  const backupDir = path.join(__dirname, 'artifacts');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, 'backup-before-repair-' + Date.now() + '.json');
  fs.writeFileSync(backupPath, JSON.stringify({ flow: original, state }, null, 2), { flag: 'wx' });
  const current = JSON.parse(JSON.stringify(await h.flow.getAdvancedFlow({ id })));
  assert.deepEqual(current, original, 'Flow changed during review; aborting');
  const cards = JSON.parse(JSON.stringify(original.cards));
  cards[cardId].args.code = code;
  for (const c of Object.values(cards)) {
    if (c.type === 'note' && String(c.value).includes('BATTERIE-WATCHDOG')) {
      c.value = 'BATTERIE-WATCHDOG\nAlle 6 h prüfen; Warnung ab 24 h ohne Lebenszeichen, Wiederholung nach 6 h. Fehlender Zeitstempel wird als Überwachung unklar gemeldet. Homey-Timeline: alle betroffenen Geräte; Versandstatus erst nach erfolgreicher Aktion. Kein separater Push-Empfänger konfiguriert.';
    }
  }
  for (const c of Object.values(cards)) {
    if (c.type === 'note' && String(c.value).includes('BATTERIE-WATCHDOG') && pushRecipients.length) {
      c.value = c.value.replace('Kein separater Push-Empfänger konfiguriert.', 'Handy-Push zusätzlich an: ' + pushRecipients.map(u => u.name).join(', ') + '.');
    }
  }
  await h.flow.updateAdvancedFlow({ id, advancedflow: { name: original.name, folder: original.folder, enabled: original.enabled, cards } });
  const verified = await h.flow.getAdvancedFlow({ id });
  assert.equal(verified.enabled, original.enabled);
  assert.equal(verified.folder, original.folder);
  assert.equal(verified.name, original.name);
  assert.equal(verified.cards[cardId].args.code, code);
  assert.equal(verified.broken, false);
  console.log(JSON.stringify({ updated: id, enabled: verified.enabled, broken: verified.broken, backupPath }));
})().catch(e => { console.error(e.message); process.exitCode = 1; });
