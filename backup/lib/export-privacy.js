'use strict';

// Match words/camelCase boundaries for PIN, avoiding harmless IDs such as
// polling_interval, spinning and pin_enabled. Other credential names commonly
// occur without separators (APIKEY, accessToken, clientSecret).
function sensitiveKey(key){
  const words=String(key).replace(/([a-z0-9])([A-Z])/g,'$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const compact=words.join('');
  return /password|passwd|passphrase|apikey|token|secret|authorization|credential|privatekey/.test(compact)
    || words.includes('pin') || /^(?:admin|user|security|access|bluelink)pin$/.test(compact);
}
function sensitiveSetting(key,meta){
  if(meta?.sensitive || String(meta?.type).toLowerCase()==='password')return true;
  // A checkbox describing password support/enabling is not a credential value.
  return meta?.type!=='checkbox' && sensitiveKey(key);
}
function cleanUrls(value,onRemoved=()=>{}){
  if(typeof value!=='string')return value;
  return value.replace(/\b(?:https?|ftp|sftp|smb|wss?):\/\/[^\s<>"']+/gi,raw=>{
    try{
      const url=new URL(raw);let removed=0;
      if(url.username||url.password){url.username='';url.password='';removed++;}
      for(const key of [...url.searchParams.keys()])if(sensitiveKey(key)){url.searchParams.delete(key);removed++;}
      if(!removed)return raw;
      onRemoved(removed);return url.toString();
    }catch(_){
      // An invalid URL authority with user-info cannot be retained safely.
      if(/^[a-z]+:\/\/[^/]*@/i.test(raw))throw Error('A URL contains credentials that could not be removed safely.');
      return raw;
    }
  });
}
function cleanTree(value,onRemoved){
  if(typeof value==='string')return cleanUrls(value,onRemoved);
  // The snapshot is already owned by the exporter. Avoid another full copy of
  // the inventory/Flow graph in the constrained Homey heap.
  if(value&&typeof value==='object')for(const key of Object.keys(value))value[key]=cleanTree(value[key],onRemoved);
  return value;
}
function assertSafeFlowArguments(flows){
  const inspect=args=>{
    if(!args||typeof args!=='object')return;
    for(const [key,value] of Object.entries(args)){
      if(sensitiveKey(key)&&value!==null&&value!==''&&value!==undefined&&typeof value!=='boolean'&&typeof value!=='object')
        throw Error('Flow arguments contain recognized credentials. Move them to a secure setting before exporting.');
      if(value&&typeof value==='object')inspect(value);
    }
  };
  for(const flow of flows){
    const cards=flow.type==='advanced'?Object.values(flow.cards||{}):[flow.trigger,...(flow.conditions||[]),...(flow.actions||[])];
    for(const card of cards)inspect(card?.args);
  }
}
module.exports={sensitiveKey,sensitiveSetting,cleanUrls,cleanTree,assertSafeFlowArguments};
