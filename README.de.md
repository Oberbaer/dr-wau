# Dr. Wau 🐶🔧⚙️👀

[![Node.js >=22](https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue.svg)](LICENSE)

Dr. Wau ist eine native Homey-Pro-App für Automationsprüfungen, Batterieüberwachung und Konfigurationsbackups. Die unterstützte Implementierung liegt unter [`Homey_Watchdog/`](Homey_Watchdog/README.md). Die bisherige Watchdog-App-ID bleibt erhalten, damit Einstellungen bei einem Update erhalten bleiben.

English documentation: [README.md](README.md)

## Funktionen

- Fünf Hauptansichten: Dr. Waus Revier, Automation Health, Gerätewache, Backups und Verwaltung.
- Nachvollziehbarer Gesamt- und Kategoriescore für Flows, Geräte, Apps und Wartbarkeit.
- Aktive Befunde mit Priorität, Status, Notizen und dauerhaften Entscheidungen.
- Mehrstufige Lebenszeichenbewertung mit nativen Zeitstempeln, Capability-Meldungen und geprüften Insights-Rohereignissen; Batterieprobleme werden getrennt bewertet.
- Gerätebezogene Lernhistorie ab 0.7.0 mit höchstens 96 bestätigten Meldezeitpunkten pro Gerät, nachvollziehbarer Konfidenz und individueller Warnschwelle. Für mittlere Sicherheit braucht Dr. Wau mindestens 10 Intervalle über 3 Tage, für hohe Sicherheit 20 über 7 Tage. Eine einzelne lange Stille wird nicht als normal gelernt.
- Annahmen und Lernphase bleiben sichtbar. Manuelle Profile und Bestätigungen haben Vorrang; vorhandene 0.6.0-Einstellungen werden erhalten. Aggregierte Insights, gespeicherte Werte und `available:true` gelten weiterhin nicht als neue Meldung.
- Urlaubsmodus mit optionalem Enddatum und Regeln pro Gerät. Batterieprobleme und eine ausdrückliche Nichtverfügbarkeit bleiben aktiv. Flow-Karten schalten den Modus ein oder aus und prüfen seinen Status.
- Einstellbare Prüf-, Warn- und Wiederholungsintervalle.
- Homey-Timeline-Meldungen, direkte Push-Empfänger per Häkchen und ein optionaler Homey-Flow-Trigger.
- Geräte- und Zonenausschlüsse samt Unterzonen, Ignorieren-Schalttafel, lokale Berichtsspeicherung und JSON-Export.
- Integrierte Backups mit Zeitplan, Netzwerkzielen und gezielter Wiederherstellung nach ausdrücklicher Bestätigung.
- Backup-Verwaltung in Deutsch, Englisch und Niederländisch, mit blau-cremefarbener Gestaltung, Dunkelmodus und einer kompakten Statusübersicht.
- Rein lesende Analyse: Die App repariert keine Flows, steuert keine Geräte und weckt keine Batteriegeräte auf.

## Screenshots

Screenshots sind geplant, aber absichtlich noch nicht enthalten. Zukünftige Dateien verwenden ausschließlich diese Pfade:

- `docs/images/overview.png`
- `docs/images/automation-health.png`
- `docs/images/battery-watchdog.png`
- `docs/images/active-findings.png`
- `docs/images/finding-management.png`
- `docs/images/ignore-board.png`
- `docs/images/watchdog-notification.png`

## Installation

Voraussetzungen:

- Homey Pro mit Homey SDK 3 und App-Kompatibilität `>=12.4.0`.
- Node.js 22 oder neuer.
- npm und ein Homey-Konto mit Berechtigung zur Installation von Entwickler-Apps.

```sh
git clone https://github.com/Oberbaer/homey-battery-watchdog.git
cd homey-battery-watchdog/Homey_Watchdog
npm install
npx homey login
npx homey app install
```

Der letzte Befehl installiert die App auf dem in der Homey CLI ausgewählten Homey. Er veröffentlicht die App nicht im Homey App Store.

## Erste Einrichtung

1. In Homey **Apps > Dr. Wau > Einstellungen** öffnen.
2. Die Übersicht prüfen und den ersten Automation-Health-Scan starten.
3. Den Batterie-Watchdog öffnen und die erkannten Batteriegeräte kontrollieren.
4. Als empfohlene Startwerte **6 h** Prüfintervall, **24 h** bis zur Warnung und **6 h** bis zur Wiederholung verwenden.
5. Automatische Prüfungen und die gewünschten Benachrichtigungskanäle aktivieren.
6. Bei Bedarf Geräte oder ganze Zonen außer Betrieb nehmen und anschließend speichern.
7. Einmal manuell prüfen. Dabei steuert die App kein Gerät.

## Übersicht

Die Übersicht ist die Startseite. Sie führt zu den beiden Hauptmodulen und zeigt auf einen Blick den letzten Automation-Health-Score sowie den Status des letzten Watchdog-Laufs.

## Automation Health

Automation Health führt einen rein lesenden Scan aus und zeigt:

- Gesamtscore
- Flows
- Geräte
- Apps
- Wartbarkeit
- Aktive Befunde

Der Bericht lässt sich nach Kategorien filtern und als JSON exportieren. Befunde erklären die Beobachtung und geben eine Empfehlung; die App führt keine Reparaturen automatisch aus.

## Batterie-Watchdog

Der Batterie-Watchdog bewertet Geräte, die eine Batteriefunktion bereitstellen. Seine Einstellungen sind:

