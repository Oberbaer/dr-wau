'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');
const MODULE_PATH = 'homey/lib/AthomApi';

function loadFrom(directory) {
  if (!directory) return null;
  let resolved;
  try { resolved = require.resolve(path.join(directory, MODULE_PATH)); } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    return null;
  }
  return require(resolved);
}

function globalNpmRoot() {
  try {
    const command = process.platform === 'win32'
      ? process.env.ComSpec || 'cmd.exe'
      : 'npm';
    const args = process.platform === 'win32'
      ? ['/d', '/s', '/c', 'npm.cmd root --global']
      : ['root', '--global'];
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch { return null; }
}

function loadAthomApi() {
  try { return require(require.resolve(MODULE_PATH)); } catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  const configured = loadFrom(process.env.HOMEY_CLI_MODULE_DIR);
  if (configured) return configured;
  const global = loadFrom(globalNpmRoot());
  if (global) return global;
  throw new Error('Homey CLI module unavailable. Install the Homey CLI globally, add the "homey" package locally, or set HOMEY_CLI_MODULE_DIR to its global npm module directory.');
}

module.exports = { loadAthomApi };
