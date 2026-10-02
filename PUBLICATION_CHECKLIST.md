# Publication checklist

Last local review: 2026-10-01

## Repository scope

- The repository root is the only supported Dr. Wau implementation, including its integrated backup module.
- Legacy Advanced Flow watchdog scripts, their root tests, and the root npm configuration have been removed from the current tree.
- Historical implementations remain available through normal Git history; no history was rewritten for the App-only cleanup.
- Future screenshot paths are documented, but no screenshot files have been created.

## Current tree

- No Homey token, API key, password, private key, e-mail address, private IP address, live Flow ID, local machine path, or known private device label is expected in files eligible for Git.
- Synthetic identifiers in tests do not identify a real Homey object.
- `node_modules`, `.homeybuild`, reports, logs, backups, runtime artifacts, and machine-local project notes are ignored.
- The locally generated Homey build was scanned for the known private values and local paths with no matches; repeat this check immediately before any future public release.

## Licensing

- Repository source is offered under the root MIT License.
- Runtime dependencies are permissively licensed, except `homey-api`, whose Athom license permits use with Homey products.
- Older transitive dependencies with missing lockfile license fields were resolved from bundled licenses, README files, or upstream repositories as MIT.
- LGPL Sharp/libvips packages belong only to the local Homey CLI development toolchain and are not app runtime dependencies.
- Detailed dependency notes are in `THIRD_PARTY_NOTICES.md`.

## Security

- Owner API routes are private.
- Publish-level manifest validation must pass before release preparation is considered complete.
- The current runtime audit reports four moderate affected packages in the known `parseuri` dependency chain. See `SECURITY.md`; no automatic forced fix was applied.

## History

The earlier privacy cleanup rewrote and rescanned the repository history before this App-only task. This task preserves the resulting history and changes only the current working tree. Existing private rollback bundles remain ignored and must not be published.

## Release boundary

The user has requested this task's GitHub consolidation. Homey installation, Homey App Store submission, tags, releases, and deployments are separate actions.
