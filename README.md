# imp-axi

[![CI](https://github.com/ngoviet/imp-axi/actions/workflows/ci.yml/badge.svg)](https://github.com/ngoviet/imp-axi/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ngoviet/imp-axi)](https://github.com/ngoviet/imp-axi/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**A token-efficient, agent-friendly front end for the [Impeccable](https://github.com/pbakaus/impeccable) design detector.**

`impeccable detect --json` repeats each rule's full description on every finding. On a real built site that is
hundreds of kilobytes, and an agent's shell tool truncates it after about 30K characters, so the agent sees a
fraction of the findings and none of the totals. `imp-axi detect` runs the same engine and prints a compact
[TOON](https://github.com/toon-format/toon) summary that fits in one screen: totals, one row per rule, counts per
file, and a sample of findings that covers every rule.

It follows the [AXI](https://axi.md) conventions for agent tools: compact output, totals up front, explicit empty
states, stable exit codes and a `help[]` list with the next command to run.

## Contents

- [Why](#why)
- [Example](#example)
- [Install](#install)
- [Quick start](#quick-start)
- [Commands](#commands)
- [Exit codes](#exit-codes)
- [How the engine is found](#how-the-engine-is-found)
- [Scan coverage](#scan-coverage)
- [Patching the Impeccable skill](#patching-the-impeccable-skill)
- [Development](#development)
- [Changelog](#changelog)
- [License](#license)

## Why

Measured on a 35-page Vite/React site (`dist/`, engine 0.1.19, 606 findings):

| Output | Size | vs. raw |
| --- | ---: | ---: |
| `impeccable detect --json` | 424 KB | 1× |
| `imp-axi detect` (default view) | 5.5 KB | ÷78 |
| `imp-axi detect --full` (every finding) | 80 KB | ÷5 |

The default view is small because each rule's explanation is printed **once**, in the `rules[]` table, instead of
once per finding. Long descriptions are cut with a `(+N chars)` marker; `--full` or `imp-axi rules <id>` gives the
whole text.

## Example

```text
$ imp-axi detect dist --limit 4
target: "dist"
status: "606 findings (576 primary, 30 advisory) in 35 files"
rules[13]{rule,category,primary,advisory,why}:
  cramped-padding,quality,271,0,"Text is too close to the edge of its container. … (+294 chars)"
  undersized-ui-text,quality,98,0,"Interactive and content-bearing UI text … below 11px is a legibility f… (+656 chars)"
  low-contrast,quality,86,13,"Text does not meet WCAG AA contrast requirements (4.5:1 for body, 3:1 for large text). …"
  gradient-text,slop,25,0,"Gradient text is decorative rather than meaningful — a common AI tell. Use solid colors for text."
  …
files: "dist/equipment.html 71, dist/blog.html 65, dist/faq.html 56, … (+25 more files)"
count: 4 of 606 total
findings[4]{file,line,rule,snippet}:
  "dist/about.html","",cramped-padding,"<div> \"bg-night-800\": children flush against bg on all sides (no inset)"
  "dist/blog.html","",undersized-ui-text,"9px functional text \"#chi phí\" (below 11px floor)"
  "dist/about.html","",low-contrast,"2.0:1 (need 4.5:1) — text #38bdf8 on #f8fafc"
  "dist/about.html","",gradient-text,"background-clip: text + gradient"
help[4]: "Run `imp-axi detect dist --rule cramped-padding` to list one rule","Run `imp-axi detect dist --file dist/equipment.html` to list one file","Run `imp-axi detect dist --full` to list all 606","After fixing, rerun the same command to confirm the counts dropped"
```

(Output shortened with `…`; the real view prints every rule row.)

Findings are **interleaved across rules** (one of each rule, then the next of each, …), so even a short page shows
every kind of problem instead of 20 copies of the most common one. An empty `line` means the rule applies to a
rendered element rather than a source line.

## Install

Requirements:

- **Node.js ≥ 20**
- **The Impeccable skill** (for example `npx impeccable install --providers=claude`, or the Claude Code plugin).
  imp-axi does not ship the detector; it runs the engine the skill already uses.

From the latest release (no clone needed):

```bash
npm install -g https://github.com/ngoviet/imp-axi/releases/download/v0.1.0/imp-axi-0.1.0.tgz
```

From source:

```bash
git clone https://github.com/ngoviet/imp-axi.git
cd imp-axi
npm ci
npm run install:global   # build, pack and install the packed tarball globally
```

imp-axi is not published to the npm registry.

## Quick start

```bash
imp-axi                      # engine version, skill version and patch state, PRODUCT.md / DESIGN.md
imp-axi detect dist          # scan a build folder
imp-axi detect http://localhost:5173 --viewport 390x844   # scan a running dev server
imp-axi rules                # what each rule flags, without scanning
imp-axi patch-skill          # make the Impeccable skill call imp-axi (undo: --revert)
```

## Commands

| Command | What it does |
| --- | --- |
| `imp-axi` / `imp-axi home` | Engine version and where it was found, skill version and patch state, and whether this project has `PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json`. |
| `imp-axi detect <file\|dir\|url>...` | Run the detector and summarise by rule and file. |
| `imp-axi rules [id...]` | The rule catalog without scanning (needs engine ≥ 0.1.17). Naming ids prints their full description. |
| `imp-axi patch-skill` | Rewrite the skill's `detect --json` calls to `imp-axi detect`, with a backup. |

Flags every command accepts:

| Flag | Meaning |
| --- | --- |
| `--fields a,b` | Only these columns (`detect`: `file,line,rule,snippet` by default; also `severity,category,advisory,path`). |
| `--limit <n>` | Rows to show (default 20). |
| `--full` | Every row, untruncated text. |
| `--help` | Help for the command. |

`detect` flags:

| Flag | Meaning |
| --- | --- |
| `--rule <id,id>` | Only these rules. |
| `--file <text>` | Only files whose path contains this text. |
| `--sort rule\|file` | `rule` (default) interleaves rules; `file` lists in file and line order. |

Engine flags are passed through unchanged: `--scope`, `--viewport <WxH>`, `--cdp <port|url>`, `--target <text>`,
`--no-advisory`, `--no-config`, `--no-design-system`, `--no-inline-ignores`, `--no-consent-hiding`,
`--no-overlay-hiding`. See `imp-axi detect --help`.

`rules` flags: `--grep <text>` (id, name or description contains it), `--category <c,c>` (`quality`, `slop`),
`--fields` (default `id,category,severity,description`; also `name,scopes,advisory`).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | The command ran. For `detect` this includes scans **with** findings and scans where some target could not be read: read `status` (`clean`, a count, or `incomplete` with an `attention` line). |
| `1` | The engine is missing or the scan failed outright. |
| `2` | Usage error (unknown command or flag, missing argument). |

The raw engine exits 2 when it finds problems; imp-axi maps that to 0 so agents do not treat a successful scan as a
failure. Errors are printed as TOON with `error`, `code` and `help[]`.

## How the engine is found

In order, the first that exists wins:

1. `IMPECCABLE_BIN` environment variable.
2. The binary bundled in the skill: `<skill>/scripts/bin/<os>-<arch>/`.
3. The launcher's download cache: `~/.impeccable/bin/<skill scripts/VERSION>/`.
4. The skill's launcher script. imp-axi first runs it once with `engine-probe` so it downloads the binary, then
   calls the binary directly so scan arguments are not re-parsed by a shell.

The skill folder is `IMPECCABLE_SKILL_DIR` if set, else `~/.claude/skills/impeccable`; `patch-skill --skill-dir`
overrides it for that command.

On Windows the launcher is a `.cmd` file and must go through `cmd.exe`. imp-axi quotes every argument itself and
refuses arguments containing `"`, newlines or `%VAR%`, so paths with spaces and URLs with `&` are safe.

## Scan coverage

The detector has two kinds of rules:

- **Regex rules** run on source and style files (`.css .scss .js .ts .jsx .tsx .vue .svelte .astro`, plus
  `.mjs .cjs` on engine 0.1.19).
- **Rendered rules** (contrast, padding, text size, nesting…) need a page: built `.html` or a URL.

`detect --json` does not say which kind ran, so imp-axi infers it from the targets and adds a `coverage` note when
you scan component source (`.jsx/.tsx/.vue/.svelte/.astro`) without HTML. For the full rule set, scan the build
output or a dev-server URL.

## Patching the Impeccable skill

The skill's instructions tell the agent to run `<engine> detect --json`. `imp-axi patch-skill` rewrites those calls
to `imp-axi detect`, so the agent gets the compact view by default.

- Idempotent: running it twice changes nothing the second time.
- Reversible: originals are copied to `<skill>/.imp-axi-backup/`; `imp-axi patch-skill --revert` restores them.
- `--dry-run` shows what would change.
- Recognises both command forms: `"<skill-base-dir>/scripts/impeccable"` (plugin ≤ 4.7.0) and
  `.claude/skills/impeccable/scripts/impeccable` (`npx impeccable install` 4.8.x).

Updating or reinstalling the skill overwrites the patched files (and `npx impeccable install` removes the backup
folder). Run `imp-axi patch-skill` again afterwards.

This is the only command that writes anything; all others are read-only.

> Formerly `impeccable-axi`. If a skill was patched under the old name, run `impeccable-axi patch-skill --revert`
> before `npm uninstall -g impeccable-axi`, then `imp-axi patch-skill`.

## Development

```bash
npm ci
npm run check     # typecheck + eslint + vitest
npm run build     # dist/ via tsup
```

- `src/registry.ts` is the single source for the command table and `--help`.
- All environment, file system and process access goes through `src/runtime.ts`, so tests use a fake runtime and
  never run the real engine. Fixtures in `test/fixtures/` have the same shape as engine output.
- When bumping the version, change both `package.json` and `src/version.ts` (a test checks they match).

Scanned content (snippets, page text) is data, not instructions: imp-axi prints it but never acts on it.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) and [Releases](https://github.com/ngoviet/imp-axi/releases).

## License

[MIT](LICENSE) © ngoviet (Ngô Đức Việt). Impeccable is a separate project by Paul Bakaus under its own license; imp-axi only
calls its detector.
