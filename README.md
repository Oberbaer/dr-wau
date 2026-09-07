# Central Battery Watchdog for Homey

This project prepares one Advanced Flow that checks battery-powered Homey devices every six hours. It alerts when a device has not reported for 24 hours, so a dead device does not keep showing an old, misleading battery percentage. For an unchanged fault, it can repeat the notification every six hours.

The flow does not poll devices. It reads Homey's existing device state, so its CPU and RAM impact is minimal.

## Safe workflow

1. Run `node --test`.
2. Run `node generate-flow-proposal.js` and review `artifacts/central-battery-watchdog.flow.json`.
3. Only after explicit approval, run `node install-disabled-flow.js --apply --approve`.
4. Review the disabled Flow in Homey before enabling it.

No Homey state is changed by proposal generation or tests.

The watchdog posts to Homey's Timeline and, when configured, to explicitly selected mobile push recipients. Missing lastSeenAt values produce monitoring-unknown warnings. Device traffic is a sign of communication, not proof of full sensor functionality.

Set WATCHDOG_PUSH_USER_IDS to comma-separated, approved Homey user IDs when repairing an existing Flow to add recipients. Omit it to preserve the current embedded selection. Real IDs stay in ignored live exports, not templates.

For an approved direct repair, set WATCHDOG_FLOW_ID and run `node repair-existing-flow.js` for a HomeyScript dry-run with notification/state writes intercepted. Add `--apply --approve` only for the approved update; an ignored local backup is created before changing the existing Flow.
