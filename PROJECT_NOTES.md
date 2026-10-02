# Project Notes - Dr. Wau

## Purpose

Maintain the native Dr. Wau app in the repository root. It combines read-only Automation Health diagnostics, scheduled battery monitoring, and integrated Backup Center functionality.

## Architecture

- `app.js` initializes the app, owner-only API, scans, schedules, notifications, and persistent settings.
- `lib/analyzer.js` produces health scores and findings.
- `lib/battery-watchdog.js` evaluates battery-capable devices and repeat suppression.
- `lib/heartbeat.js` evaluates native/capability evidence, profiles, availability and battery independently; `heartbeat-insights.js` adds bounded read-only driver-origin raw events, never resampled numeric buckets.
- `lib/zone-exclusions.js` applies whole-zone exclusions, including descendants.
- `backup/` contains Backup Center's runtime and license; `settings/backup/` hosts its UI.
- `settings/index.html` provides Overview, Automation Health, Battery Watchdog, Backups, and Management views.
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
- Dr. Wau 1.0.0 uses a new app identity and an explicit configuration migration. Credentials require re-entry; migrated warning channels, vacation and backup schedules remain off.

## Known limitations

- Communication silence does not identify its cause.
- Direct push requires an owner-supplied API Key with Flow write permission. The connection test verifies authentication, not every write scope.
- Backup settings language persistence and status endpoints have been verified on a live Homey. Live browser visual verification and selective restore remain untested.

## Test strategy

Run `npm.cmd ci`, `npm.cmd test`, `npm.cmd run validate:publish`, and `npx.cmd homey app build` from the repository root. These checks do not install or publish the app.

## Current status

Dr. Wau 1.0.0 is prepared on `feature/dr-wau-new-identity`; the Homey app lives directly at the repository root and origin points to Oberbaer/dr-wau. Migration has a versioned credential-free export, owner-only preview and explicit confirmation. The legacy 0.7.1 app and branch are preserved. See [migration](docs/migration.md) for transfer, safety and rollback rules.

Validation on 2026-10-03: 238/238 tests, publish validation and local build passed. The manual-backup crash is a release blocker: historical runtime cause/stack/kill reason are unavailable. Local fixes contain unusual job rejections and bound/minimize backup data, with four synthetic load sizes and UI progress tests. No new real backup, restore or upload was attempted; these fixes are not installed on Homey. The Development app was restarted once after evidence capture, with warnings/watchdog/vacation/schedule off; legacy settings were unchanged and the legacy app stayed stopped. Saved network targets match the migration export, with no private fresh-install defaults. See [crash review](docs/backup-crash-1.0.0.md). [PR #3](https://github.com/Oberbaer/dr-wau/pull/3) stays draft; CI has no deployment. Earlier results in the [quality report](docs/quality-day-1.0.0.md) and [identity review](docs/identity-1.0.0-review.md) are historical.

Runtime audit: four moderate affected packages in the parseuri chain; complete audit: 22 (2 low, 13 moderate, 7 high). No dependency changes or forced fixes. Private exports and live reports remain in ignored artifacts/.
