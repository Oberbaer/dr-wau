# Dr. Wau 1.0.0 – Prüfung der Identitätsmigration

Historischer Prüfstand vom 2026-10-01. Commit-/Push-Freigabe und weitere
Prüfungen erfolgten am Folgetag; aktuell gilt der
[Qualitätsbericht vom 2026-10-02](quality-day-1.0.0.md).

Stand: 2026-10-01. Lokale Prüfungen und der kontrollierte Owner-API-Livetest
sind getrennt aufgeführt. Private Exporte und Geräteansichten liegen nur unter
ignorierten lokalen Artefakten.

## Identität und Struktur

| Punkt | Ergebnis |
|---|---|
| Projektroot | `Dr_Wau`, direkt das Homey-App-Projekt |
| App-ID | `com.oberbaer.drwau` |
| Version | `1.0.0`, in allen Versionsträgern konsistent |
| GitHub | `Oberbaer/dr-wau`, bestehendes Repository umbenannt, Historie erhalten |
| origin | `https://github.com/Oberbaer/dr-wau.git` |
| Branch | `feature/dr-wau-new-identity` |
| Alter Branch | `feature/dr-wau-adaptive-profiles` erhalten |
| Git-Status bei Prüfung | Änderungen gezielt vorgemerkt; Commit/Push warten auf aufgabenspezifische Freigabe |

```text
Dr_Wau/
├── .homeycompose/
├── assets/
├── backup/
├── docs/
├── lib/
├── locales/
├── settings/
├── test/
├── tools/
├── api.js
├── app.js
├── app.json
├── package.json
└── package-lock.json
```

Git erkennt **98 Datei-Renames**. Der bisherige App-README wurde als
`docs/APP_BEHAVIOR.md` erhalten; die beiden Benutzer-READMEs bleiben im Root.
Der kleine frühere App-Gitignore ist durch die umfassendere Root-Datei abgedeckt.
Keine aktiven doppelten App-Dateien und kein notwendiger App-Unterordner bleiben.
VS-Code/Homey-Erweiterung: strukturelle Voraussetzungen geprüft; kein eigener
Live-Test der Erweiterungsoberfläche.

## Lokale Validierung

- `npm ci`: erfolgreich, Dependency-Versionen unverändert.
- `npm test`: **209/209**, davon die bestehenden 186 Tests und 23 zusätzliche
  Migrations-/Identitäts-/UI-Prüfungen.
- `npm run validate:publish`: erfolgreich. Vorhandene Homey-Berechtigung
  `homey:manager:api` führt weiterhin zu einem Hinweis auf manuelle Store-Prüfung.
- `npm run build`: erfolgreich; keine privaten Artefakte, Tests oder Tools
  im Development-Paket.
- `npm audit --omit=dev`: vier moderate betroffene Pakete in der bekannten
  `parseuri`-Kette (`parseuri`, `engine.io-client`, `socket.io-client`, `homey-api`).
- Vollständiges Audit: **22** betroffene Pakete, 2 low / 13 moderate / 7 high.
  Davon **18 ausschließlich Entwicklung**, 2 low / 9 moderate / 7 high.
  Keine automatischen Dependency-Fixes oder `--force`-Änderungen.
- Prüfung der für Git vorgesehenen Dateien: keine bekannten privaten
  Geräte-/Zonen-IDs, privaten Gerätebezeichnungen, lokalen Laufwerkpfade oder
  geprüften Token-/Schlüssel-Muster gefunden. Export, Logs und Builds ignoriert.

## Migration

Versionierter Export/Import mit Schema 1, privater Owner-API, schreibfreier
Vorschau, Dateiprüfung und ausdrücklicher Bestätigung implementiert.
Die Vorschau ist an genau diese Datei gebunden und läuft nach zehn Minuten ab.
Zugangsdaten müssen neu eingegeben werden. Details: [Migration](migration.md).

Die neue App liest keine Settings der alten App. Der Export der unveränderten
0.7.1 erfolgt ausdrücklich über die offizielle CLI/Owner-API.

