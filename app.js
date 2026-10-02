'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');
const { analyzeSnapshot, applyFindingAnnotations, findingId } = require('./lib/analyzer');
const { evaluateBatteryDevices, isBatteryDevice, markDelivered, normalizeConfig, notificationRoutes } = require('./lib/battery-watchdog');
const { isZoneExcluded, zoneMap } = require('./lib/zone-exclusions');
const { collectHeartbeatInsights } = require('./lib/heartbeat-insights');
const { updateLearningState } = require('./lib/device-learning');
const { isVacationActive, vacationExpiryDelay } = require('./lib/vacation');
const { notificationPrefix } = require('./lib/watchdog-messages');
const BackupApp = require('./backup/app');
const migration = require('./lib/config-migration');

const REPORT_SETTING = 'latest_report_v1';
const ANNOTATIONS_SETTING = 'finding_annotations_v1';
const PRIORITIES = new Set(['auto', 'critical', 'high', 'medium', 'low', 'unimportant']);
const STATUSES = new Set(['open', 'acknowledged', 'expected', 'resolved']);
const WATCHDOG_CONFIG_SETTING = 'battery_watchdog_config_v1';
const LEGACY_WATCHDOG_STATE_SETTING = 'battery_watchdog_state_v1';
const WATCHDOG_STATE_SETTING = 'battery_watchdog_state_v2';
const WATCHDOG_STATUS_SETTING = 'battery_watchdog_status_v1';
const LEARNING_SETTING = 'device_learning_state_v1';

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

