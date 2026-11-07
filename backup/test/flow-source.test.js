'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {FlowEntries,readCollection,createReader,READ_FAILED}=require('../lib/flow-source');
const Backup=require('../settings/backup'),{fixture,job}=require('./helpers.cjs');

async function parse(text,size=7,maxBytes){
 const result=[],parser=new FlowEntries((id,record)=>result.push([id,record]),maxBytes),bytes=Buffer.from(text);
 for(let at=0;at<bytes.length;at+=size)await parser.write(bytes.subarray(at,at+size));
 await parser.finish();return {result,parser};
}
async function server(handler,run){
 const s=http.createServer(handler);await new Promise(r=>s.listen(0,'127.0.0.1',r));
 try{return await run('http://127.0.0.1:'+s.address().port);}finally{await new Promise(r=>s.close(r));}
}

test('streamed Flow records preserve Unicode, nested graphs, escaped quotes and brace-like text at every byte boundary',async()=>{
 const expected={a:{id:'a',name:'Tatzen 🐶',cards:{c:{args:{text:'a } ] \\ " line\n next',n:0,on:false},outputSuccess:['d']}}},b:{id:'b',name:'Übersicht',cards:{}}};
 for(const size of [1,2,3,7,64,10000]){
  const {result}=await parse(JSON.stringify(expected),size);assert.deepEqual(Object.fromEntries(result),expected);
 }
 assert.deepEqual((await parse(' \n { } \t')).result,[]);
});

test('truncated, duplicate, invalid UTF-8 and malformed collection responses cannot become successful snapshots',async()=>{
 for(const text of ['','null','[]','{"a":null}','{"a":[]}','{"a":{', '{"a":{"name":"bad"}', '{"a":{},}', '{"a":{},"a":{}}','{"a":{},"\\u0061":{}}', '{"a":{"x":[}}}','{} trailing','{"a":{}}{}','{"a":{"x":NaN}}'])
  await assert.rejects(parse(text),new RegExp(READ_FAILED.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 const p=new FlowEntries(()=>{});await assert.rejects(p.write(Buffer.from([123,34,97,34,58,123,34,120,34,58,34,255,34,125,125])),/Flow data/);
});

test('streaming enforces response size, nesting limits and cancellation without buffering all records',async()=>{
 await assert.rejects(parse('{"a":{"name":"large"}}',3,10),/safe runtime size/);
 await assert.rejects(parse('{"a":'+('{"x":'.repeat(66))+'0'+('}'.repeat(66))+'}'),/Flow data/);
 const records=Object.fromEntries(Array.from({length:410},(_,i)=>[i.toString(16),{id:i.toString(16),name:'Synthetic '+i,text:'x'.repeat(2048)}]));
 const {result,parser}=await parse(JSON.stringify(records),1024);
 assert.equal(result.length,410);assert(parser.maxBufferedChars<2200,'only one record text may be retained');
 let count=0;const cancelled=new FlowEntries(()=>{if(++count===2)throw Error('synthetic memory warning');});
 await assert.rejects(cancelled.write(Buffer.from('{"a":{},"b":{},"c":{}}')),/synthetic memory warning/);assert.equal(count,2);
});

test('local reader sends only authenticated GET, never follows redirects and never exposes remote errors',async()=>{
 const requests=[];
 await server((req,res)=>{requests.push({method:req.method,url:req.url,auth:req.headers.authorization});res.setHeader('Content-Type','application/json');res.end('{"a":{"id":"a","name":"Synthetic"}}');},async baseUrl=>{
  const rows=[],api={getLocalUrl:async()=>baseUrl,getOwnerApiToken:async()=>'synthetic-owner-token'};
  const read=await createReader(api);await read('advanced',(id,flow)=>rows.push(flow));
  assert.equal(rows.length,1);assert.deepEqual(requests,[{method:'GET',url:'/api/manager/flow/advancedflow',auth:'Bearer synthetic-owner-token'}]);
 });
 for(const status of [302,401,500])await server((req,res)=>{res.writeHead(status,{'Content-Type':'application/json',Location:'http://example.invalid'});res.end('private remote token');},async baseUrl=>{
  await assert.rejects(readCollection({baseUrl,token:'synthetic',type:'advanced',onEntry(){}}),e=>e.message===READ_FAILED);
 });
});

test('HTTP reader rejects aborted bodies, wrong content types, excessive length and stalled responses',async()=>{
 for(const mode of ['abort','html','length','stall'])await server((req,res)=>{
  if(mode==='stall')return;
  res.setHeader('Content-Type',mode==='html'?'text/html':'application/json');
  if(mode==='length'){res.setHeader('Content-Length','100000000');return res.end('{}');}
  if(mode==='abort'){res.write('{"a":{');return setImmediate(()=>res.destroy());}
  res.end('{}');
 },async baseUrl=>{await assert.rejects(readCollection({baseUrl,token:'synthetic',type:'advanced',onEntry(){},timeoutMs:150}));});
});

test('streamed export keeps complete Flow cards, layout and arguments without a second deep clone',()=>{
 const record={id:'a',name:'Synthetic',enabled:false,folder:'f',cards:{c:{type:'action',id:'homey:app:synthetic:test',x:123,y:456,args:{text:'keep',value:0},outputSuccess:['d']},d:{type:'delay',duration:5}},triggers:{c:true}};
 const original=structuredClone(record),folders={f:{name:'Folder'}};
 const expected=Backup.buildFlows(folders,{}, {a:record})[0];
 const owned=Backup.buildFlows(folders,{}, {a:record},{owned:true})[0];
 assert.equal(owned,record);assert.equal(owned.cards,record.cards);assert.deepEqual(owned,expected);
 assert.deepEqual(original.cards,owned.cards);
});

test('a truncated streamed collection fails the app job and releases partial Flow data, then a new local job can finish',async()=>{
 const f=await fixture('en');
 f.app.createBackupFlowReader=async()=>async(type,onEntry)=>{
  if(type==='standard')await onEntry('a',{id:'a',name:'Synthetic',actions:[]});
  else throw Error(READ_FAILED);
 };
 await assert.rejects(job(f.app,f.app.startExport()),/Flow data could not be read/);
 assert.equal(f.app.exportBusy,false);assert.equal(f.app.transfers.items.size,0);assert.equal(f.calls.writes.length,0);
 f.app.createBackupFlowReader=async()=>async(type,onEntry)=>{if(type==='standard')await onEntry('a',{id:'a',name:'Synthetic',actions:[]});};
 const backup=await job(f.app,f.app.startExport());assert.equal(backup.stats.standardFlows,1);
});

test('legacy Homey card IDs retain SDK-compatible owner prefixes in streamed records',async()=>{
 const data={a:{id:'a',name:'Synthetic',broken:true,trigger:{id:'event',uri:'homey:app:synthetic'},actions:[{id:'run',uri:'homey:app:synthetic'}]},b:{id:'b',name:'Synthetic advanced',broken:true,cards:{c:{type:'action',id:'run',ownerUri:'homey:app:synthetic'},d:{type:'delay',id:'delay',duration:5}}}};
 await server((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url.endsWith('advancedflow')?{b:data.b}:{a:data.a}));},async baseUrl=>{
  const read=await createReader({getLocalUrl:async()=>baseUrl,getOwnerApiToken:async()=>'synthetic'},'synthetic-homey',1),rows=[];
  await read('standard',(_,flow)=>rows.push(flow));await read('advanced',(_,flow)=>rows.push(flow));
  assert.equal(rows[0].trigger.id,'homey:app:synthetic:event');assert.equal(rows[0].actions[0].id,'homey:app:synthetic:run');assert.equal(rows[0].trigger.uri,undefined);
  assert.equal(rows[1].cards.c.id,'homey:app:synthetic:run');assert.equal(rows[1].cards.d.id,'delay');assert(rows.every(x=>!('broken' in x)));
 });
});

