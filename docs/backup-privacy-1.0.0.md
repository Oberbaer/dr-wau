# Dr. Wau 1.0.0 – abschließende Backup-Privacy-Prüfung

## Stand vor dem freigegebenen Live-Export

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

**Live-Abnahme noch offen.** Vor dem neuen Export werden Einstellungen und
Runtime-Daten privat gesichert. Die fünf Credential-Werte aus dem vorherigen
Backup werden ausschließlich lokal mit dem neuen Ergebnis verglichen.
Private Backups, Rohlogs, Objekt-IDs, Namen und lokale Pfade bleiben außerhalb Git.
