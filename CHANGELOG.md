# Changelog

## Unreleased

### Added

- Optional mobile push delivery to explicitly selected Homey users, alongside Timeline notifications; successful push delivery is required before marking the batch delivered.

### Fixed

- Repair existing watchdog notification delivery through the available Homey Flow action.
- Save notification suppression only after successful delivery; discard unreliable legacy suppression.
- Report all affected devices and distinguish missing timestamps from confirmed silence.

### Added

- Initial central battery-device watchdog proposal.

### Changed

- Installer now places the disabled Advanced Flow in Homey's `Codex Flows` folder.
- Stale-device threshold changed to 24 hours; unchanged-fault notifications repeat every 6 hours.
