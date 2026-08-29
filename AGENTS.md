# Battery Watchdog

## Purpose

Prepare and validate a central Homey battery-device watchdog.

## Safety

- Do not call Homey from tests or proposal generation.
- A live installation requires both `--apply` and `--approve`.
- The installer creates the Advanced Flow disabled. Enabling it is a separate, user-approved action.
- Never place Homey credentials, tokens, or CLI settings in this repository.

## Commands

- `node --test`
- `node generate-flow-proposal.js`
- `node install-disabled-flow.js --apply --approve` (only after explicit approval)
