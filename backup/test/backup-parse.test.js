'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const parsers = [
  require('../../settings/backup/backup'),
  require('../settings/backup'),
];

const sample = version => ({
  format: 'homey-backup-center',
  version,
  createdAt: '2026-09-27T09:16:19.478Z',
  flows: [{ id: '12345678-1234-4123-8123-123456789abc', type: 'standard', name: 'Test' }],
  inventory: { devices: {}, zones: {}, variables: {}, apps: {} },
});

for (const [index, parser] of parsers.entries()) {
  test(`backup parser ${index + 1} accepts v5 exports`, () => {
    const backup = sample(5);
    assert.deepEqual(parser.parse(JSON.stringify(backup)), backup);
  });

  test(`backup parser ${index + 1} requires v5 inventory`, () => {
    const backup = sample(5);
    delete backup.inventory;
    assert.throws(() => parser.parse(JSON.stringify(backup)));
  });
}
