# Dr. Wau 1.0.0 – Backup-Crashprüfung, 2026-10-03

## Freigabestatus

### Vorbereitung des kontrollierten Live-Tests

Der Crashfix ist auf dem Feature-Branch committed und als Development-App
installiert. Die dreiminütige Leerlaufbeobachtung zeigte keinen Absturz;
Development- und Legacy-Einstellungen blieben unverändert. Die offizielle
Devkit-Verbindung lieferte jedoch weder Stdout-Ereignisse noch eine Loghistorie.
Deshalb wurde vor dem freigegebenen Export eine zusätzliche Diagnose vorbereitet:
`GET /backup/diagnostics`, ausschließlich für den Owner, mit höchstens 128
inhaltsfreien Phasen-/Speichereinträgen, Warnzähler und aktuellen Job-/Transfer-
Zuständen. Dieselben Einträge werden über das dokumentierte
[SDK-Realtime-Ereignis](https://apps-sdk-v3.developer.homey.app/ManagerApi.html#realtime)
an einen lokalen Collector gespiegelt. Transportfehler verändern das Ergebnis
eines Backups nicht. Zugangsdaten, Namen, Objekt-IDs und Fehlermeldungen werden
über diesen Kanal nicht ausgegeben. Er ersetzt keinen historischen Stacktrace.
Der echte Export ist zu diesem Vorbereitungsstand noch nicht gestartet.

Bei der Installation des Diagnosezusatzes scheiterte die RSS-Abfrage über
`process.memoryUsage()` in Homeys eingeschränkter Runtime. Der Diagnose-GET
lieferte einen Fehler; die App blieb aktiv, ein Export wurde nicht gestartet.
Die Phasen-/Heap-Messung verwendet bei diesem Fehler jetzt V8-Heapstatistiken.
RSS/PSS stammen in diesem Fall ausschließlich aus der externen Homey-App-Usage-
Abfrage. Derselbe abgesicherte Messpfad schützt auch das ursprüngliche Phasenlog;
eine fehlgeschlagene RSS-Messung darf keinen Export ablehnen.

**RELEASE BLOCKED.** Der gemeldete reale Absturz ist historisch nicht eindeutig
zugeordnet. Die unten beschriebenen Fehler sind lokal nachgewiesen und korrigiert;
das ersetzt den Nachweis der tatsächlichen Homey-Crashursache nicht.

**Crashursache aus Runtime-Log nicht direkt verfügbar.** Kein weiterer echter
Backup-Versuch, kein Restore und kein Netzwerk-Upload wurden ausgeführt. Die Fixes
sind lokal vorbereitet; die laufende Development-App enthält weiterhin den zuvor
installierten Stand. Branding, Legacy-App, Veröffentlichungen und `main` bleiben
außerhalb dieses Crashfixes.

## Runtime-Belege

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
Eine reale neue Backupgröße oder Heap-Messung während des gemeldeten Absturzes
liegt nicht vor, da kein erneuter Live-Export freigegeben werden konnte.

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

## Prüfungen und weitere Abnahme

- `npm ci`: erfolgreich, Lockfile unverändert.
- **238/238 Tests**, zuvor 218. Neue Fälle: vier Lastgrößen, sechs Fehlerquellen,
  kaputte/übermäßige Daten, parallele Exporte, Speicherwarnung, BLL-Timeout,
  ungewöhnliche Promise-Ablehnungen, Unicode-Serialisierung, erschöpfter Transferstore, leere Erstinstallation
  und echter UI-Jobfortschritt mit kontrolliertem Fehler.
- Lokaler Build und Publish-Validation bestanden; Validierung ist keine Veröffentlichung.
- Runtime-Audit: 4 moderate, 0 high/critical. Vollständig: 22 = 2 low, 13 moderate,
  7 high; ausschließlich zusätzlich über Dev-Abhängigkeiten: 18 = 2 low, 9 moderate,
  7 high. Keine Dependency-Änderung und kein `audit fix --force`.
- Ein erneuter kontrollierter Live-Backup-Test wurde **nicht ausgeführt**:
  Die Voraussetzung „reale Ursache verstanden“ ist nicht erfüllt.
- Development-App nach dem kontrollierten Neustart aktiv: **JA**, auf dem bisherigen
  installierten Stand. Der neue Fix ist nicht installiert.

Nächster benötigter Beleg ist der historische Crash-Log beziehungsweise ein
ausdrücklich abgestimmter weiterer Diagnoseweg mit persistierter Devkit-Session
und Runtime-Messung. Bis dahin kein weiterer echter Backupversuch und kein Release.
