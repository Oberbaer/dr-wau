# Dr. Wau 🐶🔧⚙️👀

[![Node.js >=22](https://img.shields.io/badge/Node.js-%3E%3D22-339933?logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Dr. Wau is a native Homey Pro app for automation health checks, battery monitoring, and configuration backups. The supported implementation lives in [`Homey_Watchdog/`](Homey_Watchdog/README.md). Its Homey app ID remains `com.oberbaer.homeywatchdog` so existing Watchdog settings can survive an update.

Deutsche Dokumentation: [README.de.md](README.de.md)

## Features

- Five main views: Overview, Automation Health, Battery Watchdog, Backups, and Management.
- Explainable overall and category scores for Flows, devices, apps, and maintainability.
- Active findings with priority, status, notes, and persistent decisions.
- Battery-device silence alerts based on Homey's existing `lastSeenAt` data.
- Configurable check, warning, and repeat intervals.
- Homey Timeline notifications and optional mobile push through a Homey Flow trigger.
- Device and whole-zone exclusions (including subzones), an ignore board, local report storage, and JSON export.
- Integrated Backup Center: manual and scheduled configuration backups, WebDAV/SMB/SFTP/FTP destinations, and explicitly confirmed selective restore.
- Read-only analysis: the app does not repair Flows, control devices, or wake battery devices.

## Screenshots

Screenshots are planned but are intentionally not included yet. Future assets will use only these paths:

- `docs/images/overview.png`
- `docs/images/automation-health.png`
- `docs/images/battery-watchdog.png`
- `docs/images/active-findings.png`
- `docs/images/finding-management.png`
- `docs/images/ignore-board.png`
- `docs/images/watchdog-notification.png`

## Installation

Requirements:

- Homey Pro compatible with Homey SDK 3 and app compatibility `>=12.4.0`.
- Node.js 22 or newer.
- npm and a Homey account with permission to install developer apps.

```sh
git clone https://github.com/Oberbaer/homey-battery-watchdog.git
cd homey-battery-watchdog/Homey_Watchdog
npm install
npx homey login
npx homey app install
```

The last command installs the app on the Homey selected through the Homey CLI. It does not publish the app to the Homey App Store.

## First setup

1. Open **Apps > Dr. Wau > Settings** in Homey.
2. Review the Overview and run the first Automation Health scan.
3. Open Battery Watchdog and review the detected battery devices.
4. Use the recommended starting values: check every **6 h**, warn after **24 h**, and repeat after **6 h**.
5. Enable automatic checks and the desired notification channels.
6. Optionally exclude devices or entire out-of-service zones, then save the settings.
7. Run one manual check to confirm the configuration without controlling any device.

## Overview

The Overview is the landing page. It links to the two main analysis modules and shows the latest Automation Health score and Battery Watchdog run status at a glance.

## Automation Health

Automation Health performs a read-only scan and presents:

- Overall score
- Flows
- Devices
- Apps
- Maintainability
- Active findings

The report can be filtered by category and exported as JSON. Findings explain what was detected and provide a recommendation; the app does not apply repairs automatically.

## Battery Watchdog

Battery Watchdog evaluates devices that expose a battery capability. Its controls are:

- Check interval
- Warn after
- Repeat after
- Automatic checks
- Homey Timeline
- Push notifications
- Excluded battery devices
- Excluded zones, including all descendant zones

The same zone exclusion also suppresses device availability and battery findings in future Automation Health scans. It does not suppress unrelated Flow or app findings.

## Backups

The Backups tab contains the integrated Backup Center by Dennis Weel. It can export Homey configuration, schedule uploads, and build an explicit selective restore plan. Restore changes Homey objects only after the owner chooses items and confirms execution. Source license and contributor notices are preserved in [`Homey_Watchdog/backup/`](Homey_Watchdog/backup/).

Backup Center used a different Homey app ID. Its passwords, API key, destinations, and schedule cannot move automatically into Dr. Wau; enter and test them again before switching off the former app. Existing backup files remain usable as restore inputs.

Recommended defaults are **6 h / 24 h / 6 h**. A stale timestamp indicates communication silence. It does not prove whether the cause is an empty battery, radio coverage, a mesh issue, or a device fault. Missing timestamps remain an unknown monitoring state and are never presented as a fabricated battery percentage.

## Active Findings

Active Findings lists current Automation Health observations. Findings are grouped by Flows, devices, apps, or maintainability and include severity, affected subject, and a recommendation. Ignored findings do not count toward the active score.

## Finding Management

Each finding can store a persistent decision with:

- Priority
- Status
- Note
- Ignore in future scans and score
- Save
- Reset decision
- Archive / Ignore Board

These decisions remain local to the Homey app and are reapplied after later scans.

## Ignore Board & Archive

The Management view contains the Ignore Board and archive. It keeps ignored and previously managed findings visible, supports category filtering, and lets the owner restore a decision at any time.

## Notifications

Timeline notifications are created directly by the app when enabled. For mobile push, enable **Push notifications** in Battery Watchdog and create a normal Homey Flow:

1. **When:** Homey Watchdog ? a battery watchdog warning is sent.
2. **Then:** send a mobile push notification to the desired Homey users.
3. Use the trigger's `text` token as the notification text.

The app suppresses unchanged repeat alerts until the configured repeat interval has elapsed. If delivery fails, the warning is not marked as delivered so a later run can retry it.

## Privacy & Security

Analysis and persistent state stay on the owner's Homey. The app does not require an external service and does not include Homey tokens, device inventories, or production exports in the repository. Owner APIs are private. See [Privacy](Homey_Watchdog/PRIVACY.md), [Security](Homey_Watchdog/SECURITY.md), and [third-party notices](Homey_Watchdog/THIRD_PARTY_NOTICES.md).

## Development

Run development commands from the app directory:

```powershell
cd Homey_Watchdog
npm.cmd ci
npm.cmd test
npm.cmd run validate:publish
npx.cmd homey app build
```

These commands install dependencies, run tests, validate the Homey manifest at publish level, and build locally. They do not install the app on Homey and do not publish a release. The project is licensed under the [MIT License](LICENSE).
