'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');
const { analyzeSnapshot, applyFindingAnnotations, findingId } = require('./lib/analyzer');
const { evaluateBatteryDevices, markDelivered, normalizeConfig } = require('./lib/battery-watchdog');

const REPORT_SETTING = 'latest_report_v1';
const ANNOTATIONS_SETTING = 'finding_annotations_v1';
const PRIORITIES = new Set(['auto', 'critical', 'high', 'medium', 'low', 'unimportant']);
const STATUSES = new Set(['open', 'acknowledged', 'expected', 'resolved']);
const WATCHDOG_CONFIG_SETTING = 'battery_watchdog_config_v1';
const WATCHDOG_STATE_SETTING = 'battery_watchdog_state_v1';
const WATCHDOG_STATUS_SETTING = 'battery_watchdog_status_v1';

function restoreBaseReport(report) {
  if (!report) return null;
  const unique = new Map();
  for (const finding of [...(report.findings || []), ...(report.ignoredFindings || [])]) {
    const clean = { ...finding };
    delete clean.annotation;
    delete clean.effectiveSeverity;
    delete clean.ignored;
    clean.id = clean.id || findingId(clean);
    unique.set(clean.id, clean);
  }
  return {
    ...report,
    score: report.originalScore || report.score,
    findings: [...unique.values()],
    ignoredFindings: undefined,
    management: undefined,
    originalScore: undefined,
  };
}

class HomeyWatchdogApp extends Homey.App {
  async onInit() {
    this.latestBaseReport = restoreBaseReport(this.homey.settings.get(REPORT_SETTING));
    this.findingAnnotations = this.homey.settings.get(ANNOTATIONS_SETTING) || {};
    this.scanPromise = null;
    this.watchdogPromise = null;
    this.watchdogConfig = normalizeConfig(this.homey.settings.get(WATCHDOG_CONFIG_SETTING) || {});
    this.watchdogStatus = this.homey.settings.get(WATCHDOG_STATUS_SETTING) || null;

    try {
      this.api = await HomeyAPI.createAppAPI({ homey: this.homey });
    } catch (error) {
      this.error('Could not initialize Homey Web API:', error);
      this.api = null;
    }

    this.homey.flow.getActionCard('run_health_scan').registerRunListener(async () => {
      await this.runScan('flow');
      return true;
    });

    this.homey.flow.getActionCard('run_battery_watchdog').registerRunListener(async () => {
      await this.runBatteryWatchdog('flow');
      return true;
    });

    this.watchdogWarningTrigger = this.homey.flow.getTriggerCard('battery_watchdog_warning');

    this.homey.flow.getConditionCard('health_score_below').registerRunListener(async ({ score }) => {
      if (!this.latestBaseReport) await this.runScan('flow-condition');
      return Number(this.getReport()?.score?.overall ?? 100) < Number(score);
    });

    this.scheduleBatteryWatchdog();
    this.log('Homey Watchdog initialized');
  }

  scheduleBatteryWatchdog() {
    if (this.watchdogTimer) this.homey.clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
    if (!this.watchdogConfig.enabled) return;
    this.watchdogTimer = this.homey.setInterval(() => {
      this.runBatteryWatchdog('schedule').catch(error => this.error('Battery watchdog failed:', error));
    }, this.watchdogConfig.checkHours * 3600000);
  }

