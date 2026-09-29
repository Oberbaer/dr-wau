'use strict';
const {parentPort,workerData}=require('node:worker_threads');
const {createHash,randomUUID}=require('node:crypto');
const path=require('node:path').posix;
const {timestamp}=require('./retention');
async function transfer({target:t,filename,body,operation,entry}){
 let hostMismatch=false,client,stage='connect';
 const temporary=path.join(t.directory,'.homey-'+randomUUID()+'.partial');
 const destination=filename?path.join(t.directory,filename):null;
 try {
  let put,rename,remove,removeExact,list,inspect;
  if(t.type==='sftp'){
   const Sftp=require('ssh2-sftp-client');client=new Sftp();
   await client.connect({host:t.host,port:t.port,username:t.username,password:t.password,readyTimeout:t.timeoutMs,
    hostVerifier:key=>{const configured=t.fingerprint.trim();const actual=configured.startsWith('SHA1:')?'SHA1:'+createHash('sha1').update(key).digest('hex').match(/../g).join(':'):'SHA256:'+createHash('sha256').update(key).digest('base64').replace(/=+$/,'');hostMismatch=actual.toLowerCase()!==configured.replace(/=+$/,'').toLowerCase();return !hostMismatch;}});
   if(await client.exists(t.directory)!=='d')throw Error('directory');
   put=(p,b)=>client.put(b,p,{flags:'wx'});rename=(a,b)=>client.rename(a,b);remove=p=>client.delete(p,true);removeExact=p=>client.delete(p);
   list=async()=> (await client.list(t.directory)).map(item=>({name:item.name,type:item.type==='-'?'file':'other',size:item.size}));
   inspect=async name=>{const info=await client.lstat(path.join(t.directory,name));return {type:info.isFile&&!info.isSymbolicLink?'file':'other',size:info.size};};
  }else if(t.type==='ftp'){
   stage='ftp-client';
   const ftp=require('basic-ftp');
   const {Readable}=require('node:stream');
   client=new ftp.Client(t.timeoutMs);
   client.ftp.verbose=false;
   stage='ftp-connect';
   await client.access({host:t.host,port:t.port,user:t.username,password:t.password,secure:false});
   stage='ftp-folder';
   await client.cd(t.directory||'/');
   put=async(p,b)=>{
    const remote=path.basename(p);
    await client.uploadFrom(Readable.from([Buffer.from(b)]),remote);
   };
   rename=(a,b)=>client.rename(path.basename(a),path.basename(b));
   remove=p=>client.remove(path.basename(p),true);removeExact=p=>client.remove(path.basename(p));
   list=async()=> (await client.list()).map(item=>({name:item.name,type:item.isFile?'file':'other',size:item.size}));
   inspect=async name=>{const item=(await client.list()).filter(x=>x.name===name);if(item.length!==1)throw Error('file changed');return {type:item[0].isFile?'file':'other',size:item[0].size};};
  }else{
   stage='smb-client';
   const {Client}=require('node-smb2');client=new Client(t.host,{port:t.port,connectTimeout:t.timeoutMs,requestTimeout:t.timeoutMs});
   client.on('error',()=>{});
   stage='smb-authenticate';
   const session=await client.authenticate({domain:t.domain,username:t.username,password:t.password,forceNtlmVersion:'v2'});
   stage='smb-connect-share';
   const tree=await session.connectTree(t.share);
   stage='smb-list-folder';
   await tree.readDirectory(t.directory||'/');
   put=(p,b)=>tree.createFile(p,b);rename=(a,b)=>tree.renameFile(a,b);remove=p=>tree.removeFile(p);removeExact=remove;
   // Some SMB servers return direct children with a leading "./" even for a root listing.
   list=async()=> (await tree.readDirectory(t.directory||'/')).map(item=>({name:typeof item.filename==='string'&&item.filename.startsWith('./')?item.filename.slice(2):item.filename,type:item.type==='File'&&!item.fileAttributes?.includes('ReparsePoint')?'file':'other',size:Number(item.fileSize),fileId:item.fileId}));
   inspect=async name=>{const items=(await list()).filter(x=>x.name===name);if(items.length!==1)throw Error('file changed');return items[0];};
  }
  if(operation==='retention-list') {stage='retention-list';return {ok:true,entries:await list()};}
  if(operation==='retention-delete') {
   stage='retention-check';
   if(!entry || timestamp(entry.name)===null || entry.name===filename || entry.type!=='file' || !Number.isSafeInteger(entry.size) || entry.size<=0)throw Error('unsafe retention entry');
   const current=await inspect(entry.name);
   if(current.type!=='file' || current.size!==entry.size || (entry.fileId && current.fileId!==entry.fileId))throw Error('file changed');
   stage='retention-delete';await removeExact(path.join(t.directory,entry.name));return {ok:true};
  }
  try{
   // The connection test proves write, rename and delete access using only its own random probe.
   stage='write-probe';
   await put(temporary,body?Buffer.from(body):Buffer.from('Homey connection test\n'));
   stage='rename-probe';
   await rename(temporary,destination||temporary+'.probe');
   if(!filename){stage='delete-probe';await remove(temporary+'.probe');}
  }catch(e){await remove(temporary).catch(()=>{});throw e;}
  return {ok:true};
 }catch(e){
  const message=String(e&&e.message||''),name=String(e&&e.name||''),codeValue=e&&e.code,statusValue=e&&e.status;
  const raw=String(codeValue||statusValue||message||'');
  const combined=[name,codeValue,statusValue,message].filter(v=>v!==undefined&&v!==null&&String(v)).join(' ');
  // Diagnostic text is allow-listed and truncated. Credentials/target data are never included.
  const safe=v=>String(v??'').replace(/[\r\n\t]/g,' ').replace(/[^A-Za-z0-9_ .:()-]/g,'?').slice(0,180);
  const diagnostic=[name&&('name='+safe(name)),codeValue!==undefined&&('code='+safe(codeValue)),statusValue!==undefined&&('status='+safe(statusValue)),message&&('message='+safe(message))].filter(Boolean).join('; ');
  const code=hostMismatch?'HOST_KEY':/auth|logon|password|STATUS_LOGON_FAILURE|3221225581|3221225485/i.test(combined)?'AUTH':/ECONN|ENOTFOUND|EHOST|ETIMEDOUT|STATUS_BAD_NETWORK_NAME/i.test(combined)?'CONNECTION':'IO';
  let detail='';
  if(code==='CONNECTION'&&/STATUS_BAD_NETWORK_NAME/i.test(combined)) detail='The SMB share name was not found. Enter only the share name.';
  else if(t.type==='smb') detail='SMB failed during '+stage+'.'+(diagnostic?' Diagnostic: '+diagnostic+'.':'');
  else if(t.type==='ftp') detail='FTP failed during '+stage+'.'+(diagnostic?' Diagnostic: '+diagnostic+'.':'');
  return {ok:false,code,detail};
 }finally{
  // Parent applies a hard wall-clock limit and closes sockets on every outcome.
  if(client){
   const close=t.type==='sftp'?()=>client.end():()=>client.close();
   await Promise.race([Promise.resolve().then(close).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,500))]);
  }
 }
}
if(parentPort)transfer(workerData).then(result=>parentPort.postMessage(result),()=>parentPort.postMessage({ok:false,code:'IO'}));
module.exports={transfer};
