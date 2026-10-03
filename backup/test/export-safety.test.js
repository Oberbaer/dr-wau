'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {fixture,job}=require('./helpers.cjs'),{loadFixture}=require('./export-load.cjs');
const {EXPORT_BYTES}=require('../lib/bounded-json');
const tick=()=>new Promise(r=>setImmediate(r));
for(const count of [10,100,250,500])test(`bounded local backup handles ${count} devices and ${count*2} Flows`,async()=>{
 const f=await loadFixture(count),logs=[];f.app.log=(tag,line)=>logs.push({tag,...JSON.parse(line)});
 const backup=await job(f.app,f.app.startExport());
 assert.equal(backup.stats.devices,count);assert.equal(backup.stats.standardFlows,count);assert.equal(backup.stats.advancedFlows,count);
 assert.equal(f.settingsCalls(),count);assert.equal(f.maxConcurrentSettings(),1);
 for(const d of Object.values(backup.inventory.devices)){
  assert.equal(d.settings.text.length,2048);
  for(const key of ['capabilitiesObj','energy','iconObj','color'])assert.equal(key in d,false);
 }
 assert(logs.some(x=>x.phase==='device-settings'));assert(logs.some(x=>x.phase==='complete'&&x.bytes<EXPORT_BYTES));
 assert(!JSON.stringify(logs).includes('Synthetic'));assert.equal(f.calls.writes.length,0);
 assert.equal(f.app.exportBusy,false);assert.equal(f.app.transfers.items.size,0);
});
for(const source of ['export','getDevices','getDeviceSettingsObj','getAdvancedFlows','betterLogic','publish'])test(`backup ${source} failure is contained and a later job can finish`,async()=>{
 const f=await loadFixture(1),replace=(object,key)=>{const original=object[key];object[key]=async()=>{throw Error('synthetic failure');};return ()=>object[key]=original;};
 let undo;
 if(source==='export')undo=replace(f.app,'exportBackup');
 if(source==='getDevices')undo=replace(f.client.devices,'getDevices');
 if(source==='getDeviceSettingsObj')undo=replace(f.client.devices,'getDeviceSettingsObj');
 if(source==='getAdvancedFlows')undo=replace(f.client.flow,'getAdvancedFlows');
 if(source==='betterLogic')undo=replace(f.app,'getBetterLogicVariables');
 if(source==='publish'){const original=f.app.transfers.publish;f.app.transfers.publish=()=>{throw Error('synthetic failure');};undo=()=>f.app.transfers.publish=original;}
 const handle=f.app.startExport();await tick();const status=f.app.jobs.get(handle.jobId);
 assert.equal(status.status,['export','publish'].includes(source)?'error':'done');
 if(status.status==='done'){assert.equal(f.app.transfers.items.size,1);f.app.transfers.release(status.result.id);}
 f.app.jobs.release(handle.jobId);undo();assert.equal(Boolean(f.app.exportBusy),false);
 const backup=await job(f.app,f.app.startExport());assert.equal(backup.stats.devices,1);
});
test('oversize, cyclic and unavailable Flow snapshots fail safely without retaining transfers',async()=>{
 for(const mode of ['oversize','cycle','no-flows']){
  const f=await fixture('en');
  if(mode==='oversize')f.client.flow.getFlows=async()=>({a:{id:'a',name:'Synthetic',text:'x'.repeat(EXPORT_BYTES+1)}});
  if(mode==='cycle'){const value={id:'a',name:'Synthetic'};value.self=value;f.client.flow.getFlows=async()=>({a:value});}
  if(mode==='no-flows'){f.client.flow.getFlows=async()=>{throw Error('synthetic failure');};f.client.flow.getAdvancedFlows=async()=>{throw Error('synthetic failure');};}
  const {jobId}=f.app.startExport();await tick();assert.equal(f.app.jobs.get(jobId).status,'error');
  assert.equal(f.app.exportBusy,false);assert.equal(f.app.transfers.items.size,0);
 }
});
test('one export at a time and progress reflects sequential API reads',async()=>{
 const f=await fixture('en');let resolve;
 f.client.flow.getFlowFolders=()=>new Promise(r=>resolve=r);
 const h=f.app.startExport();await tick();const second=f.app.startExport();await tick();
 assert.equal(f.app.jobs.get(second.jobId).status,'error');assert.equal(f.app.jobs.get(h.jobId).progress.phase,'reading');
 resolve({});await tick();assert.equal(f.app.jobs.get(h.jobId).status,'done');
});
test('runtime memory warning aborts the job before another manager read',async()=>{
 const f=await fixture('en');let called=false;
 f.client.flow.getFlowFolders=async()=>{f.app.backupMemoryWarning();return {};};
 f.client.flow.getFlows=async()=>{called=true;return {};};
 const {jobId}=f.app.startExport();await tick();assert.equal(f.app.jobs.get(jobId).status,'error');
 assert.equal(called,false);assert.equal(f.app.exportBusy,false);
});
test('Better Logic read uses the API timeout instead of App.get which ignores it',async()=>{
 const f=await fixture('en'),calls=[];
 f.client.call=async args=>{calls.push(args);return [];};
 await f.app.getBetterLogicVariables();assert.equal(calls.length,1);assert.equal(calls[0].$timeout,8000);assert.equal(calls[0].method,'GET');
});
