# Dr. Wau 1.0.0 – abschließende Backup-Privacy-Prüfung

## Live-Abnahme am 2026-10-03: BACKUP PRIVACY PASS

Installiert und gepusht: `16ff3649afd134dd1bac50374033bfdd44ec4f18`,
Development `com.oberbaer.drwau` 1.0.0. Paketdateien wurden gegen den Quellstand
per Hash geprüft. Genau **ein neuer** Export, kein weiterer Versuch.

| Prüfung | Ergebnis |
|---|---|
| Start / Ende (CEST) | 11:52:58,336 / 11:53:28,011 |
| Dauer / Job | 29.675 ms / `done` |
| Payload vorher / nachher | 10.065.069 / 10.302.907 Bytes (9,60 / 9,83 MiB) |
| Geräte / Standard-Flows / Advanced-Flows | 289 / 281 / 337; zuvor 331 Advanced-Flows |
| Zonen / Apps / Logic / Better Logic | 25 / 64 / 261 / 14; unverändert |
| Credential-Felder mit Werten | 5 vorher, 0 nachher; 5 inhaltsfrei als ausgelassen gemeldet |
| Bekannte reale Geheimwerte 1–5 | Jeweils `NOT FOUND`; keine Werte veröffentlicht |
| Unklassifizierte verdächtige Werte | 0 nach Prüfung der Schema-/Flow-Metadaten |
| Normale Settings | Alle 1.049 aus dem Altbackup unverändert erhalten |
| Erhaltene Typen | 489 Zahl, 284 Checkbox, 182 Dropdown, 79 Text, 15 Textarea |
| Anzahl Settings vorher / nachher | 1.075 / 1.052; 26 sensible alte Felder fehlen, davon 21 leer; 3 andere Felder neu |
| RSS Baseline / max. beobachtet | 91,50 / 147,95 MiB |
| Heap Baseline / max. beobachtet | 15,39 / 53,13 MiB |
| Nachbeobachtung | Zwei Minuten, 24 Stichproben; keine Speicherwarnung |
| App / Crash-Zähler / Exceptions | `running` / 0 → 0 / keine unbehandelte oder fatale Exception in den aufgezeichneten Logs |
| Jobs / Transfers / Export-Lock | Freigegeben; keine aktive Netzwerk- oder Zeitplanarbeit |
| UI-Handler | Installierte UI mit echter Owner-API; 111 Statusänderungen, Abschluss und Button wieder aktiv |
| Backupformat | Gültiges JSON, `homey-backup-center` Version 5, konsistente Zählungen |
| Synthetischer Restore | Ausgelassene Passwort-/PIN-Settings bleiben unverändert; keine leeren Secret-Writes |

Der Export lief aus dem tatsächlichen installierten „Backup erstellen“-Handler in
einer lokalen DOM-Testumgebung gegen die echte Homey-API. Die sichtbare Homey-
Browseroberfläche wurde dabei nicht erneut visuell geprüft. Speicherwerte sind
beobachtete Stichproben, keine garantiert erfassten Spitzen.

