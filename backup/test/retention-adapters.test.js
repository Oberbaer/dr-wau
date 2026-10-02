'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {webdavAdapter,parseMultistatus}=require('../lib/webdav-retention');
const realRequire=createRequire(require.resolve('../lib/network-worker'));
const filename='Backup_Center_2026-07-01T12-00-00-000Z_12345678-1234-4123-8123-123456789abc.json';
const current='Backup_Center_2026-09-24T12-00-00-000Z_12345678-1234-4123-8123-123456789abc.json';
function worker(mock){const sandbox={module:{exports:{}},Buffer,setTimeout,require:name=>name==='node:worker_threads'?{parentPort:null}:mock[name]||realRequire(name)};vm.runInNewContext(fs.readFileSync(require.resolve('../lib/network-worker'),'utf8'),sandbox);return sandbox.module.exports.transfer;}

test('SMB retention lists files and rechecks identity before removing a single file',async()=>{
 const calls=[];let changed=false;
 const tree={readDirectory:async()=>[{filename:'./'+filename,fileSize:100n,fileId:changed?'changed':'same',type:'File',fileAttributes:[]}],removeFile:async path=>calls.push(path)};
 class Client{on(){}async authenticate(){return {connectTree:async()=>tree};}async close(){}}
 const transfer=worker({'node-smb2':{Client}}),target={type:'smb',host:'nas',port:445,username:'u',password:'p',share:'backup',directory:'Homey',timeoutMs:30000};
 const list=await transfer({target,operation:'retention-list'});assert.equal(list.ok,true);assert.equal(list.entries[0].name,filename);
 const entry=list.entries[0];assert.equal((await transfer({target,filename:current,operation:'retention-delete',entry})).ok,true);assert.deepEqual(calls,['Homey/'+filename]);
 changed=true;assert.equal((await transfer({target,filename:current,operation:'retention-delete',entry})).ok,false);assert.equal(calls.length,1);
 assert.equal((await transfer({target,filename:current,operation:'retention-delete',entry:{...entry,name:current}})).ok,false);
 for(const name of ['../'+filename,'./'+filename,'./../'+filename,'././'+filename,'#recycle/'+filename]){
  assert.equal((await transfer({target,filename:current,operation:'retention-delete',entry:{...entry,name}})).ok,false);
 }
 assert.equal((await transfer({target,filename:current,operation:'retention-delete',entry:{...entry,type:'other'}})).ok,false);
 assert.deepEqual(calls,['Homey/'+filename]);
});
test('FTP retention only removes a listed regular file with unchanged size',async()=>{
 const calls=[];let size=100;
 class Client{constructor(){this.ftp={};}async access(){}async cd(){}async list(){return [{name:filename,isFile:true,size}];}async remove(name){calls.push(name);}close(){}}
 const transfer=worker({'basic-ftp':{Client}}),target={type:'ftp',host:'nas',port:21,username:'u',password:'p',directory:'/backups',timeoutMs:30000};
 const list=await transfer({target,operation:'retention-list'}),entry=list.entries[0];
 assert.equal((await transfer({target,filename:current,operation:'retention-delete',entry})).ok,true);assert.deepEqual(calls,[filename]);
 size=101;assert.equal((await transfer({target,filename:current,operation:'retention-delete',entry})).ok,false);assert.equal(calls.length,1);
});
test('SFTP retention rejects symbolic links and only deletes rechecked regular files',async()=>{
 const calls=[];let link=false;
 class Sftp{async connect(){}async exists(){return 'd';}async list(){return [{name:filename,type:link?'l':'-',size:100}];}async lstat(){return {isFile:!link,isSymbolicLink:link,size:100};}async delete(path){calls.push(path);}async end(){}}
 const transfer=worker({'ssh2-sftp-client':Sftp}),target={type:'sftp',host:'nas',port:22,username:'u',password:'p',directory:'/backups',timeoutMs:30000,fingerprint:'SHA256:'+'A'.repeat(43)};
 const entry=(await transfer({target,operation:'retention-list'})).entries[0];
 assert.equal((await transfer({target,filename:current,operation:'retention-delete',entry})).ok,true);assert.deepEqual(calls,['/backups/'+filename]);
 link=true;assert.equal((await transfer({target,filename:current,operation:'retention-delete',entry})).ok,false);assert.equal(calls.length,1);
});
const xml=(items)=>'<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">'+items.map(({href,size=100,etag='"a"',collection=false})=>`<d:response><d:href>${href}</d:href><d:propstat><d:prop>${collection?'<d:resourcetype><d:collection/></d:resourcetype>':'<d:resourcetype/>'}<d:getcontentlength>${size}</d:getcontentlength><d:getetag>${etag}</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat></d:response>`).join('')+'</d:multistatus>';
test('WebDAV parser accepts only immediate child files and excludes collections',()=>{
 const folder='https://nas.invalid/backups/';const entries=parseMultistatus(xml([{href:'/backups/'+filename},{href:'/backups/nested/'+filename},{href:'/other/'+filename},{href:'/backups/sub',collection:true}]),folder);
 assert.deepEqual(entries.map(e=>e.name),[filename]);
});
test('WebDAV parser rejects non-multistatus XML and DTDs',()=>{
 assert.throws(()=>parseMultistatus('<x><d:response xmlns:d="DAV:"/></x>','https://nas.invalid/backups/'));
 assert.throws(()=>parseMultistatus('<!DOCTYPE x><d:multistatus xmlns:d="DAV:"/>','https://nas.invalid/backups/'));
});
test('WebDAV deletion rechecks ETag and sends conditional DELETE',async()=>{
 const calls=[],folder='https://nas.invalid/backups/';let etag='"a"';
 const request=async(url,options)=>{calls.push([url,options]);return options.method==='DELETE'?{status:204}:{status:207,body:xml([{href:'/backups/'+filename,etag}])};};
 const adapter=webdavAdapter({url:folder},request,()=>({Authorization:'Basic redacted'}));
 const [entry]=await adapter.list();await adapter.remove(entry);
 assert.equal(calls.at(-1)[1].headers['If-Match'],'"a"');assert.equal(calls.at(-1)[1].method,'DELETE');
 etag='"b"';await assert.rejects(adapter.remove(entry),/changed/);assert.equal(calls.filter(call=>call[1].method==='DELETE').length,1);
 await assert.rejects(adapter.remove({...entry,etag:null}),/missing strong ETag/);
 await assert.rejects(adapter.remove({...entry,etag:'W/"a"'}),/missing strong ETag/);
});
