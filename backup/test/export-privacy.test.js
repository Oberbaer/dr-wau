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

test('PIN, token, secret and credential IDs are excluded across schema types and casing',async()=>{
 const f=await loadFixture(1),ids={pin:'text',adminPin:'number',API_KEY:'text','api-key':'text',accessToken:'textarea',TOKEN:'text',clientSecret:'text',credentials:'text',Authorization:'text',Login:'password'};
 f.devices.d0.settings={text:'keep',polling_interval:12,password_enabled:false,...Object.fromEntries(Object.keys(ids).map(key=>[key,key==='adminPin'?1234:'SYNTHETIC-SECRET-'+key]))};
 f.client.devices.getDeviceSettingsObj=async()=>Object.entries({...ids,text:'text',polling_interval:'number',password_enabled:'checkbox'}).map(([id,type])=>({id,type,value:''}));
 const b=await job(f.app,f.app.startExport());
 assert.deepEqual(b.inventory.devices.d0.settings,{text:'keep',polling_interval:12,password_enabled:false});
 assert(!JSON.stringify(b).includes('SYNTHETIC-SECRET-'));assert(!JSON.stringify(b).includes('1234'));
});

test('credential URLs lose user-info and sensitive query parameters without losing endpoints',async()=>{
 const f=await loadFixture(1);
 f.devices.d0.settings={url:'https://synthetic-user:synthetic-password@example.invalid/path?api_key=SYNTHETIC-TOKEN&mode=normal',text:'Keep this text'};
 f.client.devices.getDeviceSettingsObj=async()=>[{id:'url',type:'text',value:''},{id:'text',type:'text',value:''}];
 const before=structuredClone(f.devices.d0),b=await job(f.app,f.app.startExport());
 assert.equal(b.inventory.devices.d0.settings.url,'https://example.invalid/path?mode=normal');
 assert.equal(b.inventory.devices.d0.settings.text,'Keep this text');assert.deepEqual(f.devices.d0,before);
 assert(b.warnings.some(x=>x.startsWith('urls: 2')));assert(!JSON.stringify(b).includes('SYNTHETIC-TOKEN'));
});

test('clear credentials in standard and Advanced Flow arguments refuse export without rewriting live Flows',async()=>{
 for(const advanced of [false,true]){
  const f=await loadFixture(1),flow={id:'a',name:'Synthetic flow',...(advanced?{cards:{c:{type:'action',args:{clientSecret:'SYNTHETIC-SECRET'}}}}:{actions:[{args:{accessToken:'SYNTHETIC-SECRET'}}]})};
  f.client.flow[advanced?'getAdvancedFlows':'getFlows']=async()=>structuredClone({a:flow});
  await assert.rejects(job(f.app,f.app.startExport()),/Flow arguments contain recognized credentials/);
  assert.equal(f.app.exportBusy,false);assert.equal(f.app.transfers.items.size,0);assert.equal(f.calls.writes.length,0);
  assert.equal(JSON.stringify(flow).includes('SYNTHETIC-SECRET'),true);
 }
});

test('Flow graphs and benign card arguments remain while embedded URL authentication is removed',async()=>{
 const f=await loadFixture(1),flow={id:'a',name:'Synthetic flow',enabled:true,actions:[{id:'synthetic:action',args:{url:'https://synthetic-user:synthetic-password@example.invalid/hook',text:'Ordinary text',delay:5}}]};
 f.client.flow.getFlows=async()=>structuredClone({a:flow});
 const b=await job(f.app,f.app.startExport()),out=b.flows.find(x=>x.type==='standard');
 assert.equal(out.enabled,true);assert.equal(out.actions[0].args.url,'https://example.invalid/hook');
 assert.equal(out.actions[0].args.text,'Ordinary text');assert.equal(out.actions[0].args.delay,5);
 assert.equal(flow.actions[0].args.url,'https://synthetic-user:synthetic-password@example.invalid/hook');
});

test('synthetic selective restore writes ordinary settings and leaves omitted credentials unchanged',async()=>{
 const f=await loadFixture(1),writes=[];
 f.devices.d0.settings={text:'before',level:8,enabled:true,mode:'auto',password:'SYNTHETIC-PASSWORD',pin:1234};
 const schema=[['text','text'],['level','number'],['enabled','checkbox'],['mode','dropdown'],['password','password'],['pin','number']].map(([id,type])=>({id,type,value:''}));
 f.client.devices.getDeviceSettingsObj=async()=>structuredClone(schema);
 f.client.devices.getDevice=async()=>structuredClone(f.devices.d0);
 f.client.devices.setDeviceSettings=async({settings})=>{writes.push(structuredClone(settings));Object.assign(f.devices.d0.settings,settings);};
 f.app.getWriteClient=()=>f.client;
 const b=await job(f.app,f.app.startExport());b.inventory.devices.d0.settings.text='restored';
 const plan=await f.app.buildRestorePlan(b),op=plan.devices.operations.find(x=>x.id==='d0');
 assert.deepEqual([...op.settingChanges],['text']);
 await f.app.restoreBackup(b,true,{devices:['d0']});
 assert.deepEqual(writes,[{text:'restored'}]);assert.equal(f.devices.d0.settings.password,'SYNTHETIC-PASSWORD');assert.equal(f.devices.d0.settings.pin,1234);
});

test('German and English backup notices explain recognition limits and confidential storage',()=>{
 const fs=require('node:fs'),I=require('../settings/i18n');
 for(const lang of ['de','en']){
  I.setLanguage(lang);const message=I.t('Recognized passwords, PINs, tokens and API keys are excluded. Other device and Flow settings may still contain sensitive information. Keep backup files confidential.');
  assert.match(message,lang==='de'?/PINs.*Tokens.*API-Schlüssel/:/PINs.*tokens.*API keys/);
  assert.match(message,lang==='de'?/dennoch sensible.*vertraulich/:/may still contain sensitive.*confidential/);
 }
 for(const file of ['index.html','de.js','i18n.js'])assert.equal(fs.readFileSync(require.resolve('../settings/'+file),'utf8').replace(/\r\n/g,'\n'),fs.readFileSync(require.resolve('../../settings/backup/'+file),'utf8').replace(/\r\n/g,'\n'));
});
