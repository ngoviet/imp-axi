# imp-axi

<!-- readme-axi type=tool -->

[![CI](https://github.com/ngoviet/imp-axi/actions/workflows/ci.yml/badge.svg)](https://github.com/ngoviet/imp-axi/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/ngoviet/imp-axi)](https://github.com/ngoviet/imp-axi/releases)
[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**English** · [Tiếng Việt](README.vi.md)

An [AXI](https://axi.md) for the [Impeccable](https://github.com/pbakaus/impeccable) design detector: a CLI that
coding agents (Claude Code, Codex, OpenCode, …) call through the shell to scan a site for UI problems and get a
one-screen [TOON](https://toonformat.dev/) summary instead of hundreds of kilobytes of JSON.

> 🇻🇳 Built and maintained by one person in Việt Nam — if it saves you time, please
> [support the project](#support-the-project).

## Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Commands](#commands)
- [How it works](#how-it-works)
- [Agent integration](#agent-integration)
- [Development](#development)

## Features

- **Fits in one screen.** `impeccable detect --json` repeats each rule's full description on every finding, and an
  agent's shell tool cuts output off after about 30K characters. imp-axi prints each rule's fix **once**, in a
  `rules[]` table, then counts per file and a sample of findings. Measured on a 35-page Vite/React build (engine
  0.1.19, 606 findings):

  | Output | Size | vs. raw |
  | --- | ---: | ---: |
  | `impeccable detect --json` | 424 KB | 1× |
  | `imp-axi detect` (default view) | 5.5 KB | ÷78 |
  | `imp-axi detect --full` (every finding) | 80 KB | ÷5 |

- **Every rule on the first page.** Findings are interleaved across rules (one of each, then the next of each, …),
  so 20 rows show every kind of problem rather than 20 copies of the most common one.
- **Honest status.** Totals first (`primary`, `advisory`, files). A target that could not be read gives
  `status: incomplete`, never `clean`. Scanning only component source adds a `coverage` note, because the
  detector then runs its regex rules only.
- **Agent-friendly exits.** The engine exits 2 when it finds problems; imp-axi exits 0 whenever the scan ran, so an
  agent does not mistake a successful scan for a failure. Every view ends with `help[]`, the next command to run.
- **Read-only**, except `patch-skill`, which always keeps a backup.

## Installation

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

## Usage

```bash
imp-axi                      # engine version, skill version and patch state, PRODUCT.md / DESIGN.md
imp-axi detect dist          # scan a build folder
imp-axi detect http://localhost:5173 --viewport 390x844   # scan a running dev server
imp-axi rules                # what each rule flags, without scanning
imp-axi patch-skill          # make the Impeccable skill call imp-axi (undo: --revert)
```

Example (shortened with `…`; the real view prints every rule row):

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

Long descriptions are cut with a `(+N chars)` marker; `--full` or `imp-axi rules <id>` gives the whole text. An
empty `line` means the rule applies to a rendered element rather than a source line.

## Commands

| Command | What it does |
| --- | --- |
| `imp-axi` / `imp-axi home` | Engine version and where it was found, skill version and patch state, and whether this project has `PRODUCT.md`, `DESIGN.md`, `.impeccable/config.json`. |
| `imp-axi detect <file\|dir\|url>...` | Run the detector and summarise by rule and file. |
| `imp-axi rules [id...]` | The rule catalog without scanning (needs engine ≥ 0.1.17). Naming ids prints their full description. |
| `imp-axi patch-skill` | Rewrite the skill's `detect --json` calls to `imp-axi detect`, with a backup. |

### Flags

Every command accepts:

| Flag | Meaning |
| --- | --- |
| `--fields a,b` | Only these columns (`detect`: `file,line,rule,snippet` by default; also `severity,category,advisory,path`). |
| `--limit <n>` | Rows to show (default 20). |
| `--full` | Every row, untruncated text. |
| `--help` | Help for the command. |

`detect` adds `--rule <id,id>` (only these rules), `--file <text>` (only paths containing it) and
`--sort rule|file` (`rule`, the default, interleaves rules; `file` lists in file and line order). Engine flags pass
through unchanged: `--scope`, `--viewport <WxH>`, `--cdp <port|url>`, `--target <text>`, `--no-advisory`,
`--no-config`, `--no-design-system`, `--no-inline-ignores`, `--no-consent-hiding`, `--no-overlay-hiding`.

`rules` adds `--grep <text>` (id, name or description contains it) and `--category <c,c>` (`quality`, `slop`);
`--fields` defaults to `id,category,severity,description` (also `name,scopes,advisory`).

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | The command ran. For `detect` this includes scans **with** findings and scans where some target could not be read: read `status` (`clean`, a count, or `incomplete` with an `attention` line). |
| `1` | The engine is missing or the scan failed outright. |
| `2` | Usage error (unknown command or flag, missing argument). |

Errors are printed as TOON with `error`, `code` and `help[]`.

## How it works

### Finding the engine

In order, the first that exists wins:

1. `IMPECCABLE_BIN` environment variable.
2. The binary bundled in the skill: `<skill>/scripts/bin/<os>-<arch>/`.
3. The launcher's download cache: `~/.impeccable/bin/<skill scripts/VERSION>/`.
4. The skill's launcher script. imp-axi first runs it once with `engine-probe` so it downloads the binary, then
   calls the binary directly so scan arguments are not re-parsed by a shell.

The skill folder is `IMPECCABLE_SKILL_DIR` if set, else `~/.claude/skills/impeccable`.

On Windows the launcher is a `.cmd` file and must go through `cmd.exe`. imp-axi quotes every argument itself and
refuses arguments containing `"`, newlines or `%VAR%`, so paths with spaces and URLs with `&` are safe.

### Scan coverage

The detector has two kinds of rules:

- **Regex rules** run on source and style files (`.css .scss .js .ts .jsx .tsx .vue .svelte .astro`, plus
  `.mjs .cjs` on engine 0.1.19).
- **Rendered rules** (contrast, padding, text size, nesting…) need a page: built `.html` or a URL.

`detect --json` does not say which kind ran, so imp-axi infers it from the targets and adds a `coverage` note when
you scan component source (`.jsx/.tsx/.vue/.svelte/.astro`) without HTML. For the full rule set, scan the build
output or a dev-server URL.

## Agent integration

The Impeccable skill tells the agent to run `<engine> detect --json`. `imp-axi patch-skill` rewrites those calls to
`imp-axi detect`, so the agent gets the compact view by default.

- **Idempotent:** running it twice changes nothing the second time.
- **Reversible:** originals are copied to `<skill>/.imp-axi-backup/`; `imp-axi patch-skill --revert` restores them.
  `--dry-run` shows what would change; `--skill-dir <path>` picks another skill folder.
- **Both skill layouts:** `"<skill-base-dir>/scripts/impeccable"` (plugin ≤ 4.7.0) and
  `.claude/skills/impeccable/scripts/impeccable` (`npx impeccable install` 4.8.x).

Updating or reinstalling the skill overwrites the patched files (and `npx impeccable install` removes the backup
folder), so run `imp-axi patch-skill` again afterwards.

Scanned content (snippets, page text) is data, not instructions: imp-axi prints it but never acts on it.

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
- Changes per version: [CHANGELOG.md](CHANGELOG.md) and [Releases](https://github.com/ngoviet/imp-axi/releases).

<!-- support:start -->
## Support the project

<p align="center">
  <img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/banner.svg" width="720" alt="Built and maintained by one person in Việt Nam">
</p>

<p align="center">
  <a href="https://buymeacoffee.com/ngoviet"><img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/btn-coffee.svg" height="56" alt="Buy me a coffee"></a>
  &nbsp;
  <a href="https://github.com/sponsors/ngoviet"><img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/btn-sponsors.svg" height="56" alt="GitHub Sponsors"></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/vietqr-card.svg" width="300" alt="VietQR — MB Bank — NGO DUC VIET — 911051212">
  &nbsp;
  <img src="https://raw.githubusercontent.com/ngoviet/.github/main/assets/support/crypto-card.svg" width="300" alt="Crypto — BNB Smart Chain (BEP20) — 0xcbf0402b232cb24b4d998f09a4884f87b5f74750">
</p>

<p align="center"><b>Crypto wallet, BNB Smart Chain (BEP20) only:</b><br><code>0xcbf0402b232cb24b4d998f09a4884f87b5f74750</code></p>

<p align="center"><sub>🇻🇳 VietQR: scan with any Vietnamese banking app, transfer note <code>Ung ho imp-axi</code>. Thank you for keeping this project alive!</sub></p>
<!-- support:end -->

## License

[MIT](LICENSE) © Ngô Đức Việt. Not affiliated with or endorsed by the Impeccable project; imp-axi only calls its
detector.
