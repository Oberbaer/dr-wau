'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const watchdog = require('../watchdog-runtime');
const config = { stateVariableId: 'state', staleHours: 24, repeatHours: 6, pushRecipients: [{id:'a',name:'A'},{id:'b',name:'B'},{id:'c',name:'C'}] };
function fixture(fail) {
  const calls = []; let writes = 0;
  const Homey = {
    call: async () => [{id:'sensor',name:'Sensor',capabilities:['measure_battery'],lastSeenAt:new Date(Date.now()-48*3600000).toISOString()}],
    logic: {getVariables:async()=>[{id:'state',type:'string',value:'{}'}],updateVariable:async()=>{writes++;}},
    flow: {runFlowCardAction:async c=>{calls.push(c);if(fail && c.args.user?.id==='b') throw new Error('push failed');return {};}}
  };
  return {Homey,calls,writes:()=>writes};
}
test('timeline and all three selected recipients receive the warning', async()=>{
  const f=fixture(false); await watchdog(f.Homey,config);
  assert.equal(f.calls[0].id,'homey:manager:notifications:create_notification');
  assert.deepEqual(f.calls.slice(1).map(c=>c.args.user.id),['a','b','c']);
  assert.ok(f.calls.slice(1).every(c=>c.id==='homey:manager:mobile:push_text'));
  assert.ok(f.writes()>0);
});
test('failed push prevents marking the batch delivered', async()=>{
  const f=fixture(true); await assert.rejects(watchdog(f.Homey,config),/push failed/);
  assert.equal(f.writes(),0);
});
