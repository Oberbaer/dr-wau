# Project Notes – Battery Watchdog

## Purpose

Central Homey monitoring for battery-powered devices that stop reporting, even when their last battery percentage looked healthy.

## Current status

Local flow proposal prepared. No central watchdog has been installed in Homey.

## Current version

0.1.0 (unreleased)

## Architecture

- `flow-template.js`: builds the Advanced Flow and embedded HomeyScript.
- `generate-flow-proposal.js`: writes a reviewable JSON proposal locally.
- `install-disabled-flow.js`: creates the Flow disabled only with explicit flags.
- `test/`: static validation of the flow graph and watchdog script.

## Important decisions

- One central check runs every six hours instead of a timer per device.
- A device is stale after 48 hours without a Homey `lastSeenAt` update.
- Repeated notifications for an unchanged fault are limited to once per 24 hours.
- Installation does not enable the flow.

## Open tasks

- Review the generated proposal and device inventory.
- Explicitly approve disabled installation, then separately approve activation after inspection.

## Known issues

- `lastSeenAt` detects silence, but cannot distinguish an empty battery from radio-range or Zigbee-mesh issues.

## Testing

- 2026-08-29: `node --test` passed (2 tests); proposal generation and installer dry-run completed without Homey changes.

## Git / releases

- Dedicated local Git repository in this directory.
- No remote and no release tag.

## Next step

Review `artifacts/central-battery-watchdog.flow.json`; after explicit approval, install it disabled in Homey.
