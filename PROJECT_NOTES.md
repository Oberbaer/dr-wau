# Project Notes — Homey Battery Watchdog

## Purpose

Generate a reviewable, disabled Homey Advanced Flow that detects battery-capable devices which have stopped reporting.

## Architecture

- `flow-template.js` builds the Flow and embeds the self-contained runtime.
- `watchdog-runtime.js` evaluates devices and persists notification state only after successful delivery.
- `homey-api.js` resolves the Homey CLI API from a local dependency, an explicitly configured module directory, or the global npm directory.
- `generate-flow-proposal.js` produces ignored local JSON for review.
- Live install and repair scripts require explicit `--apply --approve` flags.

## Design decisions

- The Flow runs every six hours; stale reporting begins after 24 hours and repeats no sooner than every six hours.
- Device inspection is read-only and only considers `measure_battery` and `alarm_battery` capabilities.
- Missing timestamps are monitoring unknown, not a known low-battery condition.
- The generated Flow is disabled by default.

## Known limitations

- Communication silence does not identify its cause.
- A later optional push failure can cause duplicate Timeline and previously successful push notifications on retry.

## Test strategy

Run `npm test` for local runtime, Flow, and diagnostic configuration tests. Run `npm run proposal` to validate a disabled generated proposal. These checks make no live Homey changes.

## Release status and next steps

The project is prepared as a sanitized source tree for a future 0.1.0 public release. Before publishing a new repository, rerun the public-data scan, tests, proposal generation, and review the proposed Flow in a non-production context.