- Prüfintervall
- Warnung nach
- Wiederholung nach
- Automatische Prüfungen
- Homey-Timeline
- Direkte Push-Empfänger per Häkchen und optionaler Benachrichtigungs-Flow-Auslöser
- Ausgeschlossene Batteriegeräte
- Ausgeschlossene Zonen einschließlich aller Unterzonen
- Geräteprofile und individuelle Zeitgrenzen, getrennte Batterieschwellen und eine Vorschau ohne Benachrichtigungen

Zonenausschlüsse unterdrücken auch Geräte- und Batteriebefunde im nächsten Automation-Health-Scan. Andere Flow- und App-Befunde bleiben sichtbar.

## Backups

Der Backup-Bereich integriert Backup Center von Dennis Weel mit dessen MIT-Lizenz und Urheberhinweisen. Backups können manuell oder geplant erstellt und an konfigurierte WebDAV-, SMB-, SFTP- oder FTP-Ziele übertragen werden. Wiederherstellungen erfolgen nur nach Auswahl und Bestätigung.

Die bisherige Backup-Center-App besitzt eine andere Homey-App-ID. Zugangsdaten, Ziele und Zeitplan müssen in Dr. Wau neu eingetragen und geprüft werden, bevor die alte App deaktiviert wird. Vorhandene Backup-Dateien können weiterhin zum Wiederherstellen verwendet werden.

Die empfohlenen Standardwerte sind **6 h / 24 h / 24 h**; bestehende Intervalle bleiben erhalten. Die Prüfung berücksichtigt natives `lastSeenAt`, relevante Capability-Zeitstempel und bestätigte Rohereignisse der Geräte-App in Insights. Numerische Insights-Zeitraster und gespeicherte Werte ohne Zeitstempel belegen keine frische Kommunikation. Kontakte und Taster ohne Kommunikations-Zeitstempel warnen nicht wegen Nichtbenutzung. Alte periodische Messwerte sind ein Prüfhinweis, kein Offline-Beweis. Batterie und Verfügbarkeit werden getrennt bewertet. Unveränderte Probleme wiederholen sich nur nach dem eingestellten Intervall; bestätigte Entwarnungen gehen einmalig an zuvor benachrichtigte Empfänger. Es werden weder Zeitstempel noch Batteriestände erfunden.

## Aktive Befunde

Aktive Befunde zeigen die aktuellen Beobachtungen von Automation Health. Sie sind nach Flows, Geräten, Apps oder Wartbarkeit gruppiert und enthalten Schweregrad, betroffenes Objekt und Empfehlung. Ignorierte Befunde beeinflussen den aktiven Score nicht.

## Befundverwaltung

Für jeden Befund lässt sich eine dauerhafte Entscheidung speichern:

- Priorität
- Status
- Notiz
- Bei künftigen Scans und im Score ignorieren
- Speichern
- Entscheidung zurücksetzen
- Archiv / Ignorieren-Schalttafel

Diese Entscheidungen verbleiben lokal in der Homey-App und werden nach späteren Scans erneut angewendet.

## Ignorieren-Schalttafel & Archiv

Die Ansicht Verwaltung enthält die Ignorieren-Schalttafel und das Archiv. Dort bleiben ignorierte und früher bearbeitete Befunde sichtbar, lassen sich nach Kategorien filtern und jederzeit wiederherstellen.

## Benachrichtigungen

Timeline-Meldungen werden bei aktivierter Option direkt von der App erstellt. Für direkte Handy-Pushs zuerst den gemeinsamen Homey API Key unter Backups einrichten (Flow-Schreibrecht erforderlich), anschließend die Empfänger im Batterie-Watchdog anhaken. Ohne ausgewählte Benutzer sendet die App keinen direkten Push.

Die getrennte Option **Meinen Homey-Benachrichtigungs-Flow auslösen** unterstützt bestehende eigene Flows:

1. **Wenn:** Homey Watchdog — eine Batterie-Watchdog-Warnung wird gesendet.
2. **Dann:** Handy-Push an die gewünschten Homey-Benutzer senden.
3. Das `text`-Token des Triggers als Meldungstext verwenden.

Die App unterdrückt unveränderte Wiederholungswarnungen getrennt pro Kanal und Empfänger. Fehlgeschlagene Zustellungen können erneut versucht werden, ohne erfolgreiche Zustellungen zu wiederholen. Falls ein eigener Flow ebenfalls Pushs sendet, seinen Auslöser bei direkten Pushs ausschalten, um doppelte Meldungen zu vermeiden.

## Datenschutz & Sicherheit

Analyse und dauerhafter Zustand verbleiben auf dem Homey des Eigentümers. Die App benötigt keinen externen Dienst. Das Repository enthält keine Homey-Tokens, Geräteinventare oder produktiven Exporte. Die App-APIs sind nur für den Eigentümer zugänglich. Weitere Informationen: [Datenschutz](Homey_Watchdog/PRIVACY.md), [Sicherheit](Homey_Watchdog/SECURITY.md) und [Hinweise zu Drittsoftware](Homey_Watchdog/THIRD_PARTY_NOTICES.md).

## Entwicklung

Entwicklungsbefehle werden im App-Verzeichnis ausgeführt:

```powershell
cd Homey_Watchdog
npm.cmd ci
npm.cmd test
npm.cmd run validate:publish
npx.cmd homey app build
```

Diese Befehle installieren Abhängigkeiten, führen Tests aus, validieren das Homey-Manifest auf Publish-Level und erstellen einen lokalen Build. Sie installieren nichts auf Homey und veröffentlichen kein Release. Das Projekt steht unter der [MIT-Lizenz](LICENSE).
