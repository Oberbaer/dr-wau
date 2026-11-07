'use strict';
// Optional local benchmark. Separate fresh client processes, synthetic data only.
const http=require('node:http'),cp=require('node:child_process'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const Backup=require('../settings/backup'),Bounded=require('../lib/bounded-json'),Source=require('../lib/flow-source');
const counts={standard:288,advanced:410};
function flow(type,i){
 const n=(i+(type==='advanced'?counts.standard:0)).toString(16);
 const id=n.padStart(8,'0')+'-0000-4000-8000-'+n.padStart(12,'0');
 return {id,name:'Synthetic '+type+' '+i,enabled:i%2===0,...(type==='advanced'?{cards:Object.fromEntries(Array.from({length:24},(_,n)=>['c'+n,{id:'homey:app:synthetic:action',type:'action',x:n*100,y:i%5*100,args:{text:'x'.repeat(800),level:0},outputSuccess:n<23?['c'+(n+1)]:[]}]))}:{actions:[{id:'homey:app:synthetic:action',args:{text:'keep'}}]})};
}
const stable=x=>Array.isArray(x)?x.map(stable):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,stable(x[k])])):x;
async function child(mode,baseUrl){
 const {HomeyAPIV3Local}=require('homey-api');
 const baseline=process.memoryUsage(),rows=[];let peakHeap=baseline.heapUsed,peakRss=baseline.rss;
 const sample=()=>{const m=process.memoryUsage();peakHeap=Math.max(peakHeap,m.heapUsed);peakRss=Math.max(peakRss,m.rss);};
 const interval=setInterval(sample,2);
 try{
  if(mode==='buffered'){
   const api=new HomeyAPIV3Local({token:'synthetic',baseUrl,properties:{id:'synthetic-homey',softwareVersion:'12.4.0'}});
   const opts={$cache:false,$updateCache:false,$timeout:30000};
   const standard=await api.flow.getFlows(opts);sample();const advanced=await api.flow.getAdvancedFlows(opts);sample();
   rows.push(...Backup.buildFlows({},standard,advanced));sample();api.destroy();
  }else{
   const read=await Source.createReader({getLocalUrl:async()=>baseUrl,getOwnerApiToken:async()=>'synthetic'},'synthetic-homey');
   for(const type of ['standard','advanced'])await read(type,async(id,record)=>{
    rows.push(Backup.buildFlows({},type==='standard'?{[id]:record}:{},type==='advanced'?{[id]:record}:{},{owned:true})[0]);
    if(rows.length%25===0){sample();await new Promise(r=>setImmediate(r));}
   });
  }
  const digest=crypto.createHash('sha256');for(const row of rows){digest.update(JSON.stringify(stable(row)));sample();}
  const bytes=Bounded.encode(rows).length;sample();
  console.log(JSON.stringify({mode,flows:rows.length,bytes,digest:digest.digest('hex'),baselineRssMiB:baseline.rss/1048576,peakRssMiB:Math.max(peakRss,process.resourceUsage().maxRSS*1024)/1048576,peakHeapMiB:peakHeap/1048576}));
 }finally{clearInterval(interval);}
}
async function parent(){
 const server=http.createServer((req,res)=>{
  const type=req.url==='/api/manager/flow/flow'?'standard':req.url==='/api/manager/flow/advancedflow'?'advanced':null;
  if(!type){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type','application/json');
  void(async()=>{res.write('{');for(let i=0;i<counts[type];i++){const f=flow(type,i),text=(i?',':'')+JSON.stringify(f.id)+':'+JSON.stringify(f);if(!res.write(text))await new Promise(r=>res.once('drain',r));}res.end('}');})().catch(()=>res.destroy());
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const baseUrl='http://127.0.0.1:'+server.address().port,results=[];
 try{
  for(const mode of ['buffered','streamed']){
   const result=await new Promise((resolve,reject)=>{
    const p=cp.spawn(process.execPath,[__filename,'--child',mode,baseUrl],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';
    p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);p.on('error',reject);p.on('exit',code=>code?reject(Error(err||out)):resolve(JSON.parse(out.trim())));
   });results.push(result);
  }
  assert.equal(results[0].flows,698);assert.equal(results[1].flows,698);assert.equal(results[0].digest,results[1].digest);assert.equal(results[0].bytes,results[1].bytes);
  console.log(JSON.stringify({synthetic:true,liveHomeyCalls:0,results,identicalFlows:true},null,2));
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
}
(process.argv[2]==='--child'?child(process.argv[3],process.argv[4]):parent()).catch(e=>{console.error(e);process.exitCode=1;});
