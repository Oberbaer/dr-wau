# Privacy

Homey Watchdog processes Flow, device, app, zone and Logic-variable metadata locally on the user's Homey Pro. Reports, watchdog configuration, notification state and finding annotations remain in Homey app settings.

The app does not send reports or device inventories to an external service. When enabled by the user, warnings are delivered through Homey's Timeline and Homey's mobile push service to the configured Homey recipients.

Exports are created only when the user explicitly downloads a report from the settings page. Exports can contain names and identifiers from that Homey and should be treated as private.

The repository contains no exported report, live Homey inventory, Homey token, recipient id, or production Flow id. Synthetic ids used by unit tests do not identify a real Homey object.

The private owner-only migration endpoint stores imported Automation Health data directly in this app's local Homey settings. It does not transmit the data to an external service.
