# Changelog

## 1.0.0

- Clean Dr. Wau identity: `com.oberbaer.drwau`, repository `Oberbaer/dr-wau`, Homey app directly at the repository root.
- Explicit versioned configuration export/import from legacy 0.7.1, read-only preview and file-bound confirmation; preserve learning, profiles, annotations and backup preferences.
- Exclude credentials and retain activation choices separately; imported warning channels, vacation and backup schedules stay disabled.
- New turquoise doctor-puppy branding without a pendant; magenta tongue.
- No automatic uninstall of the legacy app, no Flow rewrites and no production activation.

## Historical / Legacy 0.7.x and earlier

- Start a clean Dr. Wau identity for fresh Homey installs: new app ID `com.oberbaer.drwau`. The previous `com.oberbaer.homeywatchdog` ID remains the legacy/test identity and is not overwritten by this branch.
- Dr. Wau 0.7.1: separate contact activity learning from periodic communication, group short bursts into fixed 30-minute blocks and assess active-day coverage and upper pauses. Keep automatic recommendations visible beside manual thresholds; contacts without enough activity remain event-only, and vacation pauses activity by default.
- Dr. Wau 0.7.1: merge older verified learning history independently of a fresh native heartbeat; retain deduplication and bounded compatible state.
- Calculate median and P90/P95 from one conservative interval population, with explicit event/interval counts, confidence reasons and documented outlier boundaries in the existing expert panel.
- Recheck persisted vacation deadlines at startup, Watchdog runs and short timer wakeups; long vacations no longer end at the JavaScript timer limit.

- Dr. Wau 0.7.0: adaptive per-device reporting profiles with bounded local learning history, confidence levels and conservative learned warning thresholds.
- Device Watch with profile confirmation, manual overrides, a compact overview and expert evidence; vacation mode with per-device rules and Homey Flow cards.
- Existing 0.6.0 settings and notification suppression remain compatible. Missing timestamps, cached values and aggregated numeric Insights still do not fabricate reports.

- Dr. Wau 0.6.0: layered native/capability/raw-event heartbeat evidence, editable per-device profiles and time limits, and a read-only diagnostic preview.
- Missing timestamps no longer produce recurring fault notifications. Event-only contacts/remotes and virtual profiles do not infer an outage from unchanged state; numeric Insights buckets are never treated as fresh device reports.
- Battery, Homey availability and stale-data findings are tracked separately. Stable per-problem/per-recipient suppression and confirmed recovery notices prevent false all-clears; legacy v1 state is preserved for rollback. New installations default to a 24-hour repeat interval; existing intervals are preserved unless changed explicitly.
- Dr. Wau 0.5.1: German backup UI and runtime messages, blue/cream responsive styling with dark mode, and a read-only backup/access overview.
- Keep the overview in view during initialization instead of scrolling to the network form; existing schedules and credentials remain untouched.
- Dr. Wau 0.5.0: checkbox-based device/zone exclusions and direct push recipients using the shared restore API Key.
- Clarified the legacy notification Flow trigger and suppress successful deliveries separately per channel and recipient.
- Fixed v5 backup files being rejected by the integrated backup import; Dr. Wau 0.4.1.
- Renamed the app to Dr. Wau while retaining the then-existing Homey app ID. A later clean-install identity changes this to `com.oberbaer.drwau`.
- Integrated Backup Center with manual/scheduled backups and explicitly confirmed selective restore.
- Added whole-zone exclusions, including subzones, for battery alerts and device health findings.

### Added

- Responsive top-level tabs for Overview, Automation Health, Battery Watchdog, and finding management, including compact status cards and keyboard navigation.
- `Homey_Watchdog`, a fork of the local Automation Health 0.2.1 codebase with configurable battery-device silence monitoring, Timeline alerts, and mobile push to all Homey users.
- Owner-only migration of existing Automation Health reports and annotations.
- An app warning trigger for Homey's native mobile-push Flow action.

### Changed

- Historical 0.x step: updated the fork to the Homey Watchdog identity with `com.oberbaer.homeywatchdog`; the clean Dr. Wau install now uses `com.oberbaer.drwau`.
- Battery silence checks use Homey's raw device endpoint so `lastSeenAt` reflects device communication data consistently.
- The original stale-device threshold was 24 hours with a 6-hour repeat interval; 0.6.0 adds individual profiles and uses 24-hour repeats for fresh installations.
- The repository now presents the native Homey Watchdog app as its only supported implementation.

### Removed

- Legacy root tooling, tests, and npm scripts for the former Advanced Flow watchdog implementation.

### Fixed

- Notification suppression is saved only after successful delivery; unreliable legacy suppression is discarded.
- All affected devices are reported, including missing timestamps as monitoring unknown.
