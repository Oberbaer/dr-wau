# Homey Battery Watchdog

## What it does

This repository contains two related implementations:

- Advanced Flow tooling that checks battery-capable devices every six hours. It warns when a device has not reported to Homey for 24 hours, even if Homey still displays an old battery percentage. An unchanged warning can repeat after six hours.
- [`Homey_Watchdog`](Homey_Watchdog/README.md), a Homey app fork that combines the earlier Automation Health diagnostics with the same configurable battery silence monitoring.

The app emits a `battery_watchdog_warning` Flow trigger for mobile delivery. A compact companion Flow forwards its `text` token to Homey's native all-users push action because Homey does not grant apps permission to execute that action directly.

The generated watchdog only reads existing Homey data. It does not poll or wake battery devices.

## Why it exists

A reported battery percentage can remain unchanged after a device stops communicating. This watchdog detects that loss of communication so it can be investigated before the device is needed.

## Requirements

- Node.js 18 or later.
- A Homey with Advanced Flow and HomeyScript installed for live use.
- The Homey CLI, either installed globally or available as a local `homey` package. The scripts first use normal Node module resolution, then discover the global npm module directory. Set `HOMEY_CLI_MODULE_DIR` if the global directory cannot be discovered.
- A Homey folder named `Battery Watchdog` when installing the generated Flow.

## Installation and quick start

Clone the source tree, then run:

```sh
npm test
npm run proposal
```

Review `artifacts/central-battery-watchdog.flow.json`. Proposal generation makes no live Homey changes. The proposal and all runtime artifacts are ignored by Git.

## Safe workflow

1. Generate and inspect the proposal.
2. Create the Flow only after a deliberate review: `node install-disabled-flow.js --apply --approve`.
3. Inspect the created Flow in Homey.
4. Enable it only when you have verified its placement, configuration, and notifications.

The generated Flow is disabled by default. `--apply --approve` is the intentional live-write boundary. Do not use it merely to test the project.

## Configuration

| Variable | Used by | Meaning |
| --- | --- | --- |
| `HOMEY_CLI_MODULE_DIR` | live scripts | Explicit directory containing the globally installed `homey` npm module, if automatic discovery is unavailable. |
| `WATCHDOG_FLOW_ID` | `repair-existing-flow.js` | ID of a reviewed Flow for repair dry-run or approved repair. |
| `WATCHDOG_PUSH_USER_IDS` | `repair-existing-flow.js` | Comma-separated approved Homey user IDs, or `__all__` for Homey's native all-users recipient. |
| `WATCHDOG_DEVICE_NAME` | `diagnose-runtime.js` | Exact device name for the read-only diagnostic; it has no default. |

Use fake values in scripts and documentation. Keep real IDs in private configuration or ignored local artifacts.

## Optional push recipients

Timeline notification is always attempted first. During a repair, set `WATCHDOG_PUSH_USER_IDS` only for approved recipients. Use `__all__` to let Homey deliver to all current users. Without the variable, the repair script preserves the recipients embedded in the reviewed Flow.

## Generated Flow behavior

The Flow runs every six hours and includes devices advertising `measure_battery` or `alarm_battery`. A valid `lastSeenAt` older than 24 hours produces a stale-device warning. Missing or invalid timestamps are reported as monitoring unknown, never as a fabricated low battery level. Alert state uses schema 2, ignores legacy suppression state, and is saved only after delivery succeeds.

## Testing

Run `npm test` for the local unit tests. `npm run proposal` validates and writes a disabled Flow proposal. Neither command contacts Homey.

For the app, run `npm run test:app`, `npm run validate:app`, and `npm run build:app`. These commands test and build locally; they do not install the app on Homey or publish it.

The optional diagnostic is read-only with respect to Homey state, but it does contact Homey:

```sh
WATCHDOG_DEVICE_NAME="Example device" node diagnose-runtime.js
```

## Known limitations

- `lastSeenAt` indicates communication silence. It cannot determine whether the cause is an empty battery, radio coverage, a mesh problem, or a device fault.
- Timeline delivery occurs before optional individual push delivery. If a later push fails, the batch remains undelivered so a retry can repeat the Timeline message and pushes that already succeeded. This is intentional fail-safe behavior for now.
- The capability filter can include virtual or non-sensor devices that expose a battery capability.

## Safety notes

Do not run `install-disabled-flow.js --apply --approve` or an approved repair against a Homey you have not reviewed. Inspect generated JSON and the disabled Flow before enabling it. The project never fabricates a battery percentage for missing data.

## License

[MIT](LICENSE), copyright 2026 Oberbaer.
