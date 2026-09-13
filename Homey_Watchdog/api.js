'use strict';

module.exports = {
  async getReport({ homey }) {
    return {
      report: homey.app.getReport(),
      annotations: homey.app.getFindingManagement(),
    };
  },

  async runScan({ homey }) {
    return {
      report: await homey.app.runScan('settings'),
      annotations: homey.app.getFindingManagement(),
    };
  },

  async updateFinding({ homey, body }) {
    return homey.app.updateFindingAnnotation(body);
  },

  async getWatchdog({ homey }) {
    return homey.app.getWatchdogOverview();
  },

  async updateWatchdog({ homey, body }) {
    return homey.app.updateWatchdogConfig(body);
  },

  async runWatchdog({ homey }) {
    return homey.app.runBatteryWatchdog('settings');
  },

  async testWatchdogNotification({ homey }) {
    return homey.app.sendWatchdogTestNotification();
  },

  async importAutomationHealth({ homey, body }) {
    return homey.app.importLegacyData(body);
  },
};
