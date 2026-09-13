# Store certification notes

## Why this is a separate concept

Homey Watchdog combines the former Automation Health concept with focused battery-device silence monitoring. It is not a replacement for Flow Checker, Zigbee Insights, Audit, sysInternals or Flow Gadgets.

- Flow Checker focuses on broken, disabled and unused flows and variables.
- Device Watchdog continuously monitors battery, reachability and data freshness.
- Zigbee Insights presents the wireless network state.
- Audit records changes and exports logs.
- sysInternals presents system performance data.
- Flow Gadgets provides reusable calculation and logic cards.

Homey Watchdog combines read-only snapshots into an explainable, cross-layer assessment and adds scheduled silence detection for battery-capable devices. Its distinctive output is a weighted score, confidence-labelled findings, dependency-aware prioritization, configurable notifications and a portable report. It does not control devices, manage radios or provide generic calculation cards.

## Safety and privacy

- Device, Flow and dependency inspection uses read operations exposed by Homey Web API.
- Configured warnings use Homey Timeline and Homey's mobile push action.
- There is no automatic repair function.
- No device, Flow, variable, app or wireless setting is changed.
- Processing and report storage remain local on Homey Pro.
- External data transfer is not implemented.
- The owner can explicitly download a JSON report.

## Compensation

Every app feature, including the full scan, all findings, recommendations and JSON export, is free. The app contains no subscription, payment gate or paid unlock. Any future installation or consulting work is a separate human service outside the app and is not required to use any app function.

## Permission justification

`homey:manager:api` is required because the assessment correlates normal Flows, Advanced Flows, devices, apps, Logic variables, folders and zones, and because the optional push notification uses Homey's built-in mobile action. The settings page exposes the notification controls.
