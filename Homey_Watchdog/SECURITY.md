# Security notes

Dr. Wau requests `homey:manager:api` for health analysis, battery monitoring and
configuration backups. Its settings API is private and restricted to the Homey
owner. Restore uses a separately supplied Homey API key and requires explicit
selection and confirmation. The app does not expose an external server.

## Dependency audit

The 2026-09-27 `npm audit --omit=dev` reports no runtime vulnerabilities for
the integrated dependency tree. The full install audit reports 19 findings in
the development toolchain (2 low, 13 moderate, 4 high). Re-run the audit before
distribution because advisory data changes over time.

The remaining high findings are in the local `homey` CLI development toolchain
and are not application runtime dependencies. Do not process untrusted images
or archives with that toolchain. Re-run `npm audit --omit=dev` before release
and update when Athom publishes a compatible dependency chain.

Please report suspected vulnerabilities privately to the repository owner and
do not include Homey tokens, device inventories, or exported reports in an
issue.
