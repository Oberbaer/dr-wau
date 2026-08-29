'use strict';

const fs = require('fs');
const path = require('path');
const { buildFlow, validateFlow } = require('./flow-template');

const outputDir = path.join(__dirname, 'artifacts');
const outputPath = path.join(outputDir, 'central-battery-watchdog.flow.json');
const flow = buildFlow({ stateVariableId: '__CREATED_DURING_INSTALL__' });
validateFlow(flow);
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(flow, null, 2)}\n`, 'utf8');
console.log(outputPath);
