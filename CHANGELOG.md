# Changelog

## Unreleased

### Added

- `Homey_Watchdog`, a fork of the local Automation Health 0.2.1 codebase with configurable battery-device silence monitoring, Timeline alerts, and mobile push to all Homey users.
- Owner-only migration of existing Automation Health reports and annotations.
- An app warning trigger for Homey's native mobile-push Flow action.
- Initial central battery-device watchdog proposal.
- Optional mobile push delivery to explicitly selected Homey users or Homey's native all-users recipient, alongside Timeline notifications.
- Portable Homey CLI module resolution and configurable read-only diagnostics.

### Changed

- Updated the fork to the Homey Watchdog identity and separate `com.oberbaer.homeywatchdog` app id.
- Battery silence checks use Homey's raw device endpoint so `lastSeenAt` matches the proven Advanced Flow implementation.
- The generated Flow uses a neutral public name and is disabled by default.
- The installer targets the `Battery Watchdog` Homey folder.
- Stale-device threshold is 24 hours; unchanged-fault notifications repeat every 6 hours.

### Fixed

- Notification suppression is saved only after successful delivery; unreliable legacy suppression is discarded.
- All affected devices are reported, including missing timestamps as monitoring unknown.
