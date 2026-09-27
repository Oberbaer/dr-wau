# Privacy

Dr. Wau processes Flow, device, app, zone and Logic-variable metadata locally on the user's Homey Pro. Reports, zone exclusions, watchdog configuration, notification state and finding annotations remain in Homey app settings.

Health reports and device inventories are not sent to an external service by the health scanner. When enabled by the user, warnings are delivered through Homey's Timeline and mobile push service. The integrated Backup Center can upload configuration backups to destinations configured by the owner, including WebDAV, SMB, SFTP and FTP.

Health report exports are created only when the user explicitly downloads them. Backup exports may contain device settings, Logic values and Flow arguments, including sensitive values. Backup Center excludes its saved API key, destination passwords and the Logic variable named `ha_backup_token`, but it is not a general secrets filter. Protect downloaded and uploaded backups accordingly.

The repository contains no exported report, live Homey inventory, Homey token, recipient id, or production Flow id. Synthetic ids used by unit tests do not identify a real Homey object.

The private owner-only migration endpoint stores imported Automation Health data directly in this app's local Homey settings. It does not transmit the data to an external service.
