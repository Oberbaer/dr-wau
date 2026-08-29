# Project Notes – Battery Watchdog

## Purpose

Central Homey monitoring for battery-powered devices that stop reporting, even when their last battery percentage looked healthy.

## Current status

Advanced Flow is active in Homey in the `Codex Flows` folder. It checks every 6 hours, warns after 24 hours without a device report, and repeats unchanged-fault notifications every 6 hours.

## Current version

0.1.0 (unreleased)

## Architecture

- `flow-template.js`: builds the Advanced Flow and embedded HomeyScript.
- `generate-flow-proposal.js`: writes a reviewable JSON proposal locally.
- `install-disabled-flow.js`: creates the Flow disabled only with explicit flags.
- `test/`: static validation of the flow graph and watchdog script.

## Important decisions

- One central check runs every six hours instead of a timer per device.
- A device is stale after 24 hours without a Homey `lastSeenAt` update.
- Repeated notifications for an unchanged fault are limited to once every 6 hours.
- The installer creates the Flow disabled; activation was a separate, user-approved step.

## Open tasks

- Review the generated proposal and device inventory.
- Monitor the first scheduled executions and adjust the 24-hour threshold only if normal devices produce false positives.

## Known issues

- `lastSeenAt` detects silence, but cannot distinguish an empty battery from radio-range or Zigbee-mesh issues.

## Testing

- 2026-08-29: `node --test` passed (2 tests); proposal generation, installer dry-run, post-install verification, and live configuration verification completed. The active Flow contains the 24 h / 6 h thresholds.

## Git / releases

- Dedicated local Git repository in this directory.
- No remote and no release tag.
- Installed Flow ID: `11111111-1111-4111-8111-111111111111` (disabled).

## Next step

Monitor the first scheduled run and review its notification result.
