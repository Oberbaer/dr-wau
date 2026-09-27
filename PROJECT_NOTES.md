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
- Mobile push is emitted through the app warning trigger and forwarded by a normal user-created Homey Flow. Timeline delivery stays inside the app.

## Design decisions

- Recommended defaults are a 6-hour check interval, a warning after 24 hours, and a 6-hour repeat interval.
- Device inspection is read-only and considers `measure_battery` and `alarm_battery` capabilities.
- Missing timestamps are monitoring unknown, not a known low-battery condition.
- Automatic checks start disabled on a fresh installation.
- Finding decisions and reports remain local on Homey.
- The Watchdog app ID remains unchanged. Backup Center used a separate ID, so its credentials and schedule require manual re-entry.

## Known limitations

- Communication silence does not identify its cause.
- A later optional push failure can cause a repeated Timeline notification on retry.
- Mobile push requires a normal Homey Flow connected to the app trigger.
- The integrated backup settings subpage has passed static build validation but has not been exercised on a live Homey.

## Test strategy

Run `npm.cmd ci`, `npm.cmd test`, `npm.cmd run validate:publish`, and `npx.cmd homey app build` from `Homey_Watchdog/`. These checks do not install or publish the app.

## Current status

The supported source is on `main`. Legacy root tooling for the former Advanced Flow watchdog has been removed from the current tree while remaining available through Git history. The former public Watchdog and Backup Center checkouts are preserved locally in ignored `_sources/`.