Die 3.245 Treffer auf Karten-`droptoken` sind Flow-Tag-Referenzen, keine exportierten
Auth-Tokens. Die Ausnahme im privaten Scanner ist auf dieses Kartenfeld begrenzt;
freie Argumente bleiben geprüft. Siehe [Homey Flow Arguments](https://apps.developer.homey.app/the-basics/flow/arguments).
Beliebige Geheimnisse in neutral benannten Freitexten können weiterhin unerkannt
bleiben. Auch das neue Backup bleibt vertraulich.

Die erste Collector-Abfrage traf das kurze Startfenster „App Not Running“ nach der
Installation. Kein Crash: dieselbe Devkit-Session wurde ohne Neustart oder zweite
Installation verbunden. Der Benutzer bestätigte eine zwischenzeitlich manuell
gespeicherte Zeitplanänderung; diese wurde separat als neue Beobachtungsbasis
übernommen. Alle anderen Development-Settings und der gestoppte Legacy-Stand
blieben unverändert. Watchdog, Warnkanäle, Urlaub und Zeitplan blieben aus.
Eine frische spätere Owner-Abfrage bestätigt diese Zustände, Crash-Zähler 0 und
genau einen Exportstart seit dieser Installation.

Nach dem abgeschlossenen Vergleich wurde das alte credential-haltige Backup mit
Windows-DPAPI für den aktuellen Benutzer außerhalb des Repositories verschlüsselt
archiviert. Entschlüsselung und SHA-256-Abgleich wurden vor Entfernen der lokalen
Klartextkopie geprüft. Dies ist keine Behauptung physischer sicherer SSD-Löschung.
Private Exporte, Einstellungen und Rohlogs bleiben unversioniert.

Kein dritter Export, Restore, Netzwerk-Upload, Flow-/Geräteaktion, Merge oder
Release. PR #3 bleibt Draft. Der historische erste Crash ist damit nicht
rückwirkend ursächlich bewiesen; der Privacy-Release-Blocker ist geschlossen.

## Vorprüfung des freigegebenen Live-Exports

Der Auftrag vom 2026-10-03 erlaubt die Development-Installation und genau einen
neuen lokalen Export. Legacy, Warnkanäle, Watchdog, Urlaub und Zeitplan bleiben
unverändert deaktiviert. Kein Restore, Netzwerk-Upload, Merge oder Release.

Der bisherige Gerätefilter wurde ergänzt:

- Schema-Typ `password` wird unabhängig vom Setting-Namen ausgeschlossen.
- Erkennbare Passwort-, PIN-, Token-, Secret-, API-Key-, Authorization- und
  Credential-IDs werden unabhängig von Groß-/Kleinschreibung gefiltert, auch bei
  numerischen PINs. Harmloses `polling_interval` und Checkbox-Metadaten bleiben.
- Eingebettete URL-Anmeldedaten und erkennbare geheime Queryparameter werden
  entfernt; Endpunkt und ungefährliche Parameter bleiben. Eine zusammengefasste
  Warnung weist auf vor Restore zu prüfende Endpunkte hin.
- Eindeutig geheime Flow-Argumente führen zum kontrollierten Exportfehler.
  Pflichtargumente und Flow-Logik werden nicht stillschweigend gelöscht. Die
  vorhandenen privaten Flows bestanden diese Prüfung lokal.
- Hinweise in Deutsch, Englisch und Niederländisch erklären die Grenzen der
  Erkennung. Beliebig benannte Freitexte können weiterhin sensible Werte enthalten.
- Synthetischer selektiver Restore schreibt ausschließlich ausgewählte normale
  Settings; ausgelassene Secrets bleiben unverändert. Kein realer Restore.
- URL-Bereinigung arbeitet im vorhandenen Snapshot ohne zweite vollständige
  Inventar-/Flow-Kopie im Homey-Heap.

Lokale Prüfung: `npm ci`, **251/251 Tests**, Publish-Validation und Build bestanden.
Dependencies und Lockfile unverändert. Runtime-Audit: vier moderate Befunde.
Vollständiges Audit aktuell **24 = 2 low, 12 moderate, 10 high**; zusätzlich zur
Runtime: **20 = 2 low, 8 moderate, 10 high**. Die Änderung zum vorherigen Audit
kommt aus der neuen Auditbewertung von `http-cache-semantics` und seiner Dev-Kette
`cacheable-request`/`got` im Homey-CLI-Update-Notifier. Das
[GitHub-Advisory](https://github.com/advisories/GHSA-ch52-4w7c-c8xp) wurde am
2026-10-02 aktualisiert. Kein `audit fix`, keine Dependency-Änderung.

Vor dem Export wurden Einstellungen und Runtime-Daten privat gesichert. Die
fünf Credential-Werte aus dem vorherigen Backup wurden ausschließlich lokal
mit dem neuen Ergebnis verglichen; das Ergebnis steht oben.
Private Backups, Rohlogs, Objekt-IDs, Namen und lokale Pfade bleiben außerhalb Git.
