'use strict';

// Owner-authorized CLI export; the new app never accesses another app's settings.
const fs = require('node:fs');
const path = require('node:path');
const AthomApi = require('homey/lib/AthomApi');
const { LEGACY_APP_ID, createExport, planMigration } = require('../lib/config-migration');

async function exportLegacy({ homey, output }) {
  const app = await homey.apps.getApp({ id: LEGACY_APP_ID, $cache: false });
  if (app.version !== '0.7.1' || app.state !== 'running') throw Error('Expected running legacy app version 0.7.1.');
  const settings = await homey.apps.getAppSettings({ id: LEGACY_APP_ID, $cache: false });
  const document = createExport(settings);
  // Raw settings and API errors must never be printed or written to disk.
  const directory = path.resolve(__dirname, '..', 'artifacts');
  const destination = path.resolve(output || path.join(directory, 'migration', 'dr-wau-legacy-config.json'));
  if (!destination.startsWith(directory + path.sep)) throw Error('Export destination must be inside ignored artifacts/.');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, JSON.stringify(document, null, 2), { flag: 'wx' });
  return { document, summary: planMigration(document).summary };
}

if (require.main === module) (async () => {
  const athom = new AthomApi();
  const selected = await athom.getSelectedHomey();
  if (!process.argv[2] || selected?.id !== process.argv[2]) throw Error('Explicit selected Homey ID required.');
  const result = await exportLegacy({ homey: await athom.getActiveHomey(), output: process.argv[3] });
  console.log(JSON.stringify({ exported: true, summary: result.summary }));
  process.exit(0);
})().catch(() => { console.error('Legacy export failed. Check authentication, selected Homey and destination; no raw settings were logged.'); process.exit(1); });

module.exports = { exportLegacy };
