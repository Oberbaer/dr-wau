# Competitor research snapshot

Checked on 2026-08-12 against public Homey App Store metadata.

| App | Current focus | Gap left for Dr. Wau |
| --- | --- | --- |
| [Flow Checker](https://homey.app/en-us/app/com.athom.flowchecker/) | Broken, disabled and unused flows and variables | No combined device/app health score, graph explainability or customer report |
| [Flow Gadgets](https://homey.app/en-us/app/com.pascalnohl.flowgadgets/) | Generic Advanced Flow calculation, mapping and temporary-value cards | A construction tool, not a diagnostic or audit product |
| [Device Watchdog](https://homey.app/en-us/app/com.rickd.devicewatchdog/) | Battery, reachability and data-freshness monitoring | No structural Flow graph or dependency-risk analysis |
| [Zigbee Insights](https://homey.app/en-us/app/com.all.zigbee/) | Coordinator and Zigbee network overview | No cross-layer connection from network/device symptoms to affected flows |
| [Audit](https://homey.app/en-us/app/com.audit/) | Change logging and third-party log output | Records events but does not build a prioritized health assessment |
| [sysInternals](https://homey.app/en-us/app/com.sysInternals/) | CPU, memory, temperature and network internals | No Flow/device dependency analysis |
| [HealthChecks](https://homey.app/en-us/app/it.arturoiafrate.heathchecks-io/) | healthchecks.io heartbeat integration | Internet heartbeat only |

## Differentiation

Dr. Wau should keep device and Flow inspection read-only while adding explicit notification delivery:

1. One transparent 0–100 result with visible category weights.
2. Cross-layer findings: a failed device or app is linked to affected active Flow paths.
3. Advanced Flow graph checks beyond the built-in broken flag.
4. Confidence labels that separate confirmed defects from review hints.
5. Prioritized repair advice and a portable, customer-friendly before/after report.
6. Local processing, scheduled battery silence alerts and no automatic repairs.

This separation must be explained in the Store certification notes because Homey's guidelines discourage duplicate concepts. The full app functionality remains free; optional human consulting is a separate service and does not unlock app features.
