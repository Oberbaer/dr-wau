'use strict';

const HOUR = 3600000;
function normalizeVacation(input = {}) {
  if (!input || typeof input !== 'object') input = {};
  const until = typeof input.until === 'string' && Number.isFinite(Date.parse(input.until)) ? new Date(input.until).toISOString() : null;
  return { enabled: input.enabled === true, until };
}

function isVacationActive(vacation, now = Date.now()) {
  return vacation?.enabled === true && (!vacation.until || Date.parse(vacation.until) > now);
}

function vacationDecision(device, profile, config, now = Date.now()) {
  const active = isVacationActive(config.vacation, now);
  const setting = config.deviceProfiles?.[device.id] || {};
  const rule = setting.vacationMode || 'auto';
  if (!active) return { active: false, rule: 'normal', warningAfterHours: profile.warningAfterHours };
  const capabilities = device.capabilities || Object.keys(device.capabilitiesObj || {});
  if (capabilities.some(id => /^(alarm_smoke|alarm_water|alarm_co)(\.|$)/.test(id))) {
    return { active: true, rule: 'normal', warningAfterHours: profile.warningAfterHours };
  }
  const technical = ['sensor', 'vacuum'].includes(profile.deviceClass) || (profile.mode === 'learned' && profile.learning?.confidence !== 'low');
  const chosen = rule === 'auto' ? technical ? 'normal' : 'pause' : rule;
  const factor = Number(setting.vacationFactor) >= 1 && Number(setting.vacationFactor) <= 8 ? Number(setting.vacationFactor) : 2;
  return { active: true, rule: chosen, warningAfterHours: chosen === 'pause' ? null : chosen === 'extend'
    ? Math.min(720, (profile.warningAfterHours || config.staleHours || 24) * factor) : profile.warningAfterHours };
}

module.exports = { normalizeVacation, isVacationActive, vacationDecision, HOUR };
