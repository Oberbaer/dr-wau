'use strict';

const OUTPUT_KEYS = ['outputSuccess', 'outputError', 'outputTrue', 'outputFalse'];
const GROUPS = {
  flows: { weight: 50 },
  devices: { weight: 25 },
  apps: { weight: 15 },
  maintenance: { weight: 10 },
};
const BASE_PENALTY = { critical: 20, high: 10, medium: 4, low: 1, info: 0 };
const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };

function values(input) {
  return Array.isArray(input) ? input : Object.values(input || {});
}

function mapById(input) {
  return Object.fromEntries(values(input).filter((item) => item?.id).map((item) => [item.id, item]));
}

function outputTargets(card) {
  return OUTPUT_KEYS.flatMap((key) => Array.isArray(card?.[key]) ? card[key] : []);
}

function cardEntries(flow, kind) {
  if (kind === 'normal') {
    return [
      ['trigger', { ...(flow.trigger || {}), type: 'trigger' }],
      ...values(flow.conditions).map((card, index) => [`condition:${index}`, { ...card, type: 'condition' }]),
      ...values(flow.actions).map((card, index) => [`action:${index}`, { ...card, type: 'action' }]),
    ].filter(([, card]) => card.id);
  }
  return Object.entries(flow.cards || {});
}

function graphAudit(flow) {
  const cards = flow.cards || {};
  const ids = Object.keys(cards);
  const incoming = Object.fromEntries(ids.map((id) => [id, []]));
  const dangling = [];

  for (const [sourceId, card] of Object.entries(cards)) {
    for (const key of OUTPUT_KEYS) {
      for (const targetId of Array.isArray(card[key]) ? card[key] : []) {
        if (!cards[targetId]) dangling.push({ sourceId, targetId, output: key });
        else incoming[targetId].push(sourceId);
      }
    }
  }

  const roots = ids.filter((id) => ['trigger', 'start'].includes(cards[id]?.type));
  const reachable = new Set(roots);
  let changed = true;
  while (changed) {
    changed = false;
    for (const sourceId of [...reachable]) {
      for (const targetId of outputTargets(cards[sourceId])) {
        if (!cards[targetId] || reachable.has(targetId)) continue;
        const ready = cards[targetId].type !== 'all'
          || (incoming[targetId].length > 0 && incoming[targetId].every((id) => reachable.has(id)));
        if (ready) {
          reachable.add(targetId);
          changed = true;
        }
      }
    }
  }

  return {
    cardCount: ids.length,
    rootCount: roots.length,
    actionCount: ids.filter((id) => cards[id]?.type === 'action').length,
    dangling,
    unreachable: ids.filter((id) => cards[id]?.type !== 'note' && !reachable.has(id)),
    emptyRoots: roots.filter((id) => outputTargets(cards[id]).length === 0),
  };
}

function deviceIdFromCard(card) {
  return String(card?.id || '').match(/^homey:device:([^:]+)/)?.[1] || null;
}

function appIdFromCard(card) {
  return String(card?.id || '').match(/^homey:app:([^:]+)/)?.[1] || null;
}

function appIdFromDevice(device) {
  return String(device?.ownerUri || device?.driverUri || '').match(/^homey:app:([^:]+)/)?.[1] || null;
}

function isAppRunning(app) {
  if (!app || app.enabled === false) return false;
  return !['stopped', 'crashed', 'error', 'killed'].includes(String(app.state || '').toLowerCase());
}

function isZigbee(device) {
  const settings = device?.settings || {};
  return Boolean(settings.zb_ieee_address)
    || Boolean(settings.zb_device_type)
    || (device?.flags || []).includes('zigbee');
}

function battery(device) {
  const entries = Object.entries(device?.capabilitiesObj || {})
    .filter(([id, capability]) => id.startsWith('measure_battery')
      && capability?.value !== null
      && capability?.value !== undefined
      && capability?.value !== ''
      && Number.isFinite(Number(capability.value)))
    .map(([id, capability]) => ({ id, value: Number(capability.value), lastUpdated: capability.lastUpdated || null }));
  if (!entries.length) return null;
  return entries.reduce((lowest, entry) => entry.value < lowest.value ? entry : lowest, entries[0]);
}

