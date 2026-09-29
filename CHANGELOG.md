# Changelog

## Unreleased

- Dr. Wau 0.6.0: layered native/capability/raw-event heartbeat evidence, editable per-device profiles and time limits, and a read-only diagnostic preview.
- Missing timestamps no longer produce recurring fault notifications. Event-only contacts/remotes and virtual profiles do not infer an outage from unchanged state; numeric Insights buckets are never treated as fresh device reports.
- Battery, Homey availability and stale-data findings are tracked separately. Stable per-problem/per-recipient suppression and confirmed recovery notices prevent false all-clears; legacy v1 state is preserved for rollback. New installations default to a 24-hour repeat interval; existing intervals are preserved unless changed explicitly.
- Dr. Wau 0.5.1: German backup UI and runtime messages, blue/cream responsive styling with dark mode, and a read-only backup/access overview.
- Keep the overview in view during initialization instead of scrolling to the network form; existing schedules and credentials remain untouched.
- Dr. Wau 0.5.0: checkbox-based device/zone exclusions and direct push recipients using the shared restore API Key.
- Clarified the legacy notification Flow trigger and suppress successful deliveries separately per channel and recipient.
- Fixed v5 backup files being rejected by the integrated backup import; Dr. Wau 0.4.1.
- Renamed the app to Dr. Wau while retaining the existing Homey app ID.
- Integrated Backup Center with manual/scheduled backups and explicitly confirmed selective restore.
- Added whole-zone exclusions, including subzones, for battery alerts and device health findings.

### Added

- Responsive top-level tabs for Overview, Automation Health, Battery Watchdog, and finding management, including compact status cards and keyboard navigation.
- `Homey_Watchdog`, a fork of the local Automation Health 0.2.1 codebase with configurable battery-device silence monitoring, Timeline alerts, and mobile push to all Homey users.
- Owner-only migration of existing Automation Health reports and annotations.
- An app warning trigger for Homey's native mobile-push Flow action.

### Changed

- Updated the fork to the Homey Watchdog identity and separate `com.oberbaer.homeywatchdog` app id.
- Battery silence checks use Homey's raw device endpoint so `lastSeenAt` reflects device communication data consistently.
- The original stale-device threshold was 24 hours with a 6-hour repeat interval; 0.6.0 adds individual profiles and uses 24-hour repeats for fresh installations.
- The repository now presents the native Homey Watchdog app as its only supported implementation.

### Removed

- Legacy root tooling, tests, and npm scripts for the former Advanced Flow watchdog implementation.

### Fixed

- Notification suppression is saved only after successful delivery; unreliable legacy suppression is discarded.
- All affected devices are reported, including missing timestamps as monitoring unknown.
