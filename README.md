# impeccable-axi

AXI wrapper ([axi.md](https://axi.md)) for the detector of the [Impeccable](https://github.com/pbakaus/impeccable)
design skill. `impeccable detect --json` repeats every rule's description on every finding; on a built site
that reaches hundreds of KB, and an agent's shell tool cuts it off after ~30K characters. `impeccable-axi detect`
prints a TOON summary instead:

- `status`: totals (primary / advisory / files)
- `rules[]`: one row per rule with its count and fix, printed **once**
- `files`: findings per file
- `findings[]`: first 20 findings **interleaved across rules**, so one page shows every rule
- `help[]`: the next command (`--rule`, `--file`, `--full`)

Measured on a 25-page Vite/React site (engine 0.1.16, 634 findings): raw JSON 436 KB → default view 4.8 KB
(÷91), `--full` 70 KB.

## Install

Needs Node ≥ 20 and the Impeccable skill (its engine binary is bundled in the skill, downloaded by its
launcher to `~/.impeccable/bin/<VERSION>/`, or set via `IMPECCABLE_BIN`).

```bash
npm ci && npm run install:global
impeccable-axi                 # engine + skill status
impeccable-axi patch-skill     # make the Impeccable skill call impeccable-axi (reversible: --revert)
```

## Commands

| Command | What it does |
| --- | --- |
| `impeccable-axi` / `home` | engine version, skill version and patch state, this project's PRODUCT.md / DESIGN.md |
| `impeccable-axi detect <file\|dir\|url>... [--rule ids] [--file text] [--sort rule\|file]` | run the detector and summarise; engine flags (`--scope`, `--viewport`, `--cdp`, `--target`, `--no-advisory`, …) pass through |
| `impeccable-axi patch-skill [--revert] [--dry-run] [--skill-dir p]` | rewrite the skill's `detect --json` calls to `impeccable-axi detect`; originals kept in `<skill>/.impeccable-axi-backup/` |

Every command accepts `--fields a,b`, `--limit <n>`, `--full` and `--help`. `detect` exits 0 whenever the scan
ran (read `status`); exit 1 means the engine is missing or the scan failed, exit 2 a usage error.

Source files (`.jsx`, `.tsx`, `.css`) only get the detector's regex rules; `detect` says so in `coverage`.
Scan built `.html` or a dev-server URL for the full rule set.

After updating the skill (copying a new upstream version over it), run `impeccable-axi patch-skill` again.
