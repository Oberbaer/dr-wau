'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'../settings/backup');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');

function page(){
  const dom=new JSDOM(read('index.html'),{runScripts:'outside-only',url:'https://example.invalid/settings/backup/'});
  const w=dom.window;
  w.__scrollRequests=0;
  w.HTMLElement.prototype.scrollIntoView=function(){w.__scrollRequests+=1;};
  w.eval(['de.js','i18n.js','backup.js','transfer.js','download.js','ui.js','network.js'].map(read).join('\n')+'\n;window.onHomeyReady=onHomeyReady;window.showScheduleStatus=showScheduleStatus;window.loadRestoreAuth=loadRestoreAuth;');
  return dom;
}

test('German covers canonical backup messages and static controls',()=>{
  const dom=page(),w=dom.window,i=w.BackupI18n;
  i.setLanguage('de-DE');assert.equal(i.getLanguage(),'de');
  for(const english of Object.values(i.dictionaries.en))assert.notEqual(i.dictionaries.de[english],undefined,english);
  i.apply(w.document);
  assert.equal(w.document.documentElement.lang,'de');
  assert.equal(w.document.querySelector('label[for="language"]').textContent,'Sprache');
  assert.equal(w.document.getElementById('saveSchedule').textContent,'Zeitplan speichern');
  assert.equal(w.document.getElementById('planRestore').textContent,'Änderungen auswählen');
  assert.equal(w.document.getElementById('runRestore').textContent,'Wiederherstellung ausführen');
  assert.match(w.document.getElementById('api-key').textContent,/niemals eine Wiederherstellung/);
  assert.equal(w.document.querySelector('option[value="de"]').textContent,'Deutsch');
  // Names and protocol fields must not be translated through the runtime dictionary.
  assert.equal(i.t('Synthetic sensor'), 'Synthetic sensor');
  assert.equal(i.t('homey.flow'),'homey.flow');
  dom.window.close();
});

for(const language of ['de','en','nl'])test(`backup settings load read-only in ${language} and preserve saved configuration`,async()=>{
  const dom=page(),w=dom.window,calls=[];
  const target={id:'synthetic-target',name:'Synthetic NAS',type:'smb',host:'nas.invalid',share:'backups',directory:'',username:'synthetic-user',hasPassword:true,port:445,timeoutMs:30000,retentionEnabled:true,retentionDays:60,minimumBackupsToKeep:3};
  const schedule={enabled:true,time:'03:00',weekdays:['0','1','2','3','4','5','6'],targetId:target.id,notifyUserId:'synthetic-owner',lastRun:'2026-09-28T01:00:00Z',lastStatus:'ok'};
  const responses={'/app-info':{language,version:'0.5.1'},'/network':[target],'/webdav':[], '/schedule':schedule,'/notification-users':[{id:'synthetic-owner',name:'Name'}],'/restore/auth':{configured:false,connected:false}};
  await w.onHomeyReady({ready(){},api(method,route,body,cb){calls.push({method,route,body});cb(null,structuredClone(responses[route]));}});
  await new Promise(resolve=>setImmediate(resolve));
  assert(calls.every(c=>c.method==='GET'));
  assert.equal(w.__scrollRequests,0,'loading must not jump away from the backup overview');
  assert.equal(w.document.getElementById('schedEnabled').checked,true);
  assert.equal(w.document.getElementById('schedTime').value,'03:00');
  assert.equal(w.document.getElementById('schedTarget').value,target.id);
  assert.equal(w.document.getElementById('net-password').value,'');
  assert.equal(w.document.getElementById('net-retentionDays').value,'60');
  assert.equal(w.document.getElementById('schedNotifyUser').selectedOptions[0].textContent,'Name');
  assert.match(w.document.getElementById('backup-summary-schedule').textContent,/03:00/);
  assert(!w.document.getElementById('backup-summary-success').textContent.includes('Loading'));
  if(language==='de'){
    assert.equal(w.document.getElementById('backup-summary-auth').textContent,'Noch nicht eingerichtet');
    assert.match(w.document.getElementById('net-directory-label').textContent,/Freigabe/);
    assert.deepEqual([...w.document.querySelectorAll('#schedWeekdays label')].map(e=>e.textContent),['So','Mo','Di','Mi','Do','Fr','Sa']);
    assert.match(w.document.getElementById('scheduleStatus').textContent,/Letzte erfolgreiche automatische Sicherung/);
    const latest={...schedule,manual:{status:'ok',at:'2026-09-28T12:00:00Z'}};
    w.showScheduleStatus(latest);assert.match(w.document.getElementById('backup-summary-success').textContent,/14:00/);
    await w.loadRestoreAuth();
    assert.equal(w.document.getElementById('backup-summary-auth').textContent,'Noch nicht eingerichtet');
  }
  dom.window.close();
});

test('backup UI and bundled runtime copies stay identical',()=>{
  for(const file of ['index.html','backup.css','de.js','i18n.js','ui.js','network.js','transfer.js']){
    assert.equal(read(file).replace(/\r/g,''),fs.readFileSync(path.resolve(root,'../../backup/settings',file),'utf8').replace(/\r/g,''),file);
  }
});
test('fresh backup settings have no saved private destination defaults',async()=>{
 const dom=page(),w=dom.window;
 const responses={'/app-info':{language:'de',version:'1.0.0'},'/network':[], '/webdav':[], '/schedule':{enabled:false},'/notification-users':[], '/restore/auth':{configured:false,connected:false}};
 await w.onHomeyReady({ready(){},api(method,route,body,cb){cb(null,structuredClone(responses[route]));}});
 await new Promise(r=>setImmediate(r));
 for(const field of ['host','share','username','password','domain'])assert.equal(w.document.getElementById('net-'+field).value,'');
 dom.window.close();
});
test('manual export shows device progress and a controlled job error, then unlocks the UI',async()=>{
 const dom=page(),w=dom.window,calls=[];let polls=0;
 const responses={'/app-info':{language:'de',version:'1.0.0'},'/network':[], '/webdav':[], '/schedule':{enabled:false},'/notification-users':[], '/restore/auth':{configured:false,connected:false}};
 await w.onHomeyReady({ready(){},api(method,route,body,cb){calls.push({method,route});
  if(route==='/export/prepare')return cb(null,{jobId:'synthetic-job'});
  if(route==='/job')return cb(null,++polls===1?{status:'running',progress:{phase:'devices',processed:36,total:114}}:{status:'error',error:'Backup data could not be serialized safely.'});
  cb(null,structuredClone(responses[route]));
 }});
 const operation=w.document.getElementById('fetch').onclick();await new Promise(r=>setImmediate(r));
 assert.match(w.document.getElementById('status').textContent,/Geräteeinstellungen.*36 \/ 114/);
 assert.equal(w.document.getElementById('fetch').disabled,true);await operation;
 assert.match(w.document.getElementById('status').textContent,/Backup konnte nicht erstellt werden/);
 assert.match(w.document.getElementById('status').textContent,/kontrollierten Jobfehler/);
 assert.equal(w.document.getElementById('fetch').disabled,false);assert.equal(w.document.getElementById('save').disabled,true);
 assert.equal(calls.filter(c=>c.route==='/export/prepare').length,1);
 assert(!calls.some(c=>/network\/backup|webdav\/upload|restore\/run/.test(c.route)));
 dom.window.close();
});
