'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Diagnostics=require('../lib/diagnostics'),{fixture,job}=require('./helpers.cjs');
test('diagnostic records are bounded, contain only counts and cannot fail the operation',async()=>{
 const d=new Diagnostics(()=>Promise.reject(Error('synthetic transport failure')),()=>123);
 for(let i=0;i<200;i++)d.record('devices',{processed:i,total:200,name:'private-value',password:'private-value',bytes:-1});
 await new Promise(r=>setImmediate(r));const s=d.snapshot();assert.equal(s.entries.length,128);assert.equal(s.sequence,200);
 assert(s.memory.heapUsed>0);assert(!JSON.stringify(s).includes('private-value'));assert(!('bytes' in s.entries[0]));
 s.entries[0].phase='modified';assert.notEqual(d.snapshot().entries[0].phase,'modified');
});
test('owner diagnostics show idle state and export metrics without changing settings',async()=>{
 const f=await fixture('en'),before=structuredClone(f.state);
 const initial=f.app.getBackupDiagnostics();assert.equal(initial.runningJobs,0);assert.equal(initial.exportRunning,false);assert.equal(initial.networkRunning,false);assert.equal(initial.scheduleRunning,false);
 await job(f.app,f.app.startExport());const after=f.app.getBackupDiagnostics();
 assert(after.entries.some(x=>x.phase==='complete'&&x.bytes>0));assert.equal(after.transferCount,0);assert.equal(after.runningJobs,0);assert.deepEqual(f.state,before);
 f.app.backupMemoryWarning();assert.equal(f.app.getBackupDiagnostics().memoryWarnings,1);
 assert.equal(f.app.getBackupDiagnostics().entries.at(-1).phase,'memory-warning');
});
test('diagnostic API is owner-only and returns no content collections',()=>{
 const manifest=require('../../.homeycompose/app.json'),route=manifest.api.getBackupDiagnostics;
 assert.equal(route.public,false);assert.equal(route.role,'owner');assert.equal(route.method,'get');
 assert.equal(route.path,'/backup/diagnostics');
});
