'use strict';
const {fixture}=require('./helpers.cjs');
async function loadFixture(count){
 const f=await fixture('en'),devices={},standard={},advanced={};let active=0,maxActive=0,calls=0;
 for(let i=0;i<count;i++){
  devices['d'+i]={id:'d'+i,name:'Synthetic sensor '+i,class:'sensor',settings:{text:'x'.repeat(2048)},capabilities:['measure_temperature'],capabilitiesObj:{measure_temperature:{value:20,diagnostic:'x'.repeat(40000)}},energy:{unused:'x'.repeat(1000)},iconObj:{unused:'x'.repeat(1000)},color:'unused'};
  standard[i.toString(16)]={id:i.toString(16),name:'Synthetic flow '+i,actions:Array.from({length:10},()=>({id:'synthetic:action',args:{text:'x'.repeat(300)}}))};
  advanced[(count+i).toString(16)]={id:(count+i).toString(16),name:'Synthetic advanced '+i,cards:Object.fromEntries(Array.from({length:10},(_,j)=>['c'+j,{id:'synthetic:action',type:'action',args:{text:'x'.repeat(300)}}]))};
 }
 f.client.devices.getDevices=async()=>devices;
 f.client.devices.getDeviceSettingsObj=async()=>{calls++;active++;maxActive=Math.max(active,maxActive);await Promise.resolve();active--;return [{id:'text',type:'text',value:''}];};
 f.client.flow.getFlows=async()=>standard;f.client.flow.getAdvancedFlows=async()=>advanced;
 return {...f,devices,settingsCalls:()=>calls,maxConcurrentSettings:()=>maxActive};
}
module.exports={loadFixture};
