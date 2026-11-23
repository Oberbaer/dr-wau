# Privacy

Dr. Wau processes Flow, device, app, zone and Logic-variable metadata locally on the user's Homey Pro. Reports, zone exclusions, watchdog configuration, notification state and finding annotations remain in Homey app settings.

Health reports and device inventories are not sent to an external service by the health scanner. When enabled by the user, warnings are delivered through Homey's Timeline and mobile push service. The integrated Backup Center can upload configuration backups to destinations configured by the owner, including WebDAV, SMB, SFTP and FTP.

Direct pushes are sent only to Homey users explicitly selected by the owner. Recipient IDs and per-recipient delivery suppression remain in local app settings. The shared Homey API Key is used for these push actions and explicitly confirmed selective restore; it is never returned by an API endpoint or included in a backup.

Health report exports are created only when the user explicitly downloads them. Backup exports may contain device settings, Logic values and Flow arguments, including sensitive values. Backup Center excludes its saved API key, destination passwords and the Logic variable named `ha_backup_token`, but it is not a general secrets filter. Protect downloaded and uploaded backups accordingly.

The repository contains no exported report, live Homey inventory, Homey token, recipient id, or production Flow id. Synthetic ids used by unit tests do not identify a real Homey object.

The private owner-only migration endpoint stores imported Automation Health data directly in this app's local Homey settings. It does not transmit the data to an external service.

Dr. Wau 1.0.0 configuration migration requires an explicit file export, read-only preview and confirmed import. The new app never reads another app's private settings. Saved API keys, destination credentials and URL authentication/query parameters are excluded from the migration file. Device/zone/recipient IDs, learning history and finding notes remain private data; keep exports local and out of Git. Imported notification channels, vacation and backup schedules stay disabled. See [migration](docs/migration.md) for details.
