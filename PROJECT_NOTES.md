# Project Notes - Dr. Wau

## Purpose

Maintain the native Dr. Wau app in `Homey_Watchdog/`. It combines read-only Automation Health diagnostics, scheduled battery monitoring, and integrated Backup Center functionality.

## Architecture

- `Homey_Watchdog/app.js` initializes the app, owner-only API, scans, schedules, notifications, and persistent settings.
- `Homey_Watchdog/lib/analyzer.js` produces health scores and findings.
- `Homey_Watchdog/lib/battery-watchdog.js` evaluates battery-capable devices and repeat suppression.
- `Homey_Watchdog/lib/heartbeat.js` evaluates native/capability evidence, profiles, availability and battery independently; `heartbeat-insights.js` adds bounded read-only driver-origin raw events, never resampled numeric buckets.
- `Homey_Watchdog/lib/zone-exclusions.js` applies whole-zone exclusions, including descendants.
- `Homey_Watchdog/backup/` contains Backup Center's runtime and license; `settings/backup/` hosts its UI.
- `Homey_Watchdog/settings/index.html` provides Overview, Automation Health, Battery Watchdog, Backups, and Management views.
- `.homeycompose/` is the source for app metadata and Flow cards; `app.json` is generated.
- Direct push uses checkbox-selected Homey users and the shared restore API Key. The legacy warning Flow trigger is separately configurable. Timeline delivery stays inside the app.
- Repeat suppression is tracked per channel/recipient; only successful route deliveries are persisted.
- Backup translations are shared between `backup/settings/` and the served `settings/backup/` UI. German `de.js` uses English canonical messages with aliases for the imported Dutch source strings; tests enforce copy consistency and preserve protocol data.

## Design decisions

- Recommended defaults are a 6-hour check interval, a warning after 24 hours, and a 24-hour repeat interval. Existing settings are preserved unless explicitly changed.
- Device inspection is read-only and considers `measure_battery` and `alarm_battery` capabilities.
- Missing timestamps are diagnostic limitations, not recurring warnings or proof of an outage. Contacts/remotes without communication timestamps do not warn solely for lack of usage; old periodic measurements are review findings, not an offline assertion.
- Battery thresholds default to 20% low / 5% critical. Old low values and alarms remain visible with provenance, rather than pretending they are current measurements.
- Suppression schema v2 uses a new settings key and preserves v1 unchanged for rollback. Recovery requires positive data and is sent only to routes that received the original problem; intermediate unknown data stays unresolved silently.
- Automatic checks start disabled on a fresh installation.
- Finding decisions and reports remain local on Homey.
- The Watchdog app ID remains unchanged. Backup Center used a separate ID, so its credentials and schedule require manual re-entry.

## Known limitations

- Communication silence does not identify its cause.
- Direct push requires an owner-supplied API Key with Flow write permission. The connection test verifies authentication, not every write scope.
- Backup settings language persistence and status endpoints have been verified on a live Homey. Live browser visual verification and selective restore remain untested.

## Test strategy

Run `npm.cmd ci`, `npm.cmd test`, `npm.cmd run validate:publish`, and `npx.cmd homey app build` from `Homey_Watchdog/`. These checks do not install or publish the app.

## Current status

Integration work is on `feature/dr-wau-integrated-app` with a draft PR against the existing public repository. Version 0.6.0 is installed with explicit user approval; 0.5.1 source is preserved in a local ignored rollback archive and Git history. No parallel ALT Flow is fabricated for this native app. Private device inventory and before/after diagnostic reports remain under ignored `artifacts/`. The former public Watchdog and Backup Center checkouts are preserved locally in ignored `_sources/`.

Validation for 0.6.0: reproducible `npm ci`, 141 passing tests, syntax checks, publish-level manifest validation and Homey build. Recorded real device data was replayed locally through app evaluation, then all nine requested devices were checked via the installed owner-only read-only preview. Missing-timestamp alarms were absent; old periodic measurement data and battery problems remained separate. Backup schedule, destinations, language and legacy suppression state were preserved. No manual live warning, Flow, device action, backup or restore was triggered. New UI structure/profile editing is covered by DOM tests; live browser visual QA and real new-problem/recovery delivery remain untested. The existing dependency audit reports 19 vulnerabilities (2 low, 13 moderate, 4 high); no dependency versions were changed.
