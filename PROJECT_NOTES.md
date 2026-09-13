# Project Notes — Homey Battery Watchdog

## Purpose

Maintain a reviewable Advanced Flow and a separate Homey Watchdog app that detect battery-capable devices which have stopped reporting.

## Architecture

- `flow-template.js` builds the Flow and embeds the self-contained runtime.
- `watchdog-runtime.js` evaluates devices and persists notification state only after successful delivery.
- `homey-api.js` resolves the Homey CLI API from a local dependency, an explicitly configured module directory, or the global npm directory.
- `generate-flow-proposal.js` produces ignored local JSON for review.
- Live install and repair scripts require explicit `--apply --approve` flags.
- `Homey_Watchdog/` is a fork of the local Automation Health 0.2.1 source. It retains the read-only health analysis and adds scheduled battery monitoring.
- Mobile push is delivered by a compact companion Flow listening to the app's warning trigger; Timeline delivery remains inside the app.

## Design decisions

- The Flow runs every six hours; stale reporting begins after 24 hours and repeats no sooner than every six hours.
- Device inspection is read-only and only considers `measure_battery` and `alarm_battery` capabilities.
- Missing timestamps are monitoring unknown, not a known low-battery condition.
- The generated Flow is disabled by default.
- Live mobile delivery can use Homey's native `__all__` recipient; a real test invocation was accepted by Homey.

## Known limitations

- Communication silence does not identify its cause.
- A later optional push failure can cause duplicate Timeline and previously successful push notifications on retry.

## Test strategy

Run `npm test` for local runtime, Flow, and diagnostic configuration tests. Run `npm run proposal` to validate a disabled generated proposal. These checks make no live Homey changes.

## Release status and next steps

The combined source is maintained on `feature/homey-watchdog-app`. Before publication, rerun the privacy/license audit, tests, Homey publish validation, and staged diff review.
