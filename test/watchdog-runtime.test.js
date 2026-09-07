'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const watchdog = require('../watchdog-runtime');
const config = { stateVariableId: 'state', staleHours: 24, repeatHours: 6 };
function fixture(ages, fail = false) {
  let value = '{}';
  const messages = [];
  const devices = ages.map((h, i) => ({ id: String(i), name: 'Sensor ' + i, capabilities: ['measure_battery'], lastSeenAt: h === null ? null : new Date(Date.now() - h * 3600000).toISOString(), capabilitiesObj: { measure_battery: { value: null } } }));
  const Homey = {
    call: async () => devices,
    logic: { getVariables: async () => [{ id: 'state', type: 'string', value }], updateVariable: async ({ variable }) => { value = variable.value; } },
    flow: { runFlowCardAction: async ({ args }) => { if (fail) throw new Error('delivery failed'); messages.push(args.text); return {}; } },
  };
  return { Homey, messages, state: () => JSON.parse(value), set: x => { value = JSON.stringify(x); } };
}
test('fresh excluded; all ten stale devices included; immediate repeat suppressed', async () => {
  const f = fixture([1, ...Array(10).fill(192)]);
  await watchdog(f.Homey, config);
  assert.equal(f.messages.length, 5);
  for (let i = 1; i <= 10; i++) assert.ok(f.messages.some(x => x.includes('Sensor ' + i + ':')));
  await watchdog(f.Homey, config);
  assert.equal(f.messages.length, 5);
});
test('delivery failure does not mark devices notified', async () => {
  const f = fixture([192], true);
  await assert.rejects(watchdog(f.Homey, config), /delivery failed/);
  assert.deepEqual(f.state(), {});
});
test('six-hour repeat and recovery', async () => {
  const f = fixture([48]);
  await watchdog(f.Homey, config);
  const state = f.state(); state.devices['0'].notifiedAt -= 6 * 3600000; f.set(state);
  await watchdog(f.Homey, config); assert.equal(f.messages.length, 2);
  f.Homey.call = async () => [];
  await watchdog(f.Homey, config); assert.deepEqual(f.state().devices, {});
});
test('unknown timestamp explicit; legacy suppression ignored; null battery not zero', async () => {
  const f = fixture([null]); f.set({ '0': { fingerprint: 'never', notifiedAt: Date.now() } });
  await watchdog(f.Homey, config);
  assert.match(f.messages[0], /Überwachung unklar/);
  assert.match(f.messages[0], /Batteriewert unbekannt/);
});
