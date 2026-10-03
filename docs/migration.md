# Dr. Wau 1.0.0: Identität und Konfiguration

Die Legacy-App `com.oberbaer.homeywatchdog` (0.7.1) und Dr. Wau
`com.oberbaer.drwau` (1.0.0) sind zwei getrennte Homey-Apps. Ein normales Update
überträgt ihre Settings nicht. Die alte App bleibt als Rollback installiert.
Bestehende Flow-Karten behalten ihre App-ID und werden nicht automatisch ersetzt.

## Projekt

Das bestehende GitHub-Repository wurde unter Erhalt der Historie in
[`Oberbaer/dr-wau`](https://github.com/Oberbaer/dr-wau) umbenannt. Der lokale
Ordner `Dr_Wau` ist direkt der Homey-App-Root. VS Code kann dort Manifest,
Compose-Dateien und npm-Konfiguration erkennen. Der frühere Unterordner
`Homey_Watchdog` ist ausschließlich eine historische Bezeichnung.

## Expliziter Transfer

1. Alte Warnungen und alle Ausgabekanäle deaktiviert lassen.
2. Aus dem App-Root mit der angemeldeten Homey-CLI exportieren:
   `node tools/export-legacy-config.cjs <ausdrücklich ausgewählte Homey-ID>`.
   Der Export nutzt die offizielle Owner-API. Er aktualisiert die alte App nicht.
   Eine bestehende Exportdatei wird nicht überschrieben. Optional kann ein neuer
   Dateiname innerhalb des ignorierten `artifacts/`-Ordners angegeben werden.
3. Die neue App als Development-App installieren. Keine produktive Aktivierung.
4. In **Verwaltung → Konfiguration übertragen** die JSON-Datei auswählen.
5. Vorschau prüfen. Die Vorschau schreibt keine Settings.
6. Das Ersetzen der App-Einstellungen ausdrücklich bestätigen und importieren.
   Vorhandene neue Settings derselben Bereiche werden ersetzt.
7. Werte vergleichen und Zugangsdaten neu eingeben. Aktivierung erst gesondert
   abstimmen; niemals zwei Warnsysteme parallel betreiben.

Die neue App liest niemals selbst Settings der Legacy-App. Die CLI exportiert
nur nach ausdrücklicher Auswahl des angemeldeten Homey. Exportdateien enthalten
private Geräte-/Zonen-/Empfänger-IDs, Lernzeiten und Anmerkungen: lokal behalten,
nicht in Git, Issues oder Screenshots veröffentlichen.

## Format und Daten

`dr-wau-migration`, Schema **1**, akzeptiert Legacy-ID mit Version **0.7.1**
oder die neue ID mit Version **1.0.0**. Metadaten und Datentypen werden geprüft.
Unbekannte Settings, falsche Schemas, unpassende Herkunft und erkennbare
Credential-Felder werden zurückgewiesen. Die Bestätigung gilt nur für die
unveränderte, innerhalb von zehn Minuten geprüfte Datei.

Leere und teilweise Exporte sind zulässig: ausgelassene Bereiche bleiben
unverändert, ausdrücklich enthaltene leere Bereiche ersetzen ihre bisherigen
Werte. Verschachtelte Statistik-, Profil- und Suppression-Werte werden vor
jedem Schreibzugriff geprüft. Laufende Scans, Watchdog- und Backup-/Restore-Jobs
blockieren den Import; ein bereits beendeter Restore blockiert ihn nicht.

| Bereich | Transfer |
|---|---|
| Intervalle, Batteriegrenzen, manuelle Profile/Overrides | Aktive Werte erhalten |
| Ignorierte Geräte und Zonen | Erhalten |
| Kompatible Lernhistorie und Suppression Schema 2 | Erhalten |
| Finding-Anmerkungen | Erhalten; kein aktueller Diagnosebericht übertragen |
| Backup-Ziele, Zeit, Wochentage, Ziel und Empfänger | Erhalten, Zeitplan deaktiviert |
| Watchdog-Aktivierung, Timeline, Flow-Trigger, Push-Empfänger | Ursprüngliche Wünsche separat bewahrt, aktive Kanäle aus |
| Urlaubsstatus, Ablauf und Regeln | Regeln erhalten; ursprünglicher Status separat bewahrt, aktiver Urlaub aus |
| Sprache | Erhalten, sofern unterstützt |

Die bisherigen Aktivierungswünsche liegen lokal unter
`dr_wau_migration_source_v1`. Sie aktivieren keine Timer oder Ausgabekanäle.
Push-Empfänger werden dabei bewusst nicht als aktive Auswahl übernommen.
Der Import führt weder einen Backup-Upload noch einen Restore aus. Ein
Schreibfehler löst ein Rücksetzen der betroffenen Settings aus; sollte auch
das Rücksetzen scheitern, wird dieser Zustand ausdrücklich gemeldet.

## Zugangsdaten

Homey API-Key (`restorePat`), Tokens, Passwörter, Benutzernamen, Domains und
andere bekannte Credential-Felder werden nicht exportiert. URL-Benutzer,
URL-Passwort, Query-Parameter und Fragment werden entfernt. Ziele mit
authentisierten Pfadsegmenten oder Geheimnissen in freien Anmerkungen müssen
vor dem Export bereinigt werden; solche Inhalte sind nicht zuverlässig als
Geheimnis erkennbar. Der Import leert den API-Key und Ziel-Zugangsdaten.
Für diese Daten ist bewusst kein automatischer Transfer vorgesehen.

## Rollback und Live-Prüfung

Die Legacy-App wird nicht deinstalliert und ihre Settings werden beim Transfer
nicht verändert. Ihre vorhandenen Backup-Zeitpläne bleiben unverändert; die
neuen bleiben aus. Reale Standard- und Advanced-Flows werden nur auf alte
App-Karten geprüft. Gefundene Referenzen erfordern eine gesonderte Migration;
keine produktiven Flows werden automatisch geändert.

Die Strukturänderung bewahrt Git-Historie und den bisherigen 0.7.1-Branch.
Changelog-Treffer alter Identitäten sind historisch (B), die Legacy-ID im
Migrationsmodul ist eine notwendige Herkunftsprüfung (B), Watchdog-Modulnamen
und Methoden sind Funktionsbezeichnungen (C).
