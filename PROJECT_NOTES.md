# Project Notes - Dr. Wau

## Purpose

Maintain the native Dr. Wau app in `Homey_Watchdog/`. It combines read-only Automation Health diagnostics, scheduled battery monitoring, and integrated Backup Center functionality.

## Architecture

- `Homey_Watchdog/app.js` initializes the app, owner-only API, scans, schedules, notifications, and persistent settings.
- `Homey_Watchdog/lib/analyzer.js` produces health scores and findings.
- `Homey_Watchdog/lib/battery-watchdog.js` evaluates battery-capable devices and repeat suppression.
- `Homey_Watchdog/lib/zone-exclusions.js` applies whole-zone exclusions, including descendants.
- `Homey_Watchdog/backup/` contains Backup Center's runtime and license; `settings/backup/` hosts its UI.
- `Homey_Watchdog/settings/index.html` provides Overview, Automation Health, Battery Watchdog, Backups, and Management views.
- `.homeycompose/` is the source for app metadata and Flow cards; `app.json` is generated.
- Direct push uses checkbox-selected Homey users and the shared restore API Key. The legacy warning Flow trigger is separately configurable. Timeline delivery stays inside the app.
- Repeat suppression is tracked per channel/recipient; only successful route deliveries are persisted.
- Backup translations are shared between `backup/settings/` and the served `settings/backup/` UI. German `de.js` uses English canonical messages with aliases for the imported Dutch source strings; tests enforce copy consistency and preserve protocol data.

## Design decisions

- Recommended defaults are a 6-hour check interval, a warning after 24 hours, and a 6-hour repeat interval.
- Device inspection is read-only and considers `measure_battery` and `alarm_battery` capabilities.
- Missing timestamps are monitoring unknown, not a known low-battery condition.
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

Integration work is on `feature/dr-wau-integrated-app` with a draft PR against the existing public repository. Version 0.5.1 adds German backup settings, blue/cream styling and a status overview and is installed with explicit user approval. German language persistence, running app state, and unchanged backup schedule, destination settings and Watchdog configuration were verified through live read-only checks after the approved language change. The former public Watchdog and Backup Center checkouts are preserved locally in ignored `_sources/`.

Local validation for 0.5.1: reproducible `npm ci`, 114 passing tests, publish-level manifest validation, and Homey build. German UI was inspected with synthetic data in a local narrow browser preview; full dark-mode visual QA was interrupted by a browser connection timeout. The approved live update preserved existing settings and changed only the backup language to German; no manual live backup, push or restore was triggered. The existing dependency audit reports 19 vulnerabilities (2 low, 13 moderate, 4 high); no dependency versions were changed in this feature.
