'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('settings page exposes onHomeyReady and acknowledges Homey immediately', async () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'settings', 'index.html'), 'utf8');
  assert.match(html, /<script[^>]+src=["']\/homey\.js["'][^>]+data-origin=["']settings["'][^>]*><\/script>/i);
  assert.match(html, /role="tablist"/);
  assert.match(html, /data-tab="overview"/);
  assert.match(html, /data-tab="health"/);
  assert.match(html, /data-tab="watchdog"/);
  assert.match(html, /data-tab="management"/);
  assert.match(html, /id="panel-management"/);
  assert.match(html, /id="managed-findings"/);
  assert.match(html, /id="category-filter"/);
  assert.match(html, /id="management-category-filter"/);
  assert.match(html, /value="flows"/);
  assert.match(html, /value="devices"/);
  assert.match(html, /value="apps"/);
  assert.match(html, /value="maintenance"/);
  assert.match(html, /id="watchdog-enabled"/);
  assert.match(html, /id="watchdog-stale"/);
  assert.match(html, /id="watchdog-repeat"/);
  assert.match(html, /id="watchdog-push"/);
  assert.match(html, /\/watchdog\/test/);
  assert.match(html, /function inActiveCategory/);
  assert.match(html, /\/finding/);
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)?.[1];
  assert.ok(script, 'inline settings script is present');

  const elements = new Map();
  const element = (initial = {}) => ({
    listeners: {},
    attributes: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
    append() {},
    replaceChildren() {},
    click() {},
    dataset: {},
    style: {},
    hidden: false,
    disabled: false,
    textContent: '',
    className: '',
    setAttribute(name, value) { this.attributes[name] = value; },
    focus() { this.focused = true; },
    ...initial,
  });
  const tabs = ['overview', 'health', 'watchdog', 'management'].map((name) => element({ dataset: { tab: name } }));
  const panels = ['overview', 'health', 'watchdog', 'management'].map((name) => element({ dataset: { panel: name } }));
  const sandbox = {
    navigator: { language: 'de-DE' },
    document: {
      querySelectorAll: (selector) => selector === '[role="tab"]' ? tabs : selector === '[role="tabpanel"]' ? panels : [],
      getElementById: (id) => {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
      },
      createElement: element,
    },
    Blob: class Blob {},
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
    setTimeout,
    clearTimeout,
    console,
  };
  sandbox.window = sandbox;
  vm.runInNewContext(script, sandbox, { filename: 'settings/index.html' });
  assert.equal(typeof sandbox.onHomeyReady, 'function');

  let readyCalls = 0;
  sandbox.onHomeyReady({
    ready() { readyCalls += 1; },
    api(method, route, body, callback) { callback(null, { report: null }); },
  });

  assert.equal(readyCalls, 1);
  tabs[2].listeners.click();
  assert.equal(tabs[2].attributes['aria-selected'], 'true');
  assert.equal(tabs[0].attributes['aria-selected'], 'false');
  assert.equal(panels[2].hidden, false);
  assert.equal(panels[0].hidden, true);
});
