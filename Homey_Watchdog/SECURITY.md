# Security notes

Homey Watchdog requests `homey:manager:api` so it can read Homey metadata for
health analysis and battery-device monitoring. Its settings API is private and
restricted to the Homey owner. The app does not expose an external server.

## Dependency audit

The 2026-09-12 production audit reports four moderate advisories in the legacy
Socket.IO dependency chain bundled by Athom's `homey-api` 3.20.0. No high or
critical production advisory is reported. npm proposes downgrading
`homey-api`, which is not accepted because it would replace the current API
with an older release without removing the underlying design constraint.

The remaining high findings are in the local `homey` CLI development toolchain
and are not application runtime dependencies. Do not process untrusted images
or archives with that toolchain. Re-run `npm audit --omit=dev` before release
and update when Athom publishes a compatible dependency chain.

Please report suspected vulnerabilities privately to the repository owner and
do not include Homey tokens, device inventories, or exported reports in an
issue.
