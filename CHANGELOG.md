# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-08

First public release.

### Added

- `imp-axi detect <file|dir|url>...`: runs `impeccable detect --json` and prints a TOON summary (totals, one row
  per rule with its fix printed once, counts per file, findings interleaved across rules). `--rule`, `--file`,
  `--sort`, `--limit`, `--full`, `--fields`; engine flags pass through.
- `imp-axi rules [id...]`: the detector's rule catalog without scanning (`detect --list-rules --json`, engine
  0.1.17+), with `--grep` and `--category`. Older engines get a clear error with an update hint.
- `imp-axi patch-skill`: rewrites the Impeccable skill's `detect --json` calls to `imp-axi detect`, with a backup
  in `<skill>/.imp-axi-backup/`, `--dry-run` and `--revert`. Recognises the plugin (≤ 4.7.0) and
  `npx impeccable install` (4.8.x) command forms.
- `imp-axi` / `home`: engine version and source, skill version and patch state, project `PRODUCT.md` / `DESIGN.md`.
- Engine discovery: `IMPECCABLE_BIN`, the skill's bundled binary, the launcher's download cache, then the launcher
  (run once with `engine-probe`).
- `coverage` note when only component source is scanned (regex rules only).
- Exit codes: 0 when the scan ran (engine exit 2 = findings is not an error), 1 engine missing / scan failed,
  2 usage error. Unreadable targets give `status: incomplete`, never `clean`.

### Security

- Windows `.cmd` launcher: every argument is quoted by imp-axi; arguments with `"`, newlines or `%VAR%` are refused.

### Changed

- Renamed from `impeccable-axi` to `imp-axi`.

[0.1.0]: https://github.com/ngoviet/imp-axi/releases/tag/v0.1.0
