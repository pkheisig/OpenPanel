# OpenPanel module notices

The packaged module is built from this repository at one exact source commit.
OpenPanel remains licensed under AGPL-3.0-or-later; the complete license text is
included as `LICENSE`.

The reusable bundle keeps React and ReactDOM external. Their licenses and the
exact resolved versions are recorded by `dependencies.json`. Other JavaScript
runtime dependencies are bundled and are listed there with the package-lock
entry digest used for release verification.

Bundled scientific/reference data is copied from `public/data/`. Its source and
provenance notes remain in `data/SOURCES.md`, and every copied file is covered
by `asset-manifest.json` and `SHA256SUMS`.
