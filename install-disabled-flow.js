'use strict';

const fs = require('fs');
const path = require('path');
const { loadAthomApi } = require('./homey-api');
const { FLOW_NAME, STATE_VARIABLE_NAME, buildFlow, validateFlow } = require('./flow-template');

const APPLY = process.argv.includes('--apply');
const APPROVE = process.argv.includes('--approve');
const values = value => Array.isArray(value) ? value : Object.values(value || {});

async function main() {
  if (!APPLY || !APPROVE) {
    console.log(JSON.stringify({
      mode: 'dry-run',
      message: 'No Homey changes. Use --apply --approve only after explicit approval.',
      flowName: FLOW_NAME,
      enabledAfterInstall: false,
    }, null, 2));
    return;
  }

  const AthomApi = loadAthomApi();
  const homey = await new AthomApi().getActiveHomey();
  const [flowsRaw, variablesRaw, foldersRaw, appsRaw] = await Promise.all([
    homey.flow.getAdvancedFlows({ $cache: false }),
    homey.logic.getVariables({ $cache: false }),
    homey.flow.getFlowFolders({ $cache: false }),
    homey.apps.getApps({ $cache: false }),
  ]);
  const flows = values(flowsRaw);
  const variables = values(variablesRaw);
  const folders = values(foldersRaw);
  const apps = values(appsRaw);
  if (flows.some(flow => flow.name === FLOW_NAME)) throw new Error('Watchdog Flow already exists');
  if (!apps.some(app => app.id === 'com.athom.homeyscript' && app.enabled)) throw new Error('HomeyScript is not installed or enabled');
  let state = variables.find(variable => variable.name === STATE_VARIABLE_NAME);
  if (!state) state = await homey.logic.createVariable({ variable: { name: STATE_VARIABLE_NAME, type: 'string', value: '{}' } });
  const watchdogFolder = folders.find(folder => folder.name === 'Battery Watchdog');
  if (!watchdogFolder) throw new Error('Homey folder "Battery Watchdog" is missing');
  const flow = buildFlow({ stateVariableId: state.id, folderId: watchdogFolder.id });
  validateFlow(flow);
  const created = await homey.flow.createAdvancedFlow({ advancedflow: flow });
  const verified = await homey.flow.getAdvancedFlow({ id: created.id, $cache: false });
  if (verified.enabled !== false || verified.broken === true) throw new Error('Installed Flow is not safely disabled');
  const artifactDir = path.join(__dirname, 'artifacts');
  fs.mkdirSync(artifactDir, { recursive: true });
  fs.writeFileSync(path.join(artifactDir, `installed-flow-${created.id}.json`), `${JSON.stringify(verified, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ installed: true, enabled: verified.enabled, id: verified.id, name: verified.name }, null, 2));
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
