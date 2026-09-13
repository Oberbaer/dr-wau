# Third-party notices

Homey Watchdog source code is licensed under the repository's MIT License.

Runtime dependency:

- `homey-api` 3.20.0, copyright Athom B.V. Its package license permits free use with Homey products, keeps the source proprietary to Athom B.V., and provides no warranty. Homey Watchdog is exclusively a Homey product integration. Dependency source is installed from npm and is not copied into this repository.

Development dependency:

- `homey` 4.5.0 uses the ISC License.
- Its optional Sharp/libvips build packages use Apache-2.0, MIT and/or LGPL-3.0-or-later terms. They are local build tooling and are neither copied into this repository nor declared as application runtime dependencies.

The committed lockfile records transitive npm package names, versions and integrity hashes for reproducible installation. Third-party packages retain their own licenses. `node_modules` and generated Homey build output are excluded from Git.

Some older transitive packages omit the modern `license` field from their lockfile metadata. Their bundled license/README files or linked upstream repositories identify them as MIT-licensed (`base64-arraybuffer`, `buildcheck`, `cli-table`, `component-bind`, `component-inherit`, `cpu-features`, `indexof`, `ssh2`, `to-array`, and `xmlhttprequest-ssl`). No dependency source is vendored in this repository.