class DrWauApp extends Homey.App {
  async onInit() {
    this.latestBaseReport = restoreBaseReport(this.homey.settings.get(REPORT_SETTING));
    this.findingAnnotations = this.homey.settings.get(ANNOTATIONS_SETTING) || {};
    this.scanPromise = null;
    this.watchdogPromise = null;
    this.watchdogConfig = normalizeConfig(this.homey.settings.get(WATCHDOG_CONFIG_SETTING) || { timeline: false });
    this.watchdogStatus = this.homey.settings.get(WATCHDOG_STATUS_SETTING) || null;
    this.learningState = this.homey.settings.get(LEARNING_SETTING) || { schema: 1, devices: {} };
    this.vacationExpiryStopped = false;
    await this.expireVacationIfDue();
    this.scheduleVacationExpiry();

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
      return (await this.runBatteryWatchdog('flow')).ok;
    });
    this.homey.flow.getActionCard('watchdog_vacation_on').registerRunListener(async () => { await this.setVacation(true); return true; });
    this.homey.flow.getActionCard('watchdog_vacation_off').registerRunListener(async () => { await this.setVacation(false); return true; });
    this.homey.flow.getConditionCard('watchdog_vacation_active').registerRunListener(async () => isVacationActive(this.watchdogConfig.vacation));

    this.watchdogWarningTrigger = this.homey.flow.getTriggerCard('battery_watchdog_warning');

    this.homey.flow.getConditionCard('health_score_below').registerRunListener(async ({ score }) => {
      if (!this.latestBaseReport) await this.runScan('flow-condition');
      return Number(this.getReport()?.score?.overall ?? 100) < Number(score);
    });

    this.scheduleBatteryWatchdog();
    await BackupApp.prototype.onInit.call(this);
    this.log('Dr. Wau initialized');
  }

  onUninit() {
    this.vacationExpiryStopped = true;
    if (this.watchdogTimer) this.homey.clearInterval(this.watchdogTimer);
    if (this.vacationTimer) this.homey.clearTimeout(this.vacationTimer);
    this.vacationTimer = null;
    BackupApp.prototype.onUninit.call(this);
  }

  exportMigration() {
    return migration.createExport(migration.readSettings(this.homey.settings), { sourceAppId: migration.APP_ID, sourceVersion: '1.0.0' });
  }

  previewMigration(document) {
    const plan = migration.planMigration(document);
    this.migrationPreview = { token: plan.previewToken, expiresAt: Date.now() + 10 * 60 * 1000 };
    return { summary: plan.summary, previewToken: plan.previewToken };
  }

  async importMigration(body = {}) {
    const plan = migration.planMigration(body.document);
    if (body.confirmed !== true || !this.migrationPreview || this.migrationPreview.expiresAt < Date.now()
      || this.migrationPreview.token !== plan.previewToken || body.previewToken !== plan.previewToken)
      throw Error('Preview this file and explicitly confirm the import first.');
    if (this.migrationImportBusy || this.watchdogPromise || this.scanPromise || this.scheduler?.busy
      || [...(this.jobs?.items?.values() || [])].some(job => job.status === 'running')
      || this.watchdogConfig.enabled || notificationRoutes(this.watchdogConfig).length
      || this.watchdogConfig.vacation.enabled || this.homey.settings.get('schedule')?.enabled)
      throw Error('Stop automatic checks, notifications, vacation, backup schedules and running jobs before importing.');
    this.migrationImportBusy = true;
    try {
      const summary = await migration.applyMigration(this.homey.settings, plan);
      this.watchdogConfig = normalizeConfig(this.homey.settings.get(WATCHDOG_CONFIG_SETTING));
      this.learningState = this.homey.settings.get(LEARNING_SETTING) || { schema: 1, devices: {} };
      this.findingAnnotations = this.homey.settings.get(ANNOTATIONS_SETTING) || {};
      this.writeClient = null;
      this.scheduleBatteryWatchdog();
      this.scheduleVacationExpiry();
      this.migrationPreview = null;
      return { imported: true, summary };
    } finally { this.migrationImportBusy = false; }
  }

  scheduleBatteryWatchdog() {
    if (this.watchdogTimer) this.homey.clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
    if (!this.watchdogConfig.enabled) return;
    this.watchdogTimer = this.homey.setInterval(() => {
      this.runBatteryWatchdog('schedule').catch(error => this.error('Battery watchdog failed:', error));
    }, this.watchdogConfig.checkHours * 3600000);
  }

  scheduleVacationExpiry() {
    if (this.vacationTimer) this.homey.clearTimeout(this.vacationTimer);
    this.vacationTimer = null;
    if (this.vacationExpiryStopped) return;
    const delay = vacationExpiryDelay(this.watchdogConfig.vacation, Date.now());
    if (delay === null) return;
    const timer = this.homey.setTimeout(async () => {
      if (this.vacationExpiryStopped || this.vacationTimer !== timer) return;
      this.vacationTimer = null;
      try { await this.expireVacationIfDue(); }
      catch (error) { this.error('Vacation expiry failed:', error); }
      this.scheduleVacationExpiry();
    }, delay);
    this.vacationTimer = timer;
  }

  async expireVacationIfDue(now = Date.now()) {
    if (vacationExpiryDelay(this.watchdogConfig.vacation, now) === 0) await this.setVacation(false);
  }

  async getWatchdogOverview() {
    const api = await this.ensureApi();
    const [devices, zonesRaw] = await Promise.all([
      api.call({ method: 'GET', path: '/api/manager/devices/device/' }),
      api.zones.getZones({ $cache: false }),
    ]);
    const ignored = new Set(this.watchdogConfig.ignoredDeviceIds);
    const ignoredZones = new Set(this.watchdogConfig.ignoredZoneIds);
    const zones = zoneMap(zonesRaw);
    const evaluation = await this.evaluateWatchdogSnapshot(devices, zonesRaw);
    const assessments = new Map(evaluation.assessments.map(item => [item.id, item]));
    const batteryDevices = Object.values(devices || {}).filter(isBatteryDevice).map(device => ({ id: device.id, name: device.name || device.id, zone: device.zone || null,
      ignored: ignored.has(device.id) || isZoneExcluded(device.zone, zones, ignoredZones),
      assessment: assessments.get(device.id) || null }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const availableZones = Object.values(zones).map(zone => ({ id: zone.id, name: zone.name || zone.id,
      parent: zone.parent?.id || zone.parent || null,
      ignored: isZoneExcluded(zone.id, zones, ignoredZones) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    let users = [], pushUsersError = false;
    try { users = (await this.notificationUsers()).map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)); }
    catch (_) { pushUsersError = true; }
    return { config: this.watchdogConfig, status: this.watchdogStatus, batteryDevices, zones: availableZones,
      users, pushUsersError, pushAuthReady: Boolean(this.writeClient), insightsSummary: evaluation.insightsSummary };
  }

  async updateWatchdogConfig(input = {}) {
    const config = normalizeConfig({ ...this.watchdogConfig, ...input });
    if (config.pushUserIds.length) {
      if (!this.writeClient) throw new Error('Für direkte Pushs zuerst den Homey API Key in der Backup-Verwaltung einrichten (Flow-Recht erforderlich).');
      const knownUsers = new Set((await this.notificationUsers()).map(user => user.id));
      if (config.pushUserIds.some(id => !knownUsers.has(id))) throw new Error('Ein ausgewählter Push-Empfänger ist auf diesem Homey nicht verfügbar.');
    }
    this.watchdogConfig = config;
    await this.homey.settings.set(WATCHDOG_CONFIG_SETTING, this.watchdogConfig);
    this.scheduleBatteryWatchdog();
    this.scheduleVacationExpiry();
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
    await this.homey.settings.set(LEGACY_WATCHDOG_STATE_SETTING, state);
    await this.homey.settings.set(WATCHDOG_CONFIG_SETTING, this.watchdogConfig);
    this.scheduleBatteryWatchdog();
    this.scheduleVacationExpiry();
    return {
      ok: true,
      reportImported: true,
      annotationsImported: Object.keys(annotations).length,
      watchdogDevicesImported: Object.keys(state.devices).length,
      watchdogEnabled: this.watchdogConfig.enabled,
    };
  }

  async prepareWatchdogPush() {
    const client = this.getWriteClient();
    const users = new Map((await this.notificationUsers()).map(user => [user.id, user]));
    const cardId = 'homey:manager:mobile:push_text';
    await client.flow.getFlowCardAction({ id: cardId });
    return { client, users, cardId };
  }

  async setVacation(enabled, until = null) {
    this.watchdogConfig = normalizeConfig({ ...this.watchdogConfig, vacation: { enabled, until } });
    await this.homey.settings.set(WATCHDOG_CONFIG_SETTING, this.watchdogConfig);
    this.scheduleVacationExpiry();
    return { vacation: this.watchdogConfig.vacation, active: isVacationActive(this.watchdogConfig.vacation) };
  }

  async updateDeviceProfile(id, changes = {}) {
    if (!id || typeof id !== 'string' || id.length > 120) throw new Error('Invalid device');
    const current = this.watchdogConfig.deviceProfiles[id] || {};
    const profiles = { ...this.watchdogConfig.deviceProfiles };
    if (changes.reset === true) delete profiles[id];
    else profiles[id] = { ...current, ...changes };
    this.watchdogConfig = normalizeConfig({ ...this.watchdogConfig, deviceProfiles: profiles });
    if (changes.resetLearning === true) {
      this.learningState = { schema: 1, devices: { ...(this.learningState.devices || {}) } };
      delete this.learningState.devices[id];
      await this.homey.settings.set(LEARNING_SETTING, this.learningState);
    }
    await this.homey.settings.set(WATCHDOG_CONFIG_SETTING, this.watchdogConfig);
    return this.getWatchdogOverview();
  }

  async deliverWatchdogRoute(route, text, context = {}) {
    // Settings may change while a scan or a previous batch is awaiting I/O.
    if (!notificationRoutes(this.watchdogConfig).includes(route)) return false;
    if (route === 'timeline') return this.homey.notifications.createNotification({ excerpt: text });
    if (route === 'flow') return this.watchdogWarningTrigger.trigger({ text });
    if (!route.startsWith('push:')) throw new Error('Unknown watchdog notification channel.');
    context.push ||= this.prepareWatchdogPush();
    const { client, users, cardId } = await context.push;
    if (!notificationRoutes(this.watchdogConfig).includes(route)) return false;
    const user = users.get(route.slice(5));
    if (!user) throw new Error('Ein ausgewählter Push-Empfänger ist nicht mehr verfügbar.');
    return client.flow.runFlowCardAction({ id: cardId, args: { user: { id: user.id, name: user.name }, text } });
  }

  async deliverWatchdogMessage(text) {
    const routes = notificationRoutes(this.watchdogConfig);
    if (!routes.length) return false;
    const context = {};
    const results = await Promise.allSettled(routes.map(route => this.deliverWatchdogRoute(route, text, context)));
    if (results.some(result => result.status === 'rejected')) throw new Error('Mindestens ein Benachrichtigungskanal konnte nicht zustellen. API Key und Empfänger prüfen.');
    return true;
  }

  async sendWatchdogTestNotification() {
    if (!await this.deliverWatchdogMessage('✅ Dr. Wau: Testbenachrichtigung erfolgreich ausgelöst.')) {
      throw new Error('Kein Benachrichtigungskanal ausgewählt.');
    }
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
      await this.expireVacationIfDue(startedAt);
      const api = await this.ensureApi();
      const [devices, zones] = await Promise.all([
        api.call({ method: 'GET', path: '/api/manager/devices/device/' }),
        api.zones.getZones({ $cache: false }),
      ]);
      const evaluation = await this.evaluateWatchdogSnapshot(devices, zones, startedAt, true);
      await this.homey.settings.set(LEARNING_SETTING, this.learningState);
      const context = {};
      let deliveryFailures = 0;
      for (const route of notificationRoutes(evaluation.config)) {
        for (const kind of ['problem', 'recovery']) {
          const pending = evaluation.pending.filter(item => item.kind === kind && item.routes.includes(route));
          for (let offset = 0; offset < pending.length; offset += 2) {
            const batch = pending.slice(offset, offset + 2);
            try {
              const delivered = await this.deliverWatchdogRoute(route, `${notificationPrefix(kind, batch.some(item => item.severity === 'critical') ? 'critical' : 'warning')}${batch.map(item => item.message).join('; ')}`, context);
              if (delivered !== false) markDelivered(evaluation.state, batch.map(item => item.key), startedAt, [route]);
            } catch (_) { deliveryFailures += 1; }
            await this.homey.settings.set(WATCHDOG_STATE_SETTING, evaluation.state);
          }
        }
      }
      await this.homey.settings.set(WATCHDOG_STATE_SETTING, evaluation.state);
      this.watchdogStatus = {
        ok: deliveryFailures === 0, source, checkedAt: new Date(startedAt).toISOString(),
        checkedDevices: evaluation.checkedDevices, warnings: evaluation.activeProblems, deliveryFailures,
        pendingNotifications: evaluation.pending.length, recoveries: evaluation.pending.filter(item => item.kind === 'recovery').length,
        nativeTimestampMissing: evaluation.assessments.filter(item => !item.heartbeat.nativeTimestampAvailable).length,
        insightsSummary: evaluation.insightsSummary,
        ...(deliveryFailures ? { error: 'Benachrichtigung konnte nicht vollständig zugestellt werden. API Key und Empfänger prüfen.' } : {}),
      };
      await this.homey.settings.set(WATCHDOG_STATUS_SETTING, this.watchdogStatus);
      return this.watchdogStatus;
    } catch (error) {
      this.watchdogStatus = { ok: false, source, checkedAt: new Date(startedAt).toISOString(), error: String(error?.message || error).slice(0, 500) };
      await this.homey.settings.set(WATCHDOG_STATUS_SETTING, this.watchdogStatus);
      throw error;
    }
  }

  async evaluateWatchdogSnapshot(devices, zones, now = Date.now(), learn = false) {
    const { evidence, summary } = await collectHeartbeatInsights(await this.ensureApi(), devices, this.watchdogConfig, now, zones, 24, learn ? this.learningState : null);
    if (learn) {
      const mappedZones = zoneMap(zones);
      const eligible = Object.values(devices || {}).filter(device => isBatteryDevice(device)
        && !(this.watchdogConfig.ignoredDeviceIds || []).includes(device.id)
        && !isZoneExcluded(device.zone, mappedZones, new Set(this.watchdogConfig.ignoredZoneIds || [])));
      this.learningState = updateLearningState(this.learningState, eligible, this.watchdogConfig, evidence, now, isVacationActive(this.watchdogConfig.vacation, now));
    }
    const previous = this.homey.settings.get(WATCHDOG_STATE_SETTING) || this.homey.settings.get(LEGACY_WATCHDOG_STATE_SETTING) || {};
    return { ...evaluateBatteryDevices(devices, previous, this.watchdogConfig, now, zones, evidence, this.learningState), insightsSummary: summary };
  }

  async previewBatteryWatchdog() {
    const api = await this.ensureApi();
    const [devices, zones] = await Promise.all([
      api.call({ method: 'GET', path: '/api/manager/devices/device/' }), api.zones.getZones({ $cache: false }),
    ]);
    const evaluation = await this.evaluateWatchdogSnapshot(devices, zones);
    return { version: this.homey.app.manifest.version, notificationMode: 'disabled', checkedAt: new Date().toISOString(),
      checkedDevices: evaluation.checkedDevices, warnings: evaluation.activeProblems, assessments: evaluation.assessments, insightsSummary: evaluation.insightsSummary };
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
      ignoredZoneIds: this.watchdogConfig.ignoredZoneIds,
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

for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(BackupApp.prototype))) {
  if (['constructor', 'onInit', 'onUninit'].includes(name)) continue;
  if (Object.prototype.hasOwnProperty.call(DrWauApp.prototype, name)) {
    throw new Error(`Backup integration method conflict: ${name}`);
  }
  Object.defineProperty(DrWauApp.prototype, name, descriptor);
}

module.exports = DrWauApp;
