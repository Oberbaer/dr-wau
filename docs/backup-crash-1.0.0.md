# Dr. Wau 1.0.0 – Backup-Crashprüfung, 2026-10-03

## Aktueller Status

**BACKUP PRIVACY PASS – Backup-Release-Blocker geschlossen.** Der danach separat
freigegebene Privacy-Fix wurde auf Development installiert und mit genau einem
neuen Export bestätigt. Siehe [abschließende Privacy-Prüfung](backup-privacy-1.0.0.md)
für den installierten Quellstand, reale Messungen und fünf `NOT FOUND`-Ergebnisse.
Die folgenden Befunde beschreiben den ersten Crashfix-Export und dessen damaligen
Privacy-Blocker; sie werden als historische Diagnose erhalten.

## Freigabestatus nach dem ersten Export (historisch)

**RELEASE BLOCKED – weiterer echter Backup-Test nicht freigegeben.**
Der ausdrücklich freigegebene, einmalige Export war technisch erfolgreich und
ohne Crash. Das private Backup enthält jedoch fünf Credential-Felder: drei
Passwort-/PIN-Felder und zwei als normale Texteinstellungen deklarierte API-Key-
Felder. Werte, Gerätezuordnung und Rohdatei werden nicht veröffentlicht.
Die anfänglich zusätzlich gemeldeten Suchtreffer waren Schema-Typbeschreibungen;
nach deren Prüfung bleibt kein weiterer unklassifizierter Treffer.

### Kontrollierter Live-Export am 2026-10-03

| Punkt | Ergebnis |
|---|---|
| Tatsächlich installierter Quellstand | `2fe9c4845033a5704c286035b89bf617af9e4b8c`, Development 1.0.0 |
| Vorprüfung | Drei Minuten Leerlauf; Watchdog, Warnkanäle, Urlaub und Zeitplan aus |
| Runtime-Aufzeichnung | Privater lokaler Collector: Stdout, Realtime-Phasen, Owner-Diagnose und Homey-App-Usage |
| Start / Ende | 10:37:51,534 / 10:38:21,511 CEST |
| Aufrufe von `/export/prepare` | Genau einer, aus dem installierten UI-Handler mit echter Owner-API |
| Dauer / Jobstatus | 29.977 ms / `done` |
| Geräte / Standard / Advanced Flows | 289 / 281 / 331 |
| Zonen / Apps / Logic / Better Logic | 25 / 64 / 261 / 14 |
| Payload | 10.065.069 Bytes = 9,60 MiB; 6,40 MiB unter dem 16-MiB-Limit |
| Warnungen / Speicherwarnungen / Exportlimit | 0 / 0 / nicht ausgelöst |
| RSS Baseline / max. beobachtet | 92,51 / 140,98 MiB |
| PSS Baseline / max. beobachtet | 43,88 / 92,29 MiB |
| Heap Baseline / max. beobachtet | 15,75 / 50,66 MiB |
| HeapTotal Baseline / max. beobachtet | 17,56 / 56,94 MiB |
| CPU max. beobachtet | 90 % |
| Nachbeobachtung | Zwei Minuten, 24 Stichproben; RSS 98,61–139,12 MiB, Heap am Ende 13,83 MiB |
| App / Crash-Zähler / Exceptions | `running` / 0 → 0 / keine unbehandelte oder fatale Exception in den aufgezeichneten Logs |
| Jobs / Transfers / Export-Lock | Freigegeben; kein laufender Job, Transfer oder Export-Lock |
| Produkt-UI-Pfad | 113 Statusänderungen im DOM mit realer API, Abschlussanzeige und erneut aktivem Button |
| Sichtbare UI | Benutzer-Screenshot zeigt Backup-Ansicht und deaktivierten Zeitplan; Browsersteuerung wegen unsicherer URL-Erkennung gestoppt |
| Struktur / Gerätefelder | Gültiges JSON, Format `homey-backup-center`, Version 5; Zählungen konsistent; schwere Runtimefelder entfernt |
| Dr.-Wau-Netzwerk-/Restore-Credentials | Nicht im Backup enthalten |
| Secret-Prüfung | Nicht bestanden: fünf Geräte-Credential-Felder |
| Development-/Legacy-Einstellungen | Vollständiger Vergleich unverändert; Legacy-App blieb gestoppt |

