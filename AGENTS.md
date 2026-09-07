# AGENTS.md - Homey Battery Watchdog

This file contains project-specific rules only.

All global Codex rules remain applicable.

## 1. Scope

This repository contains the Homey Battery Watchdog tooling and documentation.

Keep work limited to:

- battery-device discovery
- battery-state evaluation
- notification logic
- Flow proposal/generation
- Flow installation tooling
- related tests
- documentation

Do not mix unrelated Homey projects or repositories.

## 2. Homey Safety

Homey is production.

Prefer:

- read-only device discovery
- generated Flow proposals
- disabled staging Flows
- static validation

New or substantially modified Flows should follow the global Homey
small-change/versioned-replacement strategy.

Do not switch unrelated devices or alter production automation merely to test
the watchdog.

## 3. Generated Flow Safety

Generated Flows must:

- reference valid devices/capabilities
- handle missing or unavailable devices safely
- avoid destructive actions
- avoid unrelated device control
- use clear names
- remain understandable to the user

When installation creates a new Flow, prefer creating it disabled unless the
user has approved activation.

## 4. Battery Logic

Battery evaluation should distinguish where possible between:

- numeric battery percentage
- battery alarm capability
- unavailable data
- unsupported devices
- stale or missing values

Do not fabricate battery percentages or treat missing data as a known low
battery state.

## 5. Notifications

Avoid notification spam.

Where practical:

- notify only when relevant
- avoid duplicate messages
- identify the affected device clearly
- keep notification logic deterministic

## 6. Runtime and Private Data

Do not commit:

- live Homey dumps
- authentication tokens
- private device inventories unless explicitly sanitized
- generated runtime reports
- backups
- logs

Keep generated/private data ignored.

## 7. Validation

After meaningful changes, validate where applicable:

- device filtering
- capability detection
- battery threshold logic
- generated Flow structure
- disabled-by-default behavior
- notification behavior
- failure handling

Do not claim live Homey validation unless it was actually performed.

## 8. Project Priority

Prioritize:

1. no unintended Homey actions
2. correct battery detection
3. low notification noise
4. safe generated Flows
5. clear diagnostics
6. maintainable code