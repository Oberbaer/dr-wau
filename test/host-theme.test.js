'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const script = read('assets/host-theme.js');

function usesWebPalette({ referrer = '', ancestors, embedded = true }) {
  const window = { location: { ancestorOrigins: ancestors } };
  window.parent = embedded ? {} : window;
  const classList = new Set();
  vm.runInNewContext(script, { window, document: { referrer, documentElement: { classList } }, URL });
  return classList.has('homey-web-theme');
}

test('only an embedded official Homey Web origin delegates dark mode to the host', () => {
  assert.equal(usesWebPalette({ referrer: 'https://my.homey.app/' }), true);
  assert.equal(usesWebPalette({ ancestors: ['https://my.homey.app'], referrer: 'https://homey.local/settings/' }), true);
  assert.equal(usesWebPalette({ embedded: false, referrer: 'https://my.homey.app/' }), false);
  assert.equal(usesWebPalette({ referrer: 'https://my.homey.app.example/' }), false);
  assert.equal(usesWebPalette({ referrer: 'https://tools.developer.homey.app/' }), false);
  assert.equal(usesWebPalette({}), false);
});

test('both settings views load host detection before applying the shared OS palette', () => {
  for (const file of ['settings/index.html', 'settings/backup/index.html', 'backup/settings/index.html']) {
    const html = read(file);
    assert.match(html, /<script src="(?:\.\.\/)+assets\/host-theme\.js"><\/script>\s*<link rel="stylesheet" href="(?:\.\.\/)+assets\/brand\.css"/);
  }
  assert.match(read('assets/brand.css'), /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\.homey-web-theme\)/);
});
