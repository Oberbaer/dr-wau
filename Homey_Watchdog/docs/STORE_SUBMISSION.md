# Store certification notes

## Why this is a separate concept

Dr. Wau combines the former Automation Health concept with battery-device silence monitoring and configuration backups. It is not a replacement for Flow Checker, Zigbee Insights, Audit, sysInternals or Flow Gadgets.

- Flow Checker focuses on broken, disabled and unused flows and variables.
- Device Watchdog continuously monitors battery, reachability and data freshness.
- Zigbee Insights presents the wireless network state.
- Audit records changes and exports logs.
- sysInternals presents system performance data.
- Flow Gadgets provides reusable calculation and logic cards.

Dr. Wau combines read-only snapshots into an explainable, cross-layer assessment, adds scheduled silence detection for battery-capable devices, and integrates explicit configuration backup and selective restore. It does not control devices during health checks or manage radios.

## Safety and privacy

- Device, Flow and dependency inspection uses read operations exposed by Homey Web API.
- Configured warnings use Homey Timeline and Homey's mobile push action.
- There is no automatic repair function.
- Health scans do not change devices, Flows, variables, apps or wireless settings. Explicit selective restore can change selected configuration objects.
- Processing and report storage remain local on Homey Pro.
- Backup files can be transferred to destinations explicitly configured by the owner.
- The owner can explicitly download a JSON report.

## Compensation

Every app feature, including the full scan, all findings, recommendations and JSON export, is free. The app contains no subscription, payment gate or paid unlock. Any future installation or consulting work is a separate human service outside the app and is not required to use any app function.

## Permission justification

`homey:manager:api` is required because the assessment correlates normal Flows, Advanced Flows, devices, apps, Logic variables, folders and zones. The optional warning trigger supports user-created notification Flows. Direct pushes to selected users use an owner-supplied Homey API Key with Flow write permission; the same key supports explicitly confirmed selective restore. The app never broadens the key's permissions itself.
