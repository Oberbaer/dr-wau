# Security notes

Dr. Wau requests `homey:manager:api` for health analysis, battery monitoring and
configuration backups. Its settings API is private and restricted to the Homey
owner. Restore uses a separately supplied Homey API key and requires explicit
selection and confirmation. The app does not expose an external server.

## Dependency audit

The 2026-10-02 `npm audit --omit=dev` reports four moderate affected packages:
`parseuri`, `engine.io-client`, `socket.io-client` and the direct `homey-api`
dependency. They belong to the known `parseuri` advisory chain. These are
runtime dependencies; the audit counts affected packages, not four separate
root causes. The complete audit reports 22 affected packages (2 low,
13 moderate, 7 high), of which 18 are development-only (2 low, 9 moderate,
7 high). Advisory data changes; re-run before distribution. No dependency
versions or forced audit fixes were applied for the identity migration.

Installed `parseuri` 0.0.6 is in the affected range of
[GHSA-6fx8-h7jm-663j](https://github.com/advisories/GHSA-6fx8-h7jm-663j).
The advisory describes excessive regular-expression processing for crafted
URLs and lists no patched version. Exploitability in this app has not been
demonstrated. The audit's suggested top-level downgrade is not an established
compatible repair. See the [quality report](docs/quality-day-1.0.0.md) for the
development-only package breakdown and validation limitations.

The remaining high findings are in the local `homey` CLI development toolchain
and are not application runtime dependencies. Do not process untrusted images
or archives with that toolchain. Re-run `npm audit --omit=dev` before release
and update when Athom publishes a compatible dependency chain.

Please report suspected vulnerabilities privately to the repository owner and
do not include Homey tokens, device inventories, or exported reports in an
issue.
