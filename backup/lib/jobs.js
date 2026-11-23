'use strict';
const {randomUUID}=require('node:crypto');
function message(error){
  try { return String(error?.message || error || 'The operation failed.'); }
  catch (_) { return 'The operation failed.'; }
}
class Jobs {
  constructor(now=Date.now){this.now=now;this.items=new Map();}
  prune(){for(const [id,x] of this.items)if(x.status!=='running' && x.expires<this.now())this.items.delete(id);}
  start(fn){
    this.prune();if(this.items.size>=8)throw Error('Too many pending operations. Close other backups and try again.');
    const id=randomUUID(), item={status:'running',expires:this.now()+30*60*1000};this.items.set(id,item);
    const progress=(phase,processed=0,total=0)=>{
      if(item.status==='running' && ['reading','flows','devices','serializing'].includes(phase))
        item.progress={phase,processed:Math.max(0,Number(processed)||0),total:Math.max(0,Number(total)||0)};
    };
    // The terminal catch also contains failures in the completion/error handler.
    // Do not leave an ignored .finally() promise that can reject outside the job.
    void Promise.resolve().then(()=>fn(progress)).then(result=>{
      item.status='done';item.result=result;item.expires=this.now()+30*60*1000;
    }).catch(error=>{
      item.status='error';item.error=message(error);
      try{item.expires=this.now()+30*60*1000;}catch(_){item.expires=0;}
    });
    return {jobId:id};
  }
  get(id){this.prune();const item=this.items.get(id);if(!item)throw Error('This operation has expired. Reload the backup.');return {...item};}
  release(id){if(this.items.get(id)?.status!=='running')this.items.delete(id);return {ok:true};}
}
module.exports=Jobs;
