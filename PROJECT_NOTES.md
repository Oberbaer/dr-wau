# Project Notes – Battery Watchdog

## Purpose

Central Homey monitoring for battery-powered devices that stop reporting, even when their last battery percentage looked healthy.

## Current status

2026-09-07: Existing active Flow directly repaired with user approval. Homey Timeline delivery uses the available notification Flow action, and suppression is saved only after successful delivery. Checks every 6 hours, stale threshold 24 hours, repeats every 6 hours.

## Current version

0.1.0 (unreleased)

## Architecture

- `flow-template.js`: builds the Advanced Flow and embedded HomeyScript.
- `watchdog-runtime.js`: self-contained runtime embedded by the generator.
- `repair-existing-flow.js`: dry-run by default; `--apply --approve` backs up and updates the explicitly selected existing Flow (WATCHDOG_FLOW_ID).
- `diagnose-runtime.js`: read-only HomeyScript timestamp/API diagnostic.
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
- No dedicated mobile push recipient is configured; notifications target Homey's Timeline.
- 9 of 113 battery-capable entries currently have no valid lastSeenAt; reported explicitly as monitoring unknown, not confirmed outages. Includes virtual/vehicle/energy entries because capability filtering is broad.
- Receiving traffic does not prove that a motion sensor still detects motion correctly.
- Local tests and HomeyScript dry-run passed; real notification delivery after repair has not been exercised manually. Visual layout was not inspected; card positions/connections were preserved.

## Testing

- 2026-09-07: `node --test`: 6 passed. Covers eight-day silence, more than eight devices, delivery failure, repeat interval, recovery, unknown timestamps and legacy-state migration.
- HomeyScript dry-run completed; fresh example sensor correctly excluded. All writes/notifications intercepted in dry-run.
- Live readback confirmed same Flow ID, name, folder, enabled=true, broken=false and exact repaired code.

## Git / releases

- Dedicated local Git repository in this directory.
- No remote and no release tag.
- Installed Flow ID: `11111111-1111-4111-8111-111111111111` (active).
- Current work: branch `fix/watchdog-delivery`, uncommitted; no push performed.
- Strategy A direct repair; previous Flow and alert-state snapshot preserved in ignored `artifacts/live-before-repair-1788791255914.json`. No new or ALT Flow created.

## Next step

Check Timeline delivery after the next scheduled run. Clarify desired mobile push recipient if push is wanted; review unknown-timestamp device coverage separately. Commit requires explicit approval.
