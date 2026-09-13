# Publication checklist

Last local review: 2026-09-12

## Current tree

- No Homey token, API key, password, private key, e-mail address, private IP
  address, live Flow id, local machine path, or known private device label was
  found in files eligible for Git.
- The two UUIDs in app analyzer tests are fixed synthetic values.
- Generated PNG files contain only standard image chunks and no textual
  metadata.
- `node_modules`, `.homeybuild`, generated Flow proposals, logs, and local
  project notes are ignored.
- The generated Homey build was scanned separately and contains no known
  private data or secret pattern.

## Licensing

- Repository source is offered under the root MIT License.
- Runtime dependencies are permissively licensed, except `homey-api`, whose
  Athom license explicitly permits use with Homey products.
- Older transitive dependencies with missing lockfile license fields were
  resolved from their bundled license/README files or upstream repositories;
  all are MIT.
- LGPL Sharp/libvips packages belong only to the local Homey CLI development
  toolchain and are not app runtime dependencies.
- Detailed dependency notes are in
  `Homey_Watchdog/THIRD_PARTY_NOTICES.md`.

## Security

- Homey publish-level manifest validation passes.
- `npm audit --omit=dev` reports four moderate advisories inherited from
  Athom's current `homey-api` Socket.IO chain, with no high or critical runtime
  advisories. See `Homey_Watchdog/SECURITY.md`.

## Blocking history finding

Older commits still contain a private device label, a live Homey Flow UUID,
and a local account alias. They are absent from the current tree but remain in
Git history. Do not make this repository public or claim a fully sanitized
history until all refs are rewritten or a new clean repository is created and
the result is rescanned. History rewriting and force-pushing require explicit
approval.
