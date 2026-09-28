# Dr. Wau app

This directory contains the supported native Dr. Wau app (`com.oberbaer.homeywatchdog`). It combines read-only Automation Health diagnostics, scheduled battery monitoring, and integrated configuration backups on Homey Pro.

See the repository [English documentation](../README.md) or [German documentation](../README.de.md) for features, installation, first setup, notifications, and privacy details.

## Behavior

- Automation Health reports explainable scores and findings for Flows, devices, apps, and maintainability.
- Battery Watchdog detects communication silence from Homey's existing device timestamps.
- Recommended starting values are a 6-hour check interval, a warning after 24 hours, and a 6-hour repeat interval.
- Timeline notifications are delivered directly by the app.
- Direct mobile push targets only users selected by checkbox. It uses the same locally stored Homey API Key as selective restore and requires Flow write permission.
- The optional `battery_watchdog_warning` trigger remains available for user-created notification Flows, separately from direct push.
- Repeat suppression is tracked per channel and recipient so failed deliveries do not repeat successful ones.
- Device exclusions, finding annotations, reports, and delivery state are stored locally on Homey.
- Out-of-service zones exclude their devices and all descendant-zone devices from battery alerts and device findings.
- Backup Center source is included under `backup/`, with its original MIT license and credits. Restore requires an explicit user choice and confirmation.

Automatic checks are disabled on a fresh installation until the owner reviews and enables them in the app settings. The owner-only migration endpoint exists for controlled imports from an earlier Automation Health installation.

The app ID is retained for Watchdog upgrades. A separate Backup Center installation has a different app ID, so its credentials and backup schedule must be configured again in Dr. Wau.

## Development

Node.js 22 or newer is required.

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run validate:publish
npx.cmd homey app build
```

These commands do not install the app on Homey and do not publish it. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), [PRIVACY.md](PRIVACY.md), and [SECURITY.md](SECURITY.md).
