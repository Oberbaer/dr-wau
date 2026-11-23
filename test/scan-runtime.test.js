'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const moduleStub={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../app.js'),'utf8'),{module:moduleStub,exports:moduleStub.exports,require(id){
  if(id==='homey')return {App:class{}};
  if(id==='homey-api')return {};
  if(id==='./backup/app')return class{};
  return require(path.join(__dirname,'..',id));
}});
test('incomplete Advanced Flow reads are bounded and retain partial coverage on failure',async()=>{
 const app=new moduleStub.exports(),settings=new Map(),empty=async()=>({});
 let active=0,maximum=0;const calls=[];
 app.findingAnnotations={};app.watchdogConfig={ignoredZoneIds:[]};
 app.homey={settings:{set:(key,value)=>settings.set(key,value)}};
 app.ensureApi=async()=>({flow:{getFlows:empty,getFlowFolders:empty,
  getAdvancedFlows:async()=>Object.fromEntries(Array.from({length:10},(_,i)=>['synthetic-'+i,{id:'synthetic-'+i,name:'Synthetic '+i}])),
  getAdvancedFlow:async({id})=>{calls.push(id);active++;maximum=Math.max(maximum,active);await new Promise(r=>setImmediate(r));active--;
   if(id==='synthetic-4')throw Error('Synthetic unavailable detail');return {id,name:id,cards:{}};}},
  devices:{getDevices:empty},logic:{getVariables:empty},apps:{getApps:empty},zones:{getZones:empty}});
 const report=await app.runScan('synthetic');
 assert.equal(maximum,3);assert.equal(calls.length,10);assert.equal(new Set(calls).size,10);
 assert.equal(report.coverage['advancedFlow:synthetic-4'].ok,false);
 assert(report.findings.some(f=>f.code==='advanced_not_readable'));
 assert.equal(settings.get('latest_report_v1'),report);
 assert.equal(app.scanPromise,null);
});
