'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {job}=require('./helpers.cjs'),{loadFixture}=require('./export-load.cjs');

test('device export omits password schemas and text credentials while preserving ordinary settings',async()=>{
 const f=await loadFixture(1);
 const settings={text:'retain',level:0,enabled:false,password_enabled:true,mode:'auto',
  login:'synthetic-password',passwd:'synthetic-password-text',APIKey:'synthetic-api-key',access_token:'synthetic-access-token'};
 f.devices.d0.settings=structuredClone(settings);
 f.client.devices.getDeviceSettingsObj=async()=>Object.entries({text:'text',level:'number',enabled:'checkbox',password_enabled:'checkbox',mode:'dropdown',
  login:'password',passwd:'text',APIKey:'text',access_token:'textarea'}).map(([id,type])=>({id,type,value:settings[id]}));
 const before=structuredClone(f.devices.d0),state=structuredClone(f.state);
 const backup=await job(f.app,f.app.startExport()),d=backup.inventory.devices.d0;
 assert.deepEqual(d.settings,{text:'retain',level:0,enabled:false,password_enabled:true,mode:'auto'});
 assert.deepEqual(Object.keys(d.settingTypes).sort(),Object.keys(d.settings).sort());
 const encoded=JSON.stringify(backup);
 for(const value of ['synthetic-password','synthetic-password-text','synthetic-api-key','synthetic-access-token'])assert(!encoded.includes(value));
 assert(backup.warnings.includes('device-settings: 4 credential settings were excluded.'));
 assert.deepEqual(f.devices.d0,before);assert.deepEqual(f.state,state);assert.equal(f.calls.writes.length,0);
});

test('credential-only devices remain in inventory without a settings payload',async()=>{
 const f=await loadFixture(1);f.devices.d0.settings={password:'synthetic-password'};
 f.client.devices.getDeviceSettingsObj=async()=>[{id:'password',type:'password',value:''}];
 const backup=await job(f.app,f.app.startExport()),d=backup.inventory.devices.d0;
 assert.equal(backup.stats.devices,1);assert.equal(d.id,'d0');assert.equal(d.settings,undefined);assert.equal(d.settingTypes,undefined);
 assert.equal(f.app.transfers.items.size,0);assert.equal(f.app.jobs.items.size,0);assert.equal(f.app.exportBusy,false);
});