test('complete app export consumes real streamed HTTP records and preserves all synthetic flows',async()=>{
 const advanced=Object.fromEntries(Array.from({length:410},(_,i)=>[i.toString(16),{id:i.toString(16),name:'Synthetic '+i,cards:{c:{id:'synthetic:action',type:'action',x:i,y:12,args:{text:'x'.repeat(1000),value:0},outputSuccess:['d']},d:{type:'delay',duration:5}}}]));
 const standard={a:{id:'a',name:'Synthetic standard',enabled:false,actions:[{id:'synthetic:action',args:{text:'keep'}}]}};
 await server((req,res)=>{res.setHeader('Content-Type','application/json');const data=JSON.stringify(req.url.endsWith('advancedflow')?advanced:standard);for(let i=0;i<data.length;i+=4096)res.write(data.slice(i,i+4096));res.end();},async baseUrl=>{
  const f=await fixture('en');delete f.app.createBackupFlowReader;
  f.app.homey.api.getLocalUrl=async()=>baseUrl;f.app.homey.api.getOwnerApiToken=async()=>'synthetic';
  f.app.homey.platformVersion=2;f.client.id='synthetic-homey';
  const b=await job(f.app,f.app.startExport());assert.equal(b.stats.advancedFlows,410);assert.equal(b.stats.standardFlows,1);
  for(const flow of b.flows.filter(x=>x.type==='advanced'))assert.deepEqual(flow.cards,advanced[flow.id].cards);
  assert.equal(b.flows.find(x=>x.type==='standard').enabled,false);assert.equal(f.app.transfers.items.size,0);assert.equal(f.calls.writes.length,0);
 });
});

test('memory warning is reported distinctly from the serialized backup-size limit',async()=>{
 const f=await fixture('de');
 f.app.createBackupFlowReader=async()=>async(type,onEntry)=>{f.app.backupMemoryWarning();await onEntry('a',{id:'a',name:'Synthetic'});};
 await assert.rejects(job(f.app,f.app.startExport()),/Speicherdruck/);
 assert.equal(f.app.exportBusy,false);assert.equal(f.app.transfers.items.size,0);
});
