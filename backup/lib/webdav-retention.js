'use strict';
const {SaxesParser}=require('saxes');
const {timestamp}=require('./retention');

function parseMultistatus(xml,folderUrl) {
 const folder=new URL(folderUrl.endsWith('/')?folderUrl:folderUrl+'/');
 const results=[];
 const parser=new SaxesParser({xmlns:true});
 const stack=[];
 let response=null,field=null,content='',rootSeen=false;
 const dav=node=>node.uri==='DAV:';
 parser.on('doctype',()=>{throw Error('WebDAV DTD is unsupported.');});
 parser.on('opentag',node=>{
  stack.push(node);
  if(stack.length===1){if(!dav(node)||node.local!=='multistatus')throw Error('Invalid WebDAV multistatus.');rootSeen=true;}
  if(dav(node)&&node.local==='response'&&stack.length===2)response={};
  if(response && dav(node)){
   const parent=stack.at(-2),grandparent=stack.at(-3);
   const directHref=node.local==='href'&&stack.length===3;
   const property=['getcontentlength','getetag'].includes(node.local)&&dav(parent)&&parent.local==='prop'&&dav(grandparent)&&grandparent.local==='propstat';
   const status=node.local==='status'&&dav(parent)&&parent.local==='propstat';
   if(directHref||property||status){field=node.local;content='';}
  }
  if(response && dav(node) && node.local==='collection')response.collection=true;
 });
 parser.on('text',value=>{if(field)content+=value;});
 parser.on('closetag',node=>{
  if(response && field===node.local && dav(node)){if(response[field]!==undefined)throw Error('Duplicate WebDAV property.');response[field]=content.trim();field=null;}
  if(dav(node)&&node.local==='response'&&stack.length===2){
   if(response.href && !response.collection && response.getcontentlength && (!response.status || /\b200\b/.test(response.status))){
    const url=new URL(response.href,folder);
    const encoded=url.pathname.slice(folder.pathname.length);
    if(url.origin===folder.origin && url.search==='' && url.hash==='' && url.pathname.startsWith(folder.pathname) && encoded && !encoded.includes('/')){
     const name=decodeURIComponent(encoded);
     if(Number.isSafeInteger(Number(response.getcontentlength)))results.push({name,type:'file',size:Number(response.getcontentlength),etag:response.getetag||null});
    }
   }
   response=null;
  }
  stack.pop();
 });
 parser.write(xml).close();
 if(!rootSeen)throw Error('Missing WebDAV multistatus.');
 return results;
}

function webdavAdapter(target,request,authHeaders,currentFilename) {
 const folder=target.url.endsWith('/')?target.url:target.url+'/';
 const folderUrl=new URL(folder);
 if(folderUrl.search || folderUrl.hash)throw Error('WebDAV retention requires a folder URL without a query or fragment.');
 const headers=authHeaders(target);
 const strongEtag=value=>typeof value==='string' && /^"[\x21\x23-\x7e]{1,200}"$/.test(value);
 const fileUrl=name=>new URL(encodeURIComponent(name),folder).toString();
 const propfind=async(url,depth)=>{
  const response=await request(url,{method:'PROPFIND',headers:{...headers,Depth:String(depth)},timeoutMs:30000});
  if(response.status!==207 || response.truncated)throw Object.assign(Error('WebDAV directory listing failed.'),{code:response.truncated?'LIST_TOO_LARGE':'HTTP_'+response.status});
  return parseMultistatus(response.body,folder);
 };
 return {
  async list(){return propfind(folder,1);},
  async remove(entry){
   if(timestamp(entry.name,true)===null || entry.name===currentFilename || entry.type!=='file' || !strongEtag(entry.etag))throw Error('Unsafe WebDAV entry or missing strong ETag.');
   const fresh=(await propfind(fileUrl(entry.name),0)).filter(item=>item.name===entry.name);
   if(fresh.length!==1 || fresh[0].size!==entry.size || (entry.etag && fresh[0].etag!==entry.etag))throw Error('WebDAV file changed before deletion.');
   const response=await request(fileUrl(entry.name),{method:'DELETE',headers:{...headers,...(entry.etag?{'If-Match':entry.etag}:{})},timeoutMs:30000});
   if(response.status<200 || response.status>=300)throw Object.assign(Error('WebDAV deletion failed.'),{code:'HTTP_'+response.status});
  }
 };
}

module.exports={parseMultistatus,webdavAdapter};