  async getWatchdogOverview() {
    const api = await this.ensureApi();
    const devices = await api.call({ method: 'GET', path: '/api/manager/devices/device/' });
    const ignored = new Set(this.watchdogConfig.ignoredDeviceIds);
    const batteryDevices = Object.values(devices || {}).filter(device => {
      const capabilities = Array.isArray(device.capabilities) ? device.capabilities : Object.keys(device.capabilitiesObj || {});
      return capabilities.some(id => id === 'measure_battery' || id === 'alarm_battery');
    }).map(device => ({ id: device.id, name: device.name || device.id, ignored: ignored.has(device.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { config: this.watchdogConfig, status: this.watchdogStatus, batteryDevices };
  }

  async updateWatchdogConfig(input = {}) {
    this.watchdogConfig = normalizeConfig(input);
    await this.homey.settings.set(WATCHDOG_CONFIG_SETTING, this.watchdogConfig);
    this.scheduleBatteryWatchdog();
    return this.getWatchdogOverview();
  }

  async importLegacyData(input = {}) {
    const report = input.report && typeof input.report === 'object' ? input.report : null;
    const annotations = input.annotations && typeof input.annotations === 'object' && !Array.isArray(input.annotations)
      ? input.annotations : {};
    const state = input.watchdogState && input.watchdogState.schema === 1
      && input.watchdogState.devices && typeof input.watchdogState.devices === 'object'
      ? input.watchdogState : { schema: 1, lastCheckedAt: Date.now(), checkedDevices: 0, devices: {} };
    if (!report) throw new Error('Legacy report is required');
    if (JSON.stringify({ report, annotations }).length > 5000000) throw new Error('Legacy data is too large');

    this.latestBaseReport = restoreBaseReport(report);
    this.findingAnnotations = annotations;
    this.watchdogConfig = normalizeConfig(input.watchdogConfig || {});
    await this.homey.settings.set(REPORT_SETTING, report);
    await this.homey.settings.set(ANNOTATIONS_SETTING, annotations);
    await this.homey.settings.set(WATCHDOG_STATE_SETTING, state);
    await this.homey.settings.set(WATCHDOG_CONFIG_SETTING, this.watchdogConfig);
    this.scheduleBatteryWatchdog();
    return {
      ok: true,
      reportImported: true,
      annotationsImported: Object.keys(annotations).length,
      watchdogDevicesImported: Object.keys(state.devices).length,
      watchdogEnabled: this.watchdogConfig.enabled,
    };
  }

  async deliverWatchdogMessage(text) {
    if (!this.watchdogConfig.timeline && !this.watchdogConfig.pushAll) throw new Error('No notification channel enabled');
    if (this.watchdogConfig.timeline) await this.homey.notifications.createNotification({ excerpt: text });
    if (this.watchdogConfig.pushAll) {
      await this.watchdogWarningTrigger.trigger({ text });
    }
  }

  async sendWatchdogTestNotification() {
    await this.deliverWatchdogMessage('✅ Homey Watchdog: Testbenachrichtigung erfolgreich ausgelöst.');
    return { ok: true };
  }

  async runBatteryWatchdog(source = 'settings') {
    if (this.watchdogPromise) return this.watchdogPromise;
    this.watchdogPromise = this.performBatteryWatchdog(source).finally(() => { this.watchdogPromise = null; });
    return this.watchdogPromise;
  }

  async performBatteryWatchdog(source) {
    const startedAt = Date.now();
    try {
      const api = await this.ensureApi();
      const devices = await api.call({ method: 'GET', path: '/api/manager/devices/device/' });
      const previous = this.homey.settings.get(WATCHDOG_STATE_SETTING) || {};
      const evaluation = evaluateBatteryDevices(devices, previous, this.watchdogConfig, startedAt);
      for (let offset = 0; offset < evaluation.pending.length; offset += 2) {
        const batch = evaluation.pending.slice(offset, offset + 2);
        await this.deliverWatchdogMessage(`⚠️ Homey Watchdog: ${batch.map(item => item.message).join('; ')}`);
        markDelivered(evaluation.state, batch.map(item => item.id), startedAt);
        await this.homey.settings.set(WATCHDOG_STATE_SETTING, evaluation.state);
      }
      await this.homey.settings.set(WATCHDOG_STATE_SETTING, evaluation.state);
      this.watchdogStatus = {
        ok: true, source, checkedAt: new Date(startedAt).toISOString(),
        checkedDevices: evaluation.checkedDevices, warnings: evaluation.pending.length,
      };
      await this.homey.settings.set(WATCHDOG_STATUS_SETTING, this.watchdogStatus);
      return this.watchdogStatus;
    } catch (error) {
      this.watchdogStatus = { ok: false, source, checkedAt: new Date(startedAt).toISOString(), error: String(error?.message || error).slice(0, 500) };
      await this.homey.settings.set(WATCHDOG_STATUS_SETTING, this.watchdogStatus);
      throw error;
    }
  }

  async ensureApi() {
    if (!this.api) this.api = await HomeyAPI.createAppAPI({ homey: this.homey });
    return this.api;
  }

  getReport() {
    return applyFindingAnnotations(this.latestBaseReport, this.findingAnnotations);
  }

  getFindingManagement() {
    const currentIds = new Set((this.latestBaseReport?.findings || []).map((finding) => finding.id));
    return Object.entries(this.findingAnnotations).map(([id, annotation]) => ({
      id,
      ...annotation,
      current: currentIds.has(id),
    })).sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  }

  async updateFindingAnnotation(input = {}) {
    const id = String(input.id || '');
    if (!id) throw new Error('Finding id is required');
    const existing = this.findingAnnotations[id];
    const finding = (this.latestBaseReport?.findings || []).find((item) => item.id === id);
    if (!existing && !finding) throw new Error('Finding is unknown');

    if (input.reset === true) {
      delete this.findingAnnotations[id];
    } else {
      const priority = PRIORITIES.has(input.priority) ? input.priority : 'auto';
      const status = STATUSES.has(input.status) ? input.status : 'open';
      const now = new Date().toISOString();
      this.findingAnnotations[id] = {
        priority,
        status,
        ignored: input.ignored === true,
        note: String(input.note || '').trim().slice(0, 1000),
        firstSeenAt: existing?.firstSeenAt || this.latestBaseReport?.generatedAt || now,
        lastSeenAt: finding ? (this.latestBaseReport?.generatedAt || now) : existing?.lastSeenAt || null,
        updatedAt: now,
        snapshot: finding ? {
          code: finding.code,
          group: finding.group,
          severity: finding.severity,
          title: finding.title,
          subject: finding.subject || '',
        } : existing.snapshot,
      };
    }

    await this.homey.settings.set(ANNOTATIONS_SETTING, this.findingAnnotations);
    const report = this.getReport();
    if (report) await this.homey.settings.set(REPORT_SETTING, report);
    return { report, annotations: this.getFindingManagement() };
  }

  async recordAnnotationSightings(report) {
    let changed = false;
    for (const finding of report.findings || []) {
      const annotation = this.findingAnnotations[finding.id];
      if (!annotation) continue;
      annotation.lastSeenAt = report.generatedAt;
      annotation.snapshot = {
        code: finding.code,
        group: finding.group,
        severity: finding.severity,
        title: finding.title,
        subject: finding.subject || '',
      };
      changed = true;
    }
    if (changed) await this.homey.settings.set(ANNOTATIONS_SETTING, this.findingAnnotations);
  }

  async runScan(source = 'settings') {
    if (this.scanPromise) return this.scanPromise;
    this.scanPromise = this.performScan(source).finally(() => {
      this.scanPromise = null;
    });
    return this.scanPromise;
  }

  async performScan(source) {
    const api = await this.ensureApi();
    const coverage = {};

    const read = async (key, operation, fallback = {}) => {
      const startedAt = Date.now();
      try {
        const value = await operation();
        coverage[key] = {
          ok: true,
          durationMs: Date.now() - startedAt,
          count: Object.keys(value || {}).length,
        };
        return value || fallback;
      } catch (error) {
        coverage[key] = {
          ok: false,
          durationMs: Date.now() - startedAt,
          error: String(error?.message || error).slice(0, 240),
        };
        return fallback;
      }
    };

    const [normalFlows, advancedFlowsRaw, flowFolders, devices, variables, apps, zones] = await Promise.all([
      read('normalFlows', () => api.flow.getFlows({ $cache: false })),
      read('advancedFlows', () => api.flow.getAdvancedFlows({ $cache: false })),
      read('flowFolders', () => api.flow.getFlowFolders({ $cache: false })),
      read('devices', () => api.devices.getDevices({ $cache: false })),
      read('variables', () => api.logic.getVariables({ $cache: false })),
      read('apps', () => api.apps.getApps({ $cache: false })),
      read('zones', () => api.zones.getZones({ $cache: false })),
    ]);

    const advancedFlows = { ...advancedFlowsRaw };
    const incomplete = Object.values(advancedFlows).filter((flow) => flow?.id && !flow.cards);
    if (incomplete.length && typeof api.flow.getAdvancedFlow === 'function') {
      const results = await Promise.all(incomplete.map(async (flow) => {
        try {
          return await api.flow.getAdvancedFlow({ id: flow.id, $cache: false });
        } catch (error) {
          coverage[`advancedFlow:${flow.id}`] = {
            ok: false,
            error: String(error?.message || error).slice(0, 240),
          };
          return flow;
        }
      }));
      for (const flow of results) if (flow?.id) advancedFlows[flow.id] = flow;
    }

    const report = analyzeSnapshot({
      normalFlows,
      advancedFlows,
      flowFolders,
      devices,
      variables,
      apps,
      zones,
      coverage,
      source,
      generatedAt: new Date().toISOString(),
    });

    await this.recordAnnotationSightings(report);
    this.latestBaseReport = report;
    const managedReport = this.getReport();
    await this.homey.settings.set(REPORT_SETTING, managedReport);
    return managedReport;
  }
}

module.exports = HomeyWatchdogApp;
