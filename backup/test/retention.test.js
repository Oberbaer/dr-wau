'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cleanup,settings,timestamp}=require('../lib/retention');

const uuid='12345678-1234-4123-8123-123456789abc';
const name=iso=>'Backup_Center_'+iso.replace(/[:.]/g,'-')+'_'+uuid+'.json';
const current=name('2026-09-24T12:00:00.000Z');
const old=name('2026-07-01T12:00:00.000Z');
const exact=name('2026-07-26T12:00:00.000Z');
const young=name('2026-09-01T12:00:00.000Z');
const entry=(n,extra={})=>({name:n,type:'file',size:100,...extra});
const run=async(items,policy={},options={})=>{
 const deleted=[],logs=[];
 const report=await cleanup({target:{name:'NAS',retentionEnabled:true,retentionDays:60,minimumBackupsToKeep:1,...policy},currentFilename:current,
  list:async()=>items,remove:async item=>{if(options.fail?.includes(item.name))throw Error('secret server detail');deleted.push(item.name);},
  now:()=>Date.parse('2026-09-24T12:00:00.000Z'),log:(message,value)=>logs.push({message,value})});
 return {report,deleted,logs};
};

test('settings default off and require positive integers',()=>{
 assert.deepEqual(settings({}),{retentionEnabled:false,retentionDays:60,minimumBackupsToKeep:3});
 for(const input of [{retentionEnabled:'true'},{retentionDays:0},{retentionDays:1.5},{minimumBackupsToKeep:0},{minimumBackupsToKeep:'bad'}])assert.throws(()=>settings(input));
});
test('strict timestamp accepts only exact real backup names and dates',()=>{
 assert.equal(timestamp(current),Date.parse('2026-09-24T12:00:00.000Z'));
 assert.equal(timestamp('Backup_Center_2026-09-24T12-00-00-000Z.json'),null);
 assert.notEqual(timestamp('Backup_Center_2026-09-24T12-00-00-000Z.json',true),null);
 for(const value of ['my_backup.json','Backup_Center_2026-02-30T12-00-00-000Z_'+uuid+'.json',old+'.partial','x'+old,old+'.tmp',old.replace('.json','.txt')])assert.equal(timestamp(value),null);
});
test('disabled cleanup never lists or deletes',async()=>{
 const report=await cleanup({target:{name:'NAS'},currentFilename:current,list:()=>{throw Error('must not list');},remove:()=>{throw Error('must not delete');}});
 assert.equal(report.enabled,false);
});
test('empty or incomplete listing fails closed',async()=>{
 await assert.rejects(run([]),/absent/);
 await assert.rejects(run([entry(old)]),/absent/);
 await assert.rejects(cleanup({target:{retentionEnabled:true},currentFilename:current,list:async()=>{throw Error('offline');}}),/offline/);
});
test('age boundary, no expired backups and one or multiple expired backups',async()=>{
 let result=await run([entry(current),entry(young),entry(exact)]);assert.deepEqual(result.deleted,[]);
 result=await run([entry(current),entry(young),entry(exact),entry(old)]);assert.deepEqual(result.deleted,[old]);
 result=await run([entry(current),entry(old),entry(name('2026-06-01T12:00:00.000Z'))]);assert.equal(result.deleted.length,2);
 assert.equal(result.report.inspected,3);assert.equal(result.report.valid,3);assert.equal(result.logs.length,1);
});
test('minimum count protects old files and never deletes current',async()=>{
 for(const items of [[entry(current)],[entry(current),entry(old)],[entry(current),entry(old),entry(young)]]){
  const result=await run(items,{minimumBackupsToKeep:3});assert.deepEqual(result.deleted,[]);
 }
 const result=await run([entry(current),entry(young),entry(exact),entry(old),entry(name('2026-06-01T12:00:00.000Z'))],{minimumBackupsToKeep:3});
 assert.equal(result.deleted.length,2);assert(!result.deleted.includes(current));
});
test('unrelated, malformed, temporary and directory entries are ignored',async()=>{
 const invalid=[entry('other.json'),entry('Backup Center old.json'),entry(old+'.partial'),entry(old+'.tmp'),entry('x'+old),entry(old,{type:'directory'}),entry(name('2026-06-01T12:00:00.000Z'),{size:0})];
 const result=await run([entry(current),...invalid]);assert.deepEqual(result.deleted,[]);assert.equal(result.report.valid,1);
});
test('duplicate recognized names abort before deletion',async()=>{await assert.rejects(run([entry(current),entry(old),entry(old)]),/Duplicate/);});
test('individual delete failures preserve minimum count and report filenames without server secrets',async()=>{
 const another=name('2026-06-01T12:00:00.000Z');
 const result=await run([entry(current),entry(old),entry(another)],{}, {fail:[another,old]});
 assert.equal(result.report.errors.length,2);assert.equal(result.deleted.length,0);
 assert.equal(JSON.stringify(result.report).includes('secret'),false);
});
