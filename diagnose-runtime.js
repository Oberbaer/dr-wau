'use strict';
const A = require('homey/lib/AthomApi');
(async () => {
  const h = await new A().getActiveHomey();
  const code = `const raw = await Homey.call({method:'GET',path:'/api/manager/devices/device/'});
const wrapped = await Homey.devices.getDevices();
return JSON.stringify({raw:Object.values(raw).filter(d=>/Example sensor/.test(d.name)).map(d=>({id:d.id,lastSeenAt:d.lastSeenAt})),wrapped:Object.values(wrapped).filter(d=>/Example sensor/.test(d.name)).map(d=>({id:d.id,lastSeenAt:d.lastSeenAt})),notificationMethod:typeof Homey.notifications.createNotification});`;
  console.log(JSON.stringify(await h.flow.runFlowCardAction({id:'homey:app:com.athom.homeyscript:runCodeReturnsString_v2',args:{code}}),null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
