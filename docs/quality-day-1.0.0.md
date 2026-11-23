# Dr. Wau 1.0.0 – Qualitätsprüfung 2026-10-02

## Ergebnis und Grenzen

Dr. Wau 1.0.0 ist auf `feature/dr-wau-new-identity` geprüft, committed und
nach `origin` gepusht. [Draft-PR #3](https://github.com/Oberbaer/dr-wau/pull/3)
hat `main` als Basis und bleibt Draft. PR #2 wurde nicht verändert.
Version und neue App-ID bleiben `1.0.0` / `com.oberbaer.drwau`.
Keine Veröffentlichung und kein Merge.

Private Exporte, Geräteprofile, Laufzeitdaten und Logs bleiben in ignorierten
lokalen Artefakten. Dieser Bericht enthält keine privaten Gerätebezeichnungen,
Objekt-IDs, Zugangsdaten oder lokalen Rechnerpfade.

## Git und Änderungen

| Commit | Änderung |
|---|---|
| `afa0140` | Neue Identität, Root-Struktur, Branding und explizite Migration |
| `0434f6c` | Abgeschaltete Warnrouten während der Zustellung erneut prüfen |
| `f5da39a` | Minimale CI mit nur lesenden GitHub-Rechten |
| `02abc7b` | Verschachtelte Migrationsdaten validieren, laufende Jobs prüfen |
| `be78eb1` | Remote-Fehlertexte aus Netzwerkdiagnosen entfernen |
| `878e1c6` | Schmale Settings-Ansichten und Touch-Ziele verbessern |
| `a939d8b` | Timer nach Startfehler bereinigen, übersprungene Zustellung korrekt melden |
| `242c72b` | Ungültige Health-Batteriewerte nicht als Prozentwerte deuten |
| `6dc728e` | Lernen trotz Override und alle privaten Owner-APIs prüfen |
| `5da8cfc` | Advanced-Flow-Details mit höchstens drei parallelen Anfragen laden |

Der abschließende Dokumentationscommit folgt diesen Code-Commits; der genaue
HEAD und Remote-Abgleich stehen im lokalen Abschlussbericht und der Git-Historie.
Kein Force-Push, keine Historienänderung und keine Branch-Löschung.

## Fehlerprüfung

- Warnrouten werden vor jeder Zustellung und nach asynchroner Push-Vorbereitung
  erneut geprüft. Übersprungene Routen erhalten keinen Suppression-Eintrag.
- Statistikstrings, ungültige Aktivitätszahlen, fehlerhafte Recovery-Zeilen,
  falsche Annotationstypen, unbekannte Konfigurationsfelder und überschrittene
  Profil-/Zeitgrenzen werden vor dem Migrationsschreiben abgewiesen.
- Leere Teilimporte bewahren ausgelassene Bereiche. Vorschauen verfallen
  tatsächlich nach zehn Minuten. Laufende Jobs blockieren einen Import;
  abgeschlossene Restore-Jobs blockieren ihn nicht dauerhaft.
- Fehlgeschlagene Backup-Initialisierung räumt schon angelegte Timer auf.
- Die Health-Analyse akzeptiert nur endliche numerische Batterieprozente im
  Bereich 0–100; boolesche Werte werden nicht zu 0 oder 1 umgewandelt.
- Netzwerkdiagnosen zeigen Fehlerklasse und lokalen Schritt. Remote-Texte,
  die Zugangsdaten oder Zielmetadaten enthalten könnten, gelangen nicht hinein.
- Unvollständige Advanced-Flow-Details bleiben nach Fehlern als unvollständige
  Scan-Abdeckung sichtbar; das Nachladen ist auf drei parallele Anfragen begrenzt.

Nicht geändert: Abhängigkeiten, Berechtigungen, Authentifizierungsmodell,
Restore-Schreiblogik und produktive Homey-Objekte. Backupdateien können weiterhin
sensible Geräte-/Flow-/Variablenwerte enthalten; sie sind kein allgemein
bereinigtes Exportformat. Diese bestehende Grenze ist in PRIVACY dokumentiert.

## Lokale Tests, Validierung und CI

- `npm ci`: bestanden, Lockfile-Abhängigkeiten unverändert.
- `npm test`: **218/218**, null fehlgeschlagen, null übersprungen.
- Publish-Validierung: bestanden. `homey:manager:api` erfordert weiterhin
  manuelle Store-Prüfung; erfolgreiche Validierung ist keine Store-Freigabe.
- Build: bestanden. Eigene Tests, Tools, private Artefakte und CI-Dateien sind
  ausgeschlossen. npm-Runtime-Pakete können ihre eigenen öffentlichen
  Testdateien enthalten; diese sind keine privaten Projektartefakte.
- CI: Ubuntu, Node 22, `npm ci`, Tests, Publish-Validierung und Build.
  Actions auf Commit-SHAs fixiert, `contents: read`, keine Secrets oder
  Installation/Veröffentlichung auf Homey. Code-Läufe bis `5da8cfc` grün.
  Der abschließende HEAD wird nach dem Dokumentationspush erneut geprüft.

Zusätzlich zu bestehenden Regressionen wurden Route-Abschaltung während I/O,
ungültiger verschachtelter Import, Teilimport, echte Vorschauablaufzeit,
Job-Sperren, Remote-Fehlerredaktion, Startfehler und begrenzte Detailabfragen
getestet. Der bestätigte 24-h-Override bleibt dominant, während neue
Aktivitätsblöcke weiter gelernt werden. Die bestehenden Tests zu Urlaub,
Duplikaten, fehlenden Zeitstempeln, event-only, Suppression und Recovery bleiben
grün. Es wurden keine echten Benachrichtigungen gesendet.

## Audit

| Bereich | Low | Moderate | High | Critical | Gesamt |
|---|---:|---:|---:|---:|---:|
| Runtime (`--omit=dev`) | 0 | 4 | 0 | 0 | 4 |
| Vollständig | 2 | 13 | 7 | 0 | 22 |
| Ausschließlich Entwicklung | 2 | 9 | 7 | 0 | 18 |

Die vier Runtime-Pakete gehören zu einer ReDoS-Advisory-Kette:
`parseuri`, `engine.io-client`, `socket.io-client`, `homey-api`.
Das sind vier betroffene Pakete, keine vier unabhängigen Ursachen.
Die mögliche Auswirkung ist übermäßige CPU-Nutzung durch problematische
URI-Eingaben. Eine konkrete Ausnutzung in Dr. Wau wurde nicht nachgewiesen;
Owner-Zugriff und vertrauenswürdige Ziele beseitigen den Abhängigkeitsbefund nicht.
Installiert ist `parseuri` 0.0.6. Die
[GitHub-Advisory GHSA-6fx8-h7jm-663j](https://github.com/advisories/GHSA-6fx8-h7jm-663j)
führt `parseuri <2.0.0` als betroffen und nennt keine gepatchte Version.
Die von npm angebotene Top-Level-Änderung verweist auf eine ältere `homey-api`
Version und ist keine belegte kompatible Reparatur für diesen Stand.
Keine Overrides, Downgrades oder `audit fix --force`.

Dev-Pakete nach Severity:

- **Low (2):** `external-editor`, `inquirer`.
- **Moderate (9):** `body-parser`, `dockerode`, `express`, `got`,
  `latest-version`, `package-json`, `qs`, `update-notifier`, `uuid`.
- **High (7):** `@grpc/grpc-js`, `brace-expansion`, `engine.io`, `homey`,
  `image-size`, `sharp`, `tmp`.

Die Dev-Befunde betreffen die lokale Homey-CLI-Werkzeugkette und sind nicht
Bestandteil der Runtime-Liste. Advisory-Daten vor einer Veröffentlichung erneut
prüfen. Details und Datenschutzgrenzen: [SECURITY](../SECURITY.md),
[PRIVACY](../PRIVACY.md).

## Kontrollierte Development-Prüfung

Die neue App wurde mit den geprüften Fixes installiert und neu gestartet.
Die alte `com.oberbaer.homeywatchdog` 0.7.1 wurde nicht aktualisiert, gestoppt,
deinstalliert oder umkonfiguriert. Beide melden `running`,
`origin: devkit_install`, `crashed: false`.

Vergleiche nach dem letzten Neustart bestätigten:

- Legacy-Settings unverändert gegenüber dem heutigen Ausgangsstand.
- Neue Settings unverändert durch Installation, Neustart und lesende Prüfung.
- 104 Lernhistorien, 14 Befund-Anmerkungen, ein Zonenausschluss.
- Null gespeicherte manuelle Profile, 108 Geräte in der Vorschau.
- Ein Netzwerkziel ohne Zugangsdaten, null WebDAV-Ziele.
- Konfiguration, Lernstate, Anmerkungen, Zielmetadaten und Zeitplan stimmen mit
  dem bereits importierten bereinigten Ausgangsexport überein.
- Watchdog-Automatik, Timeline, Push-Empfänger, Warntrigger und Urlaub aus.
  Neuer Backup-Zeitplan aus; Legacy-Zeitplan unverändert.
- Kein erneuter Import, kein Backup-Upload, kein Connection-Probe, keine
  Retention, kein Restore und keine reale Geräte-/Flow-/Variablenaktion.

Alle neun gewünschten Referenzgeräte wurden lesend gefunden. Die beiden
Kontakte und Taster bleiben ohne automatische Schweigewarnung; die betrachteten
periodischen Geräte bleiben mangels belastbarer Konfidenz bei Annahmen.
Für fehlende Zeitstempel wird keine Ausfallursache erfunden. Details bleiben
im privaten lokalen Bericht. Es wurde kein Override gesetzt.

API-Prüfungen und Crashflag liefern keinen vollständigen Nachweis der
Exceptionfreiheit. Stdout-/Exceptionprotokolle waren über den verfügbaren
Diagnosezugriff nicht vollständig abrufbar. Ein aktueller vollständiger
Health-Scan wurde zur Bewahrung des importierten Settings-Stands nicht ausgelöst;
die neue App hat deshalb noch keinen gespeicherten Health-Bericht.

## UI

DOM-/CSS-Prüfung beider Seiten für **1280, 768, 390 und 320 px**, jeweils
Light und Dark: 16 Regelkombinationen, keine doppelten DOM-IDs.
UI-Regressionen prüfen Navigation, Suche, Filter, Details, Expertenansicht,
Profile, Urlaub, Migration und synthetische Backup-/Restore-Formulare.

Korrigiert: mobile Tab-Texte dürfen umbrechen, Gerätestatus stapelt sich bei
schmaler Breite, Datei-Inputs und andere Inputs haben begrenzte Breiten,
Buttons und Checkbox-/Details-Zeilen mindestens 44 px Zielhöhe.
Monitoringtabellen bleiben bewusst in einem horizontal scrollbaren Container.
Bestehende Backup-CSS-Kopien sind identisch; Dark-Regeln bleiben erhalten.

Der neue Homey-App-Tab war erreichbar. „Konfigurieren“ ließ sich wegen erneuter
Steuerungs-Zeitüberschreitung vor der Klickausführung nicht öffnen. Die
DOM-/CSS-Regelprüfung hat keinen Pixel-Layout-Renderer: tatsächliche
Zeilenumbrüche, Dropdowns, Überlappungen und Dialogdarstellung müssen visuell
geprüft werden. Keine visuelle Vollabnahme behauptet.

## Performance und Ressourcen

- Lesende Live-Vorschau: rund **0,79 s**, 108 Geräte, vier Insights-Anfragen,
  null Insights-Fehler. Kein Homey-Lasttest.
- Einzelne Live-Speichermessung: RSS rund **87,8 MiB**, PSS **39,3 MiB**,
  CPU-Anzeige **0 %**. Das ist eine Momentaufnahme, kein Langzeittest.
- Lernstate etwa **182 KiB**, neue Settings etwa **192 KiB**.
- Lokaler einmaliger Replay von 104 Lernhistorien: rund **6,2 ms**.
  Synthetische Auswertung von 104 Geräten etwa **5,2 ms**, Health-Analyse
  etwa **1,7 ms**. Das sind Rechnerwerte, keine Homey-Scanmessungen.
- Grenzen: 2.000 Lerngeräte, 96 gruppierte Meldungen / 384 Rohereignisse,
  90 Tage Historie; Insights höchstens 24 Detailanfragen, Parallelität drei.
- Scan liest sieben Bestandsquellen einmal; zusätzliche fehlende
  Advanced-Flow-Details werden einmal pro ID mit Parallelität drei gelesen.
- Urlaubswecker höchstens eine Stunde; Watchdog nach konfiguriertem Intervall,
  Backup-Pflege einmal pro Minute. Deaktivierte Automatik löst keine Uploads aus.
- Temporäre Transfers: höchstens acht / insgesamt 64 MiB, 30 Minuten TTL;
  Jobs begrenzt und ablaufend. Kein Langzeit-Leaknachweis durch Kurztests.

## Privacy und manuelle Restpunkte

Lokale Musterprüfung und Abgleich mit bekannten privaten IDs/Bezeichnungen
fanden keine solchen Daten in den für Git bestimmten Dateien. Treffer waren
öffentliche Lizenzangaben und ausdrücklich synthetische Testwerte. Ein alter
Netzwerk-Testwert wurde durch `nas.invalid` und einen synthetischen Benutzer
ersetzt. Kein echter Secret-Fund und kein externer Scanner-Upload.

### Wenn du wieder am Rechner bist

1. Beide Einstellungsseiten auf Desktop, Tablet und Smartphone in Light/Dark visuell prüfen.
2. Referenzprofile ansehen; bei Bedarf den gewünschten manuellen Override ausdrücklich setzen.
3. Zugangsdaten lokal neu eintragen und Backupziel gesondert kontrolliert testen.
4. Einen echten Warning-/Suppression-/Recovery-Test mit Benutzeranwesenheit freigeben.
5. Ersten lesenden Health-Scan auslösen und Runtime-Logs über die Homey-Oberfläche prüfen.
6. Draft-PR, CI und Audit bewerten; Merge und Veröffentlichung getrennt entscheiden.
7. Legacy-App erst nach bestätigter Abnahme und eigener Freigabe deaktivieren oder deinstallieren.