function ageDays(value, now = Date.now()) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, now - timestamp) / 86400000;
}

function zonePath(zones, zoneId) {
  const parts = [];
  const seen = new Set();
  let current = zones[zoneId];
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.name || current.id);
    current = zones[current.parent];
  }
  return parts.join(' / ') || null;
}

function localized(en, de) {
  return { en, de };
}

function findingId(finding) {
  const identity = [finding.code, finding.group, finding.subject || ''].join('|').toLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `finding_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function calculateScores(findings) {
  const grouped = Object.fromEntries(Object.keys(GROUPS).map((group) => [group, []]));
  for (const finding of findings) grouped[finding.group]?.push(finding);
  const categories = {};
  for (const [group, groupFindings] of Object.entries(grouped)) {
    const codeCounts = new Map();
    for (const finding of groupFindings) {
      const severity = finding.effectiveSeverity || finding.severity;
      const key = `${finding.code}:${severity}`;
      const previous = codeCounts.get(key) || { severity, count: 0 };
      previous.count += Number(finding.count || 1);
      codeCounts.set(key, previous);
    }
    let remaining = 1;
    for (const item of codeCounts.values()) {
      const penalty = BASE_PENALTY[item.severity]
        * (1 + Math.log2(Math.max(1, item.count)) * 0.35);
      remaining *= 1 - Math.min(80, penalty) / 100;
    }
    categories[group] = Math.max(0, Math.round(100 * remaining));
  }

  const overall = Math.round(Object.entries(GROUPS).reduce((sum, [group, config]) => (
    sum + categories[group] * config.weight / 100
  ), 0));
  const summary = Object.fromEntries(Object.keys(BASE_PENALTY).map((severity) => [
    severity,
    findings.filter((finding) => (finding.effectiveSeverity || finding.severity) === severity).length,
  ]));
  return { overall, categories, summary };
}

function applyFindingAnnotations(report, annotations = {}) {
  if (!report) return null;
  const prioritySeverity = {
    critical: 'critical', high: 'high', medium: 'medium', low: 'low', unimportant: 'info',
  };
  const annotated = values(report.findings).map((finding) => {
    const id = finding.id || findingId(finding);
    const annotation = annotations[id] || null;
    const priority = annotation?.priority || 'auto';
    return {
      ...finding,
      id,
      effectiveSeverity: prioritySeverity[priority] || finding.severity,
      ignored: annotation?.ignored === true,
      annotation: annotation ? {
        priority,
        status: annotation.status || 'open',
        note: annotation.note || '',
        updatedAt: annotation.updatedAt || null,
      } : null,
    };
  });
  const active = annotated.filter((finding) => !finding.ignored);
  const ignored = annotated.filter((finding) => finding.ignored);
  const sortFindings = (items) => items.sort((a, b) => (
    SEVERITY_RANK[b.effectiveSeverity] - SEVERITY_RANK[a.effectiveSeverity]
      || String(a.subject).localeCompare(String(b.subject))
  ));
  sortFindings(active);
  sortFindings(ignored);
  const scored = calculateScores(active);

  return {
    ...report,
    schemaVersion: 2,
    originalScore: report.originalScore || report.score,
    score: {
      ...report.score,
      overall: scored.overall,
      categories: scored.categories,
      method: `${report.score.method} Ignored findings and user priority overrides are applied before scoring.`,
    },
    summary: scored.summary,
    management: {
      active: active.length,
      ignored: ignored.length,
      annotated: annotated.filter((finding) => finding.annotation).length,
    },
    findings: active,
    ignoredFindings: ignored,
  };
}

function analyzeSnapshot(snapshot) {
  const normalFlows = mapById(snapshot.normalFlows);
  const advancedFlows = mapById(snapshot.advancedFlows);
  const folders = mapById(snapshot.flowFolders);
  const devices = mapById(snapshot.devices);
  const variables = mapById(snapshot.variables);
  const apps = mapById(snapshot.apps);
  const zones = mapById(snapshot.zones);
  const findings = [];
  const variableReferences = new Set();
  const appReferences = new Map();
  const deviceReferences = new Map();

  const add = (finding) => findings.push({ confidence: 'confirmed', ...finding });
  const remember = (map, id, flow) => {
    if (!map.has(id)) map.set(id, new Set());
    map.get(id).add(flow.name || flow.id);
  };

  const allFlows = [
    ...values(normalFlows).map((flow) => ({ flow, kind: 'normal' })),
    ...values(advancedFlows).map((flow) => ({ flow, kind: 'advanced' })),
  ];

  const duplicateNames = new Map();
  for (const { flow } of allFlows) {
    const key = String(flow.name || '').trim().toLowerCase();
    if (key) duplicateNames.set(key, [...(duplicateNames.get(key) || []), flow]);
  }
  for (const duplicates of duplicateNames.values()) {
    if (duplicates.length < 2) continue;
    add({
      code: 'duplicate_flow_name', group: 'maintenance', severity: 'low',
      title: localized('Several flows have the same name', 'Mehrere Flows haben denselben Namen'),
      recommendation: localized('Use unique names so reports and repairs identify the correct flow.', 'Eindeutige Namen verwenden, damit Bericht und Reparatur den richtigen Flow treffen.'),
      subject: duplicates.map((flow) => flow.name).join(', '), count: duplicates.length,
    });
  }

  for (const { flow, kind } of allFlows) {
    const enabled = flow.enabled !== false;
    const severityWhenActive = (active, inactive = 'info') => enabled ? active : inactive;
    const subject = flow.name || flow.id;

    if (flow.broken) add({
      code: 'flow_broken', group: 'flows', severity: severityWhenActive('critical', 'medium'),
      title: localized('Flow is marked as broken', 'Flow ist als defekt markiert'),
      recommendation: localized('Back up the flow and replace the missing card or reference.', 'Flow sichern und die fehlende Karte oder Referenz gezielt ersetzen.'),
      subject,
    });

    const folderId = flow.folder || flow.folderId;
    if (folderId && !folders[folderId]) add({
      code: 'missing_flow_folder', group: 'maintenance', severity: severityWhenActive('medium', 'low'),
      title: localized('Flow references a missing folder', 'Flow verweist auf einen fehlenden Ordner'),
      recommendation: localized('Assign an existing folder after a backup.', 'Nach einer Sicherung einen vorhandenen Ordner zuweisen.'),
      subject,
    });

    let reachable = null;
    if (kind === 'normal') {
      if (!flow.trigger?.id) add({
        code: 'normal_no_trigger', group: 'flows', severity: severityWhenActive('high', 'low'),
        title: localized('Normal Flow has no valid trigger', 'Normaler Flow hat keinen gültigen Auslöser'),
        recommendation: localized('Restore the trigger or keep the draft disabled.', 'Auslöser wiederherstellen oder den Entwurf deaktiviert lassen.'),
        subject,
      });
      if (!values(flow.actions).length) add({
        code: 'normal_no_action', group: 'flows', severity: severityWhenActive('medium', 'low'),
        title: localized('Normal Flow has no action', 'Normaler Flow hat keine Aktion'),
        recommendation: localized('Confirm that this is an intentional draft.', 'Prüfen, ob es sich bewusst um einen Entwurf handelt.'),
        subject,
      });
    } else if (!flow.cards) {
      add({
        code: 'advanced_not_readable', group: 'flows', severity: 'medium',
        title: localized('Advanced Flow could not be fully read', 'Advanced Flow konnte nicht vollständig gelesen werden'),
        recommendation: localized('Run the scan again before drawing conclusions about this flow.', 'Den Scan wiederholen, bevor dieser Flow bewertet wird.'),
        subject,
      });
    } else {
      const graph = graphAudit(flow);
      reachable = new Set(Object.keys(flow.cards).filter((id) => !graph.unreachable.includes(id)));
      if (graph.cardCount && !graph.rootCount) add({
        code: 'advanced_no_root', group: 'flows', severity: severityWhenActive('high', 'low'),
        title: localized('Advanced Flow has no trigger or start card', 'Advanced Flow hat keinen Trigger oder Start-Knoten'),
        recommendation: localized('Add a valid entry point or keep the draft disabled.', 'Gültigen Einstieg ergänzen oder den Entwurf deaktiviert lassen.'),
        subject,
      });
      if (graph.cardCount && !graph.actionCount) add({
        code: 'advanced_no_action', group: 'flows', severity: severityWhenActive('medium', 'low'),
        title: localized('Advanced Flow has no action card', 'Advanced Flow hat keine Aktionskarte'),
        recommendation: localized('Check whether an action is missing or the flow is only a draft.', 'Prüfen, ob eine Aktion fehlt oder der Flow nur ein Entwurf ist.'),
        subject,
      });
      if (graph.dangling.length) add({
        code: 'advanced_dangling_edges', group: 'flows', severity: severityWhenActive('critical', 'medium'),
        title: localized('Advanced Flow contains broken connections', 'Advanced Flow enthält beschädigte Verbindungen'),
        recommendation: localized('Back up and reconnect only the affected cards.', 'Sichern und nur die betroffenen Karten neu verbinden.'),
        subject, count: graph.dangling.length,
      });
      if (graph.unreachable.length) add({
        code: 'advanced_unreachable_cards', group: 'maintenance', severity: severityWhenActive('medium', 'low'), confidence: 'high',
        title: localized('Cards cannot be reached from a trigger', 'Karten sind von keinem Trigger erreichbar'),
        recommendation: localized('Connect intentional cards and remove confirmed leftovers after a backup.', 'Beabsichtigte Karten verbinden und bestätigte Altlasten erst nach einer Sicherung entfernen.'),
        subject, count: graph.unreachable.length,
      });
      if (graph.emptyRoots.length) add({
        code: 'advanced_empty_roots', group: 'flows', severity: severityWhenActive('medium', 'low'),
        title: localized('Trigger or start card has no output', 'Trigger oder Start-Knoten hat keinen Ausgang'),
        recommendation: localized('Connect the entry card or remove the unused draft.', 'Einstieg verbinden oder den ungenutzten Entwurf entfernen.'),
        subject, count: graph.emptyRoots.length,
      });
    }

    for (const [cardKey, card] of cardEntries(flow, kind)) {
      if (reachable && !reachable.has(cardKey)) continue;
      const runtimeSeverity = enabled ? 'high' : 'info';
      const deviceId = deviceIdFromCard(card);
      if (deviceId) {
        remember(deviceReferences, deviceId, flow);
        if (!devices[deviceId]) add({
          code: 'missing_device_reference', group: 'flows', severity: enabled ? 'critical' : 'medium',
          title: localized('Flow card references a missing device', 'Flow-Karte verweist auf ein fehlendes Gerät'),
          recommendation: localized('Back up and select the intended device again.', 'Sichern und das beabsichtigte Gerät erneut auswählen.'),
          subject,
        });
        else if (devices[deviceId].available === false) add({
          code: 'flow_uses_unavailable_device', group: 'flows', severity: enabled ? 'medium' : 'info',
          title: localized('Active path uses an unavailable device', 'Aktiver Pfad nutzt ein nicht verfügbares Gerät'),
          recommendation: localized('Confirm seasonal devices; repair the device before changing the flow.', 'Saisonale Geräte bestätigen; das Gerät vor einer Flow-Änderung reparieren.'),
          subject: `${subject} → ${devices[deviceId].name || deviceId}`,
        });
      }

      const appId = appIdFromCard(card);
      if (appId) {
        remember(appReferences, appId, flow);
        if (!apps[appId]) add({
          code: 'missing_app_reference', group: 'flows', severity: enabled ? 'critical' : 'medium',
          title: localized('Flow card belongs to a missing app', 'Flow-Karte gehört zu einer fehlenden App'),
          recommendation: localized('Restore the dependency or replace the card after a backup.', 'Abhängigkeit wiederherstellen oder Karte nach Sicherung ersetzen.'),
          subject,
        });
        else if (!isAppRunning(apps[appId])) add({
          code: 'inactive_app_reference', group: 'flows', severity: runtimeSeverity,
          title: localized('Flow depends on an inactive app', 'Flow hängt von einer inaktiven App ab'),
          recommendation: localized('Check the app state and affected paths before enabling anything.', 'App-Zustand und betroffene Pfade prüfen, bevor etwas aktiviert wird.'),
          subject: `${subject} → ${apps[appId].name || appId}`,
        });
      }

      const json = JSON.stringify(card);
      for (const match of json.matchAll(/homey:manager:logic(?:\\u007c|\|)([0-9a-f-]{36})/gi)) {
        variableReferences.add(match[1]);
        if (!variables[match[1]]) add({
          code: 'missing_logic_token', group: 'flows', severity: enabled ? 'critical' : 'medium',
          title: localized('Flow contains a token for a missing variable', 'Flow enthält einen Token einer fehlenden Variable'),
          recommendation: localized('Select a current variable in the affected card.', 'In der betroffenen Karte eine aktuelle Variable auswählen.'),
          subject,
        });
      }
      const variableId = card.args?.variable?.id;
      if (variableId) {
        variableReferences.add(variableId);
        if (!variables[variableId]) add({
          code: 'missing_logic_variable', group: 'flows', severity: enabled ? 'critical' : 'medium',
          title: localized('Logic card references a missing variable', 'Logikkarte verweist auf eine fehlende Variable'),
          recommendation: localized('Select a valid variable after backing up the flow.', 'Nach einer Flow-Sicherung eine gültige Variable auswählen.'),
          subject,
        });
      }
    }
  }

  let zigbeeCount = 0;
  let zigbeeRouters = 0;
  let zigbeeEndDevices = 0;
  for (const device of values(devices)) {
    const subject = [device.name || device.id, zonePath(zones, device.zone)].filter(Boolean).join(' · ');
    const zigbee = isZigbee(device);
    if (zigbee) {
      zigbeeCount += 1;
      const type = String(device.settings?.zb_device_type || '').toLowerCase();
      if (type === 'router') zigbeeRouters += 1;
      if (type === 'enddevice') zigbeeEndDevices += 1;

      const lastSeenDays = ageDays(device.lastSeenAt);
      const staleSeverity = type === 'router'
        ? (lastSeenDays >= 1 ? 'high' : lastSeenDays >= 0.25 ? 'medium' : null)
        : (lastSeenDays >= 7 ? 'high' : lastSeenDays >= 2 ? 'medium' : null);
      if (staleSeverity) add({
        code: 'zigbee_device_stale', group: 'devices', severity: staleSeverity, confidence: 'high',
        title: localized('Zigbee device has not reported recently', 'Zigbee-Gerät hat sich länger nicht gemeldet'),
        recommendation: localized('Check power and placement. A stale timestamp alone does not prove a mesh defect.', 'Stromversorgung und Platzierung prüfen. Ein alter Zeitstempel allein beweist keinen Mesh-Defekt.'),
        subject: `${subject} · ${Math.round(lastSeenDays * 10) / 10} days`,
      });
    }

    if (device.available === false) add({
      code: 'device_unavailable', group: 'devices', severity: deviceReferences.has(device.id) ? 'high' : 'medium',
      title: localized('Device is unavailable', 'Gerät ist nicht verfügbar'),
      recommendation: localized('Check power, range and the owning app. Do not change flows first.', 'Strom, Reichweite und Geräte-App prüfen. Nicht zuerst die Flows ändern.'),
      subject,
    });

    const level = battery(device);
    if (level && ageDays(level.lastUpdated) >= 90) add({
      code: 'battery_reading_stale', group: 'maintenance', severity: 'low', confidence: 'heuristic',
      title: localized('Battery reading may be stale', 'Batteriewert könnte veraltet sein'),
      recommendation: localized('Wait for a real device wake-up and confirm a fresh value before replacing the battery.', 'Ein echtes Aufwachen des Geräts abwarten und vor einem Wechsel einen frischen Wert bestätigen.'),
      subject: `${subject} · ${level.value}%`,
    });
    else if (level && level.value <= 5) add({
      code: 'battery_critical', group: 'devices', severity: 'critical',
      title: localized('Battery is critically low', 'Batterie ist kritisch niedrig'),
      recommendation: localized('Replace or charge the battery and confirm a fresh reading.', 'Batterie ersetzen oder laden und einen frischen Messwert bestätigen.'),
      subject: `${subject} · ${level.value}%`,
    });
    else if (level && level.value <= 20) add({
      code: 'battery_low', group: 'devices', severity: 'medium',
      title: localized('Battery is low', 'Batterie ist niedrig'),
      recommendation: localized('Plan a replacement and verify the value after the device wakes.', 'Wechsel einplanen und den Wert nach dem Aufwachen des Geräts verifizieren.'),
      subject: `${subject} · ${level.value}%`,
    });
  }

  for (const app of values(apps)) {
    if (app.enabled !== false && !isAppRunning(app)) add({
      code: 'enabled_app_not_running', group: 'apps', severity: 'high',
      title: localized('Enabled app is not running', 'Aktivierte App läuft nicht'),
      recommendation: localized('Inspect diagnostics and dependencies before restarting the app.', 'Diagnose und Abhängigkeiten prüfen, bevor die App neu gestartet wird.'),
      subject: app.name || app.id,
    });
  }

  for (const variable of values(variables)) {
    if (!variableReferences.has(variable.id)) add({
      code: 'possibly_unused_variable', group: 'maintenance', severity: 'info', confidence: 'heuristic',
      title: localized('Variable is not referenced by a scanned flow', 'Variable wird von keinem geprüften Flow referenziert'),
      recommendation: localized('Treat this as a review hint; scripts may still use the variable.', 'Nur als Prüfhinweis behandeln; Skripte können die Variable weiterhin verwenden.'),
      subject: variable.name || variable.id,
    });
  }

  for (const [key, status] of Object.entries(snapshot.coverage || {})) {
    if (!status.ok) add({
      code: 'scan_coverage_incomplete', group: 'maintenance', severity: 'medium',
      title: localized('A data source could not be read', 'Eine Datenquelle konnte nicht gelesen werden'),
      recommendation: localized('Run the scan again; do not treat this report as complete.', 'Scan wiederholen; diesen Bericht nicht als vollständig behandeln.'),
      subject: key,
    });
  }

  for (const finding of findings) finding.id = findingId(finding);
  const scored = calculateScores(findings);
  findings.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    || String(a.subject).localeCompare(String(b.subject)));

  return {
    schemaVersion: 1,
    generatedAt: snapshot.generatedAt || new Date().toISOString(),
    source: snapshot.source || 'unknown',
    mode: 'read-only',
    privacy: { localProcessing: true, externalTransfer: false },
    score: {
      overall: scored.overall,
      categories: scored.categories,
      weights: Object.fromEntries(Object.entries(GROUPS).map(([key, value]) => [key, value.weight])),
      method: 'Each severity-specific finding type reduces the remaining category score; repetitions scale logarithmically.',
    },
    inventory: {
      normalFlows: values(normalFlows).length,
      advancedFlows: values(advancedFlows).length,
      enabledFlows: allFlows.filter(({ flow }) => flow.enabled !== false).length,
      devices: values(devices).length,
      unavailableDevices: values(devices).filter((device) => device.available === false).length,
      apps: values(apps).length,
      variables: values(variables).length,
      zigbee: {
        detectedDevices: zigbeeCount,
        routers: zigbeeRouters,
        endDevices: zigbeeEndDevices,
        scope: 'Device metadata, availability and battery only; no radio repair or configuration changes.',
      },
    },
    summary: scored.summary,
    coverage: snapshot.coverage || {},
    findings,
  };
}

module.exports = { analyzeSnapshot, graphAudit, applyFindingAnnotations, calculateScores, findingId };