| Einstellung | Legacy 0.7.1 | Neu 1.0.0 | Prüfung |
|---|---:|---:|---|
| Geräte in lesender Vorschau | 108 | 108 | Konsistent |
| Gespeicherte manuelle Profile/Overrides | 0 | 0 | Gleich |
| Kompatible Geräte-Lernhistorien | 104 | 104 | Werte vollständig gleich |
| Ignorierte Geräte | 0 | 0 | Gleich |
| Zonenausschlüsse | 1 | 1 | Gleich |
| Finding-Anmerkungen | 14 | 14 | Gleich |
| Netzwerk-Backupziele | 1 | 1 | Metadaten gleich, Zugangsdaten leer |
| WebDAV-Ziele | 0 | 0 | Gleich |
| Push-Empfänger | 0 | 0 | Gleich |
| Watchdog, Timeline, Push, Warntrigger | AUS | AUS | Keine Warnroute aktiv |
| Aktiver Urlaub | AUS | AUS | Regeln erhalten |
| Backup-Zeitplan | Bestehende Konfiguration unverändert | Übertragen, deaktiviert | Keine doppelten automatischen Uploads |

Intervalle, Batteriegrenzen, Sprache und Suppression Schema 2 stimmen ebenfalls
mit dem Export überein. Die ursprünglichen Aktivierungswünsche und der
Zeitplan sind separat gespeichert. Legacy-Settings blieben beim Import und
beim anschließenden Vergleich unverändert.

Nicht übertragen: Homey API-Key, Tokens, Passwörter, Ziel-Benutzernamen,
Domains sowie URL-Authentifizierung, Query-Parameter und Fragment.
Freie Anmerkungen und authentisierte URL-Pfade erfordern eigene Bereinigung,
weil ihre geheimen Inhalte nicht allgemein erkennbar sind.

## Kontrollierter Livetest

- Neue 1.0.0-App läuft mit `origin: devkit_install`.
- Alte 0.7.1 läuft weiterhin als Development-App und bleibt installiert.
- Die Migration wurde live als Vorschau geprüft, anschließend bestätigt
  importiert und durch vollständigen Wertevergleich geprüft.
- Gerätewache und Backup-Status lesend erreichbar. Geräteansichten bleiben
  lesend; dabei wurden keine Settings verändert.
- Synthetische Restore-Vorschau bietet genau einen erwarteten Flow zur
  Erstellung an. **Kein Restore wurde ausgeführt**, kein Flow erstellt.
- Standard- und Advanced-Flows: **keine Referenzen auf alte App-Karten**.
  Keine produktiven Flows oder Geräte wurden geändert.
- Visuelle neue Live-UI-Prüfung bleibt offen: Browsersteuerung scheitert schon
  beim Tab-Zugriff an einem Timeout. DOM-Tests sind grün; ein Benutzer-Screenshot
  wurde angefragt. API-Prüfungen ersetzen diese visuelle Prüfung nicht.
- Produktive Warnungen bleiben aus. Alte App nicht deinstallieren und keine
  produktive Aktivierung vor gesonderter Abstimmung.

## Verbliebene Legacy-Treffer

| Datei | Bezeichnung | Klassifizierung / Grund |
|---|---|---|
| `CHANGELOG.md` | alte App-ID, alter Ordner, Homey Watchdog | B: klar markierte historische 0.x-Einträge |
| `docs/migration.md` | alte App-ID, alter Ordner | B: Herkunft und Strukturmigration |
| `lib/config-migration.js` | alte App-ID | B: erforderliche Validierung der Exportherkunft |
| `test/config-migration.test.js` | alter Ordner | B: prüft, dass der frühere Unterordner nicht mehr existiert |

Interne Watchdog-Funktionen und die englische Funktionsbezeichnung
Battery Watchdog bleiben **C**, keine Produktidentität. Es gibt keine aktiven
Legacy-App-ID- oder Ordnerreferenzen der Klasse A. Historie und alte Branches
wurden nicht umgeschrieben. Der bereits vorhandene separate `dev`-Remote mit
deaktiviertem Push wurde nicht geändert; das aktuelle Produkt nutzt `origin`.

## Noch offen

Visuelle Live-Prüfung, separate Commit-/Push-Freigabe und spätere produktive
Aktivierung. Das bekannte Runtime-Audit und der notwendige Credential-Neueintrag
bleiben dokumentierte Einschränkungen. Keine Veröffentlichung, kein Merge
nach `main`, keine Deinstallation und keine riskanten Audit-Fixes.
