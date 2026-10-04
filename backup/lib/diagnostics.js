'use strict';
const {getHeapStatistics}=require('node:v8');
const COUNTS=new Set(['elapsedMs','count','apiCalls','processed','total','maxSettingsBytes','maxDeviceBytes','devices','standardFlows','advancedFlows','bytes']);
function memoryUsage(){
  try{return process.memoryUsage();}catch(_){
    // Homey's restricted runtime can reject libuv's RSS lookup. V8 heap
    // counters remain usable; RSS is then read by the external Homey collector.
    const heap=getHeapStatistics();return {heapUsed:heap.used_heap_size,heapTotal:heap.total_heap_size};
  }
}
// Bounded, content-free runtime records mirrored to an owner's local collector.
// No settings, credentials, object IDs, names, requests or error messages enter this log.
class Diagnostics {
  constructor(emit=()=>{},now=Date.now){this.emit=emit;this.now=now;this.startedAt=now();this.entries=[];this.sequence=0;}
  record(phase,counts={}){
    try{
      const memory=memoryUsage();
      const row={sequence:++this.sequence,at:this.now(),phase,heapUsed:memory.heapUsed,heapTotal:memory.heapTotal,rss:memory.rss};
      for(const [key,value] of Object.entries(counts))if(COUNTS.has(key)&&Number.isFinite(value)&&value>=0)row[key]=value;
      this.entries.push(row);if(this.entries.length>128)this.entries.shift();
      try{Promise.resolve(this.emit({...row})).catch(()=>{});}catch(_){}
      return row;
    }catch(_){return null;}
  }
  snapshot(){const memory=memoryUsage();return {startedAt:this.startedAt,sequence:this.sequence,memory:{heapUsed:memory.heapUsed,heapTotal:memory.heapTotal,rss:memory.rss},entries:this.entries.map(x=>({...x}))};}
}
module.exports=Diagnostics;