Die Speicherwerte sind beobachtete Stichproben, keine garantiert erfassten Spitzen.
Es gab keinen zweiten Export, Restore, Upload, keine Geräteaktion oder Flow-Ausführung. Der lokale
Collector wurde nach der Nachbeobachtung beendet; die Homey-App wurde nicht gestoppt.
Der historische ursprüngliche Crash bleibt ohne zugehörigen Stack-/Kill-Beleg
ungeklärt. Der neue erfolgreiche Durchlauf beweist keine allgemeine Crashfreiheit.

### Diagnose und lokale Privacy-Korrektur

Die erste offizielle Devkit-Historie war leer. Ergänzt wurde
`GET /backup/diagnostics`, ausschließlich für den Owner, mit maximal 128
inhaltsfreien Phasen-/Heap-Einträgen, Warnzähler und Job-/Transferzuständen.
Das dokumentierte
[SDK-Realtime-Ereignis](https://apps-sdk-v3.developer.homey.app/ManagerApi.html#realtime)
spiegelt die Einträge an den privaten Collector. Dieser Diagnosekanal enthält keine
Namen, Objekt-IDs, Settings, Zugangsdaten oder Fehlermeldungen.

Bei der Diagnose-Installation scheiterte `process.memoryUsage()` an der RSS-Abfrage
in Homeys eingeschränkter Runtime. Ein Regressionstest und V8-Heap-Fallback
verhindern, dass diese Messung einen Diagnose-GET oder Export ablehnt. RSS/PSS
werden separat über Homey gelesen. Ein Verbindungs-Timeout und die spätere
Beendigung des lokalen Collectors durch Windows wurden vor dem Export gesichert;
die gleiche Devkit-Session wurde ohne App-Neustart wieder verbunden.

Nach dem einmaligen Export wurde ausschließlich lokal korrigiert: Schema-Passwort-
felder sowie erkennbare Credential-IDs in Text-/Textarea-Einstellungen werden
aus neuen Device-Settings-Exports entfernt. Normale numerische, Checkbox-, Dropdown-
und Texteinstellungen bleiben erhalten; ausgelassene Credentials ergeben eine
zusammengefasste Warnung ohne Namen oder Werte. Zwei Regressionstests belegen die
Auslassung, unveränderte Live-/Settings-Mocks und weiterhin gültige Inventardaten.
Alte Backups bleiben für ausdrücklich bestätigte selektive Restores lesbar.
Dieser Privacy-Fix und die separat gewünschte Formulierung „in sicheren Tatzen“
sind **nicht auf Homey installiert**. Es gab keine weitere Live-Reproduktion.
Privacy-Commit: `e6524fa1b954d773d01b670a52857b20c992ffea`;
Text-Commit: `c6502b2eea218c0d287cc9344daf7fe7e97333c6`.
Die Erkennung ist keine Garantie für beliebig benannte Secrets in Flow-Argumenten
oder anderen Freitexten; ein künftiger freigegebener Export muss erneut privat
geprüft werden. Das bestehende Backup bleibt vertraulich und darf nicht geteilt werden.

### Abschließende lokale Prüfungen

- `npm ci`: erfolgreich, Lockfile und Dependencies unverändert.
- **245/245 Tests** nach dem Live-Test und den lokalen Korrekturen bestanden.
- Build und Publish-Validation bestanden. Beide CLI-Befehle erzeugen Builddateien
  und wurden nach einem Dateisperren-Konflikt separat erfolgreich ausgeführt.
- Runtime-Audit unverändert: **4 moderate**, keine high/critical.
- Vollständiges Audit unverändert: **22 = 2 low, 13 moderate, 7 high**;
  zusätzliche Dev-Befunde: **18 = 2 low, 9 moderate, 7 high**.
  Kein `audit fix`, kein `--force`, keine Dependency-Änderung.
- Private Backup-/Runtime-Dateien bleiben ignoriert; der öffentliche Bericht
  enthält keine Credential-Werte, Geräte-/Homey-IDs, privaten Namen oder lokalen Pfade.

## Historische Runtime-Belege vor dem freigegebenen Export

- Der Benutzer meldete unmittelbar nach „Backup erstellen“: `Crashed` / `App Not Running`.
- Exakter Crashzeitpunkt, historische stdout/stderr, Exception, Stacktrace,
  Exit-Code, Signal und OOM-/Kill-/Restart-Grund sind nicht verfügbar.
- Erste Abfrage: 2026-10-03 00:04:17 CEST, bereits `running`, `crashed=false`,
  kumulierter `crashedCount=3`, `crashedMessage=null`. Der Zähler ordnet keine
  einzelnen Abstürze zu. RSS 80,53 MiB, PSS 28,23 MiB, CPU 0 %.
- Devkit-State war `null`; eine frühere Stdout-Session-ID war nicht gespeichert.
  Es wurde kein Diagnosebericht an einen externen Empfänger versendet.
- Nach Sicherung der erreichbaren Daten wurde ausschließlich der Development-
  Zeitplan deaktiviert und diese App einmal kontrolliert neu gestartet.
  Danach: RSS 73,73 MiB, PSS 26,30 MiB; Warnkanäle, Watchdog, Urlaub und Zeitplan aus.
- Abschlussabfrage: Development 1.0.0 `running`, kein Crash; Legacy 0.7.1 blieb
  `stopped`. Legacy-Einstellungen unverändert, Development-Einstellungen nach
  dem gezielten Ausschalten des Zeitplans unverändert.
- Reine Inventarabfrage: 289 Geräte insgesamt, 280 Standard- und 329 Advanced
  Flows. Die im Auftrag geschätzten 114 Geräte sind nicht die Gesamtinventarzahl.
  Keine Geräteaktionen oder Flow-Ausführungen wurden ausgelöst.

Private Rohdaten und Messprotokolle liegen ausschließlich in ignorierten lokalen
Artefakten. Dieser Bericht enthält keine privaten Namen, Objekt-IDs, Verbindungen
oder Zugangsdaten.

## Ausführungspfad und nachgewiesene Fehler

`settings/backup/ui.js` → `BackupTransfer.job('/export/prepare')` →
`backup/api.js.prepareExport()` → `startExport()` → `Jobs.start()` →
`exportBackup()` → `Transfers.publish()` → Job-Polling → kleine Transfer-Chunks.

1. **Prozessbeendigung lokal reproduziert:** Im bisherigen Job-Fehlerhandler
   erzeugt eine Ablehnung mit `null` einen `TypeError` beim Lesen von `message`.
   Unter `node --unhandled-rejections=strict` endet der Prozess mit Exit-Code 1.
   Auch fehlerwerfende Getter/String-Konvertierung konnten den Handler verlassen.
   Die unbeobachtete Promise aus `.finally()` schloss diesen Fehlerpfad nicht ab.
   Es gibt keinen Beleg, dass gerade dieser Wert beim realen Absturz vorkam.
2. **Speicherbelastung lokal gemessen:** Sieben Manager-Abfragen wurden gleichzeitig
   gestartet, schwere Device-Runtimefelder behalten und erst nach vollständigem
   `JSON.stringify()` plus `Buffer.from()` auf die Transfergröße geprüft.
   Der alte synthetische 500-Geräte-/1.000-Flow-Fall erzeugte 24.802.852 Bytes,
   59,47 MiB Heap und 131,34 MiB RSS nach Veröffentlichung im Transferstore.
   Ein OOM/Kill beim realen Homey ist deshalb eine plausible Last-Hypothese,
   bleibt ohne Runtime-Beleg aber unbewiesen.
3. Jobs halten beim lokalen Export nur Transfer-Metadaten. Die Homey-Seite erzeugt
   Base64 ausschließlich für 16-KiB-Chunks. `TextEncoder` und der vollständige
   Download-String liegen im Browser; sie belasten nicht den Homey-App-Heap.

## Korrekturen und Grenzen

- Abschließender, defensiver Job-Catch für normale und ungewöhnliche Ablehnungen;
  keine globale Unterdrückung unbehandelter Exceptions.
- Höchstens ein Export gleichzeitig. Manager und Geräteschemas werden sequenziell
  gelesen, mit ausgeschaltetem SDK-Cache und ohne Aktualisierung großer SDK-Caches.
- Acht Sekunden pro API-Lesezugriff; kooperatives Export-Zeitlimit von drei Minuten.
  Better Logic verwendet für `/ALL` den zugrunde liegenden API-Aufruf, weil
  `App.get()` den Timeout-Parameter nicht durchreicht.
- Device-Export behält Inventar-/Restorefelder und schemafreigegebene primitive
  Einstellungswerte. `capabilitiesObj`, `energy`, `iconObj`, `color` und rohe
  Unverfügbarkeitsmeldungen entfallen. Selektiver Restore benötigt diese Felder nicht.
  Alte Backup-Formate 2–5 bleiben lesbar, neue Exporte bleiben Format 5.
- Verarbeitete Device-Referenzen sowie rohe Flow-Collections werden freigegeben.
  Fehlende optionale Daten ergeben zusammengefasste Warnungen; fehlen sämtliche
  Flows, endet der Job mit Fehler. Warnungen enthalten keine Remote-Fehlerdetails.
- Begrenzte JSON-Verarbeitung prüft vor der Buffer-Allokation. Zwei Durchläufe
  messen und schreiben in genau einen Buffer; Strings werden in kleinen Stücken
  maskiert. Keine vollständige JSON-String-Zwischenkopie. Zyklen, übermäßige Tiefe,
  BigInt und wechselnde Serialisierungsgrößen führen zu einem Jobfehler.
- **16 MiB Exportlimit:** ein Viertel des bisherigen 64-MiB-Transferbudgets,
  mehr als das Dreifache des reduzierten 500-Geräte-/1.000-Flow-Lastfalls.
  Die gelesenen Snapshot-Abschnitte werden kumulativ ebenfalls begrenzt.
  Geräteschemas über 1 MiB werden ausgelassen und als Warnung zusammengefasst.
  Vor neuem Ergebnis-Buffer wird der gesamte belegte Transferstore auf höchstens
  32 MiB einschließlich dieses Ergebnisses geprüft. Das kann auch einen Restoreplan
  bei großen bereits hochgeladenen Backups sicher ablehnen; solche Handles müssen
  geschlossen werden. Der Upload-Einzellimit bleibt 50 MiB, ist keine Zusage,
  dass jeder so große Inhalt vollständig verarbeitet werden kann.
- Derselbe begrenzte Encoder wird auch für Netzwerk-/WebDAV-Payloads verwendet.
  Diese Wege wurden ausschließlich lokal mit Mocks geprüft.
- Privacy-sichere Phasenlogs: Dauer, Heap/RSS, Anzahlen, API-Aufrufe, maximale
  Device-/Schema-Bytes und Ergebnisbytes. Keine Inhalte oder Verbindungsdaten.
  Eine neue [Homey-Speicherwarnung](https://apps-sdk-v3.developer.homey.app/Homey.html)
  bricht den Export am nächsten Prüfpunkt ab.
- UI zeigt Lesen, Flows, Gerätefortschritt, Vorbereitung und Download. Kontrollierte
  Jobfehler werden von einem nicht erreichbaren Vorgangsstatus unterschieden;
  nach Verbindungsverlust wird nicht behauptet, die App laufe weiter.

**Kein JavaScript-Catch kann einen Betriebssystem-Kill oder einen fatalen OOM
abfangen.** API-Antworten werden im SDK bereits vor unseren Größenprüfungen
eingelesen. Grenzen, Cache-Vermeidung und Speicherwarnungen verringern die Last,
beweisen aber keine absolute Crashfreiheit auf Homey. Diese Grenze bleibt Teil
des Release-Blockers.

## Lokale Lastmessung

Separate Node-Prozesse mit `--expose-gc --max-old-space-size=128`; pro Gerät
40.000 Zeichen unbenötigte Capability-Diagnostik und 2.048 Zeichen Settings;
je ein Standard- und Advanced Flow mit zehn Karten. Die Messung enthält Erfassung
und Transfer-Vorbereitung. Heap/RSS sind beobachtete Stichproben, keine kontinuierlich
garantierten Spitzen. Laufzeiten sind Maschinenmessungen, keine Homey-Zusagen.

| Geräte | Flows | Payloadbytes | Dauer | Heap vorher / max. beobachtet | RSS max. beobachtet |
|---:|---:|---:|---:|---:|---:|
| 10 | 20 | 95.885 | 32 ms | 6,56 / 8,60 MiB | 56,29 MiB |
| 100 | 200 | 953.408 | 175 ms | 7,33 / 12,65 MiB | 64,49 MiB |
| 250 | 500 | 2.383.602 | 369 ms | 8,59 / 20,51 MiB | 78,43 MiB |
| 500 | 1.000 | 4.767.352 | 654 ms | 10,70 / 25,72 MiB | 96,47 MiB |

Payload und Aufrufzahl wachsen linear. Keine Prozessbeendigung in diesen Fällen.
Eine Heap-Messung während des ursprünglich gemeldeten Absturzes liegt nicht vor.
Die oben dokumentierten Realwerte stammen aus dem später freigegebenen Export.

## SMB-Herkunft und Erstinstallation

Das aktuelle gespeicherte Ziel stimmt in Typ/Host/Share/Verzeichnis sowohl mit
dem vorhandenen Legacy-State als auch mit dem früheren Migrationsexport überein;
ein Migrationseintrag ist vorhanden. Die Verbindung stammt somit aus übertragener
Benutzerkonfiguration, nicht aus privaten Quellcode-Defaults oder UI-Fallbacks.
Heute ist ein gespeichertes Passwort vorhanden; die Migration selbst entfernt
Zugangsdaten. Die UI zeigt ausschließlich `hasPassword`, niemals das gespeicherte
Passwort, und leere Erstinstallationen zeigen leere Host-/Share-/Benutzerfelder.
Diese Fälle sind per DOM-Test geprüft. Kein separater Default-Entfernungscommit
ist erforderlich, weil keine solchen Defaults gefunden wurden.

## Historische lokale Prüfungen des ersten Crashfixes

- `npm ci`: erfolgreich, Lockfile unverändert.
- **238/238 Tests**, zuvor 218. Neue Fälle: vier Lastgrößen, sechs Fehlerquellen,
  kaputte/übermäßige Daten, parallele Exporte, Speicherwarnung, BLL-Timeout,
  ungewöhnliche Promise-Ablehnungen, Unicode-Serialisierung, erschöpfter Transferstore, leere Erstinstallation
  und echter UI-Jobfortschritt mit kontrolliertem Fehler.
- Lokaler Build und Publish-Validation bestanden; Validierung ist keine Veröffentlichung.
- Runtime-Audit: 4 moderate, 0 high/critical. Vollständig: 22 = 2 low, 13 moderate,
  7 high; ausschließlich zusätzlich über Dev-Abhängigkeiten: 18 = 2 low, 9 moderate,
  7 high. Keine Dependency-Änderung und kein `audit fix --force`.

Die anschließende, ausdrücklich freigegebene Live-Prüfung ist oben dokumentiert.
Ein weiterer echter Test benötigt eine neue Freigabe; kein Release oder Merge.
