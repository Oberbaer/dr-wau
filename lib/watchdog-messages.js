'use strict';

function problemMessage(type, context = {}) {
  const hours = Math.floor(context.ageHours || 0);
  if (type === 'learned_silence') return `sonst regelmäßig zu hören; seit ${hours} h keine bestätigte Meldung. Kommunikation prüfen`;
  if (type === 'manual_silence') return `seit ${hours} h keine bestätigte Meldung; eigene Warnschwelle überschritten. Kommunikation prüfen`;
  if (type === 'heartbeat_stale') return `seit ${hours} h kein bestätigtes Lebenszeichen (${context.sourceLabel})`;
  if (type === 'measurement_stale') return `seit ${hours} h keine aktuelle Zustands-/Messwertänderung (${context.sourceLabel}); Kommunikation nicht sicher beurteilbar`;
  if (type === 'unavailable') return 'Homey meldet nicht verfügbar; Verbindung und Geräte-App prüfen';
  return '';
}

function notificationPrefix(kind, severity) {
  if (kind === 'recovery') return '✅ Dr. Wau: ';
  return severity === 'critical' ? '🚨 Dr. Wau: ' : '⚠️ Dr. Wau: ';
}

module.exports = { problemMessage, notificationPrefix };
