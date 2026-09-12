'use strict';

const { loadAthomApi } = require('./homey-api');

function deviceNameFromEnvironment(environment = process.env) {
  const name = environment.WATCHDOG_DEVICE_NAME?.trim();
  if (!name) throw new Error('Set WATCHDOG_DEVICE_NAME to the device name to inspect.');
  return name;
}

function buildDiagnosticCode(deviceName) {
  const name = JSON.stringify(deviceName);
  return `const targetName = ${name};
const raw = await Homey.call({ method: 'GET', path: '/api/manager/devices/device/' });
const wrapped = await Homey.devices.getDevices();
const matches = devices => Object.values(devices).filter(device => device.name === targetName).map(device => ({ id: device.id, lastSeenAt: device.lastSeenAt }));
return JSON.stringify({ raw: matches(raw), wrapped: matches(wrapped), notificationMethod: typeof Homey.notifications.createNotification });`;
}

async function main() {
  const AthomApi = loadAthomApi();
  const homey = await new AthomApi().getActiveHomey();
  const result = await homey.flow.runFlowCardAction({
    id: 'homey:app:com.athom.homeyscript:runCodeReturnsString_v2',
    args: { code: buildDiagnosticCode(deviceNameFromEnvironment()) },
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { buildDiagnosticCode, deviceNameFromEnvironment };
