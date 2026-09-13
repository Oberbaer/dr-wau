# Homey Watchdog

Homey Watchdog combines the diagnostics inherited from Automation Health with scheduled monitoring for battery-capable devices. It runs locally on Homey Pro.

## Features

- Explainable health score for Flows, devices, apps and dependencies.
- Battery-device silence warning after a configurable period (default: 24 hours).
- Configurable scan and repeat intervals (default: every 6 hours).
- Homey Timeline notifications and optional mobile push to Homey's native `All` recipient through the app's warning trigger.
- Device exclusions, persistent finding annotations and a local settings dashboard.
- Manual scan, watchdog run and test notification.

The watchdog reads Homey's existing device state; it does not wake or poll battery devices. A stale timestamp indicates communication silence, not its cause.

Automatic battery checks are disabled after installation until the owner enables them in the app settings. This avoids duplicate alerts while an existing Advanced Flow watchdog is still active.

The owner-only migration endpoint can import an existing Automation Health report and annotations during a controlled local upgrade.

Mobile push uses the `A battery watchdog warning is sent` trigger and a small Homey Flow that forwards its warning-text token to Homey's native push action. This follows Homey's permission model while the scheduling, device evaluation, and repeat suppression remain inside the app.

## Development

```powershell
npm.cmd ci
npm.cmd test
npm.cmd run validate:publish
npx.cmd homey app build
```

The app is a fork of the locally developed Automation Health 0.2.1 codebase. Version 0.3.0 introduces the Homey Watchdog identity and battery monitoring. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [PRIVACY.md](PRIVACY.md).

No live Homey installation or Store publication is performed by these commands. The app uses its own `com.oberbaer.homeywatchdog` id and can therefore be reviewed separately from an existing Automation Health installation.
