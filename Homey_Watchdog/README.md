# Dr. Wau app

This directory contains the supported native Dr. Wau app (`com.oberbaer.homeywatchdog`). It combines read-only Automation Health diagnostics, scheduled battery monitoring, and integrated configuration backups on Homey Pro.

See the repository [English documentation](../README.md) or [German documentation](../README.de.md) for features, installation, first setup, notifications, and privacy details.

## Behavior

- Automation Health reports explainable scores and findings for Flows, devices, apps, and maintainability.
- Battery Watchdog evaluates native heartbeat, relevant capability update times and verified raw Insights events with per-device profiles; resampled numeric buckets are not new reports. Missing timestamps and unused event devices do not automatically create fault warnings.
- From 0.7.0, Device Watch stores up to 96 confirmed report times per device in `device_learning_state_v1`, separately from the compatible Watchdog configuration. At least 10 intervals over 3 days are needed for medium confidence, and 20 over 7 days for high confidence. A learned threshold uses twice the filtered P95, rounded up and bounded by a device-class minimum. One long outage is excluded from the normal interval estimate.
- A native timestamp observed during a six-hour scan represents one observed report, not every transmission between scans. Raw Insights events are read with a bounded, rotating request window. Numeric aggregated buckets, cached values, `available:true`, and user actions in this UI never become reports. Where data is insufficient, the app shows an assumed profile or learning phase, not a learned guarantee.
- Owner-only profile controls allow confirmation, a manual warning threshold, event-only or disabled silence monitoring, a per-device vacation rule, and a learning reset. A manual 0.6.0 profile remains manual and confirmed; existing exclusions, recipients, limits and suppression state are retained.
- Vacation mode can be switched from the main view or Flow cards, optionally with an expiry. It may pause or extend a device's silence warning; battery problems and explicit Homey unavailability continue. High-confidence learned and periodic technical profiles keep their silence check by default, while event-oriented profiles pause it. Each device can override the rule.
- Device Watch starts with a small status view; the device detail reveals learned evidence and thresholds. Backup and Automation Health functions remain available. A communication-silence finding asks for inspection and does not prove that the device is offline.
- Battery, reported unavailability and stale measurement data are separate findings, with independent suppression and confirmed recovery notifications. A read-only preview and editable profiles/time limits explain each decision.
- Recommended starting values are a 6-hour check interval, a warning after 24 hours, and a 24-hour repeat interval; existing settings are retained.
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
